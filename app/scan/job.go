package scan

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/archstats/archstats-ui/app/store"
)

// A job is one workspace's scan from the moment it is claimed, before a
// commit is cloned or a row exists, until it has finished either way. A
// workspace has at most one. Its context is what Cancel and Shutdown stop,
// so a scan can be stopped while it clones or updates, not only while the
// worker analyses.
type job struct {
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{} // closed once the job has finished
}

// errShuttingDown refuses a scan asked for while the app quits.
var errShuttingDown = errors.New("the app is quitting")

// claim reserves the workspace for a scan. Every claim ends in finish.
func (s *Service) claim(ws *store.Workspace) (*job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return nil, errShuttingDown
	}
	if s.jobs[ws.ID] != nil {
		return nil, fmt.Errorf("a scan is already running for workspace %s", ws.Name)
	}
	ctx, cancel := context.WithCancel(context.Background())
	j := &job{ctx: ctx, cancel: cancel, done: make(chan struct{})}
	s.jobs[ws.ID] = j
	return j, nil
}

// finish frees the workspace for its next scan.
func (s *Service) finish(workspaceID string, j *job) {
	j.cancel()
	s.mu.Lock()
	if s.jobs[workspaceID] == j {
		delete(s.jobs, workspaceID)
	}
	s.mu.Unlock()
	close(j.done)
}

// IsRunning reports whether a scan is in flight for the workspace.
func (s *Service) IsRunning(workspaceID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.jobs[workspaceID] != nil
}

// Cancel stops the workspace's running scan. The scan is recorded as failed
// with "cancelled"; a backfill moves on to its next revision.
func (s *Service) Cancel(workspaceID string) error {
	if s.worker == "" {
		return fmt.Errorf("this scan cannot be stopped")
	}
	s.mu.Lock()
	j := s.jobs[workspaceID]
	s.mu.Unlock()
	if j == nil {
		return fmt.Errorf("no scan is running for this workspace")
	}
	j.cancel()
	return nil
}

// Shutdown stops every scan and refuses new ones, then waits up to wait for
// them to record how they ended. The app calls it on quit, so no worker or
// git process outlives it.
func (s *Service) Shutdown(wait time.Duration) {
	s.mu.Lock()
	s.closing = true
	jobs := make([]*job, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobs = append(jobs, j)
	}
	s.mu.Unlock()
	for _, j := range jobs {
		j.cancel()
	}
	deadline := time.After(wait)
	for _, j := range jobs {
		select {
		case <-j.done:
		case <-deadline:
			return
		}
	}
}
