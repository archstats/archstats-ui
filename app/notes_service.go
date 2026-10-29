package app

import (
	"errors"
	"strings"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/google/uuid"
)

// NotesService keeps a workspace's notes: what a person, or Ask on their
// behalf, learned about part of the codebase. They are read back into every
// later conversation, so understanding accumulates.
type NotesService struct {
	store *store.Store
}

func NewNotesService(st *store.Store) *NotesService {
	return &NotesService{store: st}
}

func (n *NotesService) List(workspaceID string) ([]*store.Note, error) {
	notes, err := n.store.Notes(workspaceID)
	if notes == nil {
		notes = []*store.Note{}
	}
	return notes, err
}

// Save adds a note (a new id is given when it has none) or updates one.
func (n *NotesService) Save(note store.Note) (*store.Note, error) {
	note.Text = strings.TrimSpace(note.Text)
	if note.Text == "" {
		return nil, errors.New("a note needs text")
	}
	if note.WorkspaceID == "" {
		return nil, errors.New("a note belongs to a workspace")
	}
	if note.ID == "" {
		note.ID = uuid.NewString()
	}
	if err := n.store.SaveNote(&note); err != nil {
		return nil, err
	}
	return &note, nil
}

func (n *NotesService) Delete(id string) error {
	return n.store.DeleteNote(id)
}
