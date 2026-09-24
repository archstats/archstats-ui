// Package trends computes the app's readings of a snapshot (the FD-F ids the
// Metric reference documents) and caches them per scan, so Over time draws a
// workspace's history from one small table.
package trends

import (
	"database/sql"
	"sort"
)

// Version is stored with every scan's readings; bump it when a reading's
// definition changes and every scan is read again on the next visit.
const Version = 3

// PropagationCostSQL is the reading's one definition; the Metric reference
// shows the same text.
const PropagationCostSQL = `SELECT 1.0 * ((SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_indirect WHERE "from" <> "to" AND "from" <> '.' AND "to" <> '.')) + (SELECT count(*) FROM components WHERE name <> '.')) / nullif((SELECT count(*) * count(*) FROM components WHERE name <> '.'), 0)`

const VersionKey = "app__readings_version"

// Reading ids, as the frontend's derivedMetrics.ts names them.
const (
	Components         = "app__components"
	ComponentsInTangle = "app__components_in_tangles"
	LinesInTangles     = "app__lines_in_tangles_share"
	LargestTangle      = "app__largest_tangle"
	Edges              = "app__cross_component_edges"
	PropagationCost    = "app__propagation_cost"
	DependencyLevels   = "app__dependency_levels"
	MedianInstability  = "app__median_instability"
	MedianDistance     = "app__median_distance"
	RuleFindings       = "app__rule_findings"
)

func hasTable(db *sql.DB, table string) bool {
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE name = ?`, table).Scan(&n)
	return n > 0
}

func hasColumn(db *sql.DB, table, column string) bool {
	var n int
	_ = db.QueryRow(`SELECT count(*) FROM pragma_table_info(?) WHERE name = ?`, table, column).Scan(&n)
	return n > 0
}

func one(db *sql.DB, q string) *float64 {
	var v sql.NullFloat64
	if err := db.QueryRow(q).Scan(&v); err != nil || !v.Valid {
		return nil
	}
	return &v.Float64
}

func val(f float64) *float64 { return &f }

// Compute reads every reading from one snapshot. A reading the snapshot
// cannot answer (no rules table, no indirect connections) is nil: a gap in
// the series, never a zero.
func Compute(db *sql.DB) (map[string]*float64, error) {
	out := map[string]*float64{VersionKey: val(Version)}
	out[Components] = one(db, `SELECT count(*) FROM components WHERE name <> '.'`)

	if hasTable(db, "component_strongly_connected_groups") {
		tangles := `SELECT "group" FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1`
		out[ComponentsInTangle] = one(db, `SELECT count(*) FROM component_strongly_connected_groups WHERE "group" IN (`+tangles+`)`)
		out[LargestTangle] = one(db, `SELECT coalesce(max(n), 0) FROM (SELECT count(*) AS n FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1)`)
		if hasColumn(db, "components", "complexity__lines") {
			out[LinesInTangles] = one(db, `SELECT 1.0 * sum(CASE WHEN name IN (SELECT component FROM component_strongly_connected_groups WHERE "group" IN (`+tangles+`)) THEN complexity__lines ELSE 0 END) / nullif(sum(complexity__lines), 0) FROM components`)
		}
	}

	runtimeFilter := `"from" <> "to"`
	if hasColumn(db, "component_connections_direct", "kind") {
		runtimeFilter += ` AND coalesce(kind, '') <> 'type_only'`
	}
	if hasTable(db, "component_connections_direct") {
		out[Edges] = one(db, `SELECT count(*) FROM (SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE `+runtimeFilter+` AND "from" <> '.' AND "to" <> '.')`)
		levels, err := dependencyLevels(db, runtimeFilter)
		if err != nil {
			return nil, err
		}
		out[DependencyLevels] = levels
	}
	if hasTable(db, "component_connections_indirect") {
		// MacCormack: reachable ordered pairs plus the diagonal (each
		// component reaches itself), over N². Pairs are counted distinct:
		// the table repeats identical rows.
		out[PropagationCost] = one(db, PropagationCostSQL)
	}
	if hasColumn(db, "components", "modularity__instability") {
		out[MedianInstability] = median(db, "modularity__instability")
	}
	if hasColumn(db, "components", "modularity__distance_main_sequence") {
		out[MedianDistance] = median(db, "modularity__distance_main_sequence")
	}
	if hasColumn(db, "rules", "status") {
		out[RuleFindings] = one(db, `SELECT count(*) FROM rules WHERE status = 'violation'`)
	}
	return out, nil
}

func median(db *sql.DB, column string) *float64 {
	rows, err := db.Query(`SELECT "` + column + `" FROM components WHERE name <> '.' AND "` + column + `" IS NOT NULL ORDER BY 1`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var vs []float64
	for rows.Next() {
		var v float64
		if rows.Scan(&v) == nil {
			vs = append(vs, v)
		}
	}
	return Median(vs)
}

// Median of sorted-or-not values; the lower middle for an even count, as the
// reference's SQL (OFFSET (n-1)/2) takes it.
func Median(vs []float64) *float64 {
	if len(vs) == 0 {
		return nil
	}
	s := append([]float64(nil), vs...)
	sort.Float64s(s)
	return val(s[(len(s)-1)/2])
}

func dependencyLevels(db *sql.DB, filter string) (*float64, error) {
	rows, err := db.Query(`SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE ` + filter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edges [][2]string
	for rows.Next() {
		var a, b string
		if err := rows.Scan(&a, &b); err != nil {
			return nil, err
		}
		edges = append(edges, [2]string{a, b})
	}
	if len(edges) == 0 {
		return val(0), nil
	}
	return val(float64(Levels(edges))), nil
}

// Levels is the number of nodes on the longest path through the graph once
// each strongly connected set is collapsed to one node.
func Levels(edges [][2]string) int {
	idx := map[string]int{}
	var names []string
	id := func(n string) int {
		if i, ok := idx[n]; ok {
			return i
		}
		idx[n] = len(names)
		names = append(names, n)
		return idx[n]
	}
	adj := map[int][]int{}
	for _, e := range edges {
		a, b := id(e[0]), id(e[1])
		adj[a] = append(adj[a], b)
	}
	n := len(names)
	comp := tarjan(n, adj)
	// Condensation, then the longest path by memoised depth-first search.
	cadj := map[int]map[int]bool{}
	for a, list := range adj {
		for _, b := range list {
			ca, cb := comp[a], comp[b]
			if ca != cb {
				if cadj[ca] == nil {
					cadj[ca] = map[int]bool{}
				}
				cadj[ca][cb] = true
			}
		}
	}
	memo := map[int]int{}
	var depth func(c int) int
	depth = func(c int) int {
		if d, ok := memo[c]; ok {
			return d
		}
		best := 0
		for next := range cadj[c] {
			if d := depth(next); d > best {
				best = d
			}
		}
		memo[c] = best + 1
		return best + 1
	}
	longest := 0
	for c := range comp {
		if d := depth(comp[c]); d > longest {
			longest = d
		}
	}
	return longest
}

// tarjan labels each node with its strongly connected component, iteratively
// so a long chain cannot overflow the stack.
func tarjan(n int, adj map[int][]int) []int {
	index := make([]int, n)
	low := make([]int, n)
	onStack := make([]bool, n)
	comp := make([]int, n)
	for i := range index {
		index[i] = -1
	}
	var stack []int
	next, compID := 0, 0
	type frame struct{ v, i int }
	for s := 0; s < n; s++ {
		if index[s] >= 0 {
			continue
		}
		call := []frame{{s, 0}}
		index[s], low[s] = next, next
		next++
		stack = append(stack, s)
		onStack[s] = true
		for len(call) > 0 {
			f := &call[len(call)-1]
			if f.i < len(adj[f.v]) {
				w := adj[f.v][f.i]
				f.i++
				if index[w] < 0 {
					index[w], low[w] = next, next
					next++
					stack = append(stack, w)
					onStack[w] = true
					call = append(call, frame{w, 0})
				} else if onStack[w] && index[w] < low[f.v] {
					low[f.v] = index[w]
				}
				continue
			}
			v := f.v
			call = call[:len(call)-1]
			if len(call) > 0 {
				p := call[len(call)-1].v
				if low[v] < low[p] {
					low[p] = low[v]
				}
			}
			if low[v] == index[v] {
				for {
					w := stack[len(stack)-1]
					stack = stack[:len(stack)-1]
					onStack[w] = false
					comp[w] = compID
					if w == v {
						break
					}
				}
				compID++
			}
		}
	}
	return comp
}
