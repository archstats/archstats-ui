package scan

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app/store"
)

// The test binary doubles as the scan worker, so the child-process path is
// tested with the code it really runs.
func TestMain(m *testing.M) {
	if IsWorker(os.Args) {
		switch os.Getenv("SCAN_WORKER_TEST") {
		case "hold":
			time.Sleep(time.Minute)
		case "crash":
			done := make(chan struct{})
			go func() { panic("a parser fell over") }()
			<-done
		}
		os.Exit(RunWorker(os.Stdin, os.Stdout))
	}
	os.Exit(m.Run())
}

func workerScan(t *testing.T, mode string) (*Service, *store.Store, *store.Scan, *eventRecorder) {
	t.Helper()
	t.Setenv("SCAN_WORKER_TEST", mode)
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	ws, err := st.CreateWorkspace("fixture", writeFixtureRepo(t))
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(st)
	svc.SetWorker(os.Args[0])
	rec := &eventRecorder{}
	svc.SetEmitter(rec.emit)
	started, err := svc.StartScan(ws.ID)
	if err != nil {
		t.Fatalf("StartScan: %v", err)
	}
	return svc, st, started, rec
}

func TestScanInAWorker(t *testing.T) {
	_, st, started, rec := workerScan(t, "")
	scan := waitForScan(t, st, started.ID)
	if scan.Status != store.ScanStatusComplete {
		t.Fatalf("status = %s (%s), want complete", scan.Status, scan.Error)
	}
	if _, err := os.Stat(scan.SnapshotPath); err != nil {
		t.Fatalf("snapshot missing: %v", err)
	}
	events := strings.Join(rec.names(), ",")
	if strings.Count(events, EventScanPhase) < 3 || !strings.HasSuffix(events, EventScanDone) {
		t.Fatalf("events = %s, want the worker's phases then done", events)
	}
}

func TestCancelStopsTheWorker(t *testing.T) {
	svc, st, started, _ := workerScan(t, "hold")
	time.Sleep(200 * time.Millisecond)
	if err := svc.Cancel(started.WorkspaceID); err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	scan := waitForScan(t, st, started.ID)
	if scan.Status != store.ScanStatusFailed || scan.Error != ErrCancelled.Error() {
		t.Fatalf("status = %s (%s), want failed (cancelled)", scan.Status, scan.Error)
	}
	if svc.IsRunning(started.WorkspaceID) {
		t.Fatal("still running after cancel")
	}
}

func TestAWorkerThatPanicsFailsOnlyItsScan(t *testing.T) {
	_, st, started, _ := workerScan(t, "crash")
	scan := waitForScan(t, st, started.ID)
	if scan.Status != store.ScanStatusFailed {
		t.Fatalf("status = %s, want failed", scan.Status)
	}
	if !strings.Contains(scan.Error, "crashed") || !strings.Contains(scan.Error, "a parser fell over") {
		t.Fatalf("error = %q, want the crash and its panic", scan.Error)
	}
}
