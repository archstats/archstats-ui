package scan

import (
	"fmt"
	snapshotinfo "github.com/archstats/archstats-ui/app/snapshot"
	"os"
	"path/filepath"
	"sync"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats/cmd/common"
	"github.com/archstats/archstats/cmd/config"
	"github.com/archstats/archstats/cmd/export/sqlite"
	"github.com/archstats/archstats/core"
	"github.com/archstats/archstats/core/walker"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

const (
	EventScanStarted = "scan:started"
	EventScanPhase   = "scan:phase"
	EventScanDone    = "scan:done"
	EventScanFailed  = "scan:failed"
)

// Service orchestrates workspace scans: extension auto-detection, analysis,
// and snapshot export. One scan per workspace at a time; scans are not
// cancellable in v1 (the engine has no context support).
type Service struct {
	store *store.Store
	emit  func(event string, data ...any)

	mu      sync.Mutex
	running map[string]bool // workspaceID → scan in flight
}

func NewService(st *store.Store) *Service {
	return &Service{
		store:   st,
		emit:    func(string, ...any) {},
		running: map[string]bool{},
	}
}

// SetEmitter wires event emission (in production: Wails runtime.EventsEmit).
func (s *Service) SetEmitter(emit func(event string, data ...any)) {
	s.emit = emit
}

// StartScan records a new scan and runs it asynchronously. It returns the
// scan row immediately; progress arrives via events and the scan row status.
func (s *Service) StartScan(workspaceID string) (*store.Scan, error) {
	ws, err := s.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if s.running[ws.ID] {
		s.mu.Unlock()
		return nil, fmt.Errorf("a scan is already running for workspace %s", ws.Name)
	}
	s.running[ws.ID] = true
	s.mu.Unlock()

	scan, err := s.store.CreateScan(ws.ID)
	if err != nil {
		s.mu.Lock()
		delete(s.running, ws.ID)
		s.mu.Unlock()
		return nil, err
	}

	go s.run(ws, scan)
	return scan, nil
}

// IsRunning reports whether a scan is in flight for the workspace.
func (s *Service) IsRunning(workspaceID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running[workspaceID]
}

func (s *Service) run(ws *store.Workspace, scan *store.Scan) {
	defer func() {
		s.mu.Lock()
		delete(s.running, ws.ID)
		s.mu.Unlock()
		if r := recover(); r != nil {
			msg := fmt.Sprintf("panic during scan: %v", r)
			log.Error().Str("workspace", ws.ID).Msg(msg)
			s.fail(ws.ID, scan.ID, msg)
		}
	}()

	s.emit(EventScanStarted, payload(ws.ID, scan.ID, nil))

	extensions, names, err := extensionsFor(ws.FolderPath)
	if err != nil {
		s.fail(ws.ID, scan.ID, fmt.Sprintf("detecting extensions: %v", err))
		return
	}
	s.emit(EventScanPhase, payload(ws.ID, scan.ID, map[string]any{
		"phase":      "analyzing",
		"extensions": names,
	}))

	results, err := core.New(&core.Config{
		RootPath:   ws.FolderPath,
		Extensions: extensions,
	}).Analyze()
	if err != nil {
		s.fail(ws.ID, scan.ID, fmt.Sprintf("analyzing %s: %v", ws.FolderPath, err))
		return
	}

	s.emit(EventScanPhase, payload(ws.ID, scan.ID, map[string]any{"phase": "rendering"}))
	var views []*core.View
	for _, vf := range results.GetViewFactories() {
		view, err := results.RenderView(vf.Name)
		if err != nil {
			s.fail(ws.ID, scan.ID, fmt.Sprintf("rendering view %q: %v", vf.Name, err))
			return
		}
		views = append(views, view)
	}

	s.emit(EventScanPhase, payload(ws.ID, scan.ID, map[string]any{"phase": "saving"}))
	snapshot := s.store.SnapshotPath(ws.ID, scan.ID)
	if err := os.MkdirAll(filepath.Dir(snapshot), 0o755); err != nil {
		s.fail(ws.ID, scan.ID, fmt.Sprintf("creating snapshot dir: %v", err))
		return
	}
	err = sqlite.SaveToDB(&sqlite.SqlOptions{
		DatabaseName: snapshot,
		ReportId:     ws.Name,
		ScanTime:     scan.StartedAt,
		StoreContent: true,
	}, results, views)
	if err != nil {
		os.Remove(snapshot)
		s.fail(ws.ID, scan.ID, fmt.Sprintf("saving snapshot: %v", err))
		return
	}

	if err := s.store.FinishScan(scan.ID, snapshot); err != nil {
		s.fail(ws.ID, scan.ID, fmt.Sprintf("recording scan completion: %v", err))
		return
	}
	// The registry keeps what the snapshot says about itself, so listing
	// scans never has to open one. A failure here costs a label, not a scan.
	if ident, err := snapshotinfo.ReadIdentity(snapshot, scan.StartedAt); err == nil {
		_ = s.store.SetScanIdentity(scan.ID, ident)
	}
	s.emit(EventScanDone, payload(ws.ID, scan.ID, map[string]any{"snapshotPath": snapshot}))
}

func (s *Service) fail(workspaceID, scanID, msg string) {
	if err := s.store.FailScan(scanID, msg); err != nil {
		log.Error().Err(err).Msgf("failed to record scan failure for %s", scanID)
	}
	s.emit(EventScanFailed, payload(workspaceID, scanID, map[string]any{"error": msg}))
}

func payload(workspaceID, scanID string, extra map[string]any) map[string]any {
	p := map[string]any{"workspaceId": workspaceID, "scanId": scanID}
	for k, v := range extra {
		p[k] = v
	}
	return p
}

// extensionsFor builds the always-enabled set plus auto-discovered optional
// extensions for rootDir, each configured with its CLI-default settings.
// Fresh instances are constructed per call: extensions (git in particular)
// cache per-run state and must never be reused across scans.
func extensionsFor(rootDir string) ([]core.Extension, []string, error) {
	files, err := walker.GetAllFiles(rootDir)
	if err != nil {
		return nil, nil, err
	}
	paths := make([]string, 0, len(files))
	for _, f := range files {
		paths = append(paths, f.Path())
	}
	discoveryCtx := &config.DiscoveryContext{RootDir: rootDir, Files: paths}

	configured := common.AlwaysEnabled()
	// Only the auto-discovered extensions are reported back: the always-on
	// set carries no information about this particular codebase.
	discovered := []string{}
	for _, opt := range common.Optional() {
		if opt.DiscoveryTrigger != nil && opt.DiscoveryTrigger(discoveryCtx) {
			configured = append(configured, opt)
			discovered = append(discovered, opt.Name)
		}
	}

	defaults := commandWithDefaults(configured)
	extensions := make([]core.Extension, 0, len(configured))
	for _, ce := range configured {
		ext, err := ce.Initializer(defaults)
		if err != nil {
			return nil, nil, fmt.Errorf("initializing extension %s: %w", ce.Name, err)
		}
		extensions = append(extensions, ext)
	}
	return extensions, discovered, nil
}

// commandWithDefaults builds a throwaway cobra command carrying every
// extension argument as a flag at its declared default, so Initializers can
// read their configuration without the real CLI.
func commandWithDefaults(configured []*config.CLIConfiguredExtension) *cobra.Command {
	cmd := &cobra.Command{}
	flags := cmd.Flags()
	for _, ce := range configured {
		for param, arg := range ce.Arguments {
			if flags.Lookup(param) != nil {
				continue
			}
			switch arg.Type {
			case config.String:
				flags.String(param, arg.Default.(string), arg.Description)
			case config.Int:
				flags.Int(param, arg.Default.(int), arg.Description)
			case config.Bool:
				flags.Bool(param, arg.Default.(bool), arg.Description)
			case config.StringSlice:
				flags.StringSlice(param, arg.Default.([]string), arg.Description)
			}
		}
	}
	return cmd
}
