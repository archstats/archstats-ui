package query

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/archstats/archstats-ui/app/store"
)

func consoleFixture(t *testing.T) (*Service, string, string) {
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
	db.Exec(`INSERT INTO files VALUES ('a.go', 'x'), ('b.go', 'y')`)
	db.Close()
	if err := st.FinishScan(scan.ID, path); err != nil {
		t.Fatal(err)
	}
	return NewService(st), scan.ID, root
}

func TestConsoleReads(t *testing.T) {
	svc, id, _ := consoleFixture(t)
	res, err := svc.Console(id, "select name from files order by name;")
	if err != nil || len(res.Rows) != 2 || res.Columns[0] != "name" {
		t.Fatalf("%+v %v", res, err)
	}
	if _, err := svc.Console(id, "select * from pragma_table_info('files')"); err != nil {
		t.Errorf("reading the schema is allowed: %v", err)
	}
}

func TestConsoleRefusesWritesAndAttach(t *testing.T) {
	svc, id, root := consoleFixture(t)
	target := filepath.Join(root, "x.db")
	for _, q := range []string{
		"attach '" + target + "' as x",
		"insert into files values ('c', 'z')",
		"delete from files",
		"create table t (a)",
		"pragma writable_schema = 1",
		"select 1; delete from files",
	} {
		if _, err := svc.Console(id, q); err == nil {
			t.Errorf("%q ran", q)
		}
	}
	if _, err := os.Stat(target); err == nil {
		t.Error("ATTACH created a file")
	}
	res, _ := svc.Console(id, "select count(*) from files")
	if res == nil || res.Rows[0][0] != int64(2) {
		t.Errorf("the snapshot changed: %+v", res)
	}
	if _, err := svc.Console(id, "select ';' as s"); err != nil {
		t.Errorf("a semicolon in a string is one statement: %v", err)
	}
}
