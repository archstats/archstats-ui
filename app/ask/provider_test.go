package ask

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ── Fakes ────────────────────────────────────────────────────────────────

type memSettings map[string]string

func (m memSettings) GetSetting(k string) (string, error) { return m[k], nil }
func (m memSettings) PutSetting(k, v string) error       { m[k] = v; return nil }

type memSecrets map[string]string

func (m memSecrets) get(p string) (string, error) { return m[p], nil }
func (m memSecrets) set(p, k string) error        { m[p] = k; return nil }
func (m memSecrets) del(p string) error           { delete(m, p); return nil }

func newTestService(pol Policy) (*Service, memSecrets, memSettings) {
	st, keys := memSettings{}, memSecrets{}
	s := NewService(st)
	s.keys = keys
	s.policy = func() Policy { return pol }
	return s, keys, st
}

// fakeAPI answers every POST with the next canned SSE stream and records the bodies.
type fakeAPI struct {
	bodies  []map[string]any
	headers []http.Header
	replies []string
	status  []int
}

func (f *fakeAPI) server(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			switch {
			case strings.Contains(r.URL.Path, "/v1/models"):
				fmt.Fprint(w, `{"data":[{"id":"claude-opus-5","display_name":"Claude Opus 5"},{"id":"gpt-5"},{"id":"text-embedding-3-small"}]}`)
			default:
				fmt.Fprint(w, `{"data":[{"id":"gpt-5"},{"id":"text-embedding-3-small"}]}`)
			}
			return
		}
		b, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(b, &body)
		f.bodies = append(f.bodies, body)
		f.headers = append(f.headers, r.Header.Clone())
		i := len(f.bodies) - 1
		if i < len(f.status) && f.status[i] != 0 {
			w.WriteHeader(f.status[i])
			fmt.Fprint(w, f.replies[i])
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, f.replies[i])
	}))
}

func sse(events ...string) string {
	var b strings.Builder
	for _, e := range events {
		b.WriteString(e)
		b.WriteString("\n\n")
	}
	return b.String()
}

func toolSpec(name string) ToolSpec {
	var t ToolSpec
	t.Type = "function"
	t.Function.Name = name
	t.Function.Description = "Looks at " + name
	t.Function.Parameters = json.RawMessage(`{"type":"object","properties":{"of":{"type":"string"}},"required":[]}`)
	return t
}

func call(name, args string) ToolCall {
	var c ToolCall
	c.Function.Name, c.Function.Arguments = name, json.RawMessage(args)
	return c
}

// ── History shape ────────────────────────────────────────────────────────

func TestWellFormedRepairsCutHistory(t *testing.T) {
	msgs := []Message{
		{Role: "system", Content: "sys"},
		{Role: "tool", ToolName: "rank", Content: "cut off from its call"},
		{Role: "assistant", Content: "old answer"},
		{Role: "user", Content: "q"},
		{Role: "assistant", ToolCalls: []ToolCall{call("rank", `{}`), call("about", `{"of":"x"}`)}},
		{Role: "tool", ToolName: "about", Content: "about x"},
		{Role: "user", Content: "next"},
	}
	out := wellFormed(pairToolResults(msgs))
	roles := []string{}
	for _, m := range out {
		roles = append(roles, m.Role)
	}
	if got := strings.Join(roles, ","); got != "system,user,assistant,tool,tool,user" {
		t.Fatalf("roles = %s", got)
	}
	if out[3].ToolName != "about" || out[3].ToolCallID != "call_4_1" {
		t.Errorf("about's result pairs with its own call: %+v", out[3])
	}
	if out[4].ToolName != "rank" || out[4].Content != "(no result kept)" {
		t.Errorf("rank's missing result is noted: %+v", out[4])
	}
}

func TestCheckBaseURL(t *testing.T) {
	for in, ok := range map[string]bool{
		"https://api.example.com/v1":  true,
		"http://localhost:1234/v1":    true,
		"http://192.168.1.20:8000/v1": true,
		"http://api.example.com/v1":   false,
		"ftp://x":                     false,
		"not a url":                   false,
	} {
		if _, err := checkBaseURL(in); (err == nil) != ok {
			t.Errorf("checkBaseURL(%q) err=%v, want ok=%v", in, err, ok)
		}
	}
}

// ── Claude ───────────────────────────────────────────────────────────────

func TestAnthropicToolRoundTrip(t *testing.T) {
	f := &fakeAPI{replies: []string{
		sse(
			`event: message_start`+"\n"+`data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":20}}}`,
			`event: content_block_start`+"\n"+`data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Rank first."}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}`,
			`event: content_block_start`+"\n"+`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"rank"}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"by\":"}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"health\"}"}}`,
			`event: message_delta`+"\n"+`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":30}}`,
			`event: message_stop`+"\n"+`data: {"type":"message_stop"}`,
		),
		sse(
			`event: content_block_start`+"\n"+`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
			`event: content_block_delta`+"\n"+`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Billing is lowest [E1]."}}`,
			`event: message_delta`+"\n"+`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}`,
		),
	}}
	srv := f.server(t)
	defer srv.Close()
	a := &anthropic{base: srv.URL, key: "sk-ant-test", client: srv.Client()}
	think := true
	req := Request{Model: "claude-opus-5", Think: &think, Tools: []ToolSpec{toolSpec("rank")}, Messages: []Message{
		{Role: "system", Content: "You answer about the snapshot."},
		{Role: "user", Content: "What is least healthy?", Images: []string{"iVBORw0KGgo="}},
	}}
	var deltas []Delta
	reply, err := a.chat(t.Context(), req, func(d Delta) { deltas = append(deltas, d) })
	if err != nil {
		t.Fatal(err)
	}
	if len(reply.ToolCalls) != 1 || reply.ToolCalls[0].ID != "toolu_1" || reply.ToolCalls[0].Args()["by"] != "health" {
		t.Fatalf("tool call = %+v", reply.ToolCalls)
	}
	if reply.Thinking != "Rank first." || reply.PromptTokens != 120 || reply.OutputTokens != 30 || reply.Raw == nil {
		t.Fatalf("reply = %+v", reply)
	}
	b := f.bodies[0]
	if f.headers[0].Get("x-api-key") != "sk-ant-test" || f.headers[0].Get("anthropic-version") == "" {
		t.Error("key and version headers")
	}
	if b["system"] != "You answer about the snapshot." || b["temperature"] != nil || b["cache_control"] == nil || b["fallbacks"] != "default" {
		t.Errorf("request = %v", b)
	}
	if th := b["thinking"].(map[string]any); th["type"] != "adaptive" {
		t.Errorf("thinking = %v", th)
	}
	if tools := b["tools"].([]any); tools[0].(map[string]any)["input_schema"] == nil {
		t.Error("tools carry input_schema")
	}
	first := b["messages"].([]any)[0].(map[string]any)["content"].([]any)
	if first[0].(map[string]any)["type"] != "image" {
		t.Error("the figure goes first as an image block")
	}

	// The next step sends the call back as Claude wrote it, with its thinking and the result paired by id.
	req.Messages = append(req.Messages,
		Message{Role: "assistant", ToolCalls: []ToolCall{{ID: reply.ToolCalls[0].ID, Function: reply.ToolCalls[0].Function}}, Raw: reply.Raw},
		Message{Role: "tool", ToolName: "rank", Content: "billing 2.1"},
	)
	reply2, err := a.chat(t.Context(), req, func(Delta) {})
	if err != nil || reply2.Content != "Billing is lowest [E1]." {
		t.Fatalf("second = %+v, %v", reply2, err)
	}
	msgs := f.bodies[1]["messages"].([]any)
	asst := msgs[1].(map[string]any)["content"].([]any)
	if asst[0].(map[string]any)["type"] != "thinking" || asst[0].(map[string]any)["signature"] != "sig-1" || asst[1].(map[string]any)["id"] != "toolu_1" {
		t.Errorf("assistant replay = %v", asst)
	}
	res := msgs[2].(map[string]any)["content"].([]any)[0].(map[string]any)
	if res["type"] != "tool_result" || res["tool_use_id"] != "toolu_1" {
		t.Errorf("tool result = %v", res)
	}
}

func TestAnthropicLeavesOutWhatTheModelRefuses(t *testing.T) {
	f := &fakeAPI{
		status:  []int{400, 0},
		replies: []string{`{"type":"error","error":{"type":"invalid_request_error","message":"output_config.effort: not supported on this model"}}`, sse(`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"ok"}}`)},
	}
	srv := f.server(t)
	defer srv.Close()
	a := &anthropic{base: srv.URL, key: "k", client: srv.Client()}
	reply, err := a.chat(t.Context(), Request{Model: "claude-sonnet-4-6", Messages: []Message{{Role: "user", Content: "hi"}}}, func(Delta) {})
	if err != nil || reply.Content != "ok" {
		t.Fatalf("%+v %v", reply, err)
	}
	if oc, _ := f.bodies[1]["output_config"].(map[string]any); oc["effort"] != nil {
		t.Error("asked again without effort")
	}
}

// ── OpenAI ───────────────────────────────────────────────────────────────

func TestOpenAIStreamsToolCallsInPieces(t *testing.T) {
	f := &fakeAPI{replies: []string{sse(
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"rank","arguments":""}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"by\":"}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"size\"}"}}]},"finish_reason":"tool_calls"}]}`,
		`data: {"choices":[],"usage":{"prompt_tokens":50,"completion_tokens":9}}`,
		`data: [DONE]`,
	)}}
	srv := f.server(t)
	defer srv.Close()
	o := &openai{id: OpenAI, who: "OpenAI", base: srv.URL, key: "sk-test", client: srv.Client()}
	msgs := []Message{
		{Role: "user", Content: "q"},
		{Role: "assistant", ToolCalls: []ToolCall{call("about", `{"of":"x"}`)}},
		{Role: "tool", ToolName: "about", Content: "x is big"},
	}
	reply, err := o.chat(t.Context(), Request{Model: "gpt-5", Messages: msgs, Tools: []ToolSpec{toolSpec("rank")}}, func(Delta) {})
	if err != nil {
		t.Fatal(err)
	}
	if len(reply.ToolCalls) != 1 || reply.ToolCalls[0].ID != "call_a" || reply.ToolCalls[0].Args()["by"] != "size" || reply.PromptTokens != 50 {
		t.Fatalf("reply = %+v", reply)
	}
	b := f.bodies[0]
	if f.headers[0].Get("Authorization") != "Bearer sk-test" || b["reasoning_effort"] != "low" || b["temperature"] != nil {
		t.Errorf("request = %v", b)
	}
	sent := b["messages"].([]any)
	asst, tool := sent[1].(map[string]any), sent[2].(map[string]any)
	id := asst["tool_calls"].([]any)[0].(map[string]any)["id"]
	if id == "" || tool["tool_call_id"] != id {
		t.Errorf("tool result pairs with its call: %v / %v", asst, tool)
	}
}

func TestOpenAIModelsKeepsChatModels(t *testing.T) {
	f := &fakeAPI{}
	srv := f.server(t)
	defer srv.Close()
	o := &openai{id: OpenAI, who: "OpenAI", base: srv.URL, key: "k", client: srv.Client()}
	ms, err := o.models(t.Context())
	if err != nil || len(ms) != 1 || ms[0].ID != "openai/gpt-5" || !ms[0].Remote {
		t.Fatalf("%+v %v", ms, err)
	}
}

// ── Gemini ───────────────────────────────────────────────────────────────

func TestGeminiKeepsThoughtSignatures(t *testing.T) {
	f := &fakeAPI{replies: []string{
		sse(
			`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Look at ranks","thought":true}]}}]}`,
			`data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"rank","args":{"by":"churn"}},"thoughtSignature":"gsig"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":40,"candidatesTokenCount":5,"thoughtsTokenCount":7}}`,
		),
		sse(`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Done."}]},"finishReason":"STOP"}]}`),
	}}
	srv := f.server(t)
	defer srv.Close()
	g := &gemini{base: srv.URL, key: "g-key", client: srv.Client()}
	req := Request{Model: "gemini-3-pro", Tools: []ToolSpec{toolSpec("rank")}, Messages: []Message{{Role: "system", Content: "sys"}, {Role: "user", Content: "q"}}}
	reply, err := g.chat(t.Context(), req, func(Delta) {})
	if err != nil {
		t.Fatal(err)
	}
	if reply.Thinking != "Look at ranks" || len(reply.ToolCalls) != 1 || reply.ToolCalls[0].Args()["by"] != "churn" || reply.OutputTokens != 12 {
		t.Fatalf("reply = %+v", reply)
	}
	if f.headers[0].Get("x-goog-api-key") != "g-key" || f.bodies[0]["systemInstruction"] == nil {
		t.Error("key header and system instruction")
	}
	req.Messages = append(req.Messages,
		Message{Role: "assistant", ToolCalls: reply.ToolCalls, Raw: reply.Raw},
		Message{Role: "tool", ToolName: "rank", Content: "billing"},
		// A call the app placed itself carries no signature of Gemini's.
		Message{Role: "assistant", ToolCalls: []ToolCall{call("about", `{}`)}},
		Message{Role: "tool", ToolName: "about", Content: "about"},
	)
	if _, err := g.chat(t.Context(), req, func(Delta) {}); err != nil {
		t.Fatal(err)
	}
	contents := f.bodies[1]["contents"].([]any)
	model := contents[1].(map[string]any)["parts"].([]any)
	var signed, placed bool
	for _, p := range model {
		pm := p.(map[string]any)
		if pm["functionCall"] != nil && pm["thoughtSignature"] == "gsig" {
			signed = true
		}
	}
	for _, c := range contents[3:] {
		for _, p := range c.(map[string]any)["parts"].([]any) {
			if p.(map[string]any)["thoughtSignature"] == "skip_thought_signature_validator" {
				placed = true
			}
		}
	}
	if !signed || !placed {
		t.Errorf("signature replay: signed=%v placed=%v in %v", signed, placed, contents)
	}
}

// ── The switch, the policy and the keys ──────────────────────────────────

func TestAIStartsOff(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-from-the-environment")
	s, _, settings := newTestService(Policy{})
	if st := s.Status(); st.Enabled || st.Switch {
		t.Errorf("a fresh install has AI on: %+v", st)
	}
	// Settings saved before the switch existed have no "enabled" field.
	settings[settingsKey] = `{"providers":{"ollama":{"on":true}}}`
	if st := s.Status(); st.Enabled {
		t.Errorf("older settings turned AI on: %+v", st)
	}
}

func TestNothingIsSentWhileOff(t *testing.T) {
	s, _, _ := newTestService(Policy{})
	if _, err := s.Chat("x", `{"model":"anthropic/claude-opus-5","messages":[]}`); !errors.Is(err, ErrOff) {
		t.Errorf("chat while off: %v", err)
	}
	if _, err := s.Models(); !errors.Is(err, ErrOff) {
		t.Errorf("models while off: %v", err)
	}
	if _, err := s.Embed("", []string{"x"}); !errors.Is(err, ErrOff) {
		t.Errorf("embed while off: %v", err)
	}
}

func TestPolicyHoldsTheSwitchOff(t *testing.T) {
	s, _, _ := newTestService(Policy{Off: true, Reason: "Set by your organisation"})
	if err := s.SetEnabled(true); err == nil {
		t.Fatal("a policy that holds AI off wins over the switch")
	}
	st := s.Status()
	if st.Enabled || !st.Locked {
		t.Errorf("status = %+v", st)
	}
}

func TestLocalOnlyPolicyAllowsOnlyThisMachine(t *testing.T) {
	s, keys, _ := newTestService(Policy{LocalOnly: true})
	keys["anthropic"] = "sk-ant-abcdefgh1234"
	_ = s.SetEnabled(true)
	for _, p := range s.Status().Providers {
		if p.ID == Anthropic && (p.Allowed || p.Ready) {
			t.Error("a cloud provider is not allowed under a local-only policy")
		}
		if p.ID == Ollama && !p.Allowed {
			t.Error("Ollama on this machine stays allowed")
		}
	}
}

func TestKeysAreStoredButNeverReturned(t *testing.T) {
	s, keys, settings := newTestService(Policy{})
	if err := s.SetKey(Anthropic, "  sk-ant-secret-value-9876 \n"); err != nil {
		t.Fatal(err)
	}
	if keys[Anthropic] != "sk-ant-secret-value-9876" {
		t.Errorf("stored %q", keys[Anthropic])
	}
	status, _ := json.Marshal(s.Status())
	if strings.Contains(string(status), "secret-value") || strings.Contains(settings[settingsKey], "secret-value") {
		t.Fatal("the key leaked into the status or the settings")
	}
	var anth ProviderStatus
	for _, p := range s.Status().Providers {
		if p.ID == Anthropic {
			anth = p
		}
	}
	if !anth.HasKey || anth.KeySource != "keychain" || anth.KeyHint != "9876" || !anth.On || !anth.Ready {
		t.Errorf("provider = %+v", anth)
	}
	if err := s.DeleteKey(Anthropic); err != nil || keys[Anthropic] != "" {
		t.Errorf("delete: %v", err)
	}
	if err := s.SetKey(Anthropic, "has spaces in it"); err == nil {
		t.Error("a key with spaces is refused")
	}
}

func TestEnvironmentKeyIsUsedWhenNoneIsStored(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-from-env")
	s, _, _ := newTestService(Policy{})
	for _, p := range s.Status().Providers {
		if p.ID == OpenAI && (p.KeySource != "OPENAI_API_KEY" || !p.HasKey || p.KeyHint != "") {
			t.Errorf("provider = %+v", p)
		}
	}
}

func TestChatRoutesByProvider(t *testing.T) {
	f := &fakeAPI{replies: []string{sse(`data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}`, `data: [DONE]`)}}
	srv := f.server(t)
	defer srv.Close()
	s, _, _ := newTestService(Policy{})
	_ = s.SetEnabled(true)
	if err := s.SaveProvider(OpenAICompatible, ProviderInput{On: true, BaseURL: srv.URL, Name: "LM Studio"}); err != nil {
		t.Fatal(err)
	}
	var got []string
	s.SetEmitter(func(event string, data ...any) { got = append(got, event) })
	out, err := s.Chat("t1", `{"model":"openai-compatible/qwen","messages":[{"role":"user","content":"hi"}]}`)
	if err != nil {
		t.Fatal(err)
	}
	var reply Reply
	_ = json.Unmarshal([]byte(out), &reply)
	if reply.Content != "hello" || len(got) == 0 || f.bodies[0]["model"] != "qwen" {
		t.Errorf("reply = %+v, events = %v, body = %v", reply, got, f.bodies[0])
	}
	if _, has := f.headers[0]["Authorization"]; has {
		t.Error("no key, no Authorization header")
	}
}
