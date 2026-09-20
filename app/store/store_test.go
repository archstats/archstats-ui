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

func TestCreateWorkspaceRefusesDuplicateFolder(t *testing.T) {
	s := openTestStore(t)
	folder := t.TempDir()

	first, err := s.CreateWorkspace("first", folder)
	if err != nil {
		t.Fatal(err)
	}
	// Same folder through a non-clean spelling must still collide.
	if _, err := s.CreateWorkspace("second", filepath.Join(folder, ".")); !errors.Is(err, ErrDuplicateFolder) {
		t.Fatalf("duplicate folder: err = %v, want ErrDuplicateFolder", err)
	}

	found, err := s.FindWorkspaceByFolder(folder)
	if err != nil {
		t.Fatal(err)
	}
	if found == nil || found.ID != first.ID {
		t.Fatalf("FindWorkspaceByFolder = %+v, want %s", found, first.ID)
	}
	none, err := s.FindWorkspaceByFolder(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if none != nil {
		t.Fatalf("FindWorkspaceByFolder on unknown folder = %+v, want nil", none)
	}
}

func TestCreateWorkspaceRejectsEmptyName(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.CreateWorkspace("   ", t.TempDir()); !errors.Is(err, ErrEmptyName) {
		t.Fatalf("blank name: err = %v, want ErrEmptyName", err)
	}
}

func TestRenameWorkspace(t *testing.T) {
	s := openTestStore(t)
	w, err := s.CreateWorkspace("old", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	renamed, err := s.RenameWorkspace(w.ID, "  new name ")
	if err != nil {
		t.Fatalf("RenameWorkspace: %v", err)
	}
	if renamed.Name != "new name" || renamed.FolderPath != w.FolderPath {
		t.Fatalf("renamed = %+v", renamed)
	}
	if _, err := s.RenameWorkspace(w.ID, ""); !errors.Is(err, ErrEmptyName) {
		t.Errorf("blank rename: err = %v, want ErrEmptyName", err)
	}
	if _, err := s.RenameWorkspace("missing", "x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("rename missing: err = %v, want ErrNotFound", err)
	}
}

func TestMarkInterruptedScans(t *testing.T) {
	s := openTestStore(t)
	w, err := s.CreateWorkspace("ws", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	done, err := s.CreateScan(w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.FinishScan(done.ID, s.SnapshotPath(w.ID, done.ID)); err != nil {
		t.Fatal(err)
	}
	stale, err := s.CreateScan(w.ID)
	if err != nil {
		t.Fatal(err)
	}
	// A partial snapshot the crashed process left behind.
	partial := s.SnapshotPath(w.ID, stale.ID)
	if err := os.MkdirAll(filepath.Dir(partial), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(partial, []byte("half"), 0o644); err != nil {
		t.Fatal(err)
	}

	n, err := s.MarkInterruptedScans()
	if err != nil {
		t.Fatalf("MarkInterruptedScans: %v", err)
	}
	if n != 1 {
		t.Fatalf("marked %d scans, want 1", n)
	}
	got, err := s.GetScan(stale.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != ScanStatusFailed || got.Error != ErrScanInterrupted || got.FinishedAt == nil {
		t.Fatalf("interrupted scan = %+v", got)
	}
	if _, err := os.Stat(partial); !os.IsNotExist(err) {
		t.Errorf("partial snapshot still on disk: %v", err)
	}
	untouched, err := s.GetScan(done.ID)
	if err != nil {
		t.Fatal(err)
	}
	if untouched.Status != ScanStatusComplete {
		t.Errorf("completed scan changed: %+v", untouched)
	}

	// Idempotent: nothing left to mark.
	if n, err := s.MarkInterruptedScans(); err != nil || n != 0 {
		t.Errorf("second pass: n=%d err=%v", n, err)
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
