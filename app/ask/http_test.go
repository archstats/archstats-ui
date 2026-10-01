package ask

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostAsksABusyAPIAgain(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 3 {
			w.Header().Set("retry-after", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":{"message":"rate limited"}}`))
			return
		}
		w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	res, err := post(context.Background(), srv.Client(), "Test", srv.URL, nil, map[string]any{"a": 1})
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	res.Body.Close()
	if calls != 3 {
		t.Fatalf("calls = %d, want 3", calls)
	}
}

func TestPostGivesUpOnAStillBusyAPI(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("retry-after", "0")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"rate limited"}}`))
	}))
	defer srv.Close()
	_, err := post(context.Background(), srv.Client(), "Test", srv.URL, nil, map[string]any{})
	if err == nil || !strings.Contains(err.Error(), "429") {
		t.Fatalf("err = %v, want the 429", err)
	}
	if calls != busyRetries+1 {
		t.Fatalf("calls = %d, want %d", calls, busyRetries+1)
	}
}

func TestPostDoesNotRetryABadRequest(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()
	if _, err := post(context.Background(), srv.Client(), "Test", srv.URL, nil, map[string]any{}); err == nil {
		t.Fatal("want an error")
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
}
