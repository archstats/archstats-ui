# Views plan: consolidate and rebuild every view on the tool-window system

Status: **Stages 0–3 built 2026-09-17 (uncommitted on `shell/workspace-sidebar`); Stage 4 not started.** Direction 1 provisionally chosen. Ryan leans toward
"question-based tool windows" (Direction 1) but is not fully committed. The plan
is therefore staged so Stages 0 to 3 are worth doing under either direction, and
Stage 4 (the Connections merge) is the single commitment point. Decisions taken:
Walker folds into component detail; Java collapses to one Classes view plus
detail tabs; Groups get a sidebar section and act as a scope filter.

Survey basis: all 48 routed pages under `frontend/src/pages` (about 20k lines),
read file by file on 2026-09-17. DESIGN.md (the tool-window world) is the visual
authority; PRODUCT.md principle 5 ("the visualizations are the crown jewels")
and positioning claim 4 ("structure and history in one model") drive the shape.

## 1. Thesis

Fewer, stronger tools, each answering one question, each with the same controls
in the same places. Three rules follow:

1. **Git is a source, not a family.** Static imports and shared commits are two
   weightings of the same component graph. Every structural view gets a
   `Static | Git | Combined` source switch. The Git section keeps only what is
   genuinely about people and time: Authors and Activity.
2. **Grain is a switch, not a family.** Groups, components, files and
   directories are four zoom levels of one tree. Views that make sense at more
   than one grain get a grain switch instead of a second implementation
   (Hotspots at component or directory grain; Connections at group, component
   or file grain; Metrics at component or file grain).
3. **One detail surface per entity.** Component, file and author each get one
   detail frame with tabs from the shared layout, a breadcrumb, and real
   history back. No view is a dead end: every name on screen opens its detail.

## 2. Target map

### Sidebar (8 entries, plus Groups)

| Entry | Question it answers | Absorbs |
|---|---|---|
| Overview | What is this snapshot, and where should I look first? | Git Timeline (monthly additions and deletions bars move here), Java OOP tiles when Java is present |
| Metrics | What are the numbers for every component or file, and where do they land when I cross two of them? | Components Table, Files Table, Plotter, Java OOP columns |
| Hotspots | Which units are large and hot, arranged by package? | Comparison (flat layout and group-orbit layout become layout options), Files Treemap (directory grain), Git Churn (a perspective plus a Metrics plot preset) |
| Connections | Which units are coupled to which, and how strongly? | Matrix (Grid), Chord (Radial bundling), Git Coupling (Chord, real `d3.chord`), Group Coupling (Graph at group grain), Clustering (Graph with community grouping), Files Dependencies (Graph at file grain) |
| Cycles | Which dependency cycles exist and which edge is cheapest to cut? | Per-component Cycles (becomes a scope), Walker's cycle picker |
| Authors | Who contributes, how much, and where? | Unchanged in purpose; period toggle fixed |
| Activity | When was this repository active? | Git Timeline's heatmap with a date range (or fold entirely into Overview; see open decisions) |
| Classes (Java only) | How are classes wired, and is there a path from A to B? | Spring Beans, Class Connections |
| Groups (section) | Which of my saved groups do I want to scope the views to? | Group Overview page, Group Explorer page (both removed) |

Sidebar order runs cheap to deep: Overview, Metrics, Hotspots, Connections,
Cycles, then Authors, Activity, then Classes, then the Groups section.

### Detail frames (3 frames, 15 tabs)

One `DetailFrame` component: breadcrumb (`Components › name`), entity header
with two or three key stats in mono, tabs rendered by `ViewWorkspaceLayout`'s
own tab row, and history-based back. No second rail, no pill strip.

- **Component:** Overview · Dependencies · Files · History · Cycles · Java
  - Overview: the current diagnostic page, cut to metrics with rank and
    percentile, no prose, every mention of another tab is a link.
  - Dependencies: Walker's three panes (dependents | this | dependencies) with
    the walk trail as a breadcrumb strip, a hop-depth control from Circle of
    Influence, and a pair table (references, shared commits, similarity, path
    distance) that replaces component-matrix, internal-file-matrix and
    external-file-matrix with an `Internal | External | All` scope.
  - Files: list plus source pane, built on `MetricsTable` at file grain.
  - History: shared `CommitHistory` filtered to the component.
  - Cycles: the Cycles view mounted with `scope=component`, not a fork.
  - Java: roles, wiring, JPA entities, source catalog; the one Java surface at
    component grain.
- **File:** Overview · Source · Imports · History · Java
  - Imports resolved through the class map (the logic already in the file Java
    tab) so incoming references stop being a substring guess.
- **Author:** Overview · Components · Files · History
  - Overview's hotspot list and the Components tab are one query; keep the tab.

Route count goes from 48 to about 26.

### Click model (one rule for every view)

- Single click selects and fills the inspector.
- Double-click, Enter, or the inspector's Open button goes to detail.
- Right-click opens the context menu where one exists today (groups, isolate,
  hide); no new menus.
- Hover shows the tooltip; no hover navigation, no 500 ms long-hover popovers.
- Every name rendered anywhere is a link to its detail.

## 3. Shared parts to build once (Stage 1)

| Part | Replaces | Notes |
|---|---|---|
| `DetailFrame` | three hand-built drill-down shells, three nav idioms | breadcrumb, header stats, tabs via `ViewWorkspaceLayout`, router history back |
| `MetricsTable` | `ElementTable`, files/table, group overview, author components/files, OOP table | grain-aware, column picker with defaults per grain, safe regex (try/catch, fallback to substring), sticky header, selection + `GroupActionBar`, empty and "0 of N match" states |
| `CommitHistory` | component git, file git, author timeline, git timeline | `GitActivityChart` + KPIs + commit list + top authors, filter prop, date range, "show all" |
| `PairTable` | component-matrix, internal and external file matrix, git coupling inspector | from/to rows, weights as columns, scope toggle, sort, pagination |
| `ZoomControls` | five inline zoom overlays and two views with hidden zoom | one overlay used by every canvas; Plotter and Matrix gain zoom |
| `ScopeBar` | nothing (new) | lives in the toolbar: group scope chip, grain switch, source switch; only the switches a view supports are shown |
| `useHealth()` | five copies of health and hotspot thresholds with three colour sets | one threshold table, one colour mapping through `chartTheme()` |
| `useQueryState()` | ad-hoc `watchEffect` async queries | loading, empty, error for every view; debounced sliders; N+1 loops get a progress row |
| `sqlLiteral()` | string interpolation in about a dozen views | one escaping helper now; parameter binding in the Go query service later (engine-adjacent, ask first) |
| `CodeViewer` retoken | Atom One Dark hexes | light and dark from tokens, JetBrains Mono, line highlight in accent tint |

Louvain and label propagation move to a web worker (no new dependency) so the
Connections graph never blocks the window.

## 4. Stages

Each stage ends with: real-data captures in both appearances against the
`eai-3540597-qp-common` workspace (52 components, 611 files, 3,756 commits,
Java tables present; the largest local scan), the mechanical detector, and the
finish reviewer. The foundation round was verified against a one-component
snapshot only; that must not repeat.

### Stage 0: fix what is broken (no design decisions needed)

- Authors period toggle reads `git__commits__last_30_days`, data has `__30d`;
  fix the mapping so the control works.
- Two Plotter presets use `:` instead of `__` and never appear.
- Git Coupling arc labels are `rgba(255,255,255,0.7)` on a white surface.
- Two `xmlns="http://www.w3.org/2050/svg"` in per-component cycles.
- Corrupt search icon path in component-matrix.
- `badge-color-class` passed by five views to a prop that is never rendered;
  `kpi-stats` and `show-search` passed to Cycles' frame, not props.
- Comparison `resetZoom` defined, never bound.
- Matrix `orderedComponents` sorts `store.allComponents` in place.
- Unsanitised `new RegExp(search)` in Components Table throws on `(`.
- Unescaped SQL in class-connections (line 622), walker, cycles, drill-downs.
- Git Timeline's search box is wired to nothing.
- Literal `**bold**` markdown in component overview and JPA.
- Dead files: `ConnectionChart.vue`, `common/ComponentTable.vue`.

### Stage 1: shared parts and detail frames

Build the parts in section 3. Port the component, file and author drill-downs
onto `DetailFrame`. Delete `[name]/cycles.vue` (628 lines), merge the three
matrix pages into one `PairTable` tab (about 1,260 lines to roughly 250),
replace three commit lists with `CommitHistory`. Walker moves into the
Dependencies tab here. Net removal is around 4,000 lines.

Stage 1 is worth doing under any direction.

### Stage 2: Metrics, Hotspots, Authors, Groups

- Metrics: Table and Plot as two representations over one filter, one column
  picker, one selection. Plot gains zoom, a clamped origin, and the fixed
  presets. Files Table is the same view at file grain.
- Hotspots: single click selects, double-click opens. Perspectives become named
  presets with a one-line explanation, detected by exact column ids, not
  substrings. Directory grain replaces Files Treemap. Flat and group-orbit
  layouts replace Comparison. Churn becomes the "Churn against health"
  perspective plus a Metrics plot preset.
- Authors: table primary, bars secondary, fixed period toggle; detail on
  `DetailFrame`.
- Groups: sidebar section listing saved groups with a Manage entry; choosing a
  group sets the scope chip that Metrics, Hotspots, Connections and Cycles
  honour. Remove the group Overview and Explorer pages. The manager keeps
  create, rename, members, colour, import and export.
- Overview: add the monthly additions and deletions bars, Java tiles when
  present, group count; Views section reflects the new map.

Stage 2 is also worth doing under "prune duplicates only".

### Stage 3: Cycles and Classes

- Cycles: components in a cycle become links; loading row for the per-edge
  queries; import locations inline in the inspector instead of a modal;
  `scope=component|group` from `ScopeBar`; the Diagnostics tab keeps the
  weakest-link logic.
- Classes: one class graph on a light canvas with role lanes, seed-and-expand
  (from Spring Beans), Top-N with debounce, and the path tracer as an inspector
  tab (from Class Connections). JPA entity list moves to the component and file
  Java tabs; OOP counts move to Metrics columns and Overview tiles. Delete
  `java/spring.vue`, `java/class-connections.vue`, `java/jpa.vue`,
  `java/oop.vue` (about 2,960 lines) for one view of roughly 900.

### Stage 4: Connections (the commitment point)

One view, four representations, three grains, three sources:

- Representations: **Grid** (Matrix), **Radial** (the bundling now called
  Chord), **Chord** (the real `d3.chord` now under Git Coupling), **Graph**
  (force layout from Group Coupling and Clustering).
- Grain: groups, components, files. Graph at group grain is Group Coupling;
  at file grain it is Files Dependencies with resolved imports.
- Grouping (Graph only): none, communities (Louvain, label propagation,
  connected components, in a worker), saved groups (collapsed, expandable).
- Source: static, git, combined, with the threshold sliders applied live and
  debounced, no Apply button.
- Inspector: selected node (metrics, neighbours as links, Open), selected edge
  (weights, member pairs, import locations), legend.

What it costs: Group Coupling's operation stack (expand, collapse, isolate,
hide, with reset-all) becomes ordinary graph controls with a visible filter
chip row and an undo of the last operation; Clustering's local cluster
overrides are persisted by saving them as groups, which is an improvement.
Roughly 5,900 lines of the current five views become one view of about 2,000
plus the worker.

If Ryan stops before Stage 4, the fallback is "prune duplicates": Git
Coupling folds into Chord as a source switch, Files Dependencies folds into
Group Coupling at file grain, and Matrix, Chord, Clustering and Group Coupling
stay as four sidebar entries on the shared frame with links to detail.

## 5. UX rules the builder must apply to every surviving view

- Toolbar left: title, counts in mono, `ScopeBar`. Toolbar right: search,
  view-specific actions, Configure, inspector toggle. Nothing else in the
  header.
- Inspector always present on visual views; tabs only when there are two or
  more. The single-tab rails go.
- Search placeholder names the grain ("Search components", "Search files").
  Search never re-runs SQL per keystroke; it filters loaded rows.
- Every canvas has `ZoomControls`, a loading state, an empty state with the
  reason ("No groups yet. Create one from any selection."), and a hover tooltip
  in the shared tooltip style.
- Health and hotspot colours come from `useHealth()` only; the heat ramp is the
  one DESIGN.md defines.
- Icons are Lucide through `Icon`; no emoji, no glyph characters, no inline SVG
  strings, no `v-html` icons.
- Names are honest: a view is called what it draws.
- Every view is judged on the 52-component Java snapshot in both appearances,
  not the one-component fixture.

## 6. Open decisions (not for the builder to invent)

1. **Commit to Stage 4?** Decide after seeing Stages 1 to 3 on real data.
2. **Activity as its own entry or folded into Overview?** Recommendation: fold
   into Overview if the heatmap plus monthly bars fit above the Views section
   without scrolling at 1280×800; otherwise keep the entry.
3. **SQL parameter binding in the Go query service.** Touches the app backend,
   not the engine; still ask before changing the binding signature.
4. **Where the Comparison force layout goes.** Recommendation: a "Group orbits"
   layout option in Hotspots; drop if it reads as a gimmick on real data.

## 7. Build log (2026-09-17)

- Stage 0: all thirteen fixes applied (authors period columns, plotter presets, git coupling labels, matrix in-place sort, table regex, timeline search, dead props, dead files). The two invalid SVG namespaces and the corrupt icon path went with the files they lived in.
- Stage 1: `DetailFrame`, `CommitHistory`, `PairTable`, `NeighbourList`, `ZoomControls`, `EmptyState`, `LoadingState`, `useAsyncQuery`, `useHealth`, `useBack`, `useFileRoute`, `sqlLiteral`, retokened `FileCodeViewer`. Component detail (Overview, Dependencies with the walk trail and hop depth, Files, History, Cycles, Java), file detail (Overview, Source, Imports, History, Java), author detail (Overview, Components, Files, History). Walker, CouplingFlow, CousinsDiagram, the three matrix pages and the per-component cycles fork are gone.
- Stage 2: `Metrics` (table and plot, component and file grain, 13 presets incl. churn against health), `Hotspots` (component, directory and file grain; packed and flat layouts; exact-id perspectives), `Authors` rebuilt, `Activity` page (whole-repo commit history with monthly bars), Overview gains monthly bars and Java figures, Groups section in the sidebar sets a scope that Metrics, Hotspots, Cycles and Classes honour. Comparison, Treemap, Churn, Timeline, Files Table, Components Table and Plotter are redirect stubs. Decision taken: Comparison's group-orbit layout was dropped (open decision 4); Activity stays a page (open decision 2) because the whole-repo commit list is worth a route of its own.
- Stage 3: `Cycles` reworked (links everywhere, two batched queries per cycle, inline import locations, scope, auto-selects the top cycle), `Classes` replaces Spring Beans, Class Connections, JPA and OOP (light graph with role lanes, Top-N and Explore modes, path tracer, `javaRelevance` with tests); the component and file Java tabs rebuilt on the system with three queries instead of N+1.
- Verified against the `eai-3540597-qp-common` snapshot in both appearances; 44 vitest tests; detector clean outside Stage 4 files; finish review at the end of the round.

## 8. Dependencies and order

Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4. Stages 2 and 3 can run in
parallel after Stage 1. `tasks/todo.md` T13 (parity sweep) is subsumed by the
per-stage capture rounds; T14 (purge dead code) is partly done by Stage 0.
