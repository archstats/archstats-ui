package store

import (
	"database/sql"
	"time"
)

// Pin is one finding on a workspace's evidence board.
type Pin struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	Position    int       `json:"position"`
	Kind        string    `json:"kind"`
	EntityKey   string    `json:"entityKey"`
	Title       string    `json:"title"`
	Route       string    `json:"route"`
	ScanID      *string   `json:"scanId"`
	HeadCommit  string    `json:"headCommit"`
	Revision    int       `json:"revision"`
	Lens        string    `json:"lens"`
	Scope       string    `json:"scope"`
	Role        string    `json:"role"`
	Values      string    `json:"values"`
	Note        string    `json:"note"`
	FigurePath  string    `json:"figurePath"`
	CreatedAt   time.Time `json:"createdAt"`
}

const pinColumns = `id, workspace_id, position, kind, entity_key, title, route, scan_id, head_commit, revision, lens, scope, role, pinned_values, note, figure_path, created_at`

func scanPin(scan func(dest ...any) error) (*Pin, error) {
	p := &Pin{}
	var scanID sql.NullString
	if err := scan(&p.ID, &p.WorkspaceID, &p.Position, &p.Kind, &p.EntityKey, &p.Title, &p.Route, &scanID, &p.HeadCommit, &p.Revision, &p.Lens, &p.Scope, &p.Role, &p.Values, &p.Note, &p.FigurePath, &p.CreatedAt); err != nil {
		return nil, err
	}
	if scanID.Valid {
		p.ScanID = &scanID.String
	}
	return p, nil
}

// Pins lists a workspace's board in order.
func (s *Store) Pins(workspaceID string) ([]*Pin, error) {
	rows, err := s.db.Query(`SELECT `+pinColumns+` FROM evidence_pins WHERE workspace_id = ? ORDER BY position, created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Pin
	for rows.Next() {
		p, err := scanPin(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpsertPin inserts a pin at the end of its board, or updates one in place.
func (s *Store) UpsertPin(p *Pin) error {
	var exists int
	_ = s.db.QueryRow(`SELECT count(*) FROM evidence_pins WHERE id = ?`, p.ID).Scan(&exists)
	var scanID any
	if p.ScanID != nil && *p.ScanID != "" {
		scanID = *p.ScanID
	}
	if exists > 0 {
		_, err := s.db.Exec(`UPDATE evidence_pins SET title = ?, note = ?, route = ?, pinned_values = ?, figure_path = ? WHERE id = ?`, p.Title, p.Note, p.Route, p.Values, p.FigurePath, p.ID)
		return err
	}
	var next int
	_ = s.db.QueryRow(`SELECT coalesce(max(position), -1) + 1 FROM evidence_pins WHERE workspace_id = ?`, p.WorkspaceID).Scan(&next)
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.Exec(`INSERT INTO evidence_pins (`+pinColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.WorkspaceID, next, p.Kind, p.EntityKey, p.Title, p.Route, scanID, p.HeadCommit, p.Revision, p.Lens, p.Scope, p.Role, p.Values, p.Note, p.FigurePath, p.CreatedAt)
	return err
}

// ReorderPins sets the board order to the ids given.
func (s *Store) ReorderPins(workspaceID string, ids []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE evidence_pins SET position = ? WHERE id = ? AND workspace_id = ?`, i, id, workspaceID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DeletePin removes a pin and returns its figure path, for the caller to delete.
func (s *Store) DeletePin(id string) (string, error) {
	var fig string
	_ = s.db.QueryRow(`SELECT figure_path FROM evidence_pins WHERE id = ?`, id).Scan(&fig)
	_, err := s.db.Exec(`DELETE FROM evidence_pins WHERE id = ?`, id)
	return fig, err
}
