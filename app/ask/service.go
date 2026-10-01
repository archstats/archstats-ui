// Package ask carries the Ask pane's model calls. The agent loop and its
// tools live in the frontend, where the views' own logic is; this side holds
// the AI settings and the keys, and sends each chat request to the provider
// the model belongs to, streaming the reply back as events. Nothing is sent
// anywhere while AI features are off.
package ask

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ErrOff is the answer to any model call while AI features are off.
var ErrOff = errors.New("AI features are off. Turn them on in Settings → AI")

// Service holds the settings and the running requests.
type Service struct {
	settings Settings
	keys     secrets
	client   *http.Client
	policy   func() Policy

	mu      sync.Mutex
	cfg     Config
	cancels map[string]context.CancelFunc
	// stored holds keys read from the keychain once (reading it runs a
	// system tool); "" is a known absence.
	stored map[string]string
	emit   func(event string, data ...any)
	// lists holds each provider's model list for a while (see listOf).
	lists map[string]*modelList
}

// modelList is one provider's model list, or the refusal that came
// instead; done is closed once it has arrived.
type modelList struct {
	key    string
	at     time.Time
	done   chan struct{}
	models []Model
	err    error
}

// How long a provider's answer to "which models" stands: a list for five
// minutes, a refusal for thirty seconds.
const (
	modelsFresh  = 5 * time.Minute
	refusalFresh = 30 * time.Second
)

// NewService reads the stored settings; keys stay in the system keychain.
func NewService(s Settings) *Service {
	return &Service{settings: s, keys: keychain{}, client: &http.Client{Transport: requestLog{http.DefaultTransport}}, policy: readPolicy, cfg: loadConfig(s), cancels: map[string]context.CancelFunc{}, stored: map[string]string{}, lists: map[string]*modelList{}}
}

// SetEmitter wires event emission (in production: Wails runtime.EventsEmit).
func (s *Service) SetEmitter(emit func(event string, data ...any)) { s.emit = emit }

// ── Status and settings ──────────────────────────────────────────────────

// Status is what the settings screen and every AI entry point read.
type Status struct {
	// Enabled: AI features are on (the switch, and no policy holds them off).
	Enabled bool `json:"enabled"`
	// Switch is the person's own setting.
	Switch bool `json:"switch"`
	// Locked: a policy holds the switch off.
	Locked     bool             `json:"locked"`
	Policy     string           `json:"policy"`
	PolicyPath string           `json:"policyPath"`
	Providers  []ProviderStatus `json:"providers"`
}

// ProviderStatus is one provider as the settings show it. The key itself is
// never part of it: only whether there is one, where from, and its last four.
type ProviderStatus struct {
	Kind
	On        bool   `json:"on"`
	BaseURL   string `json:"baseUrl"`
	Name      string `json:"name"`
	ShareCode bool   `json:"shareCode"`
	HasKey    bool   `json:"hasKey"`
	// KeySource is "keychain", the environment variable's name, or "".
	KeySource string `json:"keySource"`
	KeyHint   string `json:"keyHint"`
	// Allowed by policy.
	Allowed bool `json:"allowed"`
	// Ready: on, allowed, and has what it needs (key, address).
	Ready bool `json:"ready"`
	// Local: it runs on this machine.
	Local bool `json:"local"`
}

func (s *Service) Status() Status {
	s.mu.Lock()
	cfg := s.cfg
	s.mu.Unlock()
	pol := s.policy()
	st := Status{Switch: cfg.Enabled, Locked: pol.Off, Policy: pol.Reason, PolicyPath: PolicyPath()}
	st.Enabled = cfg.Enabled && !pol.Off
	for _, k := range Kinds {
		st.Providers = append(st.Providers, s.providerStatus(k, cfg.Providers[k.ID], pol))
	}
	return st
}

func (s *Service) baseURL(k Kind, pc ProviderConfig) string {
	if pc.BaseURL != "" {
		return pc.BaseURL
	}
	if k.ID == Ollama {
		if h := strings.TrimRight(os.Getenv("OLLAMA_HOST"), "/"); h != "" {
			if !strings.HasPrefix(h, "http") {
				h = "http://" + h
			}
			return h
		}
	}
	return k.DefaultURL
}

func (s *Service) providerStatus(k Kind, pc ProviderConfig, pol Policy) ProviderStatus {
	base := s.baseURL(k, pc)
	ps := ProviderStatus{Kind: k, On: pc.On, BaseURL: base, Name: pc.Name, ShareCode: pc.ShareCode, KeyHint: pc.KeyHint, Local: onThisMachine(base) && !k.Cloud}
	if k.TakesKey {
		if key := s.storedKey(k.ID); key != "" {
			ps.HasKey, ps.KeySource = true, "keychain"
		} else if _, name := envKey(k); name != "" {
			ps.HasKey, ps.KeySource, ps.KeyHint = true, name, ""
		}
	}
	ps.Allowed = pol.allows(k, base)
	ps.Ready = ps.On && ps.Allowed && (!k.NeedsKey || ps.HasKey) && base != ""
	return ps
}

// SetEnabled turns AI features on or off. A policy that holds them off wins.
func (s *Service) SetEnabled(on bool) error {
	if on {
		if pol := s.policy(); pol.Off {
			return fmt.Errorf("AI features are held off: %s", pol.Reason)
		}
	}
	return s.update(func(c *Config) error { c.Enabled = on; return nil })
}

// ProviderInput is what the settings screen saves for a provider.
type ProviderInput struct {
	On        bool   `json:"on"`
	BaseURL   string `json:"baseUrl"`
	Name      string `json:"name"`
	ShareCode bool   `json:"shareCode"`
}

// SaveProvider stores a provider's settings (not its key).
func (s *Service) SaveProvider(id string, in ProviderInput) error {
	k, ok := kindOf(id)
	if !ok {
		return fmt.Errorf("no provider %q", id)
	}
	base := ""
	if strings.TrimSpace(in.BaseURL) != "" && strings.TrimRight(strings.TrimSpace(in.BaseURL), "/") != k.DefaultURL {
		b, err := checkBaseURL(in.BaseURL)
		if err != nil {
			return err
		}
		base = b
	} else if k.NeedsURL && in.On {
		return errors.New("an address is needed, such as http://localhost:1234/v1")
	}
	return s.update(func(c *Config) error {
		pc := c.Providers[id]
		pc.On, pc.BaseURL, pc.Name, pc.ShareCode = in.On, base, strings.TrimSpace(in.Name), in.ShareCode
		c.Providers[id] = pc
		return nil
	})
}

// SetKey stores a provider's API key in the system keychain and turns the
// provider on. The key is never returned by anything.
func (s *Service) SetKey(id, key string) error {
	k, ok := kindOf(id)
	if !ok || !k.TakesKey {
		return fmt.Errorf("%s takes no key", id)
	}
	key = strings.TrimSpace(key)
	if key == "" || strings.ContainsAny(key, " \n\t") || len(key) > 512 {
		return errors.New("that does not look like an API key")
	}
	if err := s.keys.set(id, key); err != nil {
		return err
	}
	s.mu.Lock()
	s.stored[id] = key
	s.mu.Unlock()
	s.forgetList(id)
	return s.update(func(c *Config) error {
		pc := c.Providers[id]
		pc.On, pc.KeyHint = true, hint(key)
		c.Providers[id] = pc
		return nil
	})
}

// DeleteKey removes a provider's key from the keychain.
func (s *Service) DeleteKey(id string) error {
	if _, ok := kindOf(id); !ok {
		return fmt.Errorf("no provider %q", id)
	}
	if err := s.keys.del(id); err != nil {
		return err
	}
	s.mu.Lock()
	s.stored[id] = ""
	s.mu.Unlock()
	return s.update(func(c *Config) error {
		pc := c.Providers[id]
		pc.KeyHint = ""
		c.Providers[id] = pc
		return nil
	})
}

// storedKey is a provider's key from the keychain ("" when none, or when
// the keychain cannot be read).
func (s *Service) storedKey(id string) string {
	s.mu.Lock()
	key, known := s.stored[id]
	s.mu.Unlock()
	if known {
		return key
	}
	key, err := s.keys.get(id)
	if err != nil {
		return ""
	}
	s.mu.Lock()
	s.stored[id] = key
	s.mu.Unlock()
	return key
}

func (s *Service) update(f func(*Config) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.cfg
	next.Providers = map[string]ProviderConfig{}
	for k, v := range s.cfg.Providers {
		next.Providers[k] = v
	}
	if err := f(&next); err != nil {
		return err
	}
	if err := saveConfig(s.settings, next); err != nil {
		return err
	}
	s.cfg = next
	return nil
}

// TestResult says whether a provider answers with its settings.
type TestResult struct {
	OK      bool   `json:"ok"`
	Models  int    `json:"models"`
	Message string `json:"message"`
}

// Test lists a provider's models with its current settings, even while AI
// features are off (only the key goes out, nothing about the code), so a
// person can check a key before turning anything on.
func (s *Service) Test(id string) TestResult {
	k, ok := kindOf(id)
	if !ok {
		return TestResult{Message: "No such provider"}
	}
	s.mu.Lock()
	pc := s.cfg.Providers[id]
	s.mu.Unlock()
	pc.On = true
	if !s.policy().allows(k, s.baseURL(k, pc)) {
		return TestResult{Message: "Not allowed by policy"}
	}
	p, err := s.build(k, pc)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	ms, err := p.models(ctx)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	if len(ms) == 0 {
		return TestResult{OK: true, Message: "It answers, but offers no chat models"}
	}
	return TestResult{OK: true, Models: len(ms), Message: fmt.Sprintf("Connected: %d models", len(ms))}
}

// build makes the client for a provider, reading its key.
func (s *Service) build(k Kind, pc ProviderConfig) (provider, error) {
	base := s.baseURL(k, pc)
	key := ""
	if k.TakesKey {
		key = s.storedKey(k.ID)
		if key == "" {
			key, _ = envKey(k)
		}
		if key == "" && k.NeedsKey {
			return nil, fmt.Errorf("%s has no API key", k.Label)
		}
	}
	switch k.ID {
	case Ollama:
		return &ollama{base: base, client: s.client}, nil
	case Anthropic:
		return &anthropic{base: base, key: key, client: s.client}, nil
	case OpenAI:
		return &openai{id: OpenAI, who: "OpenAI", base: base, key: key, client: s.client}, nil
	case Gemini:
		return &gemini{base: base, key: key, client: s.client}, nil
	case OpenAICompatible:
		who := pc.Name
		if who == "" {
			who = "The server at " + base
		}
		if base == "" {
			return nil, errors.New("the OpenAI-compatible server has no address")
		}
		return &openai{id: OpenAICompatible, who: who, base: base, key: key, client: s.client}, nil
	}
	return nil, fmt.Errorf("no provider %q", k.ID)
}

// ready returns the client for a provider that may be used now.
func (s *Service) ready(id string) (provider, ProviderStatus, error) {
	st := s.Status()
	if !st.Enabled {
		return nil, ProviderStatus{}, ErrOff
	}
	for _, ps := range st.Providers {
		if ps.ID != id {
			continue
		}
		if !ps.Allowed {
			return nil, ps, fmt.Errorf("%s is not allowed: %s", ps.Label, st.Policy)
		}
		if !ps.Ready {
			return nil, ps, fmt.Errorf("%s is not set up. Open Settings → AI", ps.Label)
		}
		s.mu.Lock()
		pc := s.cfg.Providers[id]
		s.mu.Unlock()
		p, err := s.build(ps.Kind, pc)
		return p, ps, err
	}
	return nil, ProviderStatus{}, fmt.Errorf("no provider %q", id)
}

// ── Model calls ──────────────────────────────────────────────────────────

// ModelList is every model of every ready provider, and what went wrong
// with the ones that did not answer.
type ModelList struct {
	Models   []Model   `json:"models"`
	Problems []Problem `json:"problems"`
}

// Problem is a provider that could not list its models.
type Problem struct {
	Provider string `json:"provider"`
	Label    string `json:"label"`
	Message  string `json:"message"`
}

func (s *Service) Models() (ModelList, error) {
	st := s.Status()
	if !st.Enabled {
		return ModelList{}, ErrOff
	}
	type result struct {
		at     int
		models []Model
		err    error
		ps     ProviderStatus
	}
	var ready []ProviderStatus
	for _, ps := range st.Providers {
		if ps.Ready {
			ready = append(ready, ps)
		}
	}
	results := make(chan result, len(ready))
	for i, ps := range ready {
		go func(i int, ps ProviderStatus) {
			ms, err := s.listOf(ps)
			results <- result{at: i, models: ms, err: err, ps: ps}
		}(i, ps)
	}
	byAt := make([]result, len(ready))
	for range ready {
		r := <-results
		byAt[r.at] = r
	}
	out := ModelList{Models: []Model{}, Problems: []Problem{}}
	for _, r := range byAt {
		if r.err != nil {
			out.Problems = append(out.Problems, Problem{Provider: r.ps.ID, Label: r.ps.Label, Message: r.err.Error()})
			continue
		}
		out.Models = append(out.Models, r.models...)
	}
	return out, nil
}

// listOf is a provider's models. However often it is called, the provider is
// asked at most once at a time, and not again while its last answer stands
// or until its address or key changes.
func (s *Service) listOf(ps ProviderStatus) ([]Model, error) {
	key := ps.BaseURL + "|" + ps.KeySource + "|" + ps.KeyHint
	s.mu.Lock()
	l := s.lists[ps.ID]
	if l != nil && l.key == key {
		select {
		case <-l.done:
			fresh := modelsFresh
			if l.err != nil {
				fresh = refusalFresh
			}
			if time.Since(l.at) < fresh {
				s.mu.Unlock()
				return l.models, l.err
			}
		default:
			s.mu.Unlock()
			<-l.done
			return l.models, l.err
		}
	}
	l = &modelList{key: key, done: make(chan struct{})}
	s.lists[ps.ID] = l
	s.mu.Unlock()

	p, _, err := s.ready(ps.ID)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		l.models, err = p.models(ctx)
		cancel()
	}
	l.err, l.at = err, time.Now()
	close(l.done)
	return l.models, l.err
}

// forgetList drops a provider's model list, so it is asked again.
func (s *Service) forgetList(id string) {
	s.mu.Lock()
	delete(s.lists, id)
	s.mu.Unlock()
}

// Chat sends one request (the frontend's message format, as JSON; its model
// is "<provider>/<name>") and streams the reply as "ask:delta" events
// carrying {id, content, thinking}. It returns the whole reply as JSON.
func (s *Service) Chat(id, requestJSON string) (string, error) {
	var req Request
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return "", fmt.Errorf("reading the request: %w", err)
	}
	provID, name := splitModelID(req.Model)
	p, _, err := s.ready(provID)
	if err != nil {
		return "", err
	}
	req.Model = name

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

	reply, err := p.chat(ctx, req, func(d Delta) {
		if s.emit != nil && (d.Content != "" || d.Thinking != "") {
			s.emit("ask:delta", map[string]any{"id": id, "content": d.Content, "thinking": d.Thinking})
		}
	})
	if err != nil {
		if ctx.Err() != nil {
			return `{"stopped":true}`, nil
		}
		return "", err
	}
	if ctx.Err() != nil {
		reply.Stopped = true
	}
	if reply.ToolCalls == nil {
		reply.ToolCalls = []ToolCall{}
	}
	out, _ := json.Marshal(reply)
	return string(out), nil
}

// Embed turns texts into vectors with a local embedding model through
// Ollama. Without Ollama, Ask finds recipes by their words alone.
func (s *Service) Embed(model string, texts []string) ([][]float64, error) {
	if model == "" {
		model = "nomic-embed-text"
	}
	p, ps, err := s.ready(Ollama)
	if err != nil {
		return nil, err
	}
	if !ps.Local {
		return nil, errors.New("embeddings are made on this machine only")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	return p.(*ollama).embed(ctx, model, texts)
}

// Cancel stops a running request; the reply so far is kept.
func (s *Service) Cancel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.cancels[id]; ok {
		c()
	}
}
