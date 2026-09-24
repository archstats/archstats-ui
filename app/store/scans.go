package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
)

const (
	ScanStatusRunning  = "running"
	ScanStatusComplete = "complete"
	ScanStatusFailed   = "failed"
)

type Scan struct {
	ID           string     `json:"id"`
	WorkspaceID  string     `json:"workspaceId"`
	Status       string     `json:"status"`
	StartedAt    time.Time  `json:"startedAt"`
	FinishedAt   *time.Time `json:"finishedAt"`
	Error        string     `json:"error"`
	SnapshotPath string     `json:"snapshotPath"`

	// Identity: what this scan read and what wrote it.
	Label  string `json:"label"`
	Origin string `json:"origin"` // scan | import | backfill
	ScanIdentity
	// SizeBytes is the snapshot file's size, read from disk on listing.
	SizeBytes int64 `json:"sizeBytes"`
}

// ScanIdentity is what a snapshot says about itself, copied into the
// registry when the scan finishes so listing never opens a snapshot.
type ScanIdentity struct {
	HeadCommit       string     `json:"headCommit"`
	Branch           string     `json:"branch"`
	HeadTime         *time.Time `json:"headTime"`
	HeadTimeSource   string     `json:"headTimeSource"` // head | max_commit | scan
	DirtyFiles       *int       `json:"dirtyFiles"`
	AnalysisRevision int        `json:"analysisRevision"`
	Extensions       string     `json:"extensions"`
	IgnoreGlobs      string     `json:"ignoreGlobs"`
	RevisionRef      string     `json:"revisionRef"`
}

// ErrScanInterrupted is the recorded error for scans that were still running
// when the app exited; no engine goroutine survives a restart.
const ErrScanInterrupted = "Interrupted: the app closed before this scan finished."

// MarkInterruptedScans fails every scan still recorded as running and removes
// any partial snapshot it left behind. Call once at startup, before any scan
// can start, so the history never shows a phantom running scan.
func (s *Store) MarkInterruptedScans() (int, error) {
	rows, err := s.db.Query(`SELECT id, workspace_id FROM scans WHERE status = ?`, ScanStatusRunning)
	if err != nil {
		return 0, err
	}
	type ref struct{ id, workspaceID string }
	var stale []ref
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.id, &r.workspaceID); err != nil {
			rows.Close()
			return 0, err
		}
		stale = append(stale, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, r := range stale {
		if err := s.FailScan(r.id, ErrScanInterrupted); err != nil {
			return 0, err
		}
		if err := os.Remove(s.SnapshotPath(r.workspaceID, r.id)); err != nil && !os.IsNotExist(err) {
			return 0, err
		}
	}
	return len(stale), nil
}

// CreateScan records a new scan in status "running".
func (s *Store) CreateScan(workspaceID string) (*Scan, error) {
	if _, err := s.GetWorkspace(workspaceID); err != nil {
		return nil, err
	}
	scan := &Scan{
		ID:          uuid.NewString(),
		WorkspaceID: workspaceID,
		Status:      ScanStatusRunning,
		StartedAt:   time.Now().UTC(),
	}
	_, err := s.db.Exec(
		`INSERT INTO scans (id, workspace_id, status, started_at) VALUES (?, ?, ?, ?)`,
		scan.ID, scan.WorkspaceID, scan.Status, scan.StartedAt,
	)
	if err != nil {
		return nil, err
	}
	return scan, nil
}

// FinishScan marks a scan complete with its snapshot location.
func (s *Store) FinishScan(id, snapshotPath string) error {
	return s.finish(id, ScanStatusComplete, "", snapshotPath)
}

// FailScan marks a scan failed. Failed scans keep no snapshot.
func (s *Store) FailScan(id, errMsg string) error {
	return s.finish(id, ScanStatusFailed, errMsg, "")
}

func (s *Store) finish(id, status, errMsg, snapshotPath string) error {
	res, err := s.db.Exec(
		`UPDATE scans SET status = ?, finished_at = ?, error = ?, snapshot_path = ? WHERE id = ?`,
		status, time.Now().UTC(), errMsg, snapshotPath, id,
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("scan %s: %w", id, ErrNotFound)
	}
	return nil
}

func (s *Store) GetScan(id string) (*Scan, error) {
	row := s.db.QueryRow(
		`SELECT `+scanColumns+` FROM scans WHERE id = ?`, id)
	scan, err := scanRow(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("scan %s: %w", id, ErrNotFound)
	}
	return scan, err
}

// ListScans returns a workspace's scans, newest first.
func (s *Store) ListScans(workspaceID string) ([]*Scan, error) {
	rows, err := s.db.Query(
		`SELECT `+scanColumns+`
		 FROM scans WHERE workspace_id = ? ORDER BY started_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	scans := []*Scan{}
	for rows.Next() {
		scan, err := scanRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		scans = append(scans, scan)
	}
	return scans, rows.Err()
}

// DeleteScan removes the scan row and its snapshot file, if any.
func (s *Store) DeleteScan(id string) error {
	scan, err := s.GetScan(id)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(`DELETE FROM scans WHERE id = ?`, id); err != nil {
		return err
	}
	if scan.SnapshotPath != "" {
		if err := os.Remove(scan.SnapshotPath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

const scanColumns = `id, workspace_id, status, started_at, finished_at, error, snapshot_path,
	label, origin, head_commit, branch, head_time, head_time_source, dirty_files,
	analysis_revision, extensions, ignore_globs, revision_ref`

func scanRow(scanFn func(dest ...any) error) (*Scan, error) {
	scan := &Scan{}
	var finishedAt, headTime sql.NullTime
	var dirty sql.NullInt64
	err := scanFn(&scan.ID, &scan.WorkspaceID, &scan.Status, &scan.StartedAt,
		&finishedAt, &scan.Error, &scan.SnapshotPath,
		&scan.Label, &scan.Origin, &scan.HeadCommit, &scan.Branch, &headTime, &scan.HeadTimeSource, &dirty,
		&scan.AnalysisRevision, &scan.Extensions, &scan.IgnoreGlobs, &scan.RevisionRef)
	if err != nil {
		return nil, err
	}
	if finishedAt.Valid {
		scan.FinishedAt = &finishedAt.Time
	}
	if headTime.Valid {
		scan.HeadTime = &headTime.Time
	}
	if dirty.Valid {
		d := int(dirty.Int64)
		scan.DirtyFiles = &d
	}
	if scan.SnapshotPath != "" {
		if info, err := os.Stat(scan.SnapshotPath); err == nil {
			scan.SizeBytes = info.Size()
		}
	}
	return scan, nil
}

// SetScanIdentity records what a finished snapshot says about itself.
func (s *Store) SetScanIdentity(id string, ident ScanIdentity) error {
	_, err := s.db.Exec(`UPDATE scans SET head_commit = ?, branch = ?, head_time = ?, head_time_source = ?,
		dirty_files = ?, analysis_revision = ?, extensions = ?, ignore_globs = ?, revision_ref = ?, identity_read = 1
		WHERE id = ?`,
		ident.HeadCommit, ident.Branch, ident.HeadTime, ident.HeadTimeSource, ident.DirtyFiles,
		ident.AnalysisRevision, ident.Extensions, ident.IgnoreGlobs, ident.RevisionRef, id)
	return err
}

// SetScanOrigin records where a scan came from: "backfill" with the commit
// it was rebuilt at, or "import".
func (s *Store) SetScanOrigin(id, origin, ref string) error {
	_, err := s.db.Exec(`UPDATE scans SET origin = ?, revision_ref = ? WHERE id = ?`, origin, ref, id)
	return err
}

// Root is the directory app.db and the snapshots live in.
func (s *Store) Root() string { return s.root }

// ScansWithoutIdentity lists complete scans whose identity was never read:
// every scan taken before the registry recorded identities.
func (s *Store) ScansWithoutIdentity() ([]*Scan, error) {
	rows, err := s.db.Query(`SELECT `+scanColumns+` FROM scans WHERE status = ? AND identity_read = 0`, ScanStatusComplete)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Scan
	for rows.Next() {
		scan, err := scanRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, scan)
	}
	return out, rows.Err()
}

// SetScanLabel names a scan ("before the split"); empty clears it.
func (s *Store) SetScanLabel(id, label string) error {
	res, err := s.db.Exec(`UPDATE scans SET label = ? WHERE id = ?`, label, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("scan %s: %w", id, ErrNotFound)
	}
	return nil
}
