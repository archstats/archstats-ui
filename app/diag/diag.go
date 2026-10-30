// Package diag writes what went wrong somewhere it can be read afterwards.
//
// The app's own log, the engine's zerolog output and whatever the window
// reports (uncaught errors, long freezes) all go to one file in the app data
// folder, so a crash someone describes has a record next to it.
package diag

import (
	"io"
	stdlog "log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// maxLogSize is when the log starts over; the previous one is kept as .1.
const maxLogSize = 5 << 20

// LogPath is where the log of an app whose data lives in root is written.
func LogPath(root string) string {
	return filepath.Join(root, "logs", "archstats-desktop.log")
}

// Setup sends the standard logger and zerolog's global logger to stderr and
// to the log file under root. The returned file is closed on exit.
func Setup(root string) (io.Closer, error) {
	path := LogPath(root)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	if fi, err := os.Stat(path); err == nil && fi.Size() > maxLogSize {
		_ = os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	out := io.MultiWriter(os.Stderr, f)
	stdlog.SetOutput(out)
	log.Logger = zerolog.New(out).With().Timestamp().Logger()
	return f, nil
}

// Window records what the window reports about itself. A window stuck in a
// loop could report the same error thousands of times a second; past a
// budget per minute the rest are counted, not written.
type Window struct {
	mu      sync.Mutex
	minute  time.Time
	written int
	dropped int
	now     func() time.Time
}

const windowBudget = 30

func NewWindow() *Window { return &Window{now: time.Now} }

// Log writes one report from the window, within the budget.
func (w *Window) Log(level, message, detail string) {
	w.mu.Lock()
	now := w.now()
	if now.Sub(w.minute) >= time.Minute {
		if w.dropped > 0 {
			log.Warn().Str("source", "window").Msgf("%d more reports from the window were not written", w.dropped)
		}
		w.minute, w.written, w.dropped = now, 0, 0
	}
	if w.written >= windowBudget {
		w.dropped++
		w.mu.Unlock()
		return
	}
	w.written++
	w.mu.Unlock()

	ev := log.Info()
	switch level {
	case "error":
		ev = log.Error()
	case "warn":
		ev = log.Warn()
	}
	if len(detail) > 8<<10 {
		detail = detail[:8<<10] + "…"
	}
	ev.Str("source", "window").Str("detail", detail).Msg(message)
}
