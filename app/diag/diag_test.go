package diag

import (
	"testing"
	"time"
)

func TestWatchdogReloadsOnlyASilentVisibleWindow(t *testing.T) {
	now := time.Unix(0, 0)
	w := NewWatchdog()
	w.now = func() time.Time { return now }

	if w.due() {
		t.Fatal("reloaded a window that never beat")
	}
	w.Beat(false)
	now = now.Add(time.Hour)
	if w.due() {
		t.Fatal("reloaded a hidden window")
	}
	w.Beat(true)
	now = now.Add(10 * time.Second)
	if w.due() {
		t.Fatal("reloaded a window that beat ten seconds ago")
	}
	now = now.Add(time.Minute)
	if !w.due() {
		t.Fatal("did not reload a visible window silent for a minute")
	}
	if !w.TakeRecovered() || w.TakeRecovered() {
		t.Fatal("recovered should read true once")
	}
	if w.due() {
		t.Fatal("judged the reloaded window before its first beat")
	}
}

func TestWatchdogGivesUpOnAWindowThatDiesOnLoad(t *testing.T) {
	now := time.Unix(0, 0)
	w := NewWatchdog()
	w.now = func() time.Time { return now }
	reloads := 0
	for i := 0; i < 5; i++ {
		w.Beat(true)
		now = now.Add(time.Minute)
		if w.due() {
			reloads++
		}
	}
	if reloads != w.MaxReloads {
		t.Fatalf("reloaded %d times, want %d", reloads, w.MaxReloads)
	}
}

func TestWindowLogKeepsToItsBudget(t *testing.T) {
	now := time.Unix(0, 0)
	w := NewWindow()
	w.now = func() time.Time { return now }
	for i := 0; i < 100; i++ {
		w.Log("error", "boom", "")
	}
	if w.written != windowBudget || w.dropped != 100-windowBudget {
		t.Fatalf("written %d dropped %d", w.written, w.dropped)
	}
	now = now.Add(time.Minute)
	w.Log("error", "boom", "")
	if w.written != 1 || w.dropped != 0 {
		t.Fatalf("budget did not reset: written %d dropped %d", w.written, w.dropped)
	}
}
