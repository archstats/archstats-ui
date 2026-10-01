package ask

import (
	"context"
	"errors"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// The Ask loop lives in the frontend and speaks one message format (Ollama's
// chat shape, plus tool call ids and the provider's own reply blocks). Each
// provider below translates it to its API and back, so the loop never knows
// which model answers.

// Model is one model a provider offers, and what it can do.
type Model struct {
	// ID is "<provider>/<name>": what the frontend picks and sends back.
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Name     string `json:"name"`
	Label    string `json:"label"`
	Size     int64  `json:"size"`
	Tools    bool   `json:"tools"`
	Vision   bool   `json:"vision"`
	Think    bool   `json:"think"`
	// Remote: the conversation leaves this machine.
	Remote bool `json:"remote"`
}

// Message is one message of a conversation, as the frontend sends it.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolName   string     `json:"tool_name,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Images     []string   `json:"images,omitempty"`
	// Raw is what a provider returned for this assistant message (thinking
	// with its signature, tool calls with their ids). Sent back unchanged to
	// the provider that wrote it; any other provider ignores it.
	Raw *Raw `json:"raw,omitempty"`
}

// ToolCall is one call the model asked for.
type ToolCall struct {
	ID       string `json:"id,omitempty"`
	Function struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	} `json:"function"`
}

// Args reads the call's arguments, whether sent as an object or as a string.
func (c ToolCall) Args() map[string]any {
	out := map[string]any{}
	raw := c.Function.Arguments
	if len(raw) == 0 {
		return out
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		_ = json.Unmarshal([]byte(s), &out)
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

// Raw is a provider's own content for one assistant message.
type Raw struct {
	Provider string          `json:"provider"`
	Model    string          `json:"model"`
	Blocks   json.RawMessage `json:"blocks"`
}

// ToolSpec is a tool the model may call (OpenAI's function shape).
type ToolSpec struct {
	Type     string `json:"type"`
	Function struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
	} `json:"function"`
}

// Request is one model call.
type Request struct {
	Model    string     `json:"model"`
	Messages []Message  `json:"messages"`
	Tools    []ToolSpec `json:"tools,omitempty"`
	// Format is a JSON schema the reply must follow.
	Format json.RawMessage `json:"format,omitempty"`
	// Think: let the model reason first. Nil when the model cannot.
	Think *bool `json:"think,omitempty"`
}

// Reply is what a call returns to the frontend.
type Reply struct {
	Stopped      bool       `json:"stopped"`
	Content      string     `json:"content"`
	Thinking     string     `json:"thinking"`
	ToolCalls    []ToolCall `json:"toolCalls"`
	PromptTokens int        `json:"promptTokens"`
	OutputTokens int        `json:"outputTokens"`
	Ms           int64      `json:"ms"`
	DoneReason   string     `json:"doneReason,omitempty"`
	Raw          *Raw       `json:"raw,omitempty"`
}

// Delta is a piece of a streamed reply.
type Delta struct{ Content, Thinking string }

// provider is one model API.
type provider interface {
	models(ctx context.Context) ([]Model, error)
	chat(ctx context.Context, req Request, onDelta func(Delta)) (Reply, error)
}

// Kind describes a provider the settings can configure.
type Kind struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Cloud: it runs elsewhere, so what is asked leaves this machine.
	Cloud bool `json:"cloud"`
	// NeedsKey: it cannot be used without an API key.
	NeedsKey bool `json:"needsKey"`
	// TakesKey: a key can be stored for it (optional when NeedsKey is false).
	TakesKey bool `json:"takesKey"`
	// NeedsURL: it has no default address.
	NeedsURL   bool   `json:"needsUrl"`
	DefaultURL string `json:"defaultUrl"`
	// EnvKey is the environment variable read when no key is stored.
	EnvKey string `json:"envKey"`
	// KeyURL is where the person gets a key.
	KeyURL string `json:"keyUrl"`
}

const (
	Ollama           = "ollama"
	Anthropic        = "anthropic"
	OpenAI           = "openai"
	Gemini           = "gemini"
	OpenAICompatible = "openai-compatible"
)

// Kinds are the providers, in the order the settings list them.
var Kinds = []Kind{
	{ID: Ollama, Label: "Ollama", DefaultURL: "http://127.0.0.1:11434"},
	{ID: Anthropic, Label: "Anthropic (Claude)", Cloud: true, NeedsKey: true, TakesKey: true, DefaultURL: "https://api.anthropic.com", EnvKey: "ANTHROPIC_API_KEY", KeyURL: "https://console.anthropic.com/settings/keys"},
	{ID: OpenAI, Label: "OpenAI", Cloud: true, NeedsKey: true, TakesKey: true, DefaultURL: "https://api.openai.com/v1", EnvKey: "OPENAI_API_KEY", KeyURL: "https://platform.openai.com/api-keys"},
	{ID: Gemini, Label: "Google Gemini", Cloud: true, NeedsKey: true, TakesKey: true, DefaultURL: "https://generativelanguage.googleapis.com/v1beta", EnvKey: "GEMINI_API_KEY", KeyURL: "https://aistudio.google.com/apikey"},
	{ID: OpenAICompatible, Label: "OpenAI-compatible server", TakesKey: true, NeedsURL: true},
}

func kindOf(id string) (Kind, bool) {
	for _, k := range Kinds {
		if k.ID == id {
			return k, true
		}
	}
	return Kind{}, false
}

// splitModelID reads "<provider>/<name>"; a bare name is an Ollama model
// (conversations and settings saved before providers existed).
func splitModelID(id string) (string, string) {
	if p, name, ok := strings.Cut(id, "/"); ok {
		if _, known := kindOf(p); known {
			return p, name
		}
	}
	return Ollama, id
}

// checkBaseURL accepts https anywhere, and plain http only on this machine
// or a private network, so a key never crosses the internet unencrypted.
func checkBaseURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("%q is not an address such as https://host/v1", raw)
	}
	if u.Scheme == "http" && !nearby(u.Hostname()) {
		return "", fmt.Errorf("%s is on the internet: use https", u.Host)
	}
	u.RawQuery, u.Fragment = "", ""
	return strings.TrimRight(u.String(), "/"), nil
}

// nearby: this machine or a private network.
func nearby(host string) bool {
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast())
}

// onThisMachine: the address is this computer.
func onThisMachine(base string) bool {
	u, err := url.Parse(base)
	if err != nil {
		return false
	}
	h := u.Hostname()
	if h == "localhost" || strings.HasSuffix(h, ".localhost") {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// mediaType guesses an image's type from its base64 start (the frontend
// sends PNGs of figures, but a pasted picture may be a JPEG).
func mediaType(b64 string) string {
	switch {
	case strings.HasPrefix(b64, "/9j/"):
		return "image/jpeg"
	case strings.HasPrefix(b64, "R0lGOD"):
		return "image/gif"
	case strings.HasPrefix(b64, "UklGR"):
		return "image/webp"
	default:
		return "image/png"
	}
}

// pairToolResults gives every tool message the id of the call it answers:
// the frontend's messages name the tool, and ids are assigned here in order
// ("call_<message>_<n>") unless the provider returned its own.
func pairToolResults(msgs []Message) []Message {
	out := make([]Message, len(msgs))
	copy(out, msgs)
	var pending []ToolCall
	for i := range out {
		m := &out[i]
		switch m.Role {
		case "assistant":
			calls := make([]ToolCall, len(m.ToolCalls))
			copy(calls, m.ToolCalls)
			for j := range calls {
				if calls[j].ID == "" {
					calls[j].ID = fmt.Sprintf("call_%d_%d", i, j)
				}
			}
			m.ToolCalls = calls
			pending = append([]ToolCall(nil), calls...)
		case "tool":
			if m.ToolCallID != "" {
				continue
			}
			at := -1
			for j, c := range pending {
				if c.Function.Name == m.ToolName {
					at = j
					break
				}
			}
			if at < 0 && len(pending) > 0 {
				at = 0
			}
			if at >= 0 {
				m.ToolCallID = pending[at].ID
				if m.ToolName == "" {
					m.ToolName = pending[at].Function.Name
				}
				pending = append(pending[:at], pending[at+1:]...)
			} else {
				m.ToolCallID = fmt.Sprintf("call_%d_orphan", i)
			}
		}
	}
	return out
}

// wellFormed makes a history every API accepts: it starts at a question,
// every tool call is answered right after it (a call whose result was cut
// away gets a note saying so), and a result whose call was cut away becomes
// plain text. The frontend shortens old history, which can cut a pair apart.
func wellFormed(msgs []Message) []Message {
	out := make([]Message, 0, len(msgs))
	started := false
	var open []ToolCall
	closeOpen := func() {
		for _, c := range open {
			out = append(out, Message{Role: "tool", ToolName: c.Function.Name, ToolCallID: c.ID, Content: "(no result kept)"})
		}
		open = nil
	}
	for _, m := range msgs {
		if m.Role == "system" {
			out = append(out, m)
			continue
		}
		if !started {
			if m.Role != "user" {
				continue
			}
			started = true
		}
		if m.Role == "tool" {
			at := -1
			for j, c := range open {
				if c.ID == m.ToolCallID {
					at = j
					break
				}
			}
			if at < 0 {
				out = append(out, Message{Role: "user", Content: fmt.Sprintf("[Result of %s]\n%s", m.ToolName, m.Content)})
				continue
			}
			open = append(open[:at], open[at+1:]...)
			out = append(out, m)
			continue
		}
		closeOpen()
		out = append(out, m)
		if m.Role == "assistant" && len(m.ToolCalls) > 0 {
			open = append([]ToolCall(nil), m.ToolCalls...)
		}
	}
	closeOpen()
	return out
}

// systemText joins the system messages; the rest are the conversation.
func systemText(msgs []Message) (string, []Message) {
	var sys []string
	rest := make([]Message, 0, len(msgs))
	for _, m := range msgs {
		if m.Role == "system" {
			sys = append(sys, m.Content)
		} else {
			rest = append(rest, m)
		}
	}
	return strings.Join(sys, "\n\n"), rest
}

// schemaObject turns a raw schema into a map, or nil.
func schemaObject(raw json.RawMessage) map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return nil
	}
	return m
}

// strictSchema closes every object (additionalProperties: false) and drops
// keywords structured-output validators refuse, for the providers that
// compile a reply schema.
func strictSchema(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, x := range t {
			switch k {
			case "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "default", "examples":
				continue
			}
			out[k] = strictSchema(x)
		}
		if out["type"] == "object" {
			out["additionalProperties"] = false
			if _, ok := out["properties"]; !ok {
				out["properties"] = map[string]any{}
			}
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = strictSchema(x)
		}
		return out
	default:
		return v
	}
}

// apiError is a refusal from a model API, with its own message.
type apiError struct {
	Who    string
	Status int
	Msg    string
}

func (e *apiError) Error() string {
	switch e.Status {
	case 401, 403:
		return fmt.Sprintf("%s refused the API key (%d): %s", e.Who, e.Status, e.Msg)
	case 429:
		return fmt.Sprintf("%s is rate limiting or out of credit (429): %s", e.Who, e.Msg)
	}
	return fmt.Sprintf("%s answered %d: %s", e.Who, e.Status, e.Msg)
}

// badRequest: the API refused the request itself (an option, the schema,
// the history), which may be answered when asked without it.
func badRequest(err error) (string, bool) {
	var e *apiError
	if errors.As(err, &e) && e.Status == 400 {
		return strings.ToLower(e.Msg), true
	}
	return "", false
}

// httpError reads an API's error body into one line.
func httpError(who string, status int, body []byte) error {
	var e struct {
		Error any `json:"error"`
	}
	msg := strings.TrimSpace(string(body))
	if json.Unmarshal(body, &e) == nil && e.Error != nil {
		switch x := e.Error.(type) {
		case string:
			msg = x
		case map[string]any:
			if m, ok := x["message"].(string); ok {
				msg = m
			}
		}
	} else {
		// Gemini wraps its error in a list.
		var list []struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(body, &list) == nil && len(list) > 0 && list[0].Error.Message != "" {
			msg = list[0].Error.Message
		}
	}
	if len(msg) > 400 {
		msg = msg[:400] + "…"
	}
	return &apiError{Who: who, Status: status, Msg: msg}
}
