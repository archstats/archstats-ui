package ask

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

// countingModels answers GET .../models, counting the calls; status 0 is a list.
func countingModels(status int) (*httptest.Server, *atomic.Int32) {
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/models") {
			http.NotFound(w, r)
			return
		}
		n.Add(1)
		if status != 0 {
			w.WriteHeader(status)
			fmt.Fprint(w, `{"error":{"message":"rate limited"}}`)
			return
		}
		fmt.Fprint(w, `{"data":[{"id":"qwen"}]}`)
	}))
	return srv, &n
}

func manyModels(s *Service, n int) {
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = s.Models() }()
	}
	wg.Wait()
}

func TestModelsAsksAProviderOnceHoweverOftenCalled(t *testing.T) {
	srv, calls := countingModels(0)
	defer srv.Close()
	s, _, _ := newTestService(Policy{})
	_ = s.SetEnabled(true)
	if err := s.SaveProvider(OpenAICompatible, ProviderInput{On: true, BaseURL: srv.URL, Name: "LM Studio"}); err != nil {
		t.Fatal(err)
	}
	manyModels(s, 200)
	manyModels(s, 200)
	if got := calls.Load(); got != 1 {
		t.Fatalf("the provider was asked %d times, want 1", got)
	}
	list, _ := s.Models()
	if len(list.Models) != 1 {
		t.Fatalf("models = %+v", list)
	}
}

func TestModelsKeepsARefusalInsteadOfAskingAgain(t *testing.T) {
	srv, calls := countingModels(http.StatusTooManyRequests)
	defer srv.Close()
	s, _, _ := newTestService(Policy{})
	_ = s.SetEnabled(true)
	if err := s.SaveProvider(OpenAICompatible, ProviderInput{On: true, BaseURL: srv.URL, Name: "LM Studio"}); err != nil {
		t.Fatal(err)
	}
	manyModels(s, 200)
	list, _ := s.Models()
	if got := calls.Load(); got != 1 {
		t.Fatalf("the provider was asked %d times, want 1", got)
	}
	refused := false
	for _, p := range list.Problems {
		refused = refused || p.Provider == OpenAICompatible && strings.Contains(p.Message, "429")
	}
	if !refused {
		t.Fatalf("problems = %+v, want the 429", list.Problems)
	}
}

func TestModelsAsksAgainForANewKeyOrAddress(t *testing.T) {
	srv, calls := countingModels(0)
	defer srv.Close()
	s, _, _ := newTestService(Policy{})
	_ = s.SetEnabled(true)
	if err := s.SaveProvider(OpenAICompatible, ProviderInput{On: true, BaseURL: srv.URL, Name: "LM Studio"}); err != nil {
		t.Fatal(err)
	}
	_, _ = s.Models()
	if err := s.SetKey(OpenAICompatible, "sk-local-0001"); err != nil {
		t.Fatal(err)
	}
	_, _ = s.Models()
	if err := s.SaveProvider(OpenAICompatible, ProviderInput{On: true, BaseURL: srv.URL + "/v1", Name: "LM Studio"}); err != nil {
		t.Fatal(err)
	}
	_, _ = s.Models()
	if got := calls.Load(); got != 3 {
		t.Fatalf("the provider was asked %d times, want 3", got)
	}
}
