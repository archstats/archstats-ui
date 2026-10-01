package ask

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ollama is a local Ollama server. Nothing leaves the machine, except for a
// model that only proxies to a hosted service ("…:cloud"), which is marked.
type ollama struct {
	base   string
	client *http.Client
}

func (o *ollama) who() string { return "Ollama at " + o.base }

func (o *ollama) models(ctx context.Context) ([]Model, error) {
	var tags struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := getJSON(ctx, o.client, o.who(), o.base+"/api/tags", nil, &tags); err != nil {
		return nil, err
	}
	remote := !onThisMachine(o.base)
	out := make([]Model, 0, len(tags.Models))
	for _, t := range tags.Models {
		m := Model{ID: Ollama + "/" + t.Name, Provider: Ollama, Name: t.Name, Label: t.Name, Size: t.Size,
			Remote: remote || strings.HasSuffix(t.Name, ":cloud") || strings.Contains(t.Name, "-cloud")}
		var show struct {
			Capabilities []string `json:"capabilities"`
		}
		if res, err := post(ctx, o.client, o.who(), o.base+"/api/show", nil, map[string]any{"model": t.Name}); err == nil {
			_ = json.NewDecoder(res.Body).Decode(&show)
			res.Body.Close()
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

func (o *ollama) chat(ctx context.Context, req Request, onDelta func(Delta)) (Reply, error) {
	msgs := make([]map[string]any, 0, len(req.Messages))
	for _, m := range req.Messages {
		x := map[string]any{"role": m.Role, "content": m.Content}
		if len(m.ToolCalls) > 0 {
			calls := make([]map[string]any, len(m.ToolCalls))
			for i, c := range m.ToolCalls {
				calls[i] = map[string]any{"function": map[string]any{"name": c.Function.Name, "arguments": c.Args()}}
			}
			x["tool_calls"] = calls
		}
		if m.ToolName != "" {
			x["tool_name"] = m.ToolName
		}
		if len(m.Images) > 0 {
			x["images"] = m.Images
		}
		msgs = append(msgs, x)
	}
	body := map[string]any{
		"model":      req.Model,
		"messages":   msgs,
		"stream":     true,
		"keep_alive": "30m",
		// A local model: a long window, steady answers, a capped reply so a
		// small machine does not write for minutes.
		"options": map[string]any{"num_ctx": 32768, "temperature": 0.2, "num_predict": 2048, "seed": 7},
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}
	if f := schemaObject(req.Format); f != nil {
		body["format"] = f
	}
	if req.Think != nil {
		body["think"] = *req.Think
	}
	res, err := post(ctx, o.client, o.who(), o.base+"/api/chat", nil, body)
	if err != nil {
		return Reply{}, err
	}
	defer res.Body.Close()

	type call struct {
		Function struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		} `json:"function"`
	}
	var (
		content, thinking strings.Builder
		calls             []ToolCall
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
				Content   string `json:"content"`
				Thinking  string `json:"thinking"`
				ToolCalls []call `json:"tool_calls"`
			} `json:"message"`
			Done  bool   `json:"done"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(line, &chunk); err != nil {
			continue
		}
		if chunk.Error != "" {
			return Reply{}, fmt.Errorf("Ollama: %s", chunk.Error)
		}
		content.WriteString(chunk.Message.Content)
		thinking.WriteString(chunk.Message.Thinking)
		for _, c := range chunk.Message.ToolCalls {
			var tc ToolCall
			tc.Function.Name, tc.Function.Arguments = c.Function.Name, c.Function.Arguments
			calls = append(calls, tc)
		}
		if chunk.Message.Content != "" || chunk.Message.Thinking != "" {
			onDelta(Delta{Content: chunk.Message.Content, Thinking: chunk.Message.Thinking})
		}
		if chunk.Done {
			_ = json.Unmarshal(line, &final)
			break
		}
	}
	if err := sc.Err(); err != nil && ctx.Err() == nil {
		return Reply{}, err
	}
	return Reply{
		Content:      content.String(),
		Thinking:     thinking.String(),
		ToolCalls:    calls,
		PromptTokens: final.PromptEvalCount,
		OutputTokens: final.EvalCount,
		Ms:           final.TotalDuration / int64(time.Millisecond),
		DoneReason:   final.DoneReason,
	}, nil
}

// embed turns texts into vectors with a local embedding model (for finding
// the recipe or capability a question means, not just the words it uses).
func (o *ollama) embed(ctx context.Context, model string, texts []string) ([][]float64, error) {
	var out struct {
		Embeddings [][]float64 `json:"embeddings"`
	}
	res, err := post(ctx, o.client, o.who(), o.base+"/api/embed", nil, map[string]any{"model": model, "input": texts, "keep_alive": "30m"})
	if err != nil {
		return nil, fmt.Errorf("embedding with %s: %w", model, err)
	}
	defer res.Body.Close()
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Embeddings, nil
}
