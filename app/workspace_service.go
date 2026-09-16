package app

import (
	"github.com/archstats/archstats-ui/app/store"
)

// WorkspaceService is the Wails-bound facade for workspace CRUD.
type WorkspaceService struct {
	store *store.Store
}

func NewWorkspaceService(s *store.Store) *WorkspaceService {
	return &WorkspaceService{store: s}
}

func (w *WorkspaceService) Create(name, folderPath string) (*store.Workspace, error) {
	return w.store.CreateWorkspace(name, folderPath)
}

func (w *WorkspaceService) Get(id string) (*store.Workspace, error) {
	return w.store.GetWorkspace(id)
}

func (w *WorkspaceService) List() ([]*store.Workspace, error) {
	return w.store.ListWorkspaces()
}

func (w *WorkspaceService) Delete(id string) error {
	return w.store.DeleteWorkspace(id)
}

func (w *WorkspaceService) ListScans(workspaceID string) ([]*store.Scan, error) {
	return w.store.ListScans(workspaceID)
}

func (w *WorkspaceService) DeleteScan(scanID string) error {
	return w.store.DeleteScan(scanID)
}
