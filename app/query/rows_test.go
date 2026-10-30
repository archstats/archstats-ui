package query

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/archstats/archstats-ui/app/store"
)

// rowsFixture is a snapshot of n files whose bodies are size bytes each, open in the service.
func rowsFixture(t *testing.T, n, size int) (*Service, string) {
	t.Helper()
	root := t.TempDir()
	st, err := store.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	ws, _ := st.CreateWorkspace("w", t.TempDir())
	scan, _ := st.CreateScan(ws.ID)
	path := filepath.Join(root, "snap.db")
	db, _ := sql.Open("sqlite3", path)
	db.Exec(`CREATE TABLE files (name TEXT, body TEXT)`)
	db.Exec(`WITH RECURSIVE i(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM i WHERE x < ?)
		INSERT INTO files SELECT 'f' || x, substr(hex(zeroblob(?)), 1, ?) FROM i`, n, size, size)
	db.Close()
	if err := st.FinishScan(scan.ID, path); err != nil {
		t.Fatal(err)
	}
	svc := NewService(st)
	if err := svc.Open(scan.ID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { svc.Close() })
	return svc, scan.ID
}

func TestRowsNamesTheColumnsOnce(t *testing.T) {
	svc, _ := rowsFixture(t, 3, 4)
	got, err := svc.Rows("", "", `SELECT name, length(body) AS n FROM files ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got.Columns, ",") != "name,n" || len(got.Rows) != 3 || got.Rows[0][0] != "f1" {
		t.Fatalf("got %+v", got)
	}
}

func TestRowsRefusesAResultTooLargeToCarry(t *testing.T) {
	// 80 rows of 1 MB: few rows, too many bytes.
	svc, _ := rowsFixture(t, 80, 1<<20)
	if _, err := svc.Rows("", "", `SELECT body FROM files`); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v, want ErrTooLarge", err)
	}
}

func TestCancelStopsARunningQuery(t *testing.T) {
	svc, _ := rowsFixture(t, 1, 1)
	done := make(chan error, 1)
	go func() {
		// Counts for minutes unless stopped.
		_, err := svc.Rows("slow", "", `WITH RECURSIVE i(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM i) SELECT count(*) FROM i`)
		done <- err
	}()
	time.Sleep(100 * time.Millisecond)
	svc.Cancel("slow")
	select {
	case err := <-done:
		if !errors.Is(err, ErrCancelled) {
			t.Fatalf("err = %v, want ErrCancelled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the query kept running after Cancel")
	}
}

func TestOpeningAnotherSnapshotCancelsQueriesOnTheOldOne(t *testing.T) {
	svc, scanID := rowsFixture(t, 1, 1)
	done := make(chan error, 1)
	go func() {
		_, err := svc.Rows("slow", "", `WITH RECURSIVE i(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM i) SELECT count(*) FROM i`)
		done <- err
	}()
	time.Sleep(100 * time.Millisecond)
	if err := svc.Open(scanID); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, ErrCancelled) {
			t.Fatalf("err = %v, want ErrCancelled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the query kept running after the snapshot was swapped")
	}
}
