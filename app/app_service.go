package app

import (
	"context"
	"github.com/archstats/archstats-ui/app/diag"
	"github.com/archstats/archstats-ui/app/locale"
	"github.com/archstats/archstats-ui/app/safe"
	"github.com/archstats/archstats-ui/app/update"
	"github.com/archstats/archstats/core"
	engineversion "github.com/archstats/archstats/version"
	"net/http"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"
)

// DocsURL is the desktop guide on the documentation site.
const DocsURL = "https://archstats.github.io/archstats/desktop/"

// AppService answers questions about the running build, and holds the
// snapshot files the app was asked to open (on the command line, or by a
// second launch) until the window takes them.
type AppService struct {
	version   string
	changelog string
	mu        sync.Mutex
	pending   []string
	window    *diag.Window
	watchdog  *diag.Watchdog
	logPath   string
}

// NewAppService is the app's own service; watchdog may be nil where no window
// is watched. changelog is the CHANGELOG.md the app was built with.
func NewAppService(version, changelog string, watchdog *diag.Watchdog, logPath string) *AppService {
	if watchdog == nil {
		watchdog = diag.NewWatchdog()
	}
	return &AppService{version: version, changelog: changelog, window: diag.NewWindow(), watchdog: watchdog, logPath: logPath}
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

// About names what is running: the app, the engine inside it and the
// analysis revision its scans are written with.
type About struct {
	Version          string `json:"version"`
	Engine           string `json:"engine"`
	AnalysisRevision int    `json:"analysisRevision"`
	Platform         string `json:"platform"`
	LogPath          string `json:"logPath"`
	Docs             string `json:"docs"`
	Releases         string `json:"releases"`
}

func (a *AppService) About() About {
	defer safe.Guard("AppService.About", nil)
	return About{
		Version:          a.version,
		Engine:           engineversion.Version(),
		AnalysisRevision: core.AnalysisRevision,
		Platform:         goruntime.GOOS + "/" + goruntime.GOARCH,
		LogPath:          a.logPath,
		Docs:             DocsURL,
		Releases:         "https://github.com/" + update.Repository + "/releases",
	}
}

// UpdateCheck is the answer to "is there a newer release?".
type UpdateCheck struct {
	Current string         `json:"current"`
	Latest  update.Release `json:"latest"`
	Newer   bool           `json:"newer"`
}

// CheckForUpdate asks GitHub for the latest published release. The frontend
// calls it only while the user leaves update checks on.
func (a *AppService) CheckForUpdate() (_ UpdateCheck, callErr error) {
	defer safe.Guard("AppService.CheckForUpdate", &callErr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	latest, err := update.Latest(ctx, http.DefaultClient, "https://api.github.com")
	if err != nil {
		return UpdateCheck{Current: a.version}, err
	}
	return UpdateCheck{Current: a.version, Latest: latest, Newer: update.Newer(a.version, latest.Version)}, nil
}

// WhatsNew is what changed between the release the user last ran (seen) and
// this one, read from the changelog the app was built with.
func (a *AppService) WhatsNew(seen string) []update.Section {
	defer safe.Guard("AppService.WhatsNew", nil)
	return update.Since(a.changelog, seen, a.version)
}

// ReleaseNotes is every release in the changelog the app was built with, newest first.
func (a *AppService) ReleaseNotes() []update.Section {
	defer safe.Guard("AppService.ReleaseNotes", nil)
	return update.Sections(a.changelog)
}
