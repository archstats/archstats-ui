package scan

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/store"
)

func writeFixtureRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	files := map[string]string{
		"web/src/util.ts":         "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
		"web/src/main.ts":         "import { add } from \"./util\";\nconsole.log(add(1, 2));\n",
		"server/src/Main.java":    "package com.example;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(Greeter.greet());\n    }\n}\n",
		"server/src/Greeter.java": "package com.example;\n\npublic class Greeter {\n    static String greet() {\n        return \"hi\";\n    }\n}\n",
	}
	for path, content := range files {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func waitForScan(t *testing.T, st *store.Store, scanID string) *store.Scan {
	t.Helper()
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		scan, err := st.GetScan(scanID)
		if err != nil {
			t.Fatal(err)
		}
		if scan.Status != store.ScanStatusRunning {
			return scan
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("scan did not finish within 60s")
	return nil
}

type eventRecorder struct {
	mu     sync.Mutex
	events []string
}

func (r *eventRecorder) emit(event string, _ ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
}

func (r *eventRecorder) names() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string{}, r.events...)
}

func TestScanEndToEnd(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	ws, err := st.CreateWorkspace("fixture", writeFixtureRepo(t))
	if err != nil {
		t.Fatal(err)
	}

	svc := NewService(st)
	rec := &eventRecorder{}
	svc.SetEmitter(rec.emit)

	started, err := svc.StartScan(ws.ID)
	if err != nil {
		t.Fatalf("StartScan: %v", err)
	}
	scan := waitForScan(t, st, started.ID)

	if scan.Status != store.ScanStatusComplete {
		t.Fatalf("scan status = %s (error: %s), want complete", scan.Status, scan.Error)
	}
	if _, err := os.Stat(scan.SnapshotPath); err != nil {
		t.Fatalf("snapshot missing: %v", err)
	}

	events := rec.names()
	if events[0] != EventScanStarted || events[len(events)-1] != EventScanDone {
		t.Errorf("events = %v, want started-first done-last", events)
	}

	// Query the snapshot through the query service (Task 5 seam).
	q := query.NewService(st)
	if err := q.Open(scan.ID); err != nil {
		t.Fatalf("query.Open: %v", err)
	}
	defer q.Close()

	rows, err := q.Query("SELECT count(*) AS c FROM files")
	if err != nil {
		t.Fatalf("query files: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %v", rows)
	}
	if c, ok := rows[0]["c"].(int64); !ok || c < 4 {
		t.Errorf("file count = %v, want >= 4", rows[0]["c"])
	}

	// Frontend introspection queries must keep working (real SQLite now).
	tables, err := q.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		t.Fatalf("sqlite_master: %v", err)
	}
	var names []string
	for _, row := range tables {
		names = append(names, row["name"].(string))
	}
	joined := strings.Join(names, ",")
	for _, want := range []string{"files", "components", "snippets"} {
		if !strings.Contains(joined, want) {
			t.Errorf("table %q missing from snapshot (have: %s)", want, joined)
		}
	}
	if _, err := q.Query("SELECT name FROM PRAGMA_TABLE_INFO('components')"); err != nil {
		t.Errorf("PRAGMA_TABLE_INFO: %v", err)
	}

	// Java + TypeScript should both have been auto-discovered: snippets from
	// tree-sitter parsing must exist for both file types.
	snippets, err := q.Query("SELECT count(*) AS c FROM snippets")
	if err != nil {
		t.Fatalf("snippets: %v", err)
	}
	if c := snippets[0]["c"].(int64); c == 0 {
		t.Error("no snippets captured — tree-sitter extensions did not run")
	}
}

func TestScanFailureIsRecorded(t *testing.T) {
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	folder := t.TempDir()
	ws, err := st.CreateWorkspace("doomed", folder)
	if err != nil {
		t.Fatal(err)
	}
	// Remove the folder after registration so the walk fails at the root.
	if err := os.RemoveAll(folder); err != nil {
		t.Fatal(err)
	}

	svc := NewService(st)
	rec := &eventRecorder{}
	svc.SetEmitter(rec.emit)

	started, err := svc.StartScan(ws.ID)
	if err != nil {
		t.Fatalf("StartScan: %v", err)
	}
	scan := waitForScan(t, st, started.ID)

	if scan.Status != store.ScanStatusFailed {
		t.Fatalf("status = %s, want failed", scan.Status)
	}
	if scan.Error == "" {
		t.Error("failed scan has empty error message")
	}
	if scan.SnapshotPath != "" {
		t.Error("failed scan should keep no snapshot")
	}

	events := rec.names()
	if events[len(events)-1] != EventScanFailed {
		t.Errorf("events = %v, want failed-last", events)
	}
}

func TestExtensionsForAutoDetection(t *testing.T) {
	root := writeFixtureRepo(t)
	extensions, names, err := extensionsFor(root, nil)
	if err != nil {
		t.Fatal(err)
	}
	// The reported names are the auto-discovered optional extensions only;
	// the always-on set still loads but is not worth telling the user about.
	joined := strings.Join(names, ",")
	for _, want := range []string{"java", "typescript"} {
		if !strings.Contains(joined, want) {
			t.Errorf("extension %q not detected (have: %s)", want, joined)
		}
	}
	for _, internal := range []string{"basic", "components"} {
		if strings.Contains(joined, internal) {
			t.Errorf("always-on extension %q should not be reported (have: %s)", internal, joined)
		}
	}
	if len(extensions) <= len(names) {
		t.Errorf("expected always-on extensions to load alongside the %d detected (loaded %d)", len(names), len(extensions))
	}
	if strings.Contains(joined, ",git") || strings.HasPrefix(joined, "git,") {
		t.Errorf("git should not be detected without .git dir (have: %s)", joined)
	}
}
