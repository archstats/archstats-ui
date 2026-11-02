package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewer(t *testing.T) {
	cases := []struct {
		current, candidate string
		want               bool
	}{
		{"v0.12.0", "v0.13.0", true},
		{"v0.12.0", "v0.12.0", false},
		{"v0.13.0", "v0.12.0", false},
		{"v0.13.0-rc.1", "v0.13.0", true},
		{"dev", "v0.13.0", false},
		{"dev-abc1234", "v0.13.0", false},
		{"v0.12.0", "nightly", false},
	}
	for _, c := range cases {
		if got := Newer(c.current, c.candidate); got != c.want {
			t.Errorf("Newer(%q, %q) = %v, want %v", c.current, c.candidate, got, c.want)
		}
	}
}

const changelog = `# Changelog

Intro.

## Unreleased

- Not out yet.

## v0.14.0 (2026-11-20)

- Fourteen.

## v0.13.0 (2026-11-10)

Analysis revision 21 (was 20).

### Features

- Thirteen.

## v0.12.0 (2026-10-29)

- Twelve.
`

func TestSections(t *testing.T) {
	got := Sections(changelog)
	if len(got) != 3 {
		t.Fatalf("got %d sections, want 3: %+v", len(got), got)
	}
	if got[1].Version != "v0.13.0" || got[1].Date != "2026-11-10" {
		t.Errorf("second section is %+v", got[1])
	}
	if got[1].Body != "Analysis revision 21 (was 20).\n\n### Features\n\n- Thirteen." {
		t.Errorf("body is %q", got[1].Body)
	}
}

func TestSince(t *testing.T) {
	versions := func(s []Section) []string {
		var out []string
		for _, x := range s {
			out = append(out, x.Version)
		}
		return out
	}
	if got := versions(Since(changelog, "v0.12.0", "v0.14.0")); len(got) != 2 || got[0] != "v0.14.0" || got[1] != "v0.13.0" {
		t.Errorf("from 0.12 to 0.14: %v", got)
	}
	if got := Since(changelog, "v0.13.0", "v0.13.0"); got != nil {
		t.Errorf("same version: %v", got)
	}
	if got := Since(changelog, "", "v0.13.0"); got != nil {
		t.Errorf("first run: %v", got)
	}
	if got := Since(changelog, "v0.12.0", "dev"); got != nil {
		t.Errorf("dev build: %v", got)
	}
}

func TestLatest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/"+Repository+"/releases/latest" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"tag_name":"v0.13.0","html_url":"https://example.test/r","published_at":"2026-11-10T09:00:00Z","body":"notes","draft":false,"prerelease":false}`))
	}))
	defer srv.Close()

	got, err := Latest(context.Background(), srv.Client(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != "v0.13.0" || got.Published != "2026-11-10" || got.URL != "https://example.test/r" {
		t.Errorf("got %+v", got)
	}
}

func TestLatestRefusesAPrerelease(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"tag_name":"v0.13.0-rc.1","prerelease":true}`))
	}))
	defer srv.Close()

	if _, err := Latest(context.Background(), srv.Client(), srv.URL); err == nil {
		t.Error("a prerelease was offered")
	}
}
