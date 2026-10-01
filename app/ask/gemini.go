package ask

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// gemini is Google's Gemini API (AI Studio keys).
type gemini struct {
	base   string
	key    string
	client *http.Client
}

const geminiWho = "Gemini"

func (g *gemini) headers() map[string]string { return map[string]string{"x-goog-api-key": g.key} }

var geminiNotChat = regexp.MustCompile(`(embedding|tts|image|audio|live|aqa|robotics|learnlm|gemma)`)

func (g *gemini) models(ctx context.Context) ([]Model, error) {
	var list struct {
		Models []struct {
			Name        string   `json:"name"`
			DisplayName string   `json:"displayName"`
			Methods     []string `json:"supportedGenerationMethods"`
			Thinking    bool     `json:"thinking"`
		} `json:"models"`
	}
	if err := getJSON(ctx, g.client, geminiWho, g.base+"/models?pageSize=1000", g.headers(), &list); err != nil {
		return nil, err
	}
	out := make([]Model, 0, len(list.Models))
	for _, m := range list.Models {
		name := strings.TrimPrefix(m.Name, "models/")
		chat := false
		for _, x := range m.Methods {
			chat = chat || x == "generateContent"
		}
		if !chat || !strings.HasPrefix(name, "gemini-") || geminiNotChat.MatchString(name) {
			continue
		}
		label := m.DisplayName
		if label == "" {
			label = name
		}
		out = append(out, Model{ID: Gemini + "/" + name, Provider: Gemini, Name: name, Label: label, Tools: true, Vision: true, Think: m.Thinking || geminiThinks(name), Remote: true})
	}
	return out, nil
}

func geminiThinks(model string) bool {
	return strings.HasPrefix(model, "gemini-2.5") || strings.HasPrefix(model, "gemini-3")
}

func (g *gemini) chat(ctx context.Context, req Request, onDelta func(Delta)) (Reply, error) {
	system, rest := systemText(wellFormed(pairToolResults(withRawIDs(req.Messages, Gemini))))
	body := map[string]any{"contents": geminiContents(rest, req.Model)}
	if system != "" {
		body["systemInstruction"] = map[string]any{"parts": []map[string]any{{"text": system}}}
	}
	if len(req.Tools) > 0 {
		decls := make([]map[string]any, len(req.Tools))
		for i, t := range req.Tools {
			d := map[string]any{"name": t.Function.Name, "description": t.Function.Description}
			if p := schemaObject(t.Function.Parameters); p != nil {
				d["parametersJsonSchema"] = p
			}
			decls[i] = d
		}
		body["tools"] = []map[string]any{{"functionDeclarations": decls}}
	}
	gen := map[string]any{"maxOutputTokens": 16000}
	if f := schemaObject(req.Format); f != nil {
		gen["responseMimeType"] = "application/json"
		gen["responseJsonSchema"] = f
	}
	if geminiThinks(req.Model) {
		tc := map[string]any{"includeThoughts": true}
		if req.Think == nil || !*req.Think {
			switch {
			case strings.HasPrefix(req.Model, "gemini-3"):
				tc["thinkingLevel"] = "low"
			case strings.Contains(req.Model, "flash"):
				tc["thinkingBudget"] = 0
			}
		}
		gen["thinkingConfig"] = tc
	}
	body["generationConfig"] = gen

	url := fmt.Sprintf("%s/models/%s:streamGenerateContent?alt=sse", g.base, req.Model)
	started := time.Now()
	for attempt := 0; ; attempt++ {
		res, err := post(ctx, g.client, geminiWho, url, g.headers(), body)
		if err != nil {
			if msg, bad := badRequest(err); bad && attempt < 3 {
				switch {
				case strings.Contains(msg, "think") && gen["thinkingConfig"] != nil:
					delete(gen, "thinkingConfig")
					continue
				case strings.Contains(msg, "schema") && gen["responseJsonSchema"] != nil:
					delete(gen, "responseJsonSchema")
					continue
				}
			}
			return Reply{}, err
		}
		reply, err := g.read(ctx, res, onDelta, req.Model)
		res.Body.Close()
		if gen["responseMimeType"] != nil {
			reply.Content = jsonOnly(reply.Content)
		}
		reply.Ms = time.Since(started).Milliseconds()
		return reply, err
	}
}

// geminiContents writes the conversation as Gemini's contents. A turn Gemini
// wrote goes back with its parts as they came (a function call carries a
// thought signature the next request must return); a call the app placed
// itself is marked as such, since it has none.
func geminiContents(msgs []Message, model string) []map[string]any {
	var out []map[string]any
	add := func(role string, parts []map[string]any) {
		if len(parts) == 0 {
			return
		}
		if n := len(out); n > 0 && out[n-1]["role"] == role {
			out[n-1]["parts"] = append(out[n-1]["parts"].([]map[string]any), parts...)
			return
		}
		out = append(out, map[string]any{"role": role, "parts": parts})
	}
	for _, m := range msgs {
		switch m.Role {
		case "user":
			var parts []map[string]any
			for _, img := range m.Images {
				parts = append(parts, map[string]any{"inlineData": map[string]any{"mimeType": mediaType(img), "data": img}})
			}
			text := m.Content
			if strings.TrimSpace(text) == "" {
				text = "(empty)"
			}
			add("user", append(parts, map[string]any{"text": text}))
		case "tool":
			fr := map[string]any{"name": m.ToolName, "response": map[string]any{"content": m.Content}}
			if strings.HasPrefix(m.ToolCallID, "gem:") {
				fr["id"] = strings.TrimPrefix(m.ToolCallID, "gem:")
			}
			add("user", []map[string]any{{"functionResponse": fr}})
		case "assistant":
			if m.Raw != nil && m.Raw.Provider == Gemini && m.Raw.Model == model && len(m.ToolCalls) > 0 {
				var parts []map[string]any
				if json.Unmarshal(m.Raw.Blocks, &parts) == nil && len(parts) > 0 {
					add("model", parts)
					continue
				}
			}
			var parts []map[string]any
			if strings.TrimSpace(m.Content) != "" {
				parts = append(parts, map[string]any{"text": m.Content})
			}
			for _, c := range m.ToolCalls {
				part := map[string]any{"functionCall": map[string]any{"name": c.Function.Name, "args": c.Args()}}
				if strings.HasPrefix(model, "gemini-3") {
					part["thoughtSignature"] = "skip_thought_signature_validator"
				}
				parts = append(parts, part)
			}
			if len(parts) == 0 {
				parts = append(parts, map[string]any{"text": "(no answer)"})
			}
			add("model", parts)
		}
	}
	return out
}

func (g *gemini) read(ctx context.Context, res *http.Response, onDelta func(Delta), model string) (Reply, error) {
	type part struct {
		Text         string         `json:"text,omitempty"`
		Thought      bool           `json:"thought,omitempty"`
		Signature    string         `json:"thoughtSignature,omitempty"`
		FunctionCall map[string]any `json:"functionCall,omitempty"`
	}
	var (
		reply             Reply
		content, thinking strings.Builder
		parts             []part
		finish            string
		streamErr         error
	)
	err := readSSE(res.Body, func(_ string, data []byte) bool {
		var chunk struct {
			Candidates []struct {
				Content struct {
					Parts []part `json:"parts"`
				} `json:"content"`
				FinishReason string `json:"finishReason"`
			} `json:"candidates"`
			Usage struct {
				Prompt   int `json:"promptTokenCount"`
				Output   int `json:"candidatesTokenCount"`
				Thoughts int `json:"thoughtsTokenCount"`
			} `json:"usageMetadata"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &chunk) != nil {
			return true
		}
		if chunk.Error != nil {
			streamErr = fmt.Errorf("Gemini: %s", chunk.Error.Message)
			return false
		}
		if chunk.Usage.Prompt > 0 {
			reply.PromptTokens, reply.OutputTokens = chunk.Usage.Prompt, chunk.Usage.Output+chunk.Usage.Thoughts
		}
		for _, c := range chunk.Candidates {
			if c.FinishReason != "" {
				finish = c.FinishReason
			}
			for _, p := range c.Content.Parts {
				if p.FunctionCall == nil && p.Text != "" {
					if p.Thought {
						thinking.WriteString(p.Text)
						onDelta(Delta{Thinking: p.Text})
					} else {
						content.WriteString(p.Text)
						onDelta(Delta{Content: p.Text})
					}
				}
				// Streamed text arrives in pieces: joined, keeping each signature on its part.
				if n := len(parts); n > 0 && p.FunctionCall == nil && parts[n-1].FunctionCall == nil && parts[n-1].Thought == p.Thought && (p.Signature == "" || parts[n-1].Signature == "") {
					parts[n-1].Text += p.Text
					if p.Signature != "" {
						parts[n-1].Signature = p.Signature
					}
					continue
				}
				parts = append(parts, p)
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
	for i, p := range parts {
		if p.FunctionCall == nil {
			continue
		}
		name, _ := p.FunctionCall["name"].(string)
		args, _ := json.Marshal(p.FunctionCall["args"])
		if string(args) == "null" {
			args = []byte("{}")
		}
		var tc ToolCall
		if id, _ := p.FunctionCall["id"].(string); id != "" {
			tc.ID = "gem:" + id
		} else {
			tc.ID = fmt.Sprintf("gem_%d", i)
		}
		tc.Function.Name, tc.Function.Arguments = name, args
		reply.ToolCalls = append(reply.ToolCalls, tc)
	}
	switch finish {
	case "SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII":
		if content.Len() == 0 && len(reply.ToolCalls) == 0 {
			return Reply{}, fmt.Errorf("Gemini declined to answer this request (%s)", strings.ToLower(finish))
		}
	case "MAX_TOKENS":
		finish = "length"
	}
	reply.Content, reply.Thinking, reply.DoneReason = content.String(), thinking.String(), strings.ToLower(finish)
	if b, err := json.Marshal(parts); err == nil {
		reply.Raw = &Raw{Provider: Gemini, Model: model, Blocks: b}
	}
	return reply, nil
}
