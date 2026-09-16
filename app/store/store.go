package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// Store owns the application registry (app.db) and the on-disk layout of
// scan snapshots under the archstats data directory.
type Store struct {
	db   *sql.DB
	root string
}

// DefaultRoot returns the platform config location for archstats data,
// e.g. ~/Library/Application Support/archstats on macOS.
func DefaultRoot() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "archstats"), nil
}

// Open creates root if needed, opens (or creates) app.db inside it, and
// applies migrations.
func Open(root string) (*Store, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_foreign_keys=on", filepath.Join(root, "app.db"))
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db, root: root}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS workspaces (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	folder_path TEXT NOT NULL,
	created_at  DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
	id            TEXT PRIMARY KEY,
	workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	status        TEXT NOT NULL CHECK (status IN ('running','complete','failed')),
	started_at    DATETIME NOT NULL,
	finished_at   DATETIME,
	error         TEXT NOT NULL DEFAULT '',
	snapshot_path TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_scans_workspace ON scans(workspace_id, started_at DESC);
`)
	return err
}

// SnapshotPath returns the canonical path for a scan's snapshot database.
func (s *Store) SnapshotPath(workspaceID, scanID string) string {
	return filepath.Join(s.root, "scans", workspaceID, scanID+".db")
}
