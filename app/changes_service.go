package app

import (
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/archstats/archstats-ui/app/changes"
	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats-ui/app/trends"
)

// ChangesService answers "what changed" between two snapshots and "how has
// it moved" across all of a workspace's snapshots. Both read snapshots
// through the query service's shared handles; neither opens the global one.
type ChangesService struct {
	store   *store.Store
	query   *query.Service
	changes *changes.Service
	mu      sync.Mutex // one readings computation at a time
}

func NewChangesService(st *store.Store, q *query.Service) *ChangesService {
	return &ChangesService{store: st, query: q, changes: changes.NewService(q.OpenReadOnly)}
}

// Compare returns what changed from the base scan to the head scan.
func (c *ChangesService) Compare(baseID, headID string) (*changes.ChangeSet, error) {
	if baseID == "" || headID == "" {
		return nil, fmt.Errorf("two snapshots are needed")
	}
	return c.changes.Compare(baseID, headID)
}

// TrendPoint is one snapshot's readings with what identifies it.
type TrendPoint struct {
	ScanID           string              `json:"scanId"`
	Label            string              `json:"label"`
	StartedAt        time.Time           `json:"startedAt"`
	HeadTime         *time.Time          `json:"headTime"`
	HeadCommit       string              `json:"headCommit"`
	AnalysisRevision int                 `json:"analysisRevision"`
	IgnoreGlobs      string              `json:"ignoreGlobs"`
	Extensions       string              `json:"extensions"`
	Readings         map[string]*float64 `json:"readings"`
	Error            string              `json:"error"`
}

// Readings returns every complete scan's readings, computing (and caching)
// the ones not read before. Snapshots that cannot be opened say why.
func (c *ChangesService) Readings(workspaceID string) ([]TrendPoint, error) {
	scans, err := c.store.ListScans(workspaceID)
	if err != nil {
		return nil, err
	}
	var out []TrendPoint
	for _, s := range scans {
		if s.Status != "complete" {
			continue
		}
		p := TrendPoint{ScanID: s.ID, Label: s.Label, StartedAt: s.StartedAt, HeadTime: s.HeadTime, HeadCommit: s.HeadCommit,
			AnalysisRevision: s.AnalysisRevision, IgnoreGlobs: s.IgnoreGlobs, Extensions: s.Extensions}
		r, err := c.ensureReadings(s.ID)
		if err != nil {
			p.Error = err.Error()
		}
		p.Readings = r
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.Before(out[j].StartedAt) })
	return out, nil
}

func (c *ChangesService) ensureReadings(scanID string) (map[string]*float64, error) {
	cached, err := c.store.Readings(scanID)
	if err == nil {
		if v := cached[trends.VersionKey]; v != nil && int(*v) == trends.Version {
			return cached, nil
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	db, err := c.query.OpenReadOnly(scanID)
	if err != nil {
		return nil, err
	}
	r, err := trends.Compute(db)
	if err != nil {
		return nil, err
	}
	if err := c.store.PutReadings(scanID, r); err != nil {
		log.Printf("caching readings of %s: %v", scanID, err)
	}
	return r, nil
}

// ComputeReadings is the post-scan hook: a new snapshot's readings are ready
// before anyone opens Over time.
func (c *ChangesService) ComputeReadings(scanID string) {
	if _, err := c.ensureReadings(scanID); err != nil {
		log.Printf("readings of %s: %v", scanID, err)
	}
}

// ForgetScan drops what is cached about a deleted scan.
func (c *ChangesService) ForgetScan(scanID string) {
	c.changes.Forget(scanID)
}
