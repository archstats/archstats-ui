package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

type Workspace struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	FolderPath string    `json:"folderPath"`
	CreatedAt  time.Time `json:"createdAt"`
}

var ErrNotFound = errors.New("not found")

func (s *Store) CreateWorkspace(name, folderPath string) (*Workspace, error) {
	abs, err := filepath.Abs(folderPath)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("workspace folder: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("workspace folder %s is not a directory", abs)
	}
	w := &Workspace{
		ID:         uuid.NewString(),
		Name:       name,
		FolderPath: abs,
		CreatedAt:  time.Now().UTC(),
	}
	_, err = s.db.Exec(
		`INSERT INTO workspaces (id, name, folder_path, created_at) VALUES (?, ?, ?, ?)`,
		w.ID, w.Name, w.FolderPath, w.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (s *Store) GetWorkspace(id string) (*Workspace, error) {
	row := s.db.QueryRow(`SELECT id, name, folder_path, created_at FROM workspaces WHERE id = ?`, id)
	w := &Workspace{}
	err := row.Scan(&w.ID, &w.Name, &w.FolderPath, &w.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("workspace %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (s *Store) ListWorkspaces() ([]*Workspace, error) {
	rows, err := s.db.Query(`SELECT id, name, folder_path, created_at FROM workspaces ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workspaces := []*Workspace{}
	for rows.Next() {
		w := &Workspace{}
		if err := rows.Scan(&w.ID, &w.Name, &w.FolderPath, &w.CreatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, w)
	}
	return workspaces, rows.Err()
}

// DeleteWorkspace removes the workspace row (scans cascade) and its snapshot
// directory on disk.
func (s *Store) DeleteWorkspace(id string) error {
	res, err := s.db.Exec(`DELETE FROM workspaces WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("workspace %s: %w", id, ErrNotFound)
	}
	return os.RemoveAll(filepath.Join(s.root, "scans", id))
}
