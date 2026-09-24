package app

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/archstats/archstats-ui/app/snapshot"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats/core"
	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SnapshotInfo is what an import sheet shows before a .db is taken in.
type SnapshotInfo struct {
	Path        string    `json:"path"`
	Valid       bool      `json:"valid"`
	Reason      string    `json:"reason"`
	ReportID    string    `json:"reportId"`
	ScannedAt   time.Time `json:"scannedAt"`
	HeadCommit  string    `json:"headCommit"`
	Branch      string    `json:"branch"`
	Revision    int       `json:"revision"`
	NewerEngine bool      `json:"newerEngine"`
	Files       int       `json:"files"`
	HasGit      bool      `json:"hasGit"`
	HasSource   bool      `json:"hasSource"`
	SizeBytes   int64     `json:"sizeBytes"`
	// SuggestedWorkspaceID is the workspace named like the report, or the one
	// whose folder holds most of the snapshot's files.
	SuggestedWorkspaceID string  `json:"suggestedWorkspaceId"`
	Overlap              float64 `json:"overlap"`
	// AlreadyImportedScanID names a scan already holding this snapshot.
	AlreadyImportedScanID string `json:"alreadyImportedScanId"`
}

func openForInspect(path string) (*sql.DB, error) {
	return sql.Open("sqlite3", "file:"+path+"?mode=ro&_busy_timeout=5000")
}

func tableExists(db *sql.DB, name string) bool {
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?`, name).Scan(&n)
	return n > 0
}

// InspectSnapshot reads a .db without taking it in, and says whether it can be.
func (w *WorkspaceService) InspectSnapshot(path string) (*SnapshotInfo, error) {
	info := &SnapshotInfo{Path: path}
	st, err := os.Stat(path)
	if err != nil {
		info.Reason = "The file cannot be read."
		return info, nil
	}
	info.SizeBytes = st.Size()
	head := make([]byte, 16)
	if f, err := os.Open(path); err == nil {
		_, _ = f.Read(head)
		f.Close()
	}
	if string(head) != "SQLite format 3\x00" {
		info.Reason = "This is not a SQLite database."
		return info, nil
	}
	db, err := openForInspect(path)
	if err != nil {
		info.Reason = err.Error()
		return info, nil
	}
	defer db.Close()
	for _, t := range []string{"_metric_definitions", "files", "components"} {
		if !tableExists(db, t) {
			info.Reason = fmt.Sprintf("This database is not an Archstats snapshot: it has no %s table.", t)
			return info, nil
		}
	}
	var reports []string
	if rows, err := db.Query(`SELECT DISTINCT report_id FROM files`); err == nil {
		for rows.Next() {
			var r sql.NullString
			if rows.Scan(&r) == nil && r.Valid {
				reports = append(reports, r.String)
			}
		}
		rows.Close()
	}
	if len(reports) > 1 {
		info.Reason = fmt.Sprintf("The file holds %d reports (%s); import one snapshot at a time.", len(reports), strings.Join(reports, ", "))
		return info, nil
	}
	if len(reports) == 1 {
		info.ReportID = reports[0]
	}
	_ = db.QueryRow(`SELECT count(*) FROM files`).Scan(&info.Files)
	info.HasGit = tableExists(db, "git_commits")
	if tableExists(db, "file_contents") {
		var n int
		_ = db.QueryRow(`SELECT count(*) FROM (SELECT 1 FROM file_contents LIMIT 1)`).Scan(&n)
		info.HasSource = n > 0
	}
	fallback := st.ModTime()
	var ts sql.NullString
	if db.QueryRow(`SELECT max(timestamp) FROM files`).Scan(&ts) == nil && ts.Valid {
		if t, err := parseSQLiteTime(ts.String); err == nil {
			fallback = t
		}
	}
	ident, err := snapshot.ReadIdentity(path, fallback)
	if err == nil {
		info.HeadCommit, info.Branch, info.Revision = ident.HeadCommit, ident.Branch, ident.AnalysisRevision
	}
	info.ScannedAt = fallback
	if tableExists(db, "_snapshot") {
		var v sql.NullString
		if db.QueryRow(`SELECT value FROM _snapshot WHERE key = 'scanned_at' LIMIT 1`).Scan(&v) == nil && v.Valid {
			if t, err := time.Parse(time.RFC3339, v.String); err == nil {
				info.ScannedAt = t
			}
		}
	}
	if info.Revision > core.AnalysisRevision {
		info.NewerEngine = true
		info.Reason = fmt.Sprintf("Written by a newer analysis (revision %d; this build reads up to %d). Update Archstats to open it.", info.Revision, core.AnalysisRevision)
		return info, nil
	}
	info.Valid = true
	w.suggestWorkspace(db, info)
	return info, nil
}

func parseSQLiteTime(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparsed time %q", s)
}

// suggestWorkspace picks the workspace an import most probably belongs to:
// one named like the report, else the one whose folder has most of the
// snapshot's files. A match that is already imported says so.
func (w *WorkspaceService) suggestWorkspace(db *sql.DB, info *SnapshotInfo) {
	list, err := w.store.ListWorkspaces()
	if err != nil {
		return
	}
	var sample []string
	if rows, err := db.Query(`SELECT name FROM files ORDER BY random() LIMIT 200`); err == nil {
		for rows.Next() {
			var n string
			if rows.Scan(&n) == nil {
				sample = append(sample, n)
			}
		}
		rows.Close()
	}
	best, bestScore := "", -1.0
	for _, ws := range list {
		score := 0.0
		if len(sample) > 0 {
			hit := 0
			for _, f := range sample {
				if _, err := os.Stat(filepath.Join(ws.FolderPath, filepath.FromSlash(f))); err == nil {
					hit++
				}
			}
			score = float64(hit) / float64(len(sample))
		}
		if info.ReportID != "" && strings.EqualFold(ws.Name, info.ReportID) {
			score += 1
		}
		if score > bestScore {
			best, bestScore = ws.ID, score
		}
	}
	info.SuggestedWorkspaceID = best
	if bestScore > 1 {
		bestScore -= 1
	}
	info.Overlap = bestScore
	// Same report, same commit, same scan time: already here.
	for _, ws := range list {
		scans, err := w.store.ListScans(ws.ID)
		if err != nil {
			continue
		}
		for _, s := range scans {
			if s.Status == store.ScanStatusComplete && s.HeadCommit == info.HeadCommit && s.StartedAt.Equal(info.ScannedAt.UTC()) {
				info.AlreadyImportedScanID = s.ID
				return
			}
		}
	}
}

// ImportSnapshot copies a snapshot into a workspace's scans through SQLite
// itself (VACUUM INTO), so a CLI export whose write-ahead log was never
// merged arrives whole. The original is not touched.
func (w *WorkspaceService) ImportSnapshot(path, workspaceID string) (*store.Scan, error) {
	info, err := w.InspectSnapshot(path)
	if err != nil {
		return nil, err
	}
	if !info.Valid {
		return nil, fmt.Errorf("%s", info.Reason)
	}
	if info.AlreadyImportedScanID != "" {
		return nil, fmt.Errorf("already imported")
	}
	if _, err := w.store.GetWorkspace(workspaceID); err != nil {
		return nil, err
	}
	id := uuid.NewString()
	dest := w.store.SnapshotPath(workspaceID, id)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, err
	}
	src, err := openForInspect(path)
	if err != nil {
		return nil, err
	}
	_, err = src.Exec(`VACUUM INTO ?`, dest)
	src.Close()
	if err != nil {
		os.Remove(dest)
		return nil, fmt.Errorf("copying the snapshot: %w", err)
	}
	scan, err := w.store.AddImportedScan(id, workspaceID, info.ScannedAt.UTC(), dest)
	if err != nil {
		os.Remove(dest)
		return nil, err
	}
	if ident, err := snapshot.ReadIdentity(dest, info.ScannedAt); err == nil {
		_ = w.store.SetScanIdentity(scan.ID, ident)
	}
	_ = w.store.SetScanOrigin(scan.ID, "import", "")
	return w.store.GetScan(scan.ID)
}

// PickSnapshot asks for a .db to import; "" when cancelled.
func (w *WorkspaceService) PickSnapshot() (string, error) {
	return pickFile(w.ctx(), "Import a snapshot", "Archstats snapshot", "*.db")
}

func pickFile(ctx context.Context, title, name, patterns string) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{Title: title, Filters: []runtime.FileFilter{{DisplayName: name, Pattern: patterns}}})
}
