package app

import (
	"time"

	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/scan"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats/core"
)

// ScanService is the Wails-bound facade over scan.Service, exposing only
// frontend-safe methods (SetEmitter stays internal).
type ScanService struct {
	svc *scan.Service
}

func NewScanService(svc *scan.Service) *ScanService {
	return &ScanService{svc: svc}
}

func (s *ScanService) Start(workspaceID string) (*store.Scan, error) {
	return s.svc.StartScan(workspaceID)
}

// StartAt rescans the workspace as it was at one commit, in a throwaway
// clone; the checkout itself is not touched.
func (s *ScanService) StartAt(workspaceID, rev string) (*store.Scan, error) {
	return s.svc.StartScanAt(workspaceID, rev)
}

// ResolveCommit names a commit (sha, date, subject) before it is rescanned.
func (s *ScanService) ResolveCommit(workspaceID, rev string) (*scan.CommitInfo, error) {
	return s.svc.ResolveCommit(workspaceID, rev)
}

// ResolveCommitAt names the commit HEAD was most probably at a moment.
func (s *ScanService) ResolveCommitAt(workspaceID string, at time.Time) (*scan.CommitInfo, error) {
	return s.svc.ResolveCommitAt(workspaceID, at)
}

// Tags lists the repository's tags, newest first, for backfilling.
func (s *ScanService) Tags(workspaceID string) ([]scan.Revision, error) {
	return s.svc.Tags(workspaceID)
}

// Enqueue scans each revision in turn, in its own clean clone.
func (s *ScanService) Enqueue(workspaceID string, revs []scan.Revision) (*scan.QueueState, error) {
	return s.svc.Enqueue(workspaceID, revs)
}

func (s *ScanService) Queue(workspaceID string) *scan.QueueState {
	return s.svc.Queue(workspaceID)
}

// StopAfterCurrent lets the running scan finish and drops the rest of the queue.
func (s *ScanService) StopAfterCurrent(workspaceID string) *scan.QueueState {
	return s.svc.StopAfterCurrent(workspaceID)
}

func (s *ScanService) ClearFinished(workspaceID string) *scan.QueueState {
	return s.svc.ClearFinished(workspaceID)
}

func (s *ScanService) IsRunning(workspaceID string) bool {
	return s.svc.IsRunning(workspaceID)
}

// QueryService is the Wails-bound facade over query.Service.
type QueryService struct {
	svc *query.Service
}

func NewQueryService(svc *query.Service) *QueryService {
	return &QueryService{svc: svc}
}

func (q *QueryService) Open(scanID string) error {
	return q.svc.Open(scanID)
}

func (q *QueryService) Query(sql string) ([]map[string]any, error) {
	return q.svc.Query(sql)
}

// Console runs one read-only statement a person typed against a scan's
// snapshot: 5,000 rows, 10 seconds, writes and ATTACH refused.
func (q *QueryService) Console(scanID, sql string) (*query.Limited, error) {
	return q.svc.Console(scanID, sql)
}

// FindInCode counts a needle in every file whose source the scan kept.
func (q *QueryService) FindInCode(scanID, needle string, opt query.FindOptions) (*query.FindResult, error) {
	return q.svc.FindInCode(scanID, needle, opt)
}

// FindLines is one file's matching lines, with a line of context each side.
func (q *QueryService) FindLines(scanID, file, needle string, opt query.FindOptions) ([]query.HitLine, error) {
	return q.svc.FindLines(scanID, file, needle, opt)
}

// QueryIn reads a completed snapshot other than the open one, which is how a
// view compares the current scan against an earlier one.
func (q *QueryService) QueryIn(scanID string, sql string) ([]map[string]any, error) {
	return q.svc.QueryIn(scanID, sql)
}

// QueryLimited runs SQL keeping at most maxRows and stopping after
// timeoutMs, and says when it cut the result short. scanID "" is the open
// snapshot.
func (q *QueryService) QueryLimited(scanID, sql string, maxRows, timeoutMs int) (*query.Limited, error) {
	return q.svc.QueryLimited(scanID, sql, maxRows, timeoutMs)
}

func (q *QueryService) CurrentScan() string {
	return q.svc.CurrentScan()
}

// AnalysisRevision is the revision of the analysis this build scans with. A
// snapshot records the revision it was written with; one below this was
// scanned before fixes the engine now has, and the UI says so.
func (q *QueryService) AnalysisRevision() int {
	return core.AnalysisRevision
}
