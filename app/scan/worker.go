package scan

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/archstats/archstats/cmd/export/sqlite"
	"github.com/archstats/archstats/core"
)

// A scan runs in a process of its own: the app's binary started with
// WorkerFlag. Analysing a large repository can take gigabytes and runs code
// (parsers, git) that can panic in goroutines nobody recovers; in the app's
// process either one ends the app. In a child it ends the scan, the memory
// goes back to the system when it exits, and stopping a scan is stopping
// the child.

// WorkerFlag starts the binary as a scan worker instead of the app.
const WorkerFlag = "--scan-worker"

// ErrCancelled is the error of a scan someone stopped.
var ErrCancelled = errors.New("cancelled")

// Request is one scan for a worker: what to read and where to write it.
type Request struct {
	Root     string    `json:"root"`
	Ignore   []string  `json:"ignore"`
	Snapshot string    `json:"snapshot"`
	ReportID string    `json:"reportId"`
	ScanTime time.Time `json:"scanTime"`
}

// progress is one line a worker writes: a phase it entered, or why it failed.
type progress struct {
	Phase      string   `json:"phase,omitempty"`
	Extensions []string `json:"extensions,omitempty"`
	Error      string   `json:"error,omitempty"`
}

// Analyze reads req.Root and writes its snapshot to req.Snapshot, telling
// phase as it enters "analyzing" (with the extensions it found), "rendering"
// and "saving".
func Analyze(req Request, phase func(name string, extensions []string)) error {
	extensions, names, err := extensionsFor(req.Root, req.Ignore)
	if err != nil {
		return fmt.Errorf("detecting extensions: %v", err)
	}
	phase("analyzing", names)

	results, err := core.New(&core.Config{
		RootPath:       req.Root,
		Extensions:     extensions,
		IgnorePatterns: req.Ignore,
	}).Analyze()
	if err != nil {
		return fmt.Errorf("analyzing %s: %v", req.ReportID, err)
	}
	// Which language packs read this code; two scans read by different
	// packs are compared with a warning.
	sortedNames := append([]string(nil), names...)
	sort.Strings(sortedNames)
	results.SetSnapshotInfo("extensions", strings.Join(sortedNames, ","))

	phase("rendering", nil)
	var views []*core.View
	for _, vf := range results.GetViewFactories() {
		view, err := results.RenderView(vf.Name)
		if err != nil {
			return fmt.Errorf("rendering view %q: %v", vf.Name, err)
		}
		views = append(views, view)
	}

	phase("saving", nil)
	if err := sqlite.SaveToDB(&sqlite.SqlOptions{
		DatabaseName: req.Snapshot,
		ReportId:     req.ReportID,
		ScanTime:     req.ScanTime,
		StoreContent: true,
	}, results, views); err != nil {
		return fmt.Errorf("saving snapshot: %v", err)
	}
	return nil
}

// RunWorker is a worker's whole life: a Request on in, progress lines on
// out, and the exit code. A panic is not recovered: the parent reads the
// stack from stderr and reports the scan as crashed.
func RunWorker(in io.Reader, out io.Writer) int {
	enc := json.NewEncoder(out)
	var req Request
	if err := json.NewDecoder(in).Decode(&req); err != nil {
		_ = enc.Encode(progress{Error: fmt.Sprintf("reading the scan request: %v", err)})
		return 2
	}
	err := Analyze(req, func(name string, extensions []string) {
		_ = enc.Encode(progress{Phase: name, Extensions: extensions})
	})
	if err != nil {
		_ = enc.Encode(progress{Error: err.Error()})
		return 1
	}
	return 0
}

// inChild runs req in a worker process started from exe, and stops it when
// ctx is cancelled.
func inChild(ctx context.Context, exe string, req Request, phase func(string, []string)) error {
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, exe, WorkerFlag)
	cmd.Stdin = bytes.NewReader(body)
	cmd.Env = append(os.Environ(), workerEnv+"=1")
	stderr := &tail{max: 16 << 10}
	cmd.Stderr = stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting the scan: %v", err)
	}
	reported := ""
	lines := bufio.NewScanner(stdout)
	lines.Buffer(make([]byte, 64<<10), 4<<20)
	for lines.Scan() {
		var p progress
		if json.Unmarshal(lines.Bytes(), &p) != nil {
			continue
		}
		if p.Error != "" {
			reported = p.Error
		} else if p.Phase != "" {
			phase(p.Phase, p.Extensions)
		}
	}
	err = cmd.Wait()
	switch {
	case ctx.Err() != nil:
		return ErrCancelled
	case err == nil:
		return nil
	case reported != "":
		return errors.New(reported)
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		if ws, ok := exit.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
			return fmt.Errorf("the scan was stopped by the system (%s), most likely because it ran out of memory", ws.Signal())
		}
	}
	return fmt.Errorf("the scan crashed: %s", crashSummary(stderr.String()))
}

// workerEnv marks a worker's environment, so a test binary can serve as one.
const workerEnv = "ARCHSTATS_SCAN_WORKER"

// IsWorker reports whether this process was started as a scan worker.
func IsWorker(args []string) bool {
	for _, a := range args {
		if a == WorkerFlag {
			return true
		}
	}
	return os.Getenv(workerEnv) == "1"
}

// tail keeps the last max bytes written to it.
type tail struct {
	max int
	buf []byte
}

func (t *tail) Write(p []byte) (int, error) {
	t.buf = append(t.buf, p...)
	if len(t.buf) > t.max {
		t.buf = append([]byte(nil), t.buf[len(t.buf)-t.max:]...)
	}
	return len(p), nil
}

func (t *tail) String() string { return string(t.buf) }

// crashSummary is the panic and the first frames under it, or the last lines
// the worker wrote when it did not panic.
func crashSummary(stderr string) string {
	if i := strings.LastIndex(stderr, "panic: "); i >= 0 {
		lines := strings.SplitN(stderr[i:], "\n", 9)
		if len(lines) > 8 {
			lines = lines[:8]
		}
		return strings.TrimSpace(strings.Join(lines, "\n"))
	}
	return lastLines(stderr, 12)
}

func lastLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	out := strings.TrimSpace(strings.Join(lines, "\n"))
	if out == "" {
		return "no output"
	}
	return out
}
