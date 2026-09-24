package store

import (
	"database/sql"
	"errors"
	"time"
)

// Per-workspace state (lenses, merges, facets, arrangements) and global
// settings. Values are opaque JSON strings owned by the frontend; the store
// only keeps them durable. They lived in the webview's localStorage, which a
// reinstall, a new dev origin or a cleared cache silently empties.

// GetState returns every key stored for a workspace.
func (s *Store) GetState(workspaceID string) (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM workspace_state WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// PutState writes one key; an empty value deletes it.
func (s *Store) PutState(workspaceID, key, value string) error {
	if value == "" {
		_, err := s.db.Exec(`DELETE FROM workspace_state WHERE workspace_id = ? AND key = ?`, workspaceID, key)
		return err
	}
	_, err := s.db.Exec(`
INSERT INTO workspace_state (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT (workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		workspaceID, key, value, time.Now().UTC())
	return err
}

// GetSetting returns a global setting, or "" when unset.
func (s *Store) GetSetting(key string) (string, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

// PutSetting writes a global setting; an empty value deletes it.
func (s *Store) PutSetting(key, value string) error {
	if value == "" {
		_, err := s.db.Exec(`DELETE FROM settings WHERE key = ?`, key)
		return err
	}
	_, err := s.db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// GetSettings returns every global setting.
func (s *Store) GetSettings() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
