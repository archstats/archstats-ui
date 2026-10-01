package ask

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// anthropic is Claude, through the Messages API.
type anthropic struct {
	base   string
	key    string
	client *http.Client
}

const anthropicWho = "Anthropic"

func (a *anthropic) headers() map[string]string {
	return map[string]string{"x-api-key": a.key, "anthropic-version": "2023-06-01"}
}

func (a *anthropic) models(ctx context.Context) ([]Model, error) {
	var list struct {
		Data []struct {
			ID          string `json:"id"`
			DisplayName string `json:"display_name"`
		} `json:"data"`
	}
	if err := getJSON(ctx, a.client, anthropicWho, a.base+"/v1/models?limit=100", a.headers(), &list); err != nil {
		return nil, err
	}
	out := make([]Model, 0, len(list.Data))
	for _, m := range list.Data {
		if !strings.HasPrefix(m.ID, "claude-") {
			continue
		}
		label := m.DisplayName
		if label == "" {
			label = m.ID
		}
		out = append(out, Model{ID: Anthropic + "/" + m.ID, Provider: Anthropic, Name: m.ID, Label: label, Tools: true, Vision: true, Think: true, Remote: true})
	}
	return out, nil
}

// claudeLegacy: a model that thinks with a token budget and takes no
// effort; the rest think adaptively.
func claudeLegacy(model string) bool {
	for _, s := range []string{"claude-3", "haiku", "-4-0", "-4-1", "-4-5", "-4-20250514"} {
		if strings.Contains(model, s) {
			return true
		}
	}
	return false
}

// claudeFallbacks: models on which a refused request can be answered by
// another model inside the same call.
func claudeFallbacks(model string) bool {
	return strings.HasPrefix(model, "claude-opus-5") || strings.HasPrefix(model, "claude-fable-5") || strings.HasPrefix(model, "claude-mythos-5")
}

func (a *anthropic) body(req Request, msgs []map[string]any, system string, drop map[string]bool) map[string]any {
	body := map[string]any{
		"model":      req.Model,
		"max_tokens": 16000,
		"stream":     true,
		"messages":   msgs,
		// Every step of a turn resends the conversation: cache it.
		"cache_control": map[string]any{"type": "ephemeral"},
	}
	if f := schemaObject(req.Format); f != nil && drop["format"] {
		schema, _ := json.Marshal(f)
		system += "\n\nReply with only one JSON object that follows this JSON schema, and nothing else:\n" + string(schema)
	}
	if system = strings.TrimSpace(system); system != "" {
		body["system"] = system
	}
	if len(req.Tools) > 0 {
		tools := make([]map[string]any, len(req.Tools))
		for i, t := range req.Tools {
			schema := schemaObject(t.Function.Parameters)
			if schema == nil {
				schema = map[string]any{"type": "object", "properties": map[string]any{}}
			}
			tools[i] = map[string]any{"name": t.Function.Name, "description": t.Function.Description, "input_schema": schema}
		}
		body["tools"] = tools
	}
	think := req.Think != nil && *req.Think
	legacy := claudeLegacy(req.Model)
	if think && !drop["thinking"] {
		if legacy {
			body["thinking"] = map[string]any{"type": "enabled", "budget_tokens": 8000}
		} else {
			body["thinking"] = map[string]any{"type": "adaptive", "display": "summarized"}
		}
	}
	oc := map[string]any{}
	if !legacy && !drop["effort"] {
		if think {
			oc["effort"] = "high"
		} else {
			oc["effort"] = "medium"
		}
	}
	if f := schemaObject(req.Format); f != nil && !drop["format"] {
		oc["format"] = map[string]any{"type": "json_schema", "schema": strictSchema(f)}
	}
	if len(oc) > 0 {
		body["output_config"] = oc
	}
	if claudeFallbacks(req.Model) && !drop["fallbacks"] {
		body["fallbacks"] = "default"
	}
	return body
}

func (a *anthropic) chat(ctx context.Context, req Request, onDelta func(Delta)) (Reply, error) {
	system, rest := systemText(wellFormed(pairToolResults(withRawIDs(req.Messages, Anthropic))))
	msgs := claudeMessages(rest, req.Model, false)
	drop := map[string]bool{}
	started := time.Now()
	for attempt := 0; ; attempt++ {
		headers := a.headers()
		body := a.body(req, msgs, system, drop)
		if _, ok := body["fallbacks"]; ok {
			headers["anthropic-beta"] = "server-side-fallback-2026-07-01"
		}
		res, err := post(ctx, a.client, anthropicWho, a.base+"/v1/messages", headers, body)
		if err != nil {
			if msg, bad := badRequest(err); bad && attempt < 5 {
				if next := claudeRetry(msg, drop); next != "" {
					if next == "replay" {
						msgs = claudeMessages(rest, req.Model, true)
					}
					continue
				}
			}
			return Reply{}, err
		}
		reply, err := a.read(ctx, res, onDelta, req.Model)
		res.Body.Close()
		if drop["format"] && len(req.Format) > 0 {
			reply.Content = jsonOnly(reply.Content)
		}
		reply.Ms = time.Since(started).Milliseconds()
		return reply, err
	}
}

// claudeRetry reads a refused request for the option the model does not
// take, and marks it to be left out; "" when nothing can be left out. Thinking
// replayed into a history that was since edited (shortened) is refused too:
// it is left out once ("replay").
func claudeRetry(msg string, drop map[string]bool) string {
	try := func(what string) string {
		if drop[what] {
			return ""
		}
		drop[what] = true
		return what
	}
	switch {
	case strings.Contains(msg, "fallback"):
		return try("fallbacks")
	case strings.Contains(msg, "effort"):
		return try("effort")
	case strings.Contains(msg, "thinking") && (strings.Contains(msg, "block") || strings.Contains(msg, "signature")):
		if r := try("replay"); r != "" {
			return r
		}
		return try("thinking")
	case strings.Contains(msg, "thinking"):
		return try("thinking")
	case strings.Contains(msg, "output_config") || strings.Contains(msg, "format") || strings.Contains(msg, "schema"):
		return try("format")
	}
	return ""
}

// withRawIDs takes the ids of tool calls from the provider's own blocks, so
// results pair with the calls the provider remembers.
func withRawIDs(msgs []Message, prov string) []Message {
	out := make([]Message, len(msgs))
	copy(out, msgs)
	for i := range out {
		m := &out[i]
		if m.Role != "assistant" || m.Raw == nil || m.Raw.Provider != prov || len(m.ToolCalls) == 0 {
			continue
		}
		var ids []string
		switch prov {
		case Anthropic:
			var blocks []struct {
				Type string `json:"type"`
				ID   string `json:"id"`
			}
			_ = json.Unmarshal(m.Raw.Blocks, &blocks)
			for _, b := range blocks {
				if b.Type == "tool_use" {
					ids = append(ids, b.ID)
				}
			}
		}
		if len(ids) != len(m.ToolCalls) {
			continue
		}
		calls := make([]ToolCall, len(m.ToolCalls))
		copy(calls, m.ToolCalls)
		for j := range calls {
			calls[j].ID = ids[j]
		}
		m.ToolCalls = calls
	}
	return out
}

// claudeMessages writes the conversation as Claude's content blocks: tool
// results go back as the next user message, and consecutive messages of one
// side are merged. An assistant message Claude wrote itself goes back as it
// came (thinking with its signature), unless noThinking.
func claudeMessages(msgs []Message, model string, noThinking bool) []map[string]any {
	var out []map[string]any
	add := func(role string, blocks []map[string]any) {
		if len(blocks) == 0 {
			return
		}
		if n := len(out); n > 0 && out[n-1]["role"] == role {
			out[n-1]["content"] = append(out[n-1]["content"].([]map[string]any), blocks...)
			return
		}
		out = append(out, map[string]any{"role": role, "content": blocks})
	}
	for _, m := range msgs {
		switch m.Role {
		case "user":
			var blocks []map[string]any
			for _, img := range m.Images {
				blocks = append(blocks, map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": mediaType(img), "data": img}})
			}
			text := m.Content
			if strings.TrimSpace(text) == "" {
				text = "(empty)"
			}
			blocks = append(blocks, map[string]any{"type": "text", "text": text})
			add("user", blocks)
		case "tool":
			content := m.Content
			if strings.TrimSpace(content) == "" {
				content = "(empty)"
			}
			add("user", []map[string]any{{"type": "tool_result", "tool_use_id": m.ToolCallID, "content": content}})
		case "assistant":
			if m.Raw != nil && m.Raw.Provider == Anthropic && len(m.ToolCalls) > 0 {
				var blocks []map[string]any
				if json.Unmarshal(m.Raw.Blocks, &blocks) == nil && len(blocks) > 0 {
					kept := blocks[:0]
					for _, b := range blocks {
						t, _ := b["type"].(string)
						if (t == "thinking" || t == "redacted_thinking") && (noThinking || m.Raw.Model != model) {
							continue
						}
						if t == "text" {
							if s, _ := b["text"].(string); strings.TrimSpace(s) == "" {
								continue
							}
						}
						kept = append(kept, b)
					}
					add("assistant", kept)
					continue
				}
			}
			var blocks []map[string]any
			if strings.TrimSpace(m.Content) != "" {
				blocks = append(blocks, map[string]any{"type": "text", "text": m.Content})
			}
			for _, c := range m.ToolCalls {
				blocks = append(blocks, map[string]any{"type": "tool_use", "id": c.ID, "name": c.Function.Name, "input": c.Args()})
			}
			if len(blocks) == 0 {
				blocks = append(blocks, map[string]any{"type": "text", "text": "(no answer)"})
			}
			add("assistant", blocks)
		}
	}
	// The newest Claude models take no prefill: the conversation ends on the person.
	if n := len(out); n > 0 && out[n-1]["role"] == "assistant" {
		out = append(out, map[string]any{"role": "user", "content": []map[string]any{{"type": "text", "text": "Continue."}}})
	}
	return out
}

func (a *anthropic) read(ctx context.Context, res *http.Response, onDelta func(Delta), model string) (Reply, error) {
	type block struct {
		Type      string `json:"type"`
		ID        string `json:"id,omitempty"`
		Name      string `json:"name,omitempty"`
		Text      string `json:"text,omitempty"`
		Thinking  string `json:"thinking,omitempty"`
		Signature string `json:"signature,omitempty"`
		Data      string `json:"data,omitempty"`
		input     strings.Builder
	}
	var (
		blocks        []*block
		byIndex       = map[int]*block{}
		reply         Reply
		stop, details string
		streamErr     error
	)
	err := readSSE(res.Body, func(event string, data []byte) bool {
		var ev struct {
			Type    string `json:"type"`
			Index   int    `json:"index"`
			Message struct {
				Usage struct {
					InputTokens         int `json:"input_tokens"`
					CacheRead           int `json:"cache_read_input_tokens"`
					CacheCreation       int `json:"cache_creation_input_tokens"`
				} `json:"usage"`
			} `json:"message"`
			ContentBlock block `json:"content_block"`
			Delta        struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				Thinking    string `json:"thinking"`
				Signature   string `json:"signature"`
				PartialJSON string `json:"partial_json"`
				StopReason  string `json:"stop_reason"`
				StopDetails *struct {
					Category    string `json:"category"`
					Explanation string `json:"explanation"`
				} `json:"stop_details"`
			} `json:"delta"`
			Usage struct {
				OutputTokens int `json:"output_tokens"`
			} `json:"usage"`
			Error struct {
				Type    string `json:"type"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &ev) != nil {
			return true
		}
		switch ev.Type {
		case "message_start":
			u := ev.Message.Usage
			reply.PromptTokens = u.InputTokens + u.CacheRead + u.CacheCreation
		case "content_block_start":
			b := ev.ContentBlock
			nb := &block{Type: b.Type, ID: b.ID, Name: b.Name, Text: b.Text, Thinking: b.Thinking, Signature: b.Signature, Data: b.Data}
			byIndex[ev.Index] = nb
			blocks = append(blocks, nb)
		case "content_block_delta":
			b := byIndex[ev.Index]
			if b == nil {
				return true
			}
			switch ev.Delta.Type {
			case "text_delta":
				b.Text += ev.Delta.Text
				if b.Type == "text" {
					onDelta(Delta{Content: ev.Delta.Text})
				}
			case "thinking_delta":
				b.Thinking += ev.Delta.Thinking
				onDelta(Delta{Thinking: ev.Delta.Thinking})
			case "signature_delta":
				b.Signature += ev.Delta.Signature
			case "input_json_delta":
				b.input.WriteString(ev.Delta.PartialJSON)
			}
		case "message_delta":
			if ev.Delta.StopReason != "" {
				stop = ev.Delta.StopReason
			}
			if d := ev.Delta.StopDetails; d != nil {
				details = strings.TrimSpace(d.Category + " " + d.Explanation)
			}
			reply.OutputTokens = ev.Usage.OutputTokens
		case "error":
			streamErr = fmt.Errorf("Anthropic: %s", ev.Error.Message)
			return false
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

	var content, thinking strings.Builder
	raw := make([]map[string]any, 0, len(blocks))
	for _, b := range blocks {
		switch b.Type {
		case "text":
			content.WriteString(b.Text)
			raw = append(raw, map[string]any{"type": "text", "text": b.Text})
		case "thinking":
			thinking.WriteString(b.Thinking)
			raw = append(raw, map[string]any{"type": "thinking", "thinking": b.Thinking, "signature": b.Signature})
		case "redacted_thinking":
			raw = append(raw, map[string]any{"type": "redacted_thinking", "data": b.Data})
		case "tool_use":
			input := map[string]any{}
			if s := strings.TrimSpace(b.input.String()); s != "" {
				if json.Unmarshal([]byte(s), &input) != nil {
					// Cut off mid-call: the model is asked again.
					return Reply{}, fmt.Errorf("Claude's tool call to %s arrived as unfinished JSON", b.Name)
				}
			}
			raw = append(raw, map[string]any{"type": "tool_use", "id": b.ID, "name": b.Name, "input": input})
			args, _ := json.Marshal(input)
			var tc ToolCall
			tc.ID, tc.Function.Name, tc.Function.Arguments = b.ID, b.Name, args
			reply.ToolCalls = append(reply.ToolCalls, tc)
		}
	}
	if stop == "refusal" && content.Len() == 0 && len(reply.ToolCalls) == 0 {
		why := "Claude declined to answer this request"
		if details != "" {
			why += " (" + details + ")"
		}
		return Reply{}, fmt.Errorf("%s", why)
	}
	reply.Content, reply.Thinking = content.String(), thinking.String()
	switch stop {
	case "max_tokens":
		reply.DoneReason = "length"
	default:
		reply.DoneReason = stop
	}
	if b, err := json.Marshal(raw); err == nil {
		reply.Raw = &Raw{Provider: Anthropic, Model: model, Blocks: b}
	}
	return reply, nil
}

// jsonOnly keeps the JSON object of a reply asked to be JSON without a
// schema the API enforced (a fence or a sentence around it is dropped).
func jsonOnly(s string) string {
	i, j := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if i >= 0 && j > i {
		return s[i : j+1]
	}
	return s
}
