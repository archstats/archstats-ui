package app

import (
	"context"
	"errors"
	"path/filepath"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// WorkspaceService is the Wails-bound facade for workspace CRUD and the
// native folder picker.
type WorkspaceService struct {
	store *store.Store
	// ctx yields the Wails runtime context once the app has started; native
	// dialogs need it. A func rather than a field so nothing about it is
	// exported to the frontend bindings.
	ctx func() context.Context
}

func NewWorkspaceService(s *store.Store, ctx func() context.Context) *WorkspaceService {
	return &WorkspaceService{store: s, ctx: ctx}
}

// FolderPick is what the native picker returns to the frontend.
type FolderPick struct {
	// Path is empty when the user cancelled the dialog.
	Path string `json:"path"`
	// SuggestedName is the folder's basename, the default workspace name.
	SuggestedName string `json:"suggestedName"`
	// Existing is set when another workspace already points at Path.
	Existing *store.Workspace `json:"existing"`
}

// SelectFolder opens the OS folder picker and reports the choice together
// with any workspace that already owns that folder, so the frontend can
// refuse duplicates with a pointer instead of a bare error.
func (w *WorkspaceService) SelectFolder() (*FolderPick, error) {
	ctx := w.ctx()
	if ctx == nil {
		return nil, errors.New("folder picker unavailable before startup")
	}
	path, err := runtime.OpenDirectoryDialog(ctx, runtime.OpenDialogOptions{
		Title:                "Choose a folder to analyze",
		CanCreateDirectories: false,
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return &FolderPick{}, nil
	}
	existing, err := w.store.FindWorkspaceByFolder(path)
	if err != nil {
		return nil, err
	}
	return &FolderPick{
		Path:          path,
		SuggestedName: filepath.Base(path),
		Existing:      existing,
	}, nil
}

func (w *WorkspaceService) Create(name, folderPath string) (*store.Workspace, error) {
	return w.store.CreateWorkspace(name, folderPath)
}

func (w *WorkspaceService) Rename(id, name string) (*store.Workspace, error) {
	return w.store.RenameWorkspace(id, name)
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

// SetBaseline pins the scan a workspace compares against; "" unpins.
func (w *WorkspaceService) SetBaseline(workspaceID, scanID string) error {
	return w.store.SetBaseline(workspaceID, scanID)
}

// LabelScan names a scan ("before the split"); "" clears the label.
func (w *WorkspaceService) LabelScan(scanID, label string) error {
	return w.store.SetScanLabel(scanID, label)
}
