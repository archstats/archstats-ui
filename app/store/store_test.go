package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestWorkspaceRoundTrip(t *testing.T) {
	s := openTestStore(t)
	folder := t.TempDir()

	created, err := s.CreateWorkspace("my project", folder)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if created.ID == "" || created.Name != "my project" || created.FolderPath != folder {
		t.Fatalf("unexpected workspace: %+v", created)
	}

	got, err := s.GetWorkspace(created.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if got.FolderPath != folder {
		t.Errorf("FolderPath = %q, want %q", got.FolderPath, folder)
	}

	list, err := s.ListWorkspaces()
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Fatalf("ListWorkspaces = %+v, want 1 workspace %s", list, created.ID)
	}

	if err := s.DeleteWorkspace(created.ID); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	if _, err := s.GetWorkspace(created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetWorkspace after delete: err = %v, want ErrNotFound", err)
	}
}

func TestCreateWorkspaceRejectsBadFolder(t *testing.T) {
	s := openTestStore(t)

	if _, err := s.CreateWorkspace("nope", "/nonexistent/path/xyz"); err == nil {
		t.Error("expected error for nonexistent folder")
	}

	file := filepath.Join(t.TempDir(), "a-file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateWorkspace("nope", file); err == nil {
		t.Error("expected error for non-directory path")
	}
}

func TestScanLifecycle(t *testing.T) {
	s := openTestStore(t)
	w, err := s.CreateWorkspace("ws", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	scan, err := s.CreateScan(w.ID)
	if err != nil {
		t.Fatalf("CreateScan: %v", err)
	}
	if scan.Status != ScanStatusRunning || scan.FinishedAt != nil {
		t.Fatalf("new scan: %+v, want running/unfinished", scan)
	}

	snapshot := s.SnapshotPath(w.ID, scan.ID)
	if err := os.MkdirAll(filepath.Dir(snapshot), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(snapshot, []byte("fake db"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.FinishScan(scan.ID, snapshot); err != nil {
		t.Fatalf("FinishScan: %v", err)
	}

	got, err := s.GetScan(scan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != ScanStatusComplete || got.FinishedAt == nil || got.SnapshotPath != snapshot {
		t.Fatalf("finished scan: %+v", got)
	}

	// Second scan fails; both listed newest-first, history intact.
	scan2, err := s.CreateScan(w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.FailScan(scan2.ID, "boom"); err != nil {
		t.Fatal(err)
	}
	scans, err := s.ListScans(w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(scans) != 2 {
		t.Fatalf("ListScans = %d scans, want 2", len(scans))
	}
	if scans[0].ID != scan2.ID || scans[0].Status != ScanStatusFailed || scans[0].Error != "boom" {
		t.Errorf("newest scan = %+v, want failed scan2", scans[0])
	}

	// Deleting a scan removes its snapshot file.
	if err := s.DeleteScan(scan.ID); err != nil {
		t.Fatalf("DeleteScan: %v", err)
	}
	if _, err := os.Stat(snapshot); !os.IsNotExist(err) {
		t.Errorf("snapshot still exists after DeleteScan")
	}
}

func TestDeleteWorkspaceCascadesAndRemovesSnapshots(t *testing.T) {
	s := openTestStore(t)
	w, err := s.CreateWorkspace("ws", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	scan, err := s.CreateScan(w.ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := s.SnapshotPath(w.ID, scan.ID)
	if err := os.MkdirAll(filepath.Dir(snapshot), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(snapshot, []byte("fake db"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.FinishScan(scan.ID, snapshot); err != nil {
		t.Fatal(err)
	}

	if err := s.DeleteWorkspace(w.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetScan(scan.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("scan survived workspace delete: err = %v", err)
	}
	if _, err := os.Stat(filepath.Dir(snapshot)); !os.IsNotExist(err) {
		t.Errorf("snapshot dir survived workspace delete")
	}
}

func TestPersistenceAcrossReopen(t *testing.T) {
	root := t.TempDir()
	s, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	w, err := s.CreateWorkspace("persistent", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s.Close()

	s2, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	got, err := s2.GetWorkspace(w.ID)
	if err != nil {
		t.Fatalf("workspace lost after reopen: %v", err)
	}
	if got.Name != "persistent" {
		t.Errorf("Name = %q", got.Name)
	}
}
