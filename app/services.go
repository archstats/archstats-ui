package app

import (
	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/scan"
	"github.com/archstats/archstats-ui/app/store"
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

// QueryIn reads a completed snapshot other than the open one, which is how a
// view compares the current scan against an earlier one.
func (q *QueryService) QueryIn(scanID string, sql string) ([]map[string]any, error) {
	return q.svc.QueryIn(scanID, sql)
}

func (q *QueryService) CurrentScan() string {
	return q.svc.CurrentScan()
}
