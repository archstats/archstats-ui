package store

import (
	"database/sql"
	"time"
)

// Note is one thing learned about part of a codebase.
type Note struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	// SubjectKind is codebase, component, file, unit, entry or table;
	// Subject is its name ("" for the codebase).
	SubjectKind string    `json:"subjectKind"`
	Subject     string    `json:"subject"`
	Text        string    `json:"text"`
	Author      string    `json:"author"`
	ScanID      *string   `json:"scanId"`
	HeadCommit  string    `json:"headCommit"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const noteColumns = `id, workspace_id, subject_kind, subject, text, author, scan_id, head_commit, created_at, updated_at`

// Notes lists a workspace's notes, newest first.
func (s *Store) Notes(workspaceID string) ([]*Note, error) {
	rows, err := s.db.Query(`SELECT `+noteColumns+` FROM notes WHERE workspace_id = ? ORDER BY updated_at DESC, id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Note
	for rows.Next() {
		n := &Note{}
		var scanID sql.NullString
		if err := rows.Scan(&n.ID, &n.WorkspaceID, &n.SubjectKind, &n.Subject, &n.Text, &n.Author, &scanID, &n.HeadCommit, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		if scanID.Valid {
			n.ScanID = &scanID.String
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// SaveNote inserts a note or replaces its text and subject.
func (s *Store) SaveNote(n *Note) error {
	now := time.Now().UTC()
	if n.CreatedAt.IsZero() {
		n.CreatedAt = now
	}
	n.UpdatedAt = now
	if n.SubjectKind == "" {
		n.SubjectKind = "codebase"
	}
	if n.Author == "" {
		n.Author = "person"
	}
	_, err := s.db.Exec(`INSERT INTO notes (`+noteColumns+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET subject_kind = excluded.subject_kind, subject = excluded.subject, text = excluded.text, updated_at = excluded.updated_at`,
		n.ID, n.WorkspaceID, n.SubjectKind, n.Subject, n.Text, n.Author, n.ScanID, n.HeadCommit, n.CreatedAt, n.UpdatedAt)
	return err
}

// DeleteNote removes a note.
func (s *Store) DeleteNote(id string) error {
	_, err := s.db.Exec(`DELETE FROM notes WHERE id = ?`, id)
	return err
}
