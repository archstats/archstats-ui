// Package changes compares two snapshots of one workspace: which components,
// dependencies, tangles and rule findings appeared or went, and which
// readings moved. Snapshots are immutable, so a comparison is cached per pair.
package changes

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
)

// Opener returns a read-only handle on a scan's snapshot. The handle is
// shared and must not be closed by the caller.
type Opener func(scanID string) (*sql.DB, error)

// MovedMetrics are the readings "Largest moves" compares. No composite: each
// is shown as itself.
var MovedMetrics = []string{
	"modularity__instability",
	"modularity__distance_main_sequence",
	"modularity__coupling__afferent",
	"modularity__coupling__efferent",
	"modularity__coupling__dependents",
	"modularity__coupling__dependencies",
	"codesmells__hotspot__raw",
	"codesmells__code_health",
	"complexity__lines",
}

type Edge struct {
	From    string   `json:"from"`
	To      string   `json:"to"`
	Refs    int      `json:"refs"`
	Files   []string `json:"files"`
	Dynamic bool     `json:"dynamic"` // joined only by runtime lookups
}

type EdgeDelta struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Before int    `json:"before"`
	After  int    `json:"after"`
}

type TangleChange struct {
	// Kind is formed, dissolved, grew, shrank or reshaped.
	Kind   string   `json:"kind"`
	Before []string `json:"before"`
	After  []string `json:"after"`
	Joined []string `json:"joined"`
	Left   []string `json:"left"`
}

type Finding struct {
	Rule string `json:"rule"`
	From string `json:"from"`
	To   string `json:"to"`
	File string `json:"file"`
	Line int    `json:"line"`
	Kind string `json:"kind"`
}

type Move struct {
	Component string  `json:"component"`
	Metric    string  `json:"metric"`
	Before    float64 `json:"before"`
	After     float64 `json:"after"`
}

type ChangeSet struct {
	BaseID            string         `json:"baseId"`
	HeadID            string         `json:"headId"`
	ComponentsAdded   []string       `json:"componentsAdded"`
	ComponentsRemoved []string       `json:"componentsRemoved"`
	EdgesAdded        []Edge         `json:"edgesAdded"`
	EdgesRemoved      []Edge         `json:"edgesRemoved"`
	EdgesChanged      []EdgeDelta    `json:"edgesChanged"`
	Tangles           []TangleChange `json:"tangles"`
	RulesNew          []Finding      `json:"rulesNew"`
	RulesGone         []Finding      `json:"rulesGone"`
	// RulesChecked says whether each side recorded rules at all; a missing
	// table is "not checked", never "no findings".
	RulesChecked map[string]bool `json:"rulesChecked"`
	Moves        []Move          `json:"moves"`
}

// Service compares snapshots and remembers what it compared.
type Service struct {
	open  Opener
	mu    sync.Mutex
	cache map[string]*ChangeSet
}

func NewService(open Opener) *Service {
	return &Service{open: open, cache: map[string]*ChangeSet{}}
}

// Compare returns what changed from base to head.
func (s *Service) Compare(baseID, headID string) (*ChangeSet, error) {
	key := baseID + "|" + headID
	s.mu.Lock()
	if cs, ok := s.cache[key]; ok {
		s.mu.Unlock()
		return cs, nil
	}
	s.mu.Unlock()
	base, err := s.load(baseID)
	if err != nil {
		return nil, fmt.Errorf("reading the baseline: %w", err)
	}
	head, err := s.load(headID)
	if err != nil {
		return nil, fmt.Errorf("reading the newer snapshot: %w", err)
	}
	cs := Diff(base, head)
	cs.BaseID, cs.HeadID = baseID, headID
	s.mu.Lock()
	if len(s.cache) > 32 {
		s.cache = map[string]*ChangeSet{}
	}
	s.cache[key] = cs
	s.mu.Unlock()
	return cs, nil
}

// Forget drops cached comparisons involving a scan (it was deleted).
func (s *Service) Forget(scanID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.cache {
		if strings.HasPrefix(k, scanID+"|") || strings.HasSuffix(k, "|"+scanID) {
			delete(s.cache, k)
		}
	}
}

// Snapshot is what a comparison reads from one side.
type Snapshot struct {
	Components   map[string]map[string]float64
	Edges        map[[2]string]*Edge
	Tangles      [][]string
	Rules        map[string]Finding
	RulesChecked bool
}

func (s *Service) load(scanID string) (*Snapshot, error) {
	db, err := s.open(scanID)
	if err != nil {
		return nil, err
	}
	return Load(db)
}

func columns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out[n] = true
	}
	return out, rows.Err()
}

func quote(id string) string { return `"` + strings.ReplaceAll(id, `"`, `""`) + `"` }

// Load reads one snapshot's comparable facts.
func Load(db *sql.DB) (*Snapshot, error) {
	snap := &Snapshot{Components: map[string]map[string]float64{}, Edges: map[[2]string]*Edge{}, Rules: map[string]Finding{}}

	compCols, err := columns(db, "components")
	if err != nil {
		return nil, err
	}
	sel := []string{"name"}
	var metrics []string
	for _, m := range MovedMetrics {
		if compCols[m] {
			sel = append(sel, quote(m))
			metrics = append(metrics, m)
		}
	}
	rows, err := db.Query(`SELECT ` + strings.Join(sel, ", ") + ` FROM components`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name string
		vals := make([]sql.NullFloat64, len(metrics))
		dest := []any{&name}
		for i := range vals {
			dest = append(dest, &vals[i])
		}
		if err := rows.Scan(dest...); err != nil {
			rows.Close()
			return nil, err
		}
		m := map[string]float64{}
		for i, v := range vals {
			if v.Valid {
				m[metrics[i]] = v.Float64
			}
		}
		snap.Components[name] = m
	}
	rows.Close()

	edgeCols, err := columns(db, "component_connections_direct")
	if err != nil {
		return nil, err
	}
	if len(edgeCols) > 0 {
		kind := "''"
		where := `"from" <> "to"`
		if edgeCols["kind"] {
			kind = "coalesce(kind, '')"
			where += ` AND coalesce(kind, '') <> 'type_only'`
		}
		rows, err := db.Query(`SELECT "from", "to", coalesce(file, ''), coalesce(reference_count, 0), ` + kind + ` FROM component_connections_direct WHERE ` + where)
		if err != nil {
			return nil, err
		}
		static := map[[2]string]bool{}
		for rows.Next() {
			var from, to, file, k string
			var refs int
			if err := rows.Scan(&from, &to, &file, &refs, &k); err != nil {
				rows.Close()
				return nil, err
			}
			key := [2]string{from, to}
			e := snap.Edges[key]
			if e == nil {
				e = &Edge{From: from, To: to}
				snap.Edges[key] = e
			}
			e.Refs += refs
			if file != "" && !contains(e.Files, file) {
				e.Files = append(e.Files, file)
			}
			if k != "dynamic" {
				static[key] = true
			}
		}
		rows.Close()
		for key, e := range snap.Edges {
			e.Dynamic = edgeCols["kind"] && !static[key]
			sort.Strings(e.Files)
		}
	}

	sccCols, err := columns(db, "component_strongly_connected_groups")
	if err != nil {
		return nil, err
	}
	if sccCols["group"] && sccCols["component"] {
		rows, err := db.Query(`SELECT "group", component FROM component_strongly_connected_groups ORDER BY 1, 2`)
		if err != nil {
			return nil, err
		}
		groups := map[string][]string{}
		var order []string
		for rows.Next() {
			var g, c string
			if err := rows.Scan(&g, &c); err != nil {
				rows.Close()
				return nil, err
			}
			if _, ok := groups[g]; !ok {
				order = append(order, g)
			}
			groups[g] = append(groups[g], c)
		}
		rows.Close()
		for _, g := range order {
			if len(groups[g]) > 1 {
				snap.Tangles = append(snap.Tangles, groups[g])
			}
		}
	}

	ruleCols, err := columns(db, "rules")
	if err != nil {
		return nil, err
	}
	if ruleCols["status"] {
		snap.RulesChecked = true
		rows, err := db.Query(`SELECT coalesce(rule, ''), coalesce("from", ''), coalesce("to", ''), coalesce(file, ''), coalesce(line, 0), coalesce(kind, '') FROM rules WHERE status = 'violation'`)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var f Finding
			if err := rows.Scan(&f.Rule, &f.From, &f.To, &f.File, &f.Line, &f.Kind); err != nil {
				rows.Close()
				return nil, err
			}
			// Keyed without the line: an edit above an import must not
			// turn one finding into a gone one and a new one.
			snap.Rules[f.Rule+"\x00"+f.From+"\x00"+f.To+"\x00"+f.File] = f
		}
		rows.Close()
	}
	return snap, nil
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// Diff compares two loaded snapshots.
func Diff(base, head *Snapshot) *ChangeSet {
	cs := &ChangeSet{RulesChecked: map[string]bool{"base": base.RulesChecked, "head": head.RulesChecked}}
	for name := range head.Components {
		if _, ok := base.Components[name]; !ok {
			cs.ComponentsAdded = append(cs.ComponentsAdded, name)
		}
	}
	for name := range base.Components {
		if _, ok := head.Components[name]; !ok {
			cs.ComponentsRemoved = append(cs.ComponentsRemoved, name)
		}
	}
	sort.Strings(cs.ComponentsAdded)
	sort.Strings(cs.ComponentsRemoved)

	for key, e := range head.Edges {
		b, ok := base.Edges[key]
		switch {
		case !ok:
			cs.EdgesAdded = append(cs.EdgesAdded, *e)
		case b.Refs != e.Refs:
			cs.EdgesChanged = append(cs.EdgesChanged, EdgeDelta{From: e.From, To: e.To, Before: b.Refs, After: e.Refs})
		}
	}
	for key, e := range base.Edges {
		if _, ok := head.Edges[key]; !ok {
			cs.EdgesRemoved = append(cs.EdgesRemoved, *e)
		}
	}
	byRefs := func(list []Edge) {
		sort.Slice(list, func(i, j int) bool {
			if list[i].Refs != list[j].Refs {
				return list[i].Refs > list[j].Refs
			}
			return list[i].From+list[i].To < list[j].From+list[j].To
		})
	}
	byRefs(cs.EdgesAdded)
	byRefs(cs.EdgesRemoved)
	sort.Slice(cs.EdgesChanged, func(i, j int) bool {
		a, b := cs.EdgesChanged[i], cs.EdgesChanged[j]
		da, db := abs(a.After-a.Before), abs(b.After-b.Before)
		if da != db {
			return da > db
		}
		return a.From+a.To < b.From+b.To
	})

	cs.Tangles = diffTangles(base.Tangles, head.Tangles)

	if base.RulesChecked && head.RulesChecked {
		for k, f := range head.Rules {
			if _, ok := base.Rules[k]; !ok {
				cs.RulesNew = append(cs.RulesNew, f)
			}
		}
		for k, f := range base.Rules {
			if _, ok := head.Rules[k]; !ok {
				cs.RulesGone = append(cs.RulesGone, f)
			}
		}
		byFinding := func(list []Finding) {
			sort.Slice(list, func(i, j int) bool {
				a, b := list[i], list[j]
				return a.Rule+a.File+fmt.Sprint(a.Line) < b.Rule+b.File+fmt.Sprint(b.Line)
			})
		}
		byFinding(cs.RulesNew)
		byFinding(cs.RulesGone)
	}

	for name, after := range head.Components {
		before, ok := base.Components[name]
		if !ok {
			continue
		}
		for _, m := range MovedMetrics {
			a, okA := after[m]
			b, okB := before[m]
			if okA && okB && math.Abs(a-b) > 1e-9 {
				cs.Moves = append(cs.Moves, Move{Component: name, Metric: m, Before: b, After: a})
			}
		}
	}
	sort.Slice(cs.Moves, func(i, j int) bool {
		a, b := cs.Moves[i], cs.Moves[j]
		if a.Metric != b.Metric {
			return a.Metric < b.Metric
		}
		da, db := math.Abs(a.After-a.Before), math.Abs(b.After-b.Before)
		if da != db {
			return da > db
		}
		return a.Component < b.Component
	})
	return cs
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

// diffTangles matches tangles across snapshots by member overlap: each head
// tangle takes the base tangle it shares most members with.
func diffTangles(base, head [][]string) []TangleChange {
	var out []TangleChange
	usedBase := map[int]bool{}
	for _, h := range head {
		best, bestOverlap := -1, 0
		for i, b := range base {
			if usedBase[i] {
				continue
			}
			if o := overlap(b, h); o > bestOverlap {
				best, bestOverlap = i, o
			}
		}
		if best < 0 {
			out = append(out, TangleChange{Kind: "formed", After: sorted(h), Joined: sorted(h)})
			continue
		}
		usedBase[best] = true
		b := base[best]
		joined, left := minus(h, b), minus(b, h)
		if len(joined) == 0 && len(left) == 0 {
			continue
		}
		kind := "reshaped"
		if len(h) > len(b) {
			kind = "grew"
		} else if len(h) < len(b) {
			kind = "shrank"
		}
		out = append(out, TangleChange{Kind: kind, Before: sorted(b), After: sorted(h), Joined: joined, Left: left})
	}
	for i, b := range base {
		if !usedBase[i] {
			out = append(out, TangleChange{Kind: "dissolved", Before: sorted(b), Left: sorted(b)})
		}
	}
	rank := map[string]int{"formed": 0, "grew": 1, "reshaped": 2, "shrank": 3, "dissolved": 4}
	sort.SliceStable(out, func(i, j int) bool {
		if rank[out[i].Kind] != rank[out[j].Kind] {
			return rank[out[i].Kind] < rank[out[j].Kind]
		}
		return len(out[i].After)+len(out[i].Before) > len(out[j].After)+len(out[j].Before)
	})
	return out
}

func overlap(a, b []string) int {
	set := map[string]bool{}
	for _, x := range a {
		set[x] = true
	}
	n := 0
	for _, x := range b {
		if set[x] {
			n++
		}
	}
	return n
}

func minus(a, b []string) []string {
	set := map[string]bool{}
	for _, x := range b {
		set[x] = true
	}
	var out []string
	for _, x := range a {
		if !set[x] {
			out = append(out, x)
		}
	}
	sort.Strings(out)
	return out
}

func sorted(a []string) []string {
	out := append([]string(nil), a...)
	sort.Strings(out)
	return out
}
