package scan

import (
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/archstats/archstats-ui/app/store"
)

func run(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %v\n%s", args, err, out)
	}
	return string(out)
}

func TestStartScanAtLeavesTheCheckoutAlone(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	repo := t.TempDir()
	run(t, repo, "git", "init", "-q", "-b", "main")
	os.MkdirAll(filepath.Join(repo, "a"), 0o755)
	os.WriteFile(filepath.Join(repo, "a", "a.go"), []byte("package a\n\nfunc A() {}\n"), 0o644)
	run(t, repo, "git", "add", ".")
	run(t, repo, "git", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "first")
	first := run(t, repo, "git", "rev-parse", "HEAD")[:40]
	os.MkdirAll(filepath.Join(repo, "b"), 0o755)
	os.WriteFile(filepath.Join(repo, "b", "b.go"), []byte("package b\n\nfunc B() {}\n"), 0o644)
	run(t, repo, "git", "add", ".")
	run(t, repo, "git", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "second")
	os.WriteFile(filepath.Join(repo, "dirty.go"), []byte("package x\n"), 0o644)
	statusBefore := run(t, repo, "git", "status", "--porcelain")
	refsBefore := run(t, repo, "git", "for-each-ref")

	ws, err := st.CreateWorkspace("repo", repo)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(st)
	started, err := svc.StartScanAt(ws.ID, first[:10])
	if err != nil {
		t.Fatal(err)
	}
	scan := waitForScan(t, st, started.ID)
	if scan.Status != store.ScanStatusComplete {
		t.Fatalf("status %s: %s", scan.Status, scan.Error)
	}
	if scan.Origin != "backfill" || scan.RevisionRef != first {
		t.Errorf("origin %q ref %q", scan.Origin, scan.RevisionRef)
	}
	db, err := sql.Open("sqlite3", scan.SnapshotPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var head string
	db.QueryRow(`SELECT value FROM _snapshot WHERE key = 'git_head_commit'`).Scan(&head)
	if head != first {
		t.Errorf("snapshot head %q, want %q", head, first)
	}
	var files int
	db.QueryRow(`SELECT count(*) FROM files WHERE name LIKE 'b/%' OR name = 'dirty.go'`).Scan(&files)
	if files != 0 {
		t.Errorf("the rescan read %d files from after the commit or uncommitted", files)
	}
	if run(t, repo, "git", "status", "--porcelain") != statusBefore || run(t, repo, "git", "for-each-ref") != refsBefore {
		t.Error("the user's checkout changed")
	}
	if entries, _ := os.ReadDir(filepath.Join(st.Root(), "backfill", ws.ID)); len(entries) != 0 {
		t.Errorf("clone left behind: %v", entries)
	}
}

func TestResolveCommitRefusesUnknown(t *testing.T) {
	st, _ := store.Open(t.TempDir())
	defer st.Close()
	repo := t.TempDir()
	run(t, repo, "git", "init", "-q")
	ws, _ := st.CreateWorkspace("r", repo)
	if _, err := NewService(st).ResolveCommit(ws.ID, "deadbeef"); err == nil {
		t.Error("an unknown commit is refused")
	}
}
