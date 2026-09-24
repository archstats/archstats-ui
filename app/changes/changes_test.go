package changes

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func snapshot(t *testing.T, stmts ...string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	base := []string{
		`CREATE TABLE components (name TEXT, modularity__instability REAL, complexity__lines INTEGER)`,
		`CREATE TABLE component_connections_direct ("from" TEXT, "to" TEXT, kind TEXT, file TEXT, reference_count INTEGER)`,
		`CREATE TABLE component_strongly_connected_groups ("group" TEXT, component TEXT, group_size INTEGER)`,
	}
	for _, s := range append(base, stmts...) {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("%s: %v", s, err)
		}
	}
	return db
}

func load(t *testing.T, db *sql.DB) *Snapshot {
	t.Helper()
	s, err := Load(db)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestDiff(t *testing.T) {
	base := load(t, snapshot(t,
		`INSERT INTO components VALUES ('a', 0.5, 100), ('b', 0.2, 50), ('gone', 1, 10)`,
		`INSERT INTO component_connections_direct VALUES ('a','b','import','a/x.py',3), ('b','gone','import','b/y.py',1), ('a','b','type_only','a/t.py',9)`,
		`INSERT INTO component_strongly_connected_groups VALUES ('1','a',2), ('1','b',2)`,
		`CREATE TABLE rules (rule TEXT, status TEXT, "from" TEXT, "to" TEXT, kind TEXT, file TEXT, line INTEGER)`,
		`INSERT INTO rules VALUES ('no-ui', 'violation', 'a', 'b', 'import', 'a/x.py', 4)`,
	))
	head := load(t, snapshot(t,
		`INSERT INTO components VALUES ('a', 0.6, 120), ('b', 0.2, 50), ('new', 0, 5)`,
		`INSERT INTO component_connections_direct VALUES ('a','b','import','a/x.py',5), ('new','a','dynamic','n/z.py',1), ('b','a','import','b/w.py',1)`,
		`INSERT INTO component_strongly_connected_groups VALUES ('1','a',3), ('1','b',3), ('1','new',3)`,
		`CREATE TABLE rules (rule TEXT, status TEXT, "from" TEXT, "to" TEXT, kind TEXT, file TEXT, line INTEGER)`,
		`INSERT INTO rules VALUES ('no-ui', 'violation', 'a', 'b', 'import', 'a/x.py', 9)`,
	))
	cs := Diff(base, head)
	if len(cs.ComponentsAdded) != 1 || cs.ComponentsAdded[0] != "new" || len(cs.ComponentsRemoved) != 1 || cs.ComponentsRemoved[0] != "gone" {
		t.Errorf("components: %+v %+v", cs.ComponentsAdded, cs.ComponentsRemoved)
	}
	if len(cs.EdgesAdded) != 2 || len(cs.EdgesRemoved) != 1 || cs.EdgesRemoved[0].To != "gone" {
		t.Errorf("edges: +%+v -%+v", cs.EdgesAdded, cs.EdgesRemoved)
	}
	var dyn bool
	for _, e := range cs.EdgesAdded {
		if e.From == "new" {
			dyn = e.Dynamic
		}
	}
	if !dyn {
		t.Error("an edge made only by a runtime lookup is marked dynamic")
	}
	// The type-only rows are not a dependency: refs go 3 -> 5, not 12 -> 5.
	if len(cs.EdgesChanged) != 1 || cs.EdgesChanged[0].Before != 3 || cs.EdgesChanged[0].After != 5 {
		t.Errorf("changed: %+v", cs.EdgesChanged)
	}
	if len(cs.Tangles) != 1 || cs.Tangles[0].Kind != "grew" || len(cs.Tangles[0].Joined) != 1 || cs.Tangles[0].Joined[0] != "new" {
		t.Errorf("tangles: %+v", cs.Tangles)
	}
	// Same finding on another line is the same finding.
	if len(cs.RulesNew) != 0 || len(cs.RulesGone) != 0 {
		t.Errorf("rules: new %+v gone %+v", cs.RulesNew, cs.RulesGone)
	}
	moved := map[string]bool{}
	for _, m := range cs.Moves {
		moved[m.Component+"/"+m.Metric] = true
	}
	if !moved["a/modularity__instability"] || !moved["a/complexity__lines"] || moved["b/modularity__instability"] {
		t.Errorf("moves: %+v", cs.Moves)
	}
}

func TestDiffIdenticalAndUnchecked(t *testing.T) {
	a := load(t, snapshot(t, `INSERT INTO components VALUES ('a', 0.5, 100)`))
	b := load(t, snapshot(t, `INSERT INTO components VALUES ('a', 0.5, 100)`))
	cs := Diff(a, b)
	if len(cs.ComponentsAdded)+len(cs.EdgesAdded)+len(cs.Tangles)+len(cs.Moves) != 0 {
		t.Errorf("identical snapshots differ: %+v", cs)
	}
	if cs.RulesChecked["base"] || cs.RulesChecked["head"] {
		t.Error("no rules table means not checked")
	}
}

func TestDissolved(t *testing.T) {
	a := load(t, snapshot(t, `INSERT INTO component_strongly_connected_groups VALUES ('1','x',2), ('1','y',2)`))
	b := load(t, snapshot(t))
	cs := Diff(a, b)
	if len(cs.Tangles) != 1 || cs.Tangles[0].Kind != "dissolved" {
		t.Errorf("%+v", cs.Tangles)
	}
}
