package query

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/archstats/archstats-ui/app/store"
)

// A registry with n finished scans, each a tiny snapshot.
func setup(t *testing.T, n int) (*Service, []string) {
	t.Helper()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	ws, err := st.CreateWorkspace("w", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for i := 0; i < n; i++ {
		scan, _ := st.CreateScan(ws.ID)
		path := st.SnapshotPath(ws.ID, scan.ID)
		os.MkdirAll(filepath.Dir(path), 0o755)
		db, _ := sql.Open("sqlite3", path)
		if _, err := db.Exec(`CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2), (3);`); err != nil {
			t.Fatal(err)
		}
		db.Close()
		if err := st.FinishScan(scan.ID, path); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, scan.ID)
	}
	svc := NewService(st)
	t.Cleanup(func() { svc.Close() })
	return svc, ids
}

func TestQueryRefusesHugeResults(t *testing.T) {
	svc, ids := setup(t, 1)
	if err := svc.Open(ids[0]); err != nil {
		t.Fatal(err)
	}
	_, err := svc.Query(`WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x <= 300000) SELECT x FROM c`)
	if !errors.Is(err, ErrTooManyRows) {
		t.Fatalf("want ErrTooManyRows, got %v", err)
	}
}

func TestQueryLimitedTruncatesAndKeepsColumnOrder(t *testing.T) {
	svc, ids := setup(t, 1)
	svc.Open(ids[0])
	res, err := svc.QueryLimited("", `SELECT x AS b, x * 2 AS a FROM t ORDER BY x`, 2, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Truncated || len(res.Rows) != 2 || res.Columns[0] != "b" || res.Columns[1] != "a" {
		t.Fatalf("got %+v", res)
	}
}

func TestComparisonHandlesStayBoundedAndRelease(t *testing.T) {
	svc, ids := setup(t, altHandles+2)
	for _, id := range ids {
		if _, err := svc.QueryIn(id, `SELECT count(*) FROM t`); err != nil {
			t.Fatal(err)
		}
	}
	if len(svc.alt) != altHandles {
		t.Fatalf("open handles = %d, want %d", len(svc.alt), altHandles)
	}
	last := ids[len(ids)-1]
	svc.Release(last)
	if _, ok := svc.alt[last]; ok {
		t.Fatal("released handle still open")
	}
}
