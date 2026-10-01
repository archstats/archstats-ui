package ask

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/zalando/go-keyring"
)

// What the person set: whether AI features are on at all, and each
// provider. Keys are not here: they live in the system keychain, and nothing
// the webview can call ever reads one back.

// Settings is where the configuration is kept (the app's settings table).
type Settings interface {
	GetSetting(key string) (string, error)
	PutSetting(key, value string) error
}

const settingsKey = "ai"

// Config is the stored configuration.
type Config struct {
	// Enabled is the person's switch; a policy can hold it off.
	Enabled   bool                      `json:"enabled"`
	Providers map[string]ProviderConfig `json:"providers"`
}

// ProviderConfig is one provider's settings.
type ProviderConfig struct {
	On      bool   `json:"on"`
	BaseURL string `json:"baseUrl,omitempty"`
	// Name labels an OpenAI-compatible server ("LM Studio").
	Name string `json:"name,omitempty"`
	// ShareCode lets Ask send lines of source code to this provider; without
	// it, Ask answers from names, measures and structure only.
	ShareCode bool `json:"shareCode"`
	// KeyHint is the stored key's last four characters, to recognise it by.
	KeyHint string `json:"keyHint,omitempty"`
}

func defaultConfig() Config {
	return Config{Providers: map[string]ProviderConfig{
		Ollama: {On: true, ShareCode: true},
	}}
}

func loadConfig(s Settings) Config {
	c := defaultConfig()
	if s == nil {
		return c
	}
	raw, err := s.GetSetting(settingsKey)
	if err != nil || raw == "" {
		return c
	}
	var stored Config
	if json.Unmarshal([]byte(raw), &stored) != nil {
		return c
	}
	// A provider never saved keeps its default (Ollama on).
	c.Enabled = stored.Enabled
	for id, pc := range stored.Providers {
		c.Providers[id] = pc
	}
	return c
}

func saveConfig(s Settings, c Config) error {
	if s == nil {
		return nil
	}
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return s.PutSetting(settingsKey, string(b))
}

// Policy is what the organisation decided, above the person's switch: from
// the ARCHSTATS_AI environment variable or a policy file an administrator
// deploys (MDM, group policy, config management).
type Policy struct {
	// Off: AI features cannot be turned on.
	Off bool `json:"off"`
	// LocalOnly: only models on this machine.
	LocalOnly bool `json:"localOnly"`
	// Providers, when set, are the only ones allowed.
	Providers []string `json:"providers,omitempty"`
	// Reason is shown next to the locked switch.
	Reason string `json:"reason,omitempty"`
}

// PolicyPath is where an administrator puts the policy file.
func PolicyPath() string {
	if p := os.Getenv("ARCHSTATS_POLICY_FILE"); p != "" {
		return p
	}
	switch runtime.GOOS {
	case "darwin":
		return "/Library/Application Support/Archstats/policy.json"
	case "windows":
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "Archstats", "policy.json")
	default:
		return "/etc/archstats/policy.json"
	}
}

func readPolicy() Policy {
	var p Policy
	// The file: {"ai": {"enabled": false}} or {"ai": {"localOnly": true}} or {"ai": {"providers": ["ollama"]}}.
	if b, err := os.ReadFile(PolicyPath()); err == nil {
		var f struct {
			AI struct {
				Enabled   *bool    `json:"enabled"`
				LocalOnly bool     `json:"localOnly"`
				Providers []string `json:"providers"`
				Message   string   `json:"message"`
			} `json:"ai"`
		}
		if json.Unmarshal(b, &f) == nil {
			p.Off = f.AI.Enabled != nil && !*f.AI.Enabled
			p.LocalOnly, p.Providers = f.AI.LocalOnly, f.AI.Providers
			p.Reason = f.AI.Message
			if p.Reason == "" && (p.Off || p.LocalOnly || len(p.Providers) > 0) {
				p.Reason = "Set by your organisation"
			}
		}
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ARCHSTATS_AI"))) {
	case "off", "0", "false", "no", "disabled":
		p.Off, p.Reason = true, "Turned off by ARCHSTATS_AI"
	case "local":
		p.LocalOnly = true
		if p.Reason == "" {
			p.Reason = "Local models only (ARCHSTATS_AI=local)"
		}
	}
	return p
}

// allows: the policy lets this provider, at this address, be used.
func (p Policy) allows(kind Kind, base string) bool {
	if p.Off {
		return false
	}
	if len(p.Providers) > 0 {
		ok := false
		for _, id := range p.Providers {
			ok = ok || id == kind.ID
		}
		if !ok {
			return false
		}
	}
	if p.LocalOnly && (kind.Cloud || !onThisMachine(base)) {
		return false
	}
	return true
}

// ── Keys ─────────────────────────────────────────────────────────────────

// secrets holds API keys.
type secrets interface {
	get(provider string) (string, error)
	set(provider, key string) error
	del(provider string) error
}

// keychain is the system's credential store: Keychain on macOS, Credential
// Manager on Windows, the Secret Service (GNOME Keyring, KWallet) on Linux.
type keychain struct{}

const keychainService = "Archstats AI"

func (keychain) get(provider string) (string, error) {
	k, err := keyring.Get(keychainService, provider)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", nil
	}
	return k, err
}

func (keychain) set(provider, key string) error {
	if err := keyring.Set(keychainService, provider, key); err != nil {
		return fmt.Errorf("the system keychain would not store the key: %w", err)
	}
	return nil
}

func (keychain) del(provider string) error {
	err := keyring.Delete(keychainService, provider)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}

// envKey reads a provider's key from the environment, the way its own tools do.
func envKey(kind Kind) (string, string) {
	names := []string{}
	if kind.EnvKey != "" {
		names = append(names, kind.EnvKey)
	}
	if kind.ID == Gemini {
		names = append(names, "GOOGLE_API_KEY")
	}
	for _, n := range names {
		if v := strings.TrimSpace(os.Getenv(n)); v != "" {
			return v, n
		}
	}
	return "", ""
}

func hint(key string) string {
	if len(key) <= 8 {
		return ""
	}
	return key[len(key)-4:]
}
