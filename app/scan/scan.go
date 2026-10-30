package scan

import (
	"context"
	"fmt"
	snapshotinfo "github.com/archstats/archstats-ui/app/snapshot"
	"os"
	"path/filepath"
	"sync"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats/cmd/common"
	"github.com/archstats/archstats/cmd/config"
	"github.com/archstats/archstats/core"
	"github.com/archstats/archstats/core/plugin"
	"github.com/archstats/archstats/core/walker"
	"github.com/rs/zerolog/log"
)

const (
	EventScanStarted = "scan:started"
	EventScanPhase   = "scan:phase"
	EventScanDone    = "scan:done"
	EventScanFailed  = "scan:failed"
)

// Service orchestrates workspace scans: extension auto-detection, analysis,
// and snapshot export. One scan per workspace at a time. With a worker set,
// each scan runs in a child process (see worker.go) and can be cancelled.
type Service struct {
	store *store.Store
	emit  func(event string, data ...any)

	mu      sync.Mutex
	running map[string]bool               // workspaceID → scan in flight
	cancels map[string]context.CancelFunc // workspaceID → stops its scan
	onDone  func(scanID string)
	queue   *backfillQueue
	worker  string
}

// SetWorker runs every scan in a child process started from exe (the app's
// own binary). Without one, scans run in this process and cannot be stopped.
func (s *Service) SetWorker(exe string) { s.worker = exe }

// Cancel stops the workspace's running scan. The scan is recorded as failed
// with "cancelled"; a backfill moves on to its next revision.
func (s *Service) Cancel(workspaceID string) error {
	s.mu.Lock()
	cancel := s.cancels[workspaceID]
	s.mu.Unlock()
	if cancel == nil {
		return fmt.Errorf("no scan is running for this workspace")
	}
	if s.worker == "" {
		return fmt.Errorf("this scan cannot be stopped")
	}
	cancel()
	return nil
}

// SetOnDone runs after each scan is saved (in production: its readings are computed).
func (s *Service) SetOnDone(fn func(scanID string)) { s.onDone = fn }

func NewService(st *store.Store) *Service {
	return &Service{
		store:   st,
		emit:    func(string, ...any) {},
		running: map[string]bool{},
		cancels: map[string]context.CancelFunc{},
		queue:   newBackfillQueue(),
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

	go s.run(ws, scan, ws.FolderPath, "", nil)
	return scan, nil
}

// IsRunning reports whether a scan is in flight for the workspace.
func (s *Service) IsRunning(workspaceID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running[workspaceID]
}

// run analyses root (the workspace folder, or a clone of it at one commit)
// and saves the snapshot; done, when set, runs once the scan has finished
// either way. ref names the commit or tag a rescan reads, and is empty for
// a scan of the working copy; the UI tells the two apart by it.
func (s *Service) run(ws *store.Workspace, scan *store.Scan, root, ref string, done func(ok bool)) {
	ok := false
	defer func() {
		if done != nil {
			done(ok)
		}
	}()
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cancels[ws.ID] = cancel
	s.mu.Unlock()
	defer func() {
		cancel()
		s.mu.Lock()
		delete(s.running, ws.ID)
		delete(s.cancels, ws.ID)
		s.mu.Unlock()
		if r := recover(); r != nil {
			msg := fmt.Sprintf("panic during scan: %v", r)
			log.Error().Str("workspace", ws.ID).Msg(msg)
			s.fail(ws.ID, scan.ID, msg)
		}
	}()

	s.emit(EventScanStarted, payload(ws.ID, scan.ID, map[string]any{"ref": ref}))

	// A clone the app made is brought up to its upstream first.
	note := ""
	if ref == "" && s.store.IsManagedFolder(root) {
		s.emit(EventScanPhase, payload(ws.ID, scan.ID, map[string]any{"phase": "updating"}))
		note = updateClone(root)
		if note != "" {
			log.Warn().Str("workspace", ws.ID).Msg(note)
		}
	}

	snapshot := s.store.SnapshotPath(ws.ID, scan.ID)
	if err := os.MkdirAll(filepath.Dir(snapshot), 0o755); err != nil {
		s.fail(ws.ID, scan.ID, fmt.Sprintf("creating snapshot dir: %v", err))
		return
	}
	req := Request{
		Root: root,
		// The workspace's own exclusions, on top of the tree's ignore files.
		Ignore:   s.store.IgnoreGlobs(ws.ID),
		Snapshot: snapshot,
		ReportID: ws.Name,
		ScanTime: scan.StartedAt,
	}
	phase := func(name string, extensions []string) {
		p := map[string]any{"phase": name}
		if name == "analyzing" {
			p["extensions"] = extensions
			p["note"] = note
		}
		s.emit(EventScanPhase, payload(ws.ID, scan.ID, p))
	}
	var err error
	if s.worker != "" {
		err = inChild(ctx, s.worker, req, phase)
	} else {
		err = Analyze(req, phase)
	}
	if err != nil {
		os.Remove(snapshot)
		s.fail(ws.ID, scan.ID, err.Error())
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
	ok = true
	if s.onDone != nil {
		s.onDone(scan.ID)
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
func extensionsFor(rootDir string, ignore []string) ([]core.Extension, []string, error) {
	files, err := walker.GetAllFiles(rootDir, walker.Options{IgnorePatterns: ignore})
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

	// Every extension reads its arguments at their declared defaults.
	defaults := plugin.Values(nil, configured)
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
