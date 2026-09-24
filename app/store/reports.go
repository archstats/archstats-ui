package store

import (
	"database/sql"
	"time"
)

// Report is one notebook of a workspace's evidence. Body is the document as
// JSON; the store never reads inside it.
type Report struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	Position    int       `json:"position"`
	Title       string    `json:"title"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const reportColumns = `id, workspace_id, position, title, body, created_at, updated_at`

func (s *Store) Reports(workspaceID string) ([]*Report, error) {
	rows, err := s.db.Query(`SELECT `+reportColumns+` FROM reports WHERE workspace_id = ? ORDER BY position, created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Report
	for rows.Next() {
		r := &Report{}
		if err := rows.Scan(&r.ID, &r.WorkspaceID, &r.Position, &r.Title, &r.Body, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpsertReport inserts a report at the end of the list, or updates its title and body.
func (s *Store) UpsertReport(r *Report) error {
	now := time.Now().UTC()
	r.UpdatedAt = now
	var exists int
	_ = s.db.QueryRow(`SELECT count(*) FROM reports WHERE id = ?`, r.ID).Scan(&exists)
	if exists > 0 {
		_, err := s.db.Exec(`UPDATE reports SET title = ?, body = ?, updated_at = ? WHERE id = ?`, r.Title, r.Body, now, r.ID)
		return err
	}
	if r.CreatedAt.IsZero() {
		r.CreatedAt = now
	}
	var next int
	_ = s.db.QueryRow(`SELECT coalesce(max(position), -1) + 1 FROM reports WHERE workspace_id = ?`, r.WorkspaceID).Scan(&next)
	r.Position = next
	_, err := s.db.Exec(`INSERT INTO reports (`+reportColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.WorkspaceID, r.Position, r.Title, r.Body, r.CreatedAt, r.UpdatedAt)
	return err
}

func (s *Store) ReorderReports(workspaceID string, ids []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func(tx *sql.Tx) { _ = tx.Rollback() }(tx)
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE reports SET position = ? WHERE id = ? AND workspace_id = ?`, i, id, workspaceID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) DeleteReport(id string) error {
	_, err := s.db.Exec(`DELETE FROM reports WHERE id = ?`, id)
	return err
}
