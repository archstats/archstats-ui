package app

import (
	"path/filepath"
	"strings"
	"sync"
)

// AppService answers questions about the running build, and holds the
// snapshot files the app was asked to open (on the command line, or by a
// second launch) until the window takes them.
type AppService struct {
	version string
	mu      sync.Mutex
	pending []string
}

func NewAppService(version string) *AppService {
	return &AppService{version: version}
}

// Version is the release this build was stamped with ("dev" locally). It
// goes on every export, next to the analysis revision that read the code.
func (a *AppService) Version() string {
	return a.version
}

// QueueSnapshots keeps the .db paths among args for the window to import.
// It reports whether any were queued.
func (a *AppService) QueueSnapshots(args []string, cwd string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := len(a.pending)
	for _, arg := range args {
		if !strings.EqualFold(filepath.Ext(arg), ".db") {
			continue
		}
		if !filepath.IsAbs(arg) && cwd != "" {
			arg = filepath.Join(cwd, arg)
		}
		a.pending = append(a.pending, arg)
	}
	return len(a.pending) > n
}

// TakePendingSnapshots returns the queued .db paths and forgets them.
func (a *AppService) TakePendingSnapshots() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := a.pending
	a.pending = nil
	return out
}
