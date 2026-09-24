package app

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/archstats/archstats-ui/app/report"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/google/uuid"
)

// EvidenceService keeps a workspace's evidence board: findings pinned with
// the snapshot, commit and slicing they came from, and a figure for pinned
// views. Figures live next to app.db in evidence/<workspace>/.
type EvidenceService struct {
	store *store.Store
}

func NewEvidenceService(st *store.Store) *EvidenceService {
	return &EvidenceService{store: st}
}

func (e *EvidenceService) List(workspaceID string) ([]*store.Pin, error) {
	pins, err := e.store.Pins(workspaceID)
	if pins == nil {
		pins = []*store.Pin{}
	}
	return pins, err
}

// Upsert adds a pin (a new id is given when it has none) or updates its title, note or values.
func (e *EvidenceService) Upsert(p store.Pin) (*store.Pin, error) {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	if err := e.store.UpsertPin(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (e *EvidenceService) Reorder(workspaceID string, ids []string) error {
	return e.store.ReorderPins(workspaceID, ids)
}

func (e *EvidenceService) Delete(id string) error {
	fig, err := e.store.DeletePin(id)
	if err == nil && fig != "" && strings.HasPrefix(filepath.Clean(fig), e.dir()) {
		_ = os.Remove(fig)
	}
	return err
}

func (e *EvidenceService) dir() string { return filepath.Join(e.store.Root(), "evidence") }

// SaveFigure writes a pin's PNG (base64) and returns its path.
func (e *EvidenceService) SaveFigure(workspaceID, pinID, pngBase64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(pngBase64)
	if err != nil {
		return "", fmt.Errorf("figure is not base64: %w", err)
	}
	dir := filepath.Join(e.dir(), workspaceID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, pinID+".png")
	return path, os.WriteFile(path, data, 0o644)
}

// Figure reads a pin's PNG back as base64, for a report bundle; "" when it has none.
func (e *EvidenceService) Figure(path string) (string, error) {
	if path == "" || !strings.HasPrefix(filepath.Clean(path), e.dir()) {
		return "", nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", nil
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// Reports lists a workspace's report notebooks, in their order.
func (e *EvidenceService) Reports(workspaceID string) ([]*store.Report, error) {
	rs, err := e.store.Reports(workspaceID)
	if rs == nil {
		rs = []*store.Report{}
	}
	return rs, err
}

// SaveReport inserts a report (a new id when it has none) or saves its title and body.
func (e *EvidenceService) SaveReport(r store.Report) (*store.Report, error) {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	if err := e.store.UpsertReport(&r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (e *EvidenceService) ReorderReports(workspaceID string, ids []string) error {
	return e.store.ReorderReports(workspaceID, ids)
}

func (e *EvidenceService) DeleteReport(id string) error {
	return e.store.DeleteReport(id)
}

// RenderPDF lays a report out as a PDF and returns it as base64, for the
// files service to save where the user chooses.
func (e *EvidenceService) RenderPDF(doc report.Doc) (string, error) {
	out, err := report.Render(doc)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(out), nil
}

// OpenPDF writes a report's PDF to a temporary file and opens it in the
// system's viewer, for reading it outside the app before saving.
func (e *EvidenceService) OpenPDF(pdfBase64, name string) error {
	data, err := base64.StdEncoding.DecodeString(pdfBase64)
	if err != nil {
		return fmt.Errorf("the PDF is not base64: %w", err)
	}
	safe := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`/\:*?"<>|`, r) {
			return '-'
		}
		return r
	}, strings.TrimSpace(name))
	if safe == "" {
		safe = "Report"
	}
	dir := filepath.Join(os.TempDir(), "archstats-reports")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(dir, safe+".pdf")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	return openWithDefault(path)
}
