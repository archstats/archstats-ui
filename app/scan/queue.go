package scan

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Backfilling: scanning a list of revisions (tags, mostly) one after another,
// each in its own clean clone, so a history of snapshots exists on the
// current analysis from the first day. The engine cannot be cancelled mid-
// scan, so stopping means "stop after the current one".

const EventBackfillQueue = "backfill:queue"

// Revision is a ref the backfill sheet offers.
type Revision struct {
	Ref  string    `json:"ref"`
	Sha  string    `json:"sha"`
	Time time.Time `json:"time"`
	// Why it cannot be scanned, when it cannot (a shallow clone stops before it).
	Unavailable string `json:"unavailable"`
}

type QueueItem struct {
	Ref    string `json:"ref"`
	Sha    string `json:"sha"`
	State  string `json:"state"` // queued, running, done, failed, stopped
	ScanID string `json:"scanId"`
	Error  string `json:"error"`
}

type QueueState struct {
	Items    []QueueItem `json:"items"`
	Stopping bool        `json:"stopping"`
}

type backfillQueue struct {
	mu       sync.Mutex
	items    map[string][]QueueItem
	stopping map[string]bool
	active   map[string]bool
}

func newBackfillQueue() *backfillQueue {
	return &backfillQueue{items: map[string][]QueueItem{}, stopping: map[string]bool{}, active: map[string]bool{}}
}

// Tags lists the repository's tags, newest first, each with its commit. One
// for-each-ref reads them all, and one cat-file checks which commits a
// shallow clone has: a git process per tag took minutes on Sylius.
func (s *Service) Tags(workspaceID string) ([]Revision, error) {
	ws, err := s.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	out, err := git(ws.FolderPath, "for-each-ref", "refs/tags", "--sort=-creatordate",
		"--format=%(refname:short)%00%(objectname)%00%(*objectname)%00%(committerdate:iso-strict)%00%(*committerdate:iso-strict)%00%(creatordate:iso-strict)")
	if err != nil {
		return nil, fmt.Errorf("listing tags: %w", err)
	}
	var revs []Revision
	for _, line := range strings.Split(out, "\n") {
		f := strings.Split(line, "\x00")
		if len(f) < 6 || f[0] == "" {
			continue
		}
		// An annotated tag points at a tag object; its commit is the peeled one.
		sha, when := f[1], f[3]
		if f[2] != "" {
			sha, when = f[2], f[4]
		}
		if when == "" {
			when = f[5]
		}
		r := Revision{Ref: f[0], Sha: sha}
		if t, err := time.Parse(time.RFC3339, when); err == nil {
			r.Time = t
		}
		revs = append(revs, r)
	}
	missing := missingCommits(ws.FolderPath, revs)
	for i := range revs {
		if missing[revs[i].Sha] {
			revs[i].Unavailable = "not in this clone's history (a shallow clone stops early)"
		}
	}
	return revs, nil
}

// missingCommits asks git once which of the revisions' commits it does not have.
func missingCommits(dir string, revs []Revision) map[string]bool {
	out := map[string]bool{}
	if len(revs) == 0 {
		return out
	}
	var in strings.Builder
	for _, r := range revs {
		in.WriteString(r.Sha + "^{commit}\n")
	}
	cmd := exec.Command("git", "-C", dir, "cat-file", "--batch-check")
	cmd.Stdin = strings.NewReader(in.String())
	res, err := cmd.Output()
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(res), "\n") {
		if strings.HasSuffix(line, " missing") {
			out[strings.TrimSuffix(strings.TrimSuffix(line, " missing"), "^{commit}")] = true
		}
	}
	return out
}

// Enqueue adds revisions to the workspace's backfill queue and starts it if idle.
func (s *Service) Enqueue(workspaceID string, revs []Revision) (*QueueState, error) {
	if len(revs) == 0 {
		return s.Queue(workspaceID), nil
	}
	q := s.queue
	q.mu.Lock()
	for _, r := range revs {
		dup := false
		for _, it := range q.items[workspaceID] {
			if it.Sha == r.Sha && (it.State == "queued" || it.State == "running") {
				dup = true
			}
		}
		if !dup {
			q.items[workspaceID] = append(q.items[workspaceID], QueueItem{Ref: r.Ref, Sha: r.Sha, State: "queued"})
		}
	}
	q.stopping[workspaceID] = false
	start := !q.active[workspaceID]
	if start {
		q.active[workspaceID] = true
	}
	q.mu.Unlock()
	s.emitQueue(workspaceID)
	if start {
		go s.drain(workspaceID)
	}
	return s.Queue(workspaceID), nil
}

// Queue is the workspace's backfill queue as it stands.
func (s *Service) Queue(workspaceID string) *QueueState {
	q := s.queue
	q.mu.Lock()
	defer q.mu.Unlock()
	items := append([]QueueItem(nil), q.items[workspaceID]...)
	return &QueueState{Items: items, Stopping: q.stopping[workspaceID]}
}

// StopAfterCurrent lets the running scan finish and drops what is still queued.
func (s *Service) StopAfterCurrent(workspaceID string) *QueueState {
	q := s.queue
	q.mu.Lock()
	q.stopping[workspaceID] = true
	for i, it := range q.items[workspaceID] {
		if it.State == "queued" {
			q.items[workspaceID][i].State = "stopped"
		}
	}
	q.mu.Unlock()
	s.emitQueue(workspaceID)
	return s.Queue(workspaceID)
}

// ClearFinished forgets the rows that are done, failed or stopped.
func (s *Service) ClearFinished(workspaceID string) *QueueState {
	q := s.queue
	q.mu.Lock()
	var keep []QueueItem
	for _, it := range q.items[workspaceID] {
		if it.State == "queued" || it.State == "running" {
			keep = append(keep, it)
		}
	}
	q.items[workspaceID] = keep
	q.mu.Unlock()
	s.emitQueue(workspaceID)
	return s.Queue(workspaceID)
}

func (s *Service) emitQueue(workspaceID string) {
	s.emit(EventBackfillQueue, map[string]any{"workspaceId": workspaceID})
}

// drain scans queued revisions one at a time until none is left or a stop is asked.
func (s *Service) drain(workspaceID string) {
	q := s.queue
	// Idle is decided under the same lock Enqueue checks, so a revision queued
	// while the last scan finishes is never left waiting for a drain that ended.
	defer s.emitQueue(workspaceID)
	for {
		q.mu.Lock()
		idx := -1
		for i, it := range q.items[workspaceID] {
			if it.State == "queued" {
				idx = i
				break
			}
		}
		if idx < 0 || q.stopping[workspaceID] {
			q.active[workspaceID] = false
			q.mu.Unlock()
			return
		}
		item := q.items[workspaceID][idx]
		q.items[workspaceID][idx].State = "running"
		q.mu.Unlock()
		s.emitQueue(workspaceID)

		// A scan the user started by hand goes first; the queue waits for it.
		for s.IsRunning(workspaceID) {
			time.Sleep(500 * time.Millisecond)
		}
		finished := make(chan bool, 1)
		scan, err := s.startAt(workspaceID, item.Sha, item.Ref, func(ok bool) { finished <- ok })
		state, msg, scanID := "failed", "", ""
		if err != nil {
			msg = err.Error()
		} else {
			scanID = scan.ID
			if <-finished {
				state = "done"
			} else {
				state = "failed"
				if sc, err := s.store.GetScan(scan.ID); err == nil {
					msg = sc.Error
				}
			}
		}
		if msg != "" {
			log.Warn().Str("workspace", workspaceID).Str("ref", item.Ref).Msg(msg)
		}
		q.mu.Lock()
		for i, it := range q.items[workspaceID] {
			if it.Sha == item.Sha && it.State == "running" {
				q.items[workspaceID][i].State, q.items[workspaceID][i].Error, q.items[workspaceID][i].ScanID = state, msg, scanID
			}
		}
		q.mu.Unlock()
		s.emitQueue(workspaceID)
	}
}
