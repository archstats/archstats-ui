package ask

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

// openai is the Chat Completions API: OpenAI itself, or any server that
// speaks it (LM Studio, llama.cpp, vLLM, OpenRouter, Groq, Mistral, …).
type openai struct {
	id     string // OpenAI or OpenAICompatible
	who    string
	base   string // ends in /v1 (or the server's equivalent)
	key    string
	client *http.Client
}

func (o *openai) headers() map[string]string {
	if o.key == "" {
		return nil
	}
	return map[string]string{"Authorization": "Bearer " + o.key}
}

// Chat models among everything OpenAI lists (which includes embeddings,
// speech, images and moderation).
var openAIChat = regexp.MustCompile(`^(gpt-|o\d|chatgpt-)`)
var openAINotChat = regexp.MustCompile(`(audio|realtime|transcribe|tts|image|search|instruct|embedding|moderation|dall-e|whisper|codex)`)

func (o *openai) models(ctx context.Context) ([]Model, error) {
	var list struct {
		Data []struct {
			ID      string `json:"id"`
			Created int64  `json:"created"`
		} `json:"data"`
	}
	if err := getJSON(ctx, o.client, o.who, o.base+"/models", o.headers(), &list); err != nil {
		return nil, err
	}
	sort.SliceStable(list.Data, func(i, j int) bool { return list.Data[i].Created > list.Data[j].Created })
	remote := o.id == OpenAI || !onThisMachine(o.base)
	out := make([]Model, 0, len(list.Data))
	for _, m := range list.Data {
		if o.id == OpenAI && (!openAIChat.MatchString(m.ID) || openAINotChat.MatchString(m.ID)) {
			continue
		}
		out = append(out, Model{ID: o.id + "/" + m.ID, Provider: o.id, Name: m.ID, Label: m.ID, Tools: true, Vision: o.id == OpenAI, Think: o.id == OpenAI && openAIReasoning(m.ID), Remote: remote})
	}
	return out, nil
}

var openAIReasons = regexp.MustCompile(`^(o\d|gpt-5)`)

// openAIReasoning: a model that takes reasoning_effort (and no temperature).
func openAIReasoning(model string) bool { return openAIReasons.MatchString(model) }

func (o *openai) chat(ctx context.Context, req Request, onDelta func(Delta)) (Reply, error) {
	msgs := wellFormed(pairToolResults(req.Messages))
	body := map[string]any{
		"model":          req.Model,
		"messages":       openAIMessages(msgs),
		"stream":         true,
		"stream_options": map[string]any{"include_usage": true},
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}
	if f := schemaObject(req.Format); f != nil {
		body["response_format"] = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "reply", "schema": f}}
	}
	if o.id == OpenAI && openAIReasoning(req.Model) {
		if req.Think != nil && *req.Think {
			body["reasoning_effort"] = "high"
		} else {
			body["reasoning_effort"] = "low"
		}
		body["max_completion_tokens"] = 16000
	} else if o.id == OpenAI {
		body["max_completion_tokens"] = 4096
	} else {
		body["max_tokens"] = 4096
	}
	started := time.Now()
	for attempt := 0; ; attempt++ {
		res, err := post(ctx, o.client, o.who, o.base+"/chat/completions", o.headers(), body)
		if err != nil {
			// An option this model or server does not take: asked again without it.
			if msg, bad := badRequest(err); bad && attempt < 4 {
				dropped := false
				for _, f := range []string{"reasoning_effort", "response_format", "stream_options", "max_completion_tokens", "max_tokens"} {
					if _, ok := body[f]; ok && strings.Contains(msg, f) {
						delete(body, f)
						dropped = true
					}
				}
				if !dropped && strings.Contains(msg, "json_schema") {
					delete(body, "response_format")
					dropped = true
				}
				if dropped {
					continue
				}
			}
			return Reply{}, err
		}
		reply, err := o.read(ctx, res, onDelta)
		res.Body.Close()
		if _, asked := body["response_format"]; !asked && len(req.Format) > 0 {
			reply.Content = jsonOnly(reply.Content)
		}
		reply.Ms = time.Since(started).Milliseconds()
		return reply, err
	}
}

func openAIMessages(msgs []Message) []map[string]any {
	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		switch m.Role {
		case "system":
			out = append(out, map[string]any{"role": "system", "content": m.Content})
		case "user":
			if len(m.Images) == 0 {
				out = append(out, map[string]any{"role": "user", "content": m.Content})
				continue
			}
			parts := []map[string]any{{"type": "text", "text": m.Content}}
			for _, img := range m.Images {
				parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:" + mediaType(img) + ";base64," + img}})
			}
			out = append(out, map[string]any{"role": "user", "content": parts})
		case "assistant":
			x := map[string]any{"role": "assistant", "content": m.Content}
			if len(m.ToolCalls) > 0 {
				calls := make([]map[string]any, len(m.ToolCalls))
				for i, c := range m.ToolCalls {
					args, _ := json.Marshal(c.Args())
					calls[i] = map[string]any{"id": c.ID, "type": "function", "function": map[string]any{"name": c.Function.Name, "arguments": string(args)}}
				}
				x["tool_calls"] = calls
				if m.Content == "" {
					x["content"] = nil
				}
			}
			out = append(out, x)
		case "tool":
			out = append(out, map[string]any{"role": "tool", "tool_call_id": m.ToolCallID, "content": m.Content})
		}
	}
	return out
}

func (o *openai) read(ctx context.Context, res *http.Response, onDelta func(Delta)) (Reply, error) {
	type partial struct {
		id, name string
		args     strings.Builder
	}
	var (
		reply             Reply
		content, thinking strings.Builder
		calls             = map[int]*partial{}
		order             []int
		finish            string
		streamErr         error
	)
	err := readSSE(res.Body, func(_ string, data []byte) bool {
		if string(data) == "[DONE]" {
			return false
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content"`
					Reasoning        string `json:"reasoning"`
					ToolCalls        []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			} `json:"usage"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &chunk) != nil {
			return true
		}
		if chunk.Error != nil {
			streamErr = fmt.Errorf("%s: %s", o.who, chunk.Error.Message)
			return false
		}
		if chunk.Usage != nil {
			reply.PromptTokens, reply.OutputTokens = chunk.Usage.PromptTokens, chunk.Usage.CompletionTokens
		}
		for _, c := range chunk.Choices {
			d := c.Delta
			if d.Content != "" {
				content.WriteString(d.Content)
				onDelta(Delta{Content: d.Content})
			}
			if r := d.ReasoningContent + d.Reasoning; r != "" {
				thinking.WriteString(r)
				onDelta(Delta{Thinking: r})
			}
			for _, tc := range d.ToolCalls {
				p := calls[tc.Index]
				if p == nil {
					p = &partial{}
					calls[tc.Index] = p
					order = append(order, tc.Index)
				}
				if tc.ID != "" {
					p.id = tc.ID
				}
				if tc.Function.Name != "" {
					p.name = tc.Function.Name
				}
				p.args.WriteString(tc.Function.Arguments)
			}
			if c.FinishReason != "" {
				finish = c.FinishReason
			}
		}
		return true
	})
	if streamErr != nil {
		return Reply{}, streamErr
	}
	if ctx.Err() != nil {
		reply.Stopped = true
	} else if err != nil {
		return Reply{}, err
	}
	for _, i := range order {
		p := calls[i]
		args := strings.TrimSpace(p.args.String())
		if args == "" {
			args = "{}"
		}
		if !json.Valid([]byte(args)) {
			return Reply{}, fmt.Errorf("the tool call to %s arrived as unfinished JSON", p.name)
		}
		var tc ToolCall
		tc.ID, tc.Function.Name, tc.Function.Arguments = p.id, p.name, json.RawMessage(args)
		reply.ToolCalls = append(reply.ToolCalls, tc)
	}
	reply.Content, reply.Thinking = content.String(), thinking.String()
	reply.DoneReason = finish
	return reply, nil
}
