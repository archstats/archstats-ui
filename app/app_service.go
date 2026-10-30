package app

import (
	"github.com/archstats/archstats-ui/app/diag"
	"github.com/archstats/archstats-ui/app/locale"
	"github.com/archstats/archstats-ui/app/safe"
	"path/filepath"
	"strings"
	"sync"
)

// AppService answers questions about the running build, and holds the
// snapshot files the app was asked to open (on the command line, or by a
// second launch) until the window takes them.
type AppService struct {
	version  string
	mu       sync.Mutex
	pending  []string
	window   *diag.Window
	watchdog *diag.Watchdog
	logPath  string
}

// NewAppService is the app's own service; watchdog may be nil where no window is watched.
func NewAppService(version string, watchdog *diag.Watchdog, logPath string) *AppService {
	if watchdog == nil {
		watchdog = diag.NewWatchdog()
	}
	return &AppService{version: version, window: diag.NewWindow(), watchdog: watchdog, logPath: logPath}
}

// Version is the release this build was stamped with ("dev" locally). It
// goes on every export, next to the analysis revision that read the code.
func (a *AppService) Version() string {
	defer safe.Guard("AppService.Version", nil)

	return a.version
}

// SetLocale tells the Go side the app's language, for the dialog titles and
// messages it writes itself. The frontend calls it once at startup.
func (a *AppService) SetLocale(lang string) {
	defer safe.Guard("AppService.SetLocale", nil)

	locale.Set(lang)
}

// QueueSnapshots keeps the .db paths among args for the window to import.
// It reports whether any were queued.
func (a *AppService) QueueSnapshots(args []string, cwd string) bool {
	defer safe.Guard("AppService.QueueSnapshots", nil)

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
	defer safe.Guard("AppService.TakePendingSnapshots", nil)

	a.mu.Lock()
	defer a.mu.Unlock()
	out := a.pending
	a.pending = nil
	return out
}

// Log records something the window reports about itself: an uncaught error,
// a promise nobody handled, a freeze. level is "error", "warn" or "info".
func (a *AppService) Log(level, message, detail string) {
	defer safe.Guard("AppService.Log", nil)
	a.window.Log(level, message, detail)
}

// Heartbeat is the window saying it is alive and whether it can be seen; a
// visible window that stops beating is reloaded (see diag.Watchdog).
func (a *AppService) Heartbeat(visible bool) {
	defer safe.Guard("AppService.Heartbeat", nil)
	a.watchdog.Beat(visible)
}

// TakeRecovered reports, once, whether the window was reloaded because it
// stopped answering, so it can say so.
func (a *AppService) TakeRecovered() bool {
	defer safe.Guard("AppService.TakeRecovered", nil)
	return a.watchdog.TakeRecovered()
}

// LogPath is where the app writes its log, for "Show the log".
func (a *AppService) LogPath() string {
	defer safe.Guard("AppService.LogPath", nil)
	return a.logPath
}
