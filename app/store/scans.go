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
		`SELECT id, workspace_id, status, started_at, finished_at, error, snapshot_path FROM scans WHERE id = ?`, id)
	scan, err := scanRow(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("scan %s: %w", id, ErrNotFound)
	}
	return scan, err
}

// ListScans returns a workspace's scans, newest first.
func (s *Store) ListScans(workspaceID string) ([]*Scan, error) {
	rows, err := s.db.Query(
		`SELECT id, workspace_id, status, started_at, finished_at, error, snapshot_path
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

func scanRow(scanFn func(dest ...any) error) (*Scan, error) {
	scan := &Scan{}
	var finishedAt sql.NullTime
	err := scanFn(&scan.ID, &scan.WorkspaceID, &scan.Status, &scan.StartedAt,
		&finishedAt, &scan.Error, &scan.SnapshotPath)
	if err != nil {
		return nil, err
	}
	if finishedAt.Valid {
		scan.FinishedAt = &finishedAt.Time
	}
	return scan, nil
}
