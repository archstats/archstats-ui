package scan

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app/store"
)

func TestBackfillScansEachTagInTurn(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	repo := t.TempDir()
	commit := func(msg string) string {
		run(t, repo, "git", "add", ".")
		run(t, repo, "git", "-c", "commit.gpgsign=false", "commit", "-q", "-m", msg)
		return run(t, repo, "git", "rev-parse", "HEAD")[:40]
	}
	run(t, repo, "git", "init", "-q", "-b", "main")
	os.MkdirAll(filepath.Join(repo, "a"), 0o755)
	os.WriteFile(filepath.Join(repo, "a", "a.go"), []byte("package a\n"), 0o644)
	v1 := commit("one")
	run(t, repo, "git", "-c", "tag.gpgsign=false", "tag", "v1")
	os.MkdirAll(filepath.Join(repo, "b"), 0o755)
	os.WriteFile(filepath.Join(repo, "b", "b.go"), []byte("package b\n"), 0o644)
	v2 := commit("two")
	run(t, repo, "git", "-c", "tag.gpgsign=false", "tag", "-a", "v2", "-m", "annotated")

	ws, _ := st.CreateWorkspace("repo", repo)
	svc := NewService(st)
	tags, err := svc.Tags(ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	shas := map[string]string{}
	for _, r := range tags {
		shas[r.Ref] = r.Sha
	}
	if shas["v1"] != v1 || shas["v2"] != v2 {
		t.Fatalf("tags %v, want v1 %s and v2 (peeled) %s", tags, v1, v2)
	}

	if _, err := svc.Enqueue(ws.ID, tags); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Minute)
	for {
		q := svc.Queue(ws.ID)
		done := 0
		for _, it := range q.Items {
			if it.State == "failed" {
				t.Fatalf("%s failed: %s", it.Ref, it.Error)
			}
			if it.State == "done" {
				done++
			}
		}
		if done == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("queue did not finish: %+v", q.Items)
		}
		time.Sleep(200 * time.Millisecond)
	}
	for _, it := range svc.Queue(ws.ID).Items {
		scan, err := st.GetScan(it.ScanID)
		if err != nil {
			t.Fatal(err)
		}
		if scan.RevisionRef != it.Ref {
			t.Errorf("row ref %q, want the tag %q", scan.RevisionRef, it.Ref)
		}
		db, _ := sql.Open("sqlite3", scan.SnapshotPath)
		var head string
		db.QueryRow(`SELECT value FROM _snapshot WHERE key = 'git_head_commit'`).Scan(&head)
		db.Close()
		if head != shas[it.Ref] {
			t.Errorf("%s: snapshot head %q, want %q", it.Ref, head, shas[it.Ref])
		}
	}
	if entries, _ := os.ReadDir(filepath.Join(st.Root(), "backfill", ws.ID)); len(entries) != 0 {
		t.Errorf("clones left behind: %v", entries)
	}
}

func TestStopAfterCurrentDropsTheRest(t *testing.T) {
	svc := NewService(nil)
	svc.queue.items["w"] = []QueueItem{{Ref: "a", State: "running"}, {Ref: "b", State: "queued"}}
	svc.queue.drains["w"] = draining
	q := svc.StopAfterCurrent("w")
	if q.Items[0].State != "running" || q.Items[1].State != "stopped" || !q.Stopping {
		t.Fatalf("%+v", q)
	}
	if got := svc.ClearFinished("w").Items; len(got) != 1 || got[0].Ref != "a" {
		t.Fatalf("%+v", got)
	}
}

// A drain that panics leaves the queue idle, so the next Enqueue starts one.
// It used to stay "active" for good, with its row running for ever.
func TestDrainThatPanicsFreesTheQueue(t *testing.T) {
	svc := NewService(nil) // no store: startAt panics on it
	svc.queue.items["w"] = []QueueItem{{Ref: "a", Sha: "x", State: ItemQueued}}
	svc.queue.drains["w"] = draining
	svc.drain("w")
	q := svc.Queue("w")
	if svc.queue.drains["w"] != idle || q.Items[0].State != ItemFailed {
		t.Fatalf("drain = %v, items %+v", svc.queue.drains["w"], q.Items)
	}
}

// Shutdown stops a scan in its clone step and refuses the next one.
func TestShutdownRefusesNewScans(t *testing.T) {
	svc := NewService(nil)
	svc.Shutdown(0)
	if _, err := svc.claim(&store.Workspace{ID: "w"}); !errors.Is(err, errShuttingDown) {
		t.Fatalf("err = %v", err)
	}
}
