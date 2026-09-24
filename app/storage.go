package app

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/archstats/archstats-ui/app/store"
)

// StorageWorkspace is one workspace's snapshots with their sizes on disk.
type StorageWorkspace struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	BaselineScanID string        `json:"baselineScanId"`
	Scans          []*store.Scan `json:"scans"`
	Bytes          int64         `json:"bytes"`
}

// StorageSummary lists every workspace's snapshots and what they take up:
// the answer to "9.9 GB of scans, and which can go".
func (w *WorkspaceService) StorageSummary() ([]StorageWorkspace, error) {
	list, err := w.store.ListWorkspaces()
	if err != nil {
		return nil, err
	}
	out := make([]StorageWorkspace, 0, len(list))
	for _, ws := range list {
		scans, err := w.store.ListScans(ws.ID)
		if err != nil {
			return nil, err
		}
		sw := StorageWorkspace{ID: ws.ID, Name: ws.Name, Scans: scans}
		if ws.BaselineScanID != nil {
			sw.BaselineScanID = *ws.BaselineScanID
		}
		for _, s := range scans {
			sw.Bytes += s.SizeBytes
		}
		out = append(out, sw)
	}
	return out, nil
}

// DeleteScans deletes several snapshots, closing any open handle on each
// first (Windows will not delete an open file). It stops at the first
// failure and says which scan it was.
func (w *WorkspaceService) DeleteScans(ids []string) error {
	for _, id := range ids {
		w.release(id)
		if err := w.store.DeleteScan(id); err != nil {
			return fmt.Errorf("deleting scan %s: %w", id, err)
		}
	}
	return nil
}

// removeWorkspaceLeftovers deletes what a workspace kept outside app.db
// besides its snapshots: rescan clones and evidence figures.
func removeWorkspaceLeftovers(root, workspaceID string) {
	_ = os.RemoveAll(filepath.Join(root, "backfill", workspaceID))
	_ = os.RemoveAll(filepath.Join(root, "evidence", workspaceID))
}
