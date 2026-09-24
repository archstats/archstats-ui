package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A registry written before migrations were numbered upgrades in place:
// rows survive, a backup is left beside it, and the new columns read as
// "unknown" rather than as facts.
func TestUpgradeFromUnnumberedRegistry(t *testing.T) {
	root := t.TempDir()
	db, err := sql.Open("sqlite3", "file:"+filepath.Join(root, "app.db")+"?_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	if err := migrate0tx(db); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	mustExec(t, db, `INSERT INTO workspaces (id, name, folder_path, created_at) VALUES ('w1', 'old', '/x', ?)`, now)
	mustExec(t, db, `INSERT INTO scans (id, workspace_id, status, started_at, snapshot_path) VALUES ('s1', 'w1', 'complete', ?, '')`, now)
	db.Close()

	s, err := Open(root)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	if _, err := os.Stat(filepath.Join(root, "app.db.bak-v0")); err != nil {
		t.Errorf("no backup before migrating: %v", err)
	}
	w, err := s.GetWorkspace("w1")
	if err != nil || w.Name != "old" || w.BaselineScanID != nil {
		t.Fatalf("workspace after upgrade: %+v, %v", w, err)
	}
	scan, err := s.GetScan("s1")
	if err != nil || scan.Origin != "scan" || scan.AnalysisRevision != 0 || scan.HeadTime != nil {
		t.Fatalf("scan after upgrade: %+v, %v", scan, err)
	}
	pending, err := s.ScansWithoutIdentity()
	if err != nil || len(pending) != 1 {
		t.Fatalf("scans without identity: %d, %v", len(pending), err)
	}
	// Opening again is a no-op.
	s2, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s2.Close()
}

func TestStateAndSettings(t *testing.T) {
	s := openTestStore(t)
	w, err := s.CreateWorkspace("w", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := s.PutState(w.ID, "lens.active", `"Domains"`); err != nil {
		t.Fatal(err)
	}
	if err := s.PutState(w.ID, "lens.active", `"Layers"`); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetState(w.ID)
	if got["lens.active"] != `"Layers"` {
		t.Fatalf("state = %v", got)
	}
	if err := s.PutState(w.ID, "lens.active", ""); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetState(w.ID)
	if _, ok := got["lens.active"]; ok {
		t.Fatalf("empty value should delete: %v", got)
	}
	if err := s.PutSetting("pseudonymise", "true"); err != nil {
		t.Fatal(err)
	}
	if v, _ := s.GetSetting("pseudonymise"); v != "true" {
		t.Fatalf("setting = %q", v)
	}
	// State goes with its workspace.
	_ = s.PutState(w.ID, "k", "v")
	if err := s.DeleteWorkspace(w.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	s.db.QueryRow(`SELECT count(*) FROM workspace_state`).Scan(&n)
	if n != 0 {
		t.Fatalf("state rows left after deleting the workspace: %d", n)
	}
}

func TestBaselineClearsWhenItsScanGoes(t *testing.T) {
	s := openTestStore(t)
	w, _ := s.CreateWorkspace("w", t.TempDir())
	scan, _ := s.CreateScan(w.ID)
	if err := s.SetBaseline(w.ID, scan.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetWorkspace(w.ID)
	if got.BaselineScanID == nil || *got.BaselineScanID != scan.ID {
		t.Fatalf("baseline = %v", got.BaselineScanID)
	}
	if err := s.DeleteScan(scan.ID); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetWorkspace(w.ID)
	if got.BaselineScanID != nil {
		t.Fatalf("baseline should clear with its scan, got %v", *got.BaselineScanID)
	}
}

func migrate0tx(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if err := migrate0(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func mustExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatal(err)
	}
}
