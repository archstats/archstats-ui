package app

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// RevealSnapshot shows a scan's .db in the file manager: the snapshot is the
// contract, and a person should be able to find it.
func (w *WorkspaceService) RevealSnapshot(scanID string) error {
	scan, err := w.store.GetScan(scanID)
	if err != nil {
		return err
	}
	if scan.SnapshotPath == "" {
		return fmt.Errorf("this scan has no snapshot file")
	}
	return revealInFileManager(scan.SnapshotPath)
}

// SnapshotPath returns where a scan's .db lives, for "Copy path".
func (w *WorkspaceService) SnapshotPath(scanID string) (string, error) {
	scan, err := w.store.GetScan(scanID)
	if err != nil {
		return "", err
	}
	return scan.SnapshotPath, nil
}

// SaveSnapshotCopy asks where to save and writes a copy of a scan's .db.
// Without source, the copy has no file_contents -- the stored text of every
// file -- and is vacuumed so it is actually smaller. Returns the path, or ""
// when cancelled.
func (w *WorkspaceService) SaveSnapshotCopy(scanID string, withSource bool) (string, error) {
	scan, err := w.store.GetScan(scanID)
	if err != nil {
		return "", err
	}
	if scan.SnapshotPath == "" {
		return "", fmt.Errorf("this scan has no snapshot file")
	}
	ws, err := w.store.GetWorkspace(scan.WorkspaceID)
	if err != nil {
		return "", err
	}
	name := safeName(ws.Name)
	if scan.Label != "" {
		name += "-" + safeName(scan.Label)
	} else {
		name += "-" + scan.StartedAt.Format("2006-01-02")
	}
	if !withSource {
		name += "-without-source"
	}
	dest, err := runtime.SaveFileDialog(w.ctx(), runtime.SaveDialogOptions{
		DefaultFilename: name + ".db",
		Title:           "Save a copy of the snapshot",
		Filters:         []runtime.FileFilter{{DisplayName: "Archstats snapshot", Pattern: "*.db"}},
	})
	if err != nil || dest == "" {
		return "", err
	}
	_ = os.Remove(dest)
	src, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?mode=ro", scan.SnapshotPath))
	if err != nil {
		return "", err
	}
	defer src.Close()
	// VACUUM INTO writes a consistent copy, WAL pages included.
	if _, err := src.Exec(`VACUUM INTO ?`, dest); err != nil {
		return "", fmt.Errorf("copying the snapshot: %w", err)
	}
	if !withSource {
		out, err := sql.Open("sqlite3", dest)
		if err != nil {
			return "", err
		}
		defer out.Close()
		var n int
		_ = out.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'file_contents'`).Scan(&n)
		if n > 0 {
			if _, err := out.Exec(`DELETE FROM file_contents`); err != nil {
				return "", err
			}
		}
		// Deleting alone leaves the pages in the file; VACUUM returns them.
		if _, err := out.Exec(`VACUUM`); err != nil {
			return "", err
		}
	}
	return dest, nil
}

func safeName(s string) string {
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`/\:*?"<>|`, r) {
			return '-'
		}
		return r
	}, strings.TrimSpace(s))
	return filepath.Clean(strings.ReplaceAll(s, " ", "-"))
}
