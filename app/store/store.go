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
	// WAL and a busy timeout: debounced state writes, scan completion and
	// reading caches write from different goroutines over one pool.
	dsn := fmt.Sprintf("file:%s?_foreign_keys=on&_busy_timeout=5000&_journal_mode=WAL", filepath.Join(root, "app.db"))
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

// migrations are applied in order; PRAGMA user_version records how many
// have run. Never edit one that has shipped: add the next.
var migrations = []func(tx *sql.Tx) error{
	migrate0,
	migrate1,
	migrate2,
}

func (s *Store) migrate() error {
	var version int
	if err := s.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	if version >= len(migrations) {
		return nil
	}
	// A registry holds months of work (workspaces, lenses, merges); an
	// upgrade that goes wrong must be undoable by hand.
	if version > 0 || s.hasRows() {
		if err := s.backup(version); err != nil {
			return fmt.Errorf("backing up app.db before migration %d: %w", version+1, err)
		}
	}
	for i := version; i < len(migrations); i++ {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if err := migrations[i](tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i, err)
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) hasRows() bool {
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`).Scan(&n); err != nil || n == 0 {
		return false
	}
	if err := s.db.QueryRow(`SELECT count(*) FROM workspaces`).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

// backup copies app.db to app.db.bak-v<version> through SQLite itself, so a
// WAL file's pages are included.
func (s *Store) backup(version int) error {
	dest := filepath.Join(s.root, fmt.Sprintf("app.db.bak-v%d", version))
	_ = os.Remove(dest)
	_, err := s.db.Exec(`VACUUM INTO ?`, dest)
	return err
}

// migrate0 is the schema every registry had before migrations were
// numbered; IF NOT EXISTS makes it a no-op on those.
func migrate0(tx *sql.Tx) error {
	_, err := tx.Exec(`
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

// migrate1 gives a scan an identity (the commit it read, what wrote it, a
// label), a workspace a baseline, and the app somewhere durable for state
// that lived in the webview's localStorage.
func migrate1(tx *sql.Tx) error {
	_, err := tx.Exec(`
ALTER TABLE scans ADD COLUMN label             TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN origin            TEXT    NOT NULL DEFAULT 'scan';
ALTER TABLE scans ADD COLUMN head_commit       TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN branch            TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN head_time         DATETIME;
ALTER TABLE scans ADD COLUMN head_time_source  TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN dirty_files       INTEGER;
ALTER TABLE scans ADD COLUMN analysis_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scans ADD COLUMN extensions        TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN ignore_globs      TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN revision_ref      TEXT    NOT NULL DEFAULT '';
ALTER TABLE scans ADD COLUMN identity_read     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN baseline_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL;
CREATE TABLE settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE workspace_state (
	workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	key          TEXT NOT NULL,
	value        TEXT NOT NULL,
	updated_at   DATETIME NOT NULL,
	PRIMARY KEY (workspace_id, key)
);
`)
	return err
}

// SnapshotPath returns the canonical path for a scan's snapshot database.
func (s *Store) SnapshotPath(workspaceID, scanID string) string {
	return filepath.Join(s.root, "scans", workspaceID, scanID+".db")
}

// migrate2 caches the app's readings per scan (propagation cost, tangles,
// medians), so Over time reads one row per point instead of opening every
// snapshot. A snapshot never changes, so a reading never goes stale; the
// analysis that computes it is versioned in the key.
func migrate2(tx *sql.Tx) error {
	_, err := tx.Exec(`
CREATE TABLE scan_readings (
	scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
	reading TEXT NOT NULL,
	value   REAL,
	PRIMARY KEY (scan_id, reading)
);`)
	return err
}
