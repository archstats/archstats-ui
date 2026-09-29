package clone

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app/store"
)

func TestParse(t *testing.T) {
	cases := []struct {
		in, url, slug string
	}{
		{"https://github.com/archstats/archstats", "https://github.com/archstats/archstats.git", "github.com/archstats/archstats"},
		{"https://github.com/archstats/archstats.git", "https://github.com/archstats/archstats.git", "github.com/archstats/archstats"},
		{"https://github.com/spring-projects/spring-petclinic/tree/main/src", "https://github.com/spring-projects/spring-petclinic.git", "github.com/spring-projects/spring-petclinic"},
		{"git@github.com:archstats/archstats.git", "git@github.com:archstats/archstats.git", "github.com/archstats/archstats"},
		{"github.com/django/django", "https://github.com/django/django.git", "github.com/django/django"},
		{"django/django", "https://github.com/django/django.git", "github.com/django/django"},
		{"https://gitlab.com/group/sub/project.git", "https://gitlab.com/group/sub/project.git", "gitlab.com/group/sub/project"},
		{"ssh://git@git.example.org:2222/team/app.git", "ssh://git@git.example.org:2222/team/app.git", "git.example.org/team/app"},
		{"  git clone https://github.com/a/b  ", "https://github.com/a/b.git", "github.com/a/b"},
	}
	for _, c := range cases {
		r, err := Parse(c.in)
		if err != nil {
			t.Errorf("Parse(%q): %v", c.in, err)
			continue
		}
		if r.URL != c.url || r.Slug() != c.slug {
			t.Errorf("Parse(%q) = %q %q, want %q %q", c.in, r.URL, r.Slug(), c.url, c.slug)
		}
	}
	for _, bad := range []string{"", "hello", "ftp://x.org/a/b", "https://", "a b c"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("Parse(%q) should refuse", bad)
		}
	}
	if r, err := Parse("/Users/me/src/thing.git"); err != nil || !r.Local || r.Name != "thing" {
		t.Errorf("local path: %+v %v", r, err)
	}
}

func TestParseLine(t *testing.T) {
	p, ok := ParseLine("Receiving objects:  50% (500/1000), 12.50 MiB | 3.20 MiB/s")
	if !ok || p.Phase != "receiving" || p.Percent != 43.5 || p.Received != "12.50 MiB" || p.Rate != "3.20 MiB/s" {
		t.Errorf("receiving: %+v %v", p, ok)
	}
	p, ok = ParseLine("remote: Compressing objects: 100% (80/80), done.")
	if !ok || p.Phase != "compressing" || p.Percent != 5 {
		t.Errorf("compressing: %+v", p)
	}
	p, ok = ParseLine("Resolving deltas: 100% (10/10), done.")
	if !ok || p.Percent != 95 {
		t.Errorf("resolving: %+v", p)
	}
	if _, ok := ParseLine("warning: redirecting to https://x"); ok {
		t.Error("a warning is not progress")
	}
	if p, ok := ParseLine("Cloning into '/tmp/x'..."); !ok || p.Percent != -1 {
		t.Errorf("banner: %+v", p)
	}
}

func TestExplain(t *testing.T) {
	r := Repo{Host: "github.com"}
	checks := map[string]string{
		"fatal: could not read Username for 'https://github.com': terminal prompts disabled": "needs a sign-in",
		"remote: Repository not found.\nfatal: repository 'x' not found":                     "no repository at that address",
		"ssh: Could not resolve hostname githb.com":                                          "Could not reach",
		"git@github.com: Permission denied (publickey).":                                     "SSH refused",
		"fatal: something odd happened":                                                      "something odd happened",
	}
	for in, want := range checks {
		if got := Explain(in, r); !strings.Contains(got, want) {
			t.Errorf("Explain(%q) = %q, want it to say %q", in, got, want)
		}
	}
}

func TestArgs(t *testing.T) {
	now := time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)
	if got := strings.Join(Args("u", "d", HistoryYear, now), " "); got != "clone --progress --shallow-since=2025-09-29 -- u d" {
		t.Errorf("year: %s", got)
	}
	if got := strings.Join(Args("u", "d", HistoryLatest, now), " "); got != "clone --progress --depth 1 -- u d" {
		t.Errorf("latest: %s", got)
	}
	if got := strings.Join(Args("u", "d", HistoryFull, now), " "); strings.Contains(got, "filter") {
		t.Errorf("full must never be a partial clone: %s", got)
	}
}

// A local repository cloned end to end: the job finishes, the workspace
// exists, the folder is managed, and removing it leaves no empty parents.
func TestCloneLocal(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	src := filepath.Join(t.TempDir(), "demo")
	run := func(args ...string) {
		cmd := exec.Command("git", append([]string{"-C", src}, args...)...)
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
	}
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatal(err)
	}
	run("init", "-q")
	if err := os.WriteFile(filepath.Join(src, "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-qm", "first")

	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	svc := NewService(st)
	done := make(chan Job, 1)
	svc.SetEmitter(func(event string, data ...any) {
		if event == EventDone || event == EventFailed {
			done <- data[0].(Job)
		}
	})
	job, err := svc.Start(Request{Input: src})
	if err != nil {
		t.Fatal(err)
	}
	var end Job
	select {
	case end = <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("clone did not finish")
	}
	if end.State != "done" || end.WorkspaceID == "" {
		t.Fatalf("job ended %s: %s", end.State, end.Error)
	}
	ws, err := st.GetWorkspace(end.WorkspaceID)
	if err != nil || !ws.Managed || ws.Name != "demo" || ws.FolderPath != job.Dest {
		t.Fatalf("workspace: %+v %v", ws, err)
	}
	if _, err := os.Stat(filepath.Join(job.Dest, "a.go")); err != nil {
		t.Fatalf("the clone has no files: %v", err)
	}
	if plan := svc.Plan(src, ""); plan.Existing == nil || plan.Existing.ID != ws.ID {
		t.Errorf("a second plan should point at the workspace: %+v", plan)
	}
	RemoveManaged(st, ws.FolderPath)
	if _, err := os.Stat(filepath.Join(st.ReposRoot(), "local")); !os.IsNotExist(err) {
		t.Errorf("empty parents should be pruned: %v", err)
	}
}
