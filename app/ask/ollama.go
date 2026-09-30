// Package ask talks to a local Ollama server for the Ask pane. The agent
// loop and the tools live in the frontend, where the views' own logic is;
// this side only carries a chat request to the model and streams the reply
// back as events, so nothing but the local server is ever contacted.
package ask

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Model is one model the local server holds, and whether it can call tools.
type Model struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Tools  bool   `json:"tools"`
	Vision bool   `json:"vision"`
	Think  bool   `json:"think"`
	Remote bool   `json:"remote"`
}

// Service holds the running requests so the pane can stop one.
type Service struct {
	base    string
	client  *http.Client
	mu      sync.Mutex
	cancels map[string]context.CancelFunc
	emit    func(event string, data ...any)
}

func NewService() *Service {
	base := strings.TrimRight(os.Getenv("OLLAMA_HOST"), "/")
	if base == "" {
		base = "http://127.0.0.1:11434"
	} else if !strings.HasPrefix(base, "http") {
		base = "http://" + base
	}
	return &Service{base: base, client: &http.Client{}, cancels: map[string]context.CancelFunc{}}
}

// SetEmitter wires event emission (in production: Wails runtime.EventsEmit).
func (s *Service) SetEmitter(emit func(event string, data ...any)) { s.emit = emit }

// Models lists the local models, tool-capable first. A model that only
// proxies to a hosted service ("…:cloud") is marked, because it sends the
// conversation off this machine.
func (s *Service) Models() ([]Model, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var tags struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := s.getJSON(ctx, "/api/tags", &tags); err != nil {
		return nil, fmt.Errorf("Ollama is not answering at %s: %w", s.base, err)
	}
	out := make([]Model, 0, len(tags.Models))
	for _, t := range tags.Models {
		m := Model{Name: t.Name, Size: t.Size, Remote: strings.HasSuffix(t.Name, ":cloud") || strings.Contains(t.Name, "-cloud")}
		var show struct {
			Capabilities []string `json:"capabilities"`
		}
		if err := s.postJSON(ctx, "/api/show", map[string]any{"model": t.Name}, &show); err == nil {
			for _, c := range show.Capabilities {
				switch c {
				case "tools":
					m.Tools = true
				case "vision":
					m.Vision = true
				case "thinking":
					m.Think = true
				}
			}
		}
		out = append(out, m)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Tools != out[j].Tools {
			return out[i].Tools
		}
		return out[i].Size > out[j].Size
	})
	return out, nil
}

// Chat sends one request (Ollama's /api/chat body, as JSON) and streams the
// reply as "ask:delta" events carrying {id, content, thinking}. It returns
// the whole assistant message with any tool calls, plus the token counts,
// as JSON.
func (s *Service) Chat(id, requestJSON string) (string, error) {
	var req map[string]any
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return "", fmt.Errorf("reading the request: %w", err)
	}
	req["stream"] = true
	body, _ := json.Marshal(req)

	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cancels[id] = cancel
	s.mu.Unlock()
	defer func() {
		cancel()
		s.mu.Lock()
		delete(s.cancels, id)
		s.mu.Unlock()
	}()

	hr, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	hr.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(hr)
	if err != nil {
		if ctx.Err() != nil {
			return `{"stopped":true}`, nil
		}
		return "", fmt.Errorf("Ollama is not answering at %s: %w", s.base, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return "", fmt.Errorf("Ollama answered %d: %s", res.StatusCode, strings.TrimSpace(string(msg)))
	}

	type toolCall struct {
		Function struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		} `json:"function"`
	}
	var (
		content, thinking strings.Builder
		calls             []toolCall
		final             struct {
			PromptEvalCount int    `json:"prompt_eval_count"`
			EvalCount       int    `json:"eval_count"`
			TotalDuration   int64  `json:"total_duration"`
			DoneReason      string `json:"done_reason"`
		}
	)
	sc := bufio.NewScanner(res.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var chunk struct {
			Message struct {
				Content   string     `json:"content"`
				Thinking  string     `json:"thinking"`
				ToolCalls []toolCall `json:"tool_calls"`
			} `json:"message"`
			Done  bool   `json:"done"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(line, &chunk); err != nil {
			continue
		}
		if chunk.Error != "" {
			return "", fmt.Errorf("Ollama: %s", chunk.Error)
		}
		content.WriteString(chunk.Message.Content)
		thinking.WriteString(chunk.Message.Thinking)
		calls = append(calls, chunk.Message.ToolCalls...)
		if (chunk.Message.Content != "" || chunk.Message.Thinking != "") && s.emit != nil {
			s.emit("ask:delta", map[string]any{"id": id, "content": chunk.Message.Content, "thinking": chunk.Message.Thinking})
		}
		if chunk.Done {
			_ = json.Unmarshal(line, &final)
			break
		}
	}
	if err := sc.Err(); err != nil && ctx.Err() == nil {
		return "", err
	}
	out, _ := json.Marshal(map[string]any{
		"stopped":      ctx.Err() != nil,
		"content":      content.String(),
		"thinking":     thinking.String(),
		"toolCalls":    calls,
		"promptTokens": final.PromptEvalCount,
		"outputTokens": final.EvalCount,
		"ms":           final.TotalDuration / int64(time.Millisecond),
		"doneReason":   final.DoneReason,
	})
	return string(out), nil
}

// Embed turns texts into vectors with a local embedding model (for finding
// the recipe or capability a question means, not just the words it uses).
func (s *Service) Embed(model string, texts []string) ([][]float64, error) {
	if model == "" {
		model = "nomic-embed-text"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	var out struct {
		Embeddings [][]float64 `json:"embeddings"`
	}
	if err := s.postJSON(ctx, "/api/embed", map[string]any{"model": model, "input": texts, "keep_alive": "30m"}, &out); err != nil {
		return nil, fmt.Errorf("embedding with %s: %w", model, err)
	}
	return out.Embeddings, nil
}

// Cancel stops a running request; the reply so far is kept.
func (s *Service) Cancel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.cancels[id]; ok {
		c()
	}
}

func (s *Service) getJSON(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+path, nil)
	if err != nil {
		return err
	}
	return s.do(req, out)
}

func (s *Service) postJSON(ctx context.Context, path string, in, out any) error {
	b, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return s.do(req, out)
}

func (s *Service) do(req *http.Request, out any) error {
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
