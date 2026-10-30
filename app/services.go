package app

import (
	"github.com/archstats/archstats-ui/app/safe"
	"time"

	"github.com/archstats/archstats-ui/app/ask"
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

// Cancel stops the workspace's running scan.
func (s *ScanService) Cancel(workspaceID string) (callErr error) {
	defer safe.Guard("ScanService.Cancel", &callErr)
	return s.svc.Cancel(workspaceID)
}

func (s *ScanService) Start(workspaceID string) (_ *store.Scan, callErr error) {
	defer safe.Guard("ScanService.Start", &callErr)

	return s.svc.StartScan(workspaceID)
}

// StartAt rescans the workspace as it was at one commit, in a throwaway
// clone; the checkout itself is not touched.
func (s *ScanService) StartAt(workspaceID, rev string) (_ *store.Scan, callErr error) {
	defer safe.Guard("ScanService.StartAt", &callErr)

	return s.svc.StartScanAt(workspaceID, rev)
}

// ResolveCommit names a commit (sha, date, subject) before it is rescanned.
func (s *ScanService) ResolveCommit(workspaceID, rev string) (_ *scan.CommitInfo, callErr error) {
	defer safe.Guard("ScanService.ResolveCommit", &callErr)

	return s.svc.ResolveCommit(workspaceID, rev)
}

// ResolveCommitAt names the commit HEAD was most probably at a moment.
func (s *ScanService) ResolveCommitAt(workspaceID string, at time.Time) (_ *scan.CommitInfo, callErr error) {
	defer safe.Guard("ScanService.ResolveCommitAt", &callErr)

	return s.svc.ResolveCommitAt(workspaceID, at)
}

// Tags lists the repository's tags, newest first, for backfilling.
func (s *ScanService) Tags(workspaceID string) (_ []scan.Revision, callErr error) {
	defer safe.Guard("ScanService.Tags", &callErr)

	return s.svc.Tags(workspaceID)
}

// Enqueue scans each revision in turn, in its own clean clone.
func (s *ScanService) Enqueue(workspaceID string, revs []scan.Revision) (_ *scan.QueueState, callErr error) {
	defer safe.Guard("ScanService.Enqueue", &callErr)

	return s.svc.Enqueue(workspaceID, revs)
}

func (s *ScanService) Queue(workspaceID string) *scan.QueueState {
	defer safe.Guard("ScanService.Queue", nil)

	return s.svc.Queue(workspaceID)
}

// StopAfterCurrent lets the running scan finish and drops the rest of the queue.
func (s *ScanService) StopAfterCurrent(workspaceID string) *scan.QueueState {
	defer safe.Guard("ScanService.StopAfterCurrent", nil)

	return s.svc.StopAfterCurrent(workspaceID)
}

func (s *ScanService) ClearFinished(workspaceID string) *scan.QueueState {
	defer safe.Guard("ScanService.ClearFinished", nil)

	return s.svc.ClearFinished(workspaceID)
}

func (s *ScanService) IsRunning(workspaceID string) bool {
	defer safe.Guard("ScanService.IsRunning", nil)

	return s.svc.IsRunning(workspaceID)
}

// QueryService is the Wails-bound facade over query.Service.
type QueryService struct {
	svc *query.Service
}

func NewQueryService(svc *query.Service) *QueryService {
	return &QueryService{svc: svc}
}

func (q *QueryService) Open(scanID string) (callErr error) {
	defer safe.Guard("QueryService.Open", &callErr)

	return q.svc.Open(scanID)
}

func (q *QueryService) Query(sql string) (_ []map[string]any, callErr error) {
	defer safe.Guard("QueryService.Query", &callErr)

	return q.svc.Query(sql)
}

// Rows runs SQL on the open snapshot, or on scanID when given, and returns the
// column names once and the rows as values: the shape the window reads. id
// names the query for Cancel.
func (q *QueryService) Rows(id, scanID, sql string) (_ *query.Table, callErr error) {
	defer safe.Guard("QueryService.Rows", &callErr)

	return q.svc.Rows(id, scanID, sql)
}

// Cancel stops a query started by Rows that the window no longer needs.
func (q *QueryService) Cancel(id string) {
	defer safe.Guard("QueryService.Cancel", nil)

	q.svc.Cancel(id)
}

// Console runs one read-only statement a person typed against a scan's
// snapshot: 5,000 rows, 10 seconds, writes and ATTACH refused.
func (q *QueryService) Console(scanID, sql string) (_ *query.Limited, callErr error) {
	defer safe.Guard("QueryService.Console", &callErr)

	return q.svc.Console(scanID, sql)
}

// ReportConsole runs a report cell's statement as Console does, with 30
// seconds instead of 10: a report runs its queries unattended.
func (q *QueryService) ReportConsole(scanID, sql string) (_ *query.Limited, callErr error) {
	defer safe.Guard("QueryService.ReportConsole", &callErr)

	return q.svc.ReportConsole(scanID, sql)
}

// FindInCode counts a needle in every file whose source the scan kept.
func (q *QueryService) FindInCode(scanID, needle string, opt query.FindOptions) (_ *query.FindResult, callErr error) {
	defer safe.Guard("QueryService.FindInCode", &callErr)

	return q.svc.FindInCode(scanID, needle, opt)
}

// FindLines is one file's matching lines, with a line of context each side.
func (q *QueryService) FindLines(scanID, file, needle string, opt query.FindOptions) (_ []query.HitLine, callErr error) {
	defer safe.Guard("QueryService.FindLines", &callErr)

	return q.svc.FindLines(scanID, file, needle, opt)
}

// QueryIn reads a completed snapshot other than the open one, which is how a
// view compares the current scan against an earlier one.
func (q *QueryService) QueryIn(scanID string, sql string) (_ []map[string]any, callErr error) {
	defer safe.Guard("QueryService.QueryIn", &callErr)

	return q.svc.QueryIn(scanID, sql)
}

// QueryLimited runs SQL keeping at most maxRows and stopping after
// timeoutMs, and says when it cut the result short. scanID "" is the open
// snapshot.
func (q *QueryService) QueryLimited(scanID, sql string, maxRows, timeoutMs int) (_ *query.Limited, callErr error) {
	defer safe.Guard("QueryService.QueryLimited", &callErr)

	return q.svc.QueryLimited(scanID, sql, maxRows, timeoutMs)
}

func (q *QueryService) CurrentScan() string {
	defer safe.Guard("QueryService.CurrentScan", nil)

	return q.svc.CurrentScan()
}

// AnalysisRevision is the revision of the analysis this build scans with. A
// snapshot records the revision it was written with; one below this was
// scanned before fixes the engine now has, and the UI says so.
func (q *QueryService) AnalysisRevision() int {
	defer safe.Guard("QueryService.AnalysisRevision", nil)

	return core.AnalysisRevision
}

// AskService is the Wails-bound facade over ask.Service: the Ask pane's
// line to the model it picked. Every call refuses while AI features are off.
type AskService struct {
	svc *ask.Service
}

func NewAskService(svc *ask.Service) *AskService {
	return &AskService{svc: svc}
}

// Models lists the models of every provider that is set up.
func (a *AskService) Models() (_ ask.ModelList, callErr error) {
	defer safe.Guard("AskService.Models", &callErr)

	return a.svc.Models()
}

// Chat runs one model turn and streams it as "ask:delta" events.
func (a *AskService) Chat(id, requestJSON string) (_ string, callErr error) {
	defer safe.Guard("AskService.Chat", &callErr)

	return a.svc.Chat(id, requestJSON)
}

// Embed turns texts into vectors with a local embedding model.
func (a *AskService) Embed(model string, texts []string) (_ [][]float64, callErr error) {
	defer safe.Guard("AskService.Embed", &callErr)

	return a.svc.Embed(model, texts)
}

// Cancel stops a running turn.
func (a *AskService) Cancel(id string) {
	defer safe.Guard("AskService.Cancel", nil)

	a.svc.Cancel(id)
}

// AIService is the Wails-bound home of the AI settings: the switch every AI
// feature obeys, and each provider. It stores API keys but never returns one.
type AIService struct {
	svc *ask.Service
}

func NewAIService(svc *ask.Service) *AIService {
	return &AIService{svc: svc}
}

// Status is the switch, the policy, and every provider (without keys).
func (a *AIService) Status() ask.Status {
	defer safe.Guard("AIService.Status", nil)
	return a.svc.Status()
}

// SetEnabled turns AI features on or off.
func (a *AIService) SetEnabled(on bool) (callErr error) {
	defer safe.Guard("AIService.SetEnabled", &callErr)
	return a.svc.SetEnabled(on)
}

// SaveProvider stores a provider's settings.
func (a *AIService) SaveProvider(id string, in ask.ProviderInput) (callErr error) {
	defer safe.Guard("AIService.SaveProvider", &callErr)

	return a.svc.SaveProvider(id, in)
}

// SetKey puts a provider's API key in the system keychain.
func (a *AIService) SetKey(id, key string) (callErr error) {
	defer safe.Guard("AIService.SetKey", &callErr)
	return a.svc.SetKey(id, key)
}

// DeleteKey removes a provider's API key from the system keychain.
func (a *AIService) DeleteKey(id string) (callErr error) {
	defer safe.Guard("AIService.DeleteKey", &callErr)
	return a.svc.DeleteKey(id)
}

// Test checks that a provider answers with its settings.
func (a *AIService) Test(id string) ask.TestResult {
	defer safe.Guard("AIService.Test", nil)
	return a.svc.Test(id)
}
