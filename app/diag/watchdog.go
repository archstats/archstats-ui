package diag

import (
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Watchdog reloads a window that stopped answering.
//
// The page in the window runs in a process of its own. When the system kills
// that process (most often for memory) the window turns white and stays that
// way: nothing in Wails reloads it. The window beats every few seconds while
// it is visible; when a visible window has been silent too long, the watchdog
// reloads it. A hidden window throttles its timers, so it says so as it hides
// and is not watched until it beats again.
type Watchdog struct {
	mu        sync.Mutex
	last      time.Time
	visible   bool
	reloads   []time.Time
	recovered bool
	now       func() time.Time

	// Silence is how long a visible window may go without a beat.
	Silence time.Duration
	// MaxReloads within ReloadWindow stops a window that dies on load from being reloaded for ever.
	MaxReloads   int
	ReloadWindow time.Duration
}

func NewWatchdog() *Watchdog {
	return &Watchdog{now: time.Now, Silence: 45 * time.Second, MaxReloads: 2, ReloadWindow: 5 * time.Minute}
}

// Beat is the window saying it is alive, and whether anyone can see it.
func (w *Watchdog) Beat(visible bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.last = w.now()
	w.visible = visible
}

// TakeRecovered reports, once, whether the window was reloaded by the watchdog.
func (w *Watchdog) TakeRecovered() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	r := w.recovered
	w.recovered = false
	return r
}

// due says whether the window should be reloaded now, and records it if so.
func (w *Watchdog) due() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := w.now()
	if w.last.IsZero() || !w.visible || now.Sub(w.last) < w.Silence {
		return false
	}
	recent := w.reloads[:0]
	for _, t := range w.reloads {
		if now.Sub(t) < w.ReloadWindow {
			recent = append(recent, t)
		}
	}
	w.reloads = recent
	if len(w.reloads) >= w.MaxReloads {
		return false
	}
	w.reloads = append(w.reloads, now)
	w.recovered = true
	// Wait for the reloaded window's first beat before judging it again.
	w.last = time.Time{}
	return true
}

// Run checks every few seconds until stop is closed, calling reload when due.
func (w *Watchdog) Run(stop <-chan struct{}, reload func()) {
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-stop:
			return
		case <-tick.C:
			if w.due() {
				log.Error().Msg("the window stopped answering; reloading it")
				reload()
			}
		}
	}
}
