// Package contract_test holds the read contract between the engine pinned
// in go.mod and the app's Go code that reads its snapshots.
//
// The engine writes a SQLite snapshot; the app reads it by table and column
// name, and most readers degrade quietly when a name is missing (a gap in a
// trend, a comparison with no metrics) instead of failing. So a column the
// engine renamed shows up as an empty panel, not as an error. This test scans
// testdata/sample-repo with the app's own scan service (extensionsFor ->
// Analyze -> RenderView -> SaveToDB, the code the app runs), then checks that
// every table and column the Go readers name is there and runs every reader
// the frontend calls over IPC against the result.
//
// Set ARCHSTATS_FIXTURE_DB to a path to keep the snapshot: the frontend's
// contract test (src/features/snapshot/schema.contract.test.ts) reads it.
// scripts/verify-harness.sh does both.
package contract_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app"
	"github.com/archstats/archstats-ui/app/changes"
	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/scan"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/archstats/archstats-ui/app/trends"
	_ "github.com/mattn/go-sqlite3"
)

// readsFrom is every table and column the app's Go code names in SQL against
// a snapshot, by the file that names it. A reader that finds one missing
// degrades instead of failing, which is why it is written down here.
// changes.MovedMetrics is added in TestSnapshotContract.
var readsFrom = map[string][]string{
	// app/snapshot/identity.go, app/import.go
	"_snapshot": {"key", "value"},
	// app/import.go, app/trends/readings.go
	"files": {"name", "component", "role", "report_id", "timestamp", "complexity__lines"},
	// app/snapshot/identity.go
	"git_commits": {"commit_time"},
	// app/query/find.go, app/import.go, app/snapshot_files.go
	"file_contents": {"file", "content"},
	// app/trends/readings.go, app/changes/changes.go
	"components":                          {"name", "modularity__instability", "modularity__distance_main_sequence"},
	"component_connections_direct":        {"from", "to", "kind", "file", "reference_count"},
	"component_connections_indirect":      {"from", "to"},
	"component_strongly_connected_groups": {"group", "component"},
	"rules":                               {"rule", "status", "from", "to", "kind", "file", "line"},
}

// snapshotKeys are the _snapshot keys the app reads (app/snapshot/identity.go,
// app/import.go); a scan with git history writes every one of them.
var snapshotKeys = []string{"analysis_revision", "git_head_commit", "git_branch", "git_head_time", "extensions", "scanned_at"}

type fixture struct {
	store      *store.Store
	workspace  *store.Workspace
	base, head *store.Scan
	db         *sql.DB
	schema     map[string]map[string]bool
}

func TestSnapshotContract(t *testing.T) {
	f := buildFixture(t)

	t.Run("schema has every table and column the readers name", func(t *testing.T) {
		want := map[string][]string{}
		for table, cols := range readsFrom {
			want[table] = append([]string(nil), cols...)
		}
		want["components"] = append(want["components"], changes.MovedMetrics...)
		var missing []string
		for table, cols := range want {
			have, ok := f.schema[table]
			if !ok {
				missing = append(missing, table)
				continue
			}
			for _, c := range cols {
				if !have[c] {
					missing = append(missing, table+"."+c)
				}
			}
		}
		sort.Strings(missing)
		if len(missing) > 0 {
			t.Fatalf("the snapshot no longer has what the app reads:\n  %s\nThe engine renamed or dropped them: change the readers (and readsFrom), or the engine.", strings.Join(missing, "\n  "))
		}
	})

	t.Run("_snapshot has the keys the app reads", func(t *testing.T) {
		have := map[string]bool{}
		rows, err := f.db.Query(`SELECT key FROM _snapshot`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var k string
			if err := rows.Scan(&k); err != nil {
				t.Fatal(err)
			}
			have[k] = true
		}
		for _, k := range snapshotKeys {
			if !have[k] {
				t.Errorf("_snapshot has no %q", k)
			}
		}
	})

	t.Run("scan identity is read from the snapshot", func(t *testing.T) {
		id := f.head.ScanIdentity
		if id.AnalysisRevision <= 0 || id.HeadCommit == "" || id.Branch != "main" || id.Extensions == "" || id.HeadTimeSource != "head" {
			t.Errorf("identity = %+v, want a revision, the head commit, branch main, extensions and a head time from the snapshot", id)
		}
		roundTrip(t, f.head)
	})

	t.Run("WorkspaceService.InspectSnapshot", func(t *testing.T) {
		ws := app.NewWorkspaceService(f.store, context.Background, func(string) {})
		info, err := ws.InspectSnapshot(f.head.SnapshotPath)
		if err != nil {
			t.Fatal(err)
		}
		if !info.Valid || info.Files == 0 || !info.HasGit || !info.HasSource || info.Revision <= 0 || info.HeadCommit == "" || info.ScannedAt.IsZero() {
			t.Errorf("InspectSnapshot = %+v, want a valid snapshot with files, git, source, a revision, a head commit and a scan time", info)
		}
		roundTrip(t, info)
	})

	q := query.NewService(f.store)
	t.Cleanup(func() { _ = q.Close() })
	qs := app.NewQueryService(q)
	cs := app.NewChangesService(f.store, q)

	t.Run("ChangesService.Compare", func(t *testing.T) {
		set, err := cs.Compare(f.base.ID, f.head.ID)
		if err != nil {
			t.Fatal(err)
		}
		roundTrip(t, set)

		snap := load(t, f.db)
		if len(snap.Components) == 0 || len(snap.Edges) == 0 || len(snap.Tangles) == 0 {
			t.Fatalf("changes.Load read %d components, %d edges, %d tangles; want all three (sample-repo has an orders <-> billing cycle)", len(snap.Components), len(snap.Edges), len(snap.Tangles))
		}
		for _, m := range changes.MovedMetrics {
			found := false
			for _, vals := range snap.Components {
				if _, ok := vals[m]; ok {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("no component has a value for %s", m)
			}
		}
	})

	t.Run("ChangesService.Readings", func(t *testing.T) {
		points, err := cs.Readings(f.workspace.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(points) != 2 {
			t.Fatalf("readings for %d scans, want 2", len(points))
		}
		for _, p := range points {
			if p.Error != "" {
				t.Errorf("scan %s: %s", p.ScanID, p.Error)
			}
			for _, id := range []string{trends.Components, trends.ComponentsInTangle, trends.LinesInTangles, trends.LargestTangle, trends.Edges, trends.PropagationCost, trends.DependencyLevels, trends.MedianInstability, trends.MedianDistance, trends.ReachablePairs, trends.RuleFindings} {
				if p.Readings[id] == nil {
					t.Errorf("scan %s: reading %s is a gap; the snapshot no longer answers it", p.ScanID, id)
				}
			}
		}
		roundTrip(t, points)
	})

	t.Run("QueryService", func(t *testing.T) {
		if err := qs.Open(f.head.ID); err != nil {
			t.Fatal(err)
		}
		rows, err := qs.Query(`SELECT name, complexity__lines FROM files ORDER BY name`)
		if err != nil || len(rows) == 0 {
			t.Fatalf("Query: %d rows, %v", len(rows), err)
		}
		roundTrip(t, rows)
		if _, err := qs.Rows("contract", f.head.ID, `SELECT "from", "to", reference_count FROM component_connections_direct`); err != nil {
			t.Errorf("Rows: %v", err)
		}
		limited, err := qs.Console(f.head.ID, `SELECT count(*) AS n FROM components`)
		if err != nil {
			t.Fatalf("Console: %v", err)
		}
		roundTrip(t, limited)
		hits, err := qs.FindInCode(f.head.ID, "Invoice", query.FindOptions{})
		if err != nil || hits.TotalHits == 0 {
			t.Fatalf("FindInCode: %+v, %v", hits, err)
		}
		lines, err := qs.FindLines(f.head.ID, hits.Files[0].File, "Invoice", query.FindOptions{})
		if err != nil || len(lines) == 0 {
			t.Fatalf("FindLines: %d lines, %v", len(lines), err)
		}
		roundTrip(t, hits)
		roundTrip(t, lines)
	})
}

// buildFixture commits sample-repo twice into a fresh git repository, scans
// it twice through the app's scan service and opens the newer snapshot.
func buildFixture(t *testing.T) *fixture {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	root := filepath.Join(t.TempDir(), "sample-repo")
	if err := os.CopyFS(root, os.DirFS(filepath.Join("..", "..", "testdata", "sample-repo"))); err != nil {
		t.Fatal(err)
	}
	git := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		cmd.Env = gitEnv()
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	git("init", "-q", "-b", "main")
	git("add", ".")
	git("commit", "-q", "-m", "first")
	appendTo(t, filepath.Join(root, "svc/store/store.go"), "\nfunc Close() {}\n")
	appendTo(t, filepath.Join(root, "web/src/util.ts"), "\nexport const one = add(0, 1);\n")
	git("commit", "-q", "-am", "second")

	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	ws, err := st.CreateWorkspace("sample-repo", root)
	if err != nil {
		t.Fatal(err)
	}
	svc := scan.NewService(st)
	f := &fixture{store: st, workspace: ws, base: runScan(t, st, svc, ws.ID), head: runScan(t, st, svc, ws.ID)}

	if out := os.Getenv("ARCHSTATS_FIXTURE_DB"); out != "" {
		if err := copyFile(f.head.SnapshotPath, out); err != nil {
			t.Fatalf("keeping the fixture at %s: %v", out, err)
		}
		t.Logf("fixture snapshot written to %s", out)
	}

	f.db, err = sql.Open("sqlite3", "file:"+f.head.SnapshotPath+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = f.db.Close() })
	f.schema = schemaOf(t, f.db)
	return f
}

func runScan(t *testing.T, st *store.Store, svc *scan.Service, workspaceID string) *store.Scan {
	t.Helper()
	started, err := svc.StartScan(workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	for deadline := time.Now().Add(2 * time.Minute); time.Now().Before(deadline); time.Sleep(20 * time.Millisecond) {
		s, err := st.GetScan(started.ID)
		if err != nil {
			t.Fatal(err)
		}
		if s.Status == store.ScanStatusRunning {
			continue
		}
		if s.Status != store.ScanStatusComplete {
			t.Fatalf("scan %s: %s", s.Status, s.Error)
		}
		// The registry learns the identity just after it records the scan done.
		for i := 0; s.AnalysisRevision == 0 && i < 100; i++ {
			time.Sleep(20 * time.Millisecond)
			if s, err = st.GetScan(started.ID); err != nil {
				t.Fatal(err)
			}
		}
		return s
	}
	t.Fatal("scan did not finish within 2 minutes")
	return nil
}

func schemaOf(t *testing.T, db *sql.DB) map[string]map[string]bool {
	t.Helper()
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, n)
	}
	rows.Close()
	out := map[string]map[string]bool{}
	for _, table := range tables {
		cols, err := db.Query(`SELECT name FROM pragma_table_info(?)`, table)
		if err != nil {
			t.Fatal(err)
		}
		out[table] = map[string]bool{}
		for cols.Next() {
			var c string
			if err := cols.Scan(&c); err != nil {
				t.Fatal(err)
			}
			out[table][c] = true
		}
		cols.Close()
	}
	return out
}

func load(t *testing.T, db *sql.DB) *changes.Snapshot {
	t.Helper()
	snap, err := changes.Load(db)
	if err != nil {
		t.Fatal(err)
	}
	return snap
}

// roundTrip sends v the way Wails does (encoding/json) and reads it back
// into its own type: a value the frontend would receive mangled fails here.
func roundTrip(t *testing.T, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("%T does not marshal: %v", v, err)
	}
	back := reflect.New(reflect.TypeOf(v))
	if err := json.Unmarshal(b, back.Interface()); err != nil {
		t.Fatalf("%T does not unmarshal: %v", v, err)
	}
}

func appendTo(t *testing.T, path, text string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(text); err != nil {
		t.Fatal(err)
	}
}

func copyFile(from, to string) error {
	if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
		return err
	}
	src, err := os.Open(from)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(to)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		return err
	}
	return dst.Close()
}

// gitEnv pins author, committer and dates, and keeps the user's git config
// (a global commit.gpgsign) and any inherited GIT_DIR out of the fixture.
func gitEnv() []string {
	var env []string
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(kv), "GIT_") {
			env = append(env, kv)
		}
	}
	return append(env,
		"GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1",
		"GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.com", "GIT_AUTHOR_DATE=2026-01-01T00:00:00Z",
		"GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.com", "GIT_COMMITTER_DATE=2026-01-01T00:00:00Z")
}
