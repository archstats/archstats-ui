package clone

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

const (
	EventProgress = "clone:progress"
	EventDone     = "clone:done"
	EventFailed   = "clone:failed"
)

// How much history a clone fetches. Archstats reads history for churn,
// co-change and authors, so full is the default; the others trade those
// views for time and disk. A blobless partial clone (--filter=blob:none) is
// never offered: git then fetches every blob over the network during the
// scan's log walk, which turned a one-minute scan into twelve.
const (
	HistoryFull   = "full"
	HistoryYear   = "year"
	HistoryLatest = "latest"
)

// Request is what the clone sheet sends.
type Request struct {
	Input   string `json:"input"`
	Dest    string `json:"dest"` // empty: the default folder under the repos root
	History string `json:"history"`
	Name    string `json:"name"` // empty: the repository's name
}

// Plan is what the sheet shows before anything happens.
type Plan struct {
	Repo       Repo             `json:"repo"`
	Dest       string           `json:"dest"`
	DestExists bool             `json:"destExists"`
	Existing   *store.Workspace `json:"existing"`
	Error      string           `json:"error"`
}

// Job is one clone, running or finished, as the frontend sees it.
type Job struct {
	ID          string    `json:"id"`
	Repo        Repo      `json:"repo"`
	Dest        string    `json:"dest"`
	Name        string    `json:"name"`
	History     string    `json:"history"`
	State       string    `json:"state"` // running, done, failed, cancelled
	Progress    Progress  `json:"progress"`
	Error       string    `json:"error"`
	WorkspaceID string    `json:"workspaceId"`
	StartedAt   time.Time `json:"startedAt"`
}

type Service struct {
	store *store.Store
	emit  func(event string, data ...any)
	// now is the clock --shallow-since counts back from; a field for tests.
	now func() time.Time

	mu      sync.Mutex
	jobs    map[string]*Job
	cancels map[string]context.CancelFunc
}

func NewService(st *store.Store) *Service {
	return &Service{
		store:   st,
		emit:    func(string, ...any) {},
		now:     time.Now,
		jobs:    map[string]*Job{},
		cancels: map[string]context.CancelFunc{},
	}
}

func (s *Service) SetEmitter(emit func(event string, data ...any)) { s.emit = emit }

// DefaultDest is the repository's folder under the repos root:
// repos/github.com/owner/name, so the path names what it holds.
func (s *Service) DefaultDest(r Repo) string {
	parts := []string{s.store.ReposRoot()}
	if r.Local {
		parts = append(parts, "local")
	} else {
		parts = append(parts, SafeSegment(r.Host))
		for _, o := range strings.Split(r.Owner, "/") {
			if o != "" {
				parts = append(parts, SafeSegment(o))
			}
		}
	}
	parts = append(parts, SafeSegment(r.Name))
	return filepath.Join(parts...)
}

// Plan reads an address and says where it would go and what is in the way.
func (s *Service) Plan(input, dest string) *Plan {
	r, err := Parse(input)
	if err != nil {
		return &Plan{Error: "Paste a repository address: https://…, git@host:owner/repo.git, or owner/repo for GitHub."}
	}
	p := &Plan{Repo: r, Dest: dest}
	if p.Dest == "" {
		p.Dest = s.DefaultDest(r)
	}
	p.DestExists = !emptyOrMissing(p.Dest)
	if ws, err := s.store.FindWorkspaceByFolder(p.Dest); err == nil {
		p.Existing = ws
	}
	return p
}

// Start begins a clone in the background and returns its job at once.
func (s *Service) Start(req Request) (*Job, error) {
	plan := s.Plan(req.Input, req.Dest)
	if plan.Error != "" {
		return nil, errors.New(plan.Error)
	}
	if plan.Existing != nil {
		return nil, fmt.Errorf("%s is already the workspace %q", plan.Dest, plan.Existing.Name)
	}
	if plan.DestExists {
		return nil, fmt.Errorf("%s already exists and is not empty; choose another folder", plan.Dest)
	}
	s.mu.Lock()
	for _, j := range s.jobs {
		if j.State == "running" && j.Dest == plan.Dest {
			s.mu.Unlock()
			return nil, fmt.Errorf("%s is already being cloned there", plan.Repo.Slug())
		}
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = plan.Repo.Name
	}
	history := req.History
	if history != HistoryYear && history != HistoryLatest {
		history = HistoryFull
	}
	job := &Job{
		ID:        uuid.NewString(),
		Repo:      plan.Repo,
		Dest:      plan.Dest,
		Name:      name,
		History:   history,
		State:     "running",
		Progress:  Progress{Phase: "connecting", Percent: -1},
		StartedAt: s.now().UTC(),
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.jobs[job.ID] = job
	s.cancels[job.ID] = cancel
	snapshot := *job
	s.mu.Unlock()

	go s.run(ctx, job)
	return &snapshot, nil
}

// Cancel stops a running clone; its half-written folder is removed.
func (s *Service) Cancel(id string) {
	s.mu.Lock()
	cancel := s.cancels[id]
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Jobs lists this session's clones, newest first, so a reloaded window
// finds the one still running.
func (s *Service) Jobs() []Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		out = append(out, *j)
	}
	for i := 1; i < len(out); i++ {
		for k := i; k > 0 && out[k].StartedAt.After(out[k-1].StartedAt); k-- {
			out[k], out[k-1] = out[k-1], out[k]
		}
	}
	return out
}

// Forget drops a finished job from the list.
func (s *Service) Forget(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j := s.jobs[id]; j != nil && j.State != "running" {
		delete(s.jobs, id)
		delete(s.cancels, id)
	}
}

// Args is the git command line for a job; exported for tests.
func Args(url, dest, history string, now time.Time) []string {
	args := []string{"clone", "--progress"}
	switch history {
	case HistoryLatest:
		args = append(args, "--depth", "1")
	case HistoryYear:
		args = append(args, "--shallow-since="+now.AddDate(-1, 0, 0).Format("2006-01-02"))
	}
	return append(args, "--", url, dest)
}

// Env keeps git from waiting on a prompt nobody can answer, and in English
// so its progress can be read.
func Env() []string {
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C", "LANG=C")
	if os.Getenv("GIT_SSH_COMMAND") == "" {
		env = append(env, "GIT_SSH_COMMAND=ssh -o BatchMode=yes -o ConnectTimeout=20")
	}
	return env
}

func (s *Service) run(ctx context.Context, job *Job) {
	fail := func(msg string, cancelled bool) {
		_ = os.RemoveAll(job.Dest)
		pruneEmptyParents(filepath.Dir(job.Dest), s.store.ReposRoot())
		s.update(job, func(j *Job) {
			j.Error = msg
			j.State = "failed"
			if cancelled {
				j.State = "cancelled"
			}
		})
		s.emit(EventFailed, s.view(job))
	}

	if err := os.MkdirAll(filepath.Dir(job.Dest), 0o755); err != nil {
		fail(fmt.Sprintf("Could not create %s: %v", filepath.Dir(job.Dest), err), false)
		return
	}
	cmd := exec.CommandContext(ctx, "git", Args(job.Repo.URL, job.Dest, job.History, s.now())...)
	cmd.Env = Env()
	stderr, err := cmd.StderrPipe()
	if err != nil {
		fail(err.Error(), false)
		return
	}
	if err := cmd.Start(); err != nil {
		fail(Explain(err.Error(), job.Repo), false)
		return
	}
	s.emit(EventProgress, s.view(job))

	// Progress is redrawn many times a second; the window needs a few.
	var tail strings.Builder
	last := time.Time{}
	lastPhase := ""
	sc := bufio.NewScanner(stderr)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	sc.Split(SplitProgress)
	for sc.Scan() {
		line := sc.Text()
		p, ok := ParseLine(line)
		if !ok {
			if strings.TrimSpace(line) != "" && tail.Len() < 8192 {
				tail.WriteString(line + "\n")
			}
			continue
		}
		if p.Percent < 0 && lastPhase != "" {
			continue
		}
		if p.Phase == lastPhase && time.Since(last) < 120*time.Millisecond {
			s.update(job, func(j *Job) { j.Progress = keepTransfer(j.Progress, p) })
			continue
		}
		last, lastPhase = time.Now(), p.Phase
		s.update(job, func(j *Job) { j.Progress = keepTransfer(j.Progress, p) })
		s.emit(EventProgress, s.view(job))
	}
	err = cmd.Wait()
	if ctx.Err() != nil {
		fail("Cancelled.", true)
		return
	}
	if err != nil {
		log.Warn().Str("repo", job.Repo.URL).Msg(strings.TrimSpace(tail.String()))
		fail(Explain(tail.String()+"\n"+err.Error(), job.Repo), false)
		return
	}

	ws, err := s.store.CreateWorkspace(job.Name, job.Dest)
	if err != nil {
		fail(fmt.Sprintf("The clone finished, but the workspace could not be made: %v", err), false)
		return
	}
	s.update(job, func(j *Job) {
		j.State = "done"
		j.WorkspaceID = ws.ID
		j.Progress = Progress{Phase: "checkout", Percent: 100, Received: j.Progress.Received}
	})
	s.emit(EventDone, s.view(job))
}

// keepTransfer carries the last known size over into the later phases, so
// the sheet can still say how much arrived.
func keepTransfer(prev, next Progress) Progress {
	if next.Received == "" && next.Phase != "receiving" {
		next.Received = prev.Received
	}
	return next
}

func (s *Service) update(job *Job, fn func(*Job)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(job)
}

func (s *Service) view(job *Job) Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	return *job
}

func emptyOrMissing(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return os.IsNotExist(err)
	}
	return len(entries) == 0
}

// pruneEmptyParents removes the owner and host folders a failed or deleted
// clone leaves empty, stopping at the repos root.
func pruneEmptyParents(dir, root string) {
	for {
		rel, err := filepath.Rel(root, dir)
		if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
			return
		}
		if !emptyOrMissing(dir) {
			return
		}
		if err := os.Remove(dir); err != nil && !os.IsNotExist(err) {
			return
		}
		dir = filepath.Dir(dir)
	}
}

// RemoveManaged deletes a clone the app made, and any folders it leaves empty.
func RemoveManaged(st *store.Store, folder string) {
	if !st.IsManagedFolder(folder) {
		return
	}
	if err := os.RemoveAll(folder); err != nil {
		log.Warn().Err(err).Str("folder", folder).Msg("removing a managed clone")
		return
	}
	pruneEmptyParents(filepath.Dir(folder), st.ReposRoot())
}
