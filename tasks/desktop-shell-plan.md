# Desktop shell and Connections brief

Status: confirmed 2026-09-17. **Stage A (shell) built 2026-09-17, uncommitted on `shell/workspace-sidebar`; Stage B (Connections) not started.** Follows `views-plan.md`
(Stages 0–3 shipped) and commits to its Stage 4. Mode: Operate.

## 1. Job and audience

Engineers and architects opening a scanned snapshot on macOS first, Windows and
Linux second. They expect a document window that behaves like every other one
on their OS and tool windows that all read the same way.

## 2. Outcome and proof

- The window zooms, goes full screen, and its panes drag-resize.
- Every view shares one toolbar grammar, so a control learned in one view is
  found in the same place in the next.
- The six connection views (Matrix, Chord, Clustering, Git Coupling, Group
  Coupling, File Dependencies) become one Connections view with switches.

## 3. Direction

JetBrains New UI tool-window world from `DESIGN.md`, unchanged. Two additions:

**Shell.** macOS uses a hidden-inset title bar: traffic lights sit inside the
sidebar brand row, which becomes the drag region; the toolbar row is also
draggable (`--wails-draggable: drag`) except its controls. The window title
disappears, so the sidebar workspace row carries that identity. Windows and
Linux keep the native frame and get the same toolbar row underneath it.
Platform comes from the Wails runtime, not a user agent string.

**Toolbar grammar, fixed order, left to right:**
title and counts · scope chip | source switch · grain switch · representation
switch · view-specific switches … search · view actions · Configure · inspector
toggle. Switches are segmented controls; their state lives in the URL query so
back, forward, and links restore it. Panes: sidebar 200–360px, inspector
280–560px, both dragged by a hairline handle, widths remembered, double-click
resets.

**Connections.** One route `/views/connections` with `?rep=matrix|chord|graph`,
`?source=static|git|combined`, `?grain=group|component|file`, `?q`. One
inspector for all three representations: the same entity card (name linking to
detail, kind tag, StatStrip, PairTable of neighbours with Refs/Shared/Co-change),
plus a representation-specific legend tab only where one is needed. Selection
model is identical everywhere: click selects, hover previews, Esc clears,
Enter opens detail.

## 4. Scope and boundaries

- Stage A, shell: `main.go` Mac options (title bar, zoom fix already applied),
  `layouts/default.vue`, `NavBar.vue` brand row, `ViewWorkspaceLayout.vue`
  toolbar order and drag handles, a `PaneHandle` component and a `panes` store.
- Stage B, Connections: new page and `ConnectionsInspector`; the existing
  `ChordDiagram`, `MatrixDiagram`, `ClusteringDiagram` and the file force graph
  become representation renderers behind one props contract; `group-coupling.vue`
  (2,499 lines) is mined for its group-grain logic and deleted; the six routes
  become redirect stubs; sidebar becomes Components: Metrics, Hotspots,
  Connections, Cycles · Git: Authors, Activity · Java: Classes. The Files
  section goes, because file grain lives inside Connections and Hotspots.
- Untouched: Go services beyond window options, detail pages, Metrics,
  Hotspots, Cycles, tokens.
- Anti-goals: frameless windows, custom window controls, native NSToolbar
  (Wails v2 cannot), any new colour outside the ramps.

## 5. States and ranges

Typical snapshot 52 components, 611 files. Must hold to about 500 components
and 5,000 files. Chord caps at 120 nodes and Matrix at 400 rows; past the cap
the view shows an empty state asking for a scope (group or search) instead of
rendering. Graph at file grain always starts scoped to the selected component.
Git source with no history shows the shared "No git history" empty state.

## 6. Interaction and layout

Toolbar 40px, one row, never wraps: below 1100px the view-specific switches
collapse into Configure. Inspector default 340px. Diagrams refit on pane and
window resize with a 100ms debounce. Zoom controls bottom-right of the
visualizer, as in Cycles and Hotspots.

## 7. Constraints and open decisions

- Wails v2.12: `mac.Options{TitleBar: mac.TitleBarHiddenInset()}`; hidden
  title bar means the drag region must be explicit or the window cannot move.
- Tests: URL state round-trip for the switches, panes store persistence,
  representation cap logic.
- Budget: Sonnet builders, `npm run check` before captures, one capture per
  representation in one scheme, one reviewer pass at the end of Stage B only.

Open, asserted unless corrected:
1. Files sidebar section is removed (file grain inside Connections).
2. Group Coupling keeps only its group-grain matrix and pair inspector; its
   other modes are dropped.
3. Windows and Linux keep the native title bar; no custom chrome there.

## 8. Build log

**Stage A, 2026-09-17.** `main.go` gets `Mac: &mac.Options{TitleBar: mac.TitleBarHiddenInset()}`
(the missing Mac block was why the green button was disabled). New
`composables/usePlatform.ts` (Wails runtime first, navigator fallback, sets
`data-platform` on `<html>`), `stores/panes.ts` (+ test; sidebar 200–360 default
240, inspector 280–560 with `null` = the view's suggested width; persisted in
`archstats.panes`; pane changes fire a debounced synthetic `resize`),
`components/shell/PaneHandle.vue` (pointer capture, arrows, double-click or
Enter resets). `layouts/default.vue` hosts the sidebar handle and, on macOS, an
80px collapsed rail with a 52px drag band under the traffic lights. `NavBar.vue`
brand row is the macOS drag region (52px tall, 80px left inset). `.drag-region`
in `index.css` sets `--wails-draggable` and opts controls out.
`ViewWorkspaceLayout.vue` toolbar order is fixed: title · counts · ScopeBar |
`#switches` … search · `#actions` · Configure · inspector toggle; below 1100px
the switches render inside Configure. Metrics, Hotspots, Cycles, Classes and
Authors moved their segmented controls to `#switches` and dropped their own
ScopeBar. `DetailFrame.vue` header is a drag region too. Stage 4 files still use
`#actions` for switches until Stage B replaces them.

Not verifiable headlessly: traffic-light alignment against the 52px brand row,
window dragging from the toolbar, and the zoom button. Check in the live app.

## 9. Stage B builder contract

Route `frontend/src/pages/views/connections.vue`, query state `rep`, `source`,
`grain`, `q`, `sel` (defaults matrix · static · component). One model feeds
three renderers:

```ts
type Grain = "group" | "component" | "file"
type Source = "static" | "git" | "combined"
type Rep = "matrix" | "chord" | "graph"
interface CNode { id: string; label: string; kind: Grain; group?: string; community?: number; lines?: number; files?: number; health?: number; hotspot?: number }
interface CEdge { from: string; to: string; references: number; sharedCommits: number; weight: number }  // weight 0–1 by source
```

Data (all through `store.query`, escaped with `utils/sql.ts`):
- component static: `component_connections_direct` grouped by (`from`,`to`), `sum(reference_count)`.
- component git: `git_component_shared_commits` (`pair_1`,`pair_2`,`shared_commits`), undirected.
- component nodes: `components` (name, lines, file count, health and hotspot via `useHealth`), `component_communities.community_nr` for Graph colouring.
- file static: the import-resolution logic in `pages/views/files/dependencies.vue` extracted to `utils/fileImports.ts` (snippets table, `snippet_type LIKE '%import%'`).
- file git: `file_matrix.git_co_changes` where > 0.
- group grain: aggregate component edges by membership from `useGroupsStore`; fewer than two groups shows an empty state linking to the Groups manager.
- combined: edges in either source, `weight = 0.5·refs/maxRefs + 0.5·shared/maxShared`.
- scope store applies to component and file grains.

Renderers, one props contract `{ nodes, edges, selected, hovered, theme }`,
emitting `select(id | [from,to] | null)` and `hover(id | null)`:
- `ConnectionsMatrix.vue`: DSM, sticky row and column headers, cells on the blue data ramp by weight, ordered by group then name, header click selects a node, cell click selects a pair. Cap 400 nodes.
- `ConnectionsChord.vue`: `d3.chord` ribbons for every source (no hierarchical bundling); labels around the ring, hover dims others. Cap 120 nodes.
- `ConnectionsGraph.vue`: d3-force, nodes coloured by community (component grain) or by component (file grain), ZoomControls bottom-right, fit on resize (100 ms debounce, listen to `resize`).
Past a cap: `EmptyState` "Too many components to draw as a chord. Scope to a group or search to narrow it." with search still live.

Selection model everywhere: click selects, hover previews, Esc clears, Enter
opens detail (component → `/views/components/<name>`, file → `/views/files/<path>`,
group → set scope and go to Metrics).

Inspector (`ConnectionsInspector.vue`), one tab unless a legend is needed:
name linking to detail, `ui-tag` kind, `StatStrip`, `PairTable` of neighbours
with Refs, Shared, Co-change, sorted by weight; pair selection shows both
entities and the pair's numbers. Empty inspector text: "Click a node or a cell
to inspect it."

Retire: `components/matrix.vue`, `chord.vue`, `clustering.vue`,
`group-coupling.vue`, `git/coupling.vue`, `files/dependencies.vue` become
redirect stubs to `/views/connections?…`; delete `ChordDiagram.vue`,
`ClusteringDiagram.vue`, `ComponentMatrix.vue`, `CouplingDetailsModal.vue` and
any component only they used (check with grep first). Sidebar: Components
Metrics · Hotspots · Connections · Cycles; Git Authors · Activity; Java Classes;
the Files section goes. `pages/index.vue` lists Connections once under
Components (thumbnail `public/img/views/connections.png` + `-dark`), and drops
Matrix, Chord, Clustering, Git Coupling and File Dependencies. Add tests for
the URL state round-trip and the combined-weight maths.

## 10. Direction update 2026-09-17: Graph is the coupling view, clusters are gone

Ryan: bring back the coupling view as it was, merged with Group Coupling and
Clustering; separate "clusters" are unintuitive. Consequences, sent to the
Stage B builder: Graph is the default representation; nodes colour by group,
never by community; the only trace of Louvain communities is a "Suggest groups"
action that draws dashed hulls the user can accept into real groups; group
nodes expand and collapse in place; shift-drag lasso selects in the graph.

## 11. Stage C: selection → group, everywhere (not started)

Rule for every view that lists or draws components or files: the same
selection model and the same tray.

- Select: click, shift-click range or toggle, cmd/ctrl-click toggle, shift-drag
  lasso on canvases, checkbox column in tables, Esc clears.
- Tray: one `SelectionTray` (evolves `GroupActionBar`) docked bottom-centre of
  the visualizer: "N components selected" · **Create group** (primary; inline
  name field prefilled "Group N", Enter commits) · "Add to ▾" (existing groups)
  · "Scope" · Clear. Keyboard: cmd/ctrl+G creates a group from the selection.
- Feedback: the new group appears in the sidebar Groups section immediately
  with its colour, and the selected items recolour to it in place.
- Surfaces: Metrics (rows), Hotspots (cells), Cycles (nodes and "Save cycle as
  group"), Connections (all three representations), Classes (component of the
  class), component detail Dependencies tab (neighbour rows), author detail
  Components tab. `useSelection(type)` composable owns the set; views only
  render it.

**Stage B, 2026-09-17.** Built in the main session (a Sonnet draft was stopped
and replaced; only `utils/connections.ts` and `utils/fileImports.ts` survived
after a line-by-line review and edits). New: `pages/views/connections.vue`,
`composables/useConnectionsModel.ts` (raw rows cached per grain; source, scope,
search, hidden set and group expansion are synchronous derivations),
`components/connections/{ConnectionsGraph,ConnectionsMatrix,ConnectionsChord,
ConnectionsInspector}.vue`. Graph is the default representation; group hulls,
dashed suggestion hulls with Accept, shift-drag lasso, drag, fit, zoom
controls, arrowheads on static edges. Matrix: sticky headers, blue ramp by
weight, cap 200. Chord: `d3.chord`/`chordDirected`, cap 120. Selection model
everywhere: click, shift/cmd-click, Esc, Enter opens detail, cmd/ctrl+G creates
a group from the selection, right-click menu (create group, add to group,
select all in group, expand/collapse, scope, hide, open detail). Six old views
are redirect stubs; ChordDiagram, ClusteringDiagram, ComponentMatrix,
CouplingDetailsModal, the walker/cousins/comparison/info-list/coupling
component folders, `utils/clustering.ts` and `useGroupOverlay.ts` are deleted.
Sidebar: Components Metrics · Hotspots · Connections · Cycles; Git Authors ·
Activity; Java Classes. Pages: 43 files, 5,879 lines (from 48 / 19,986 at the
start of the programme). Verified by a Sonnet browser-driving pass; see §12.

## 12. Verification and Stage C progress, 2026-09-17 (night)

Sonnet browser pass on Connections (11 steps): all visual steps passed; two
real bugs found and fixed: first shift-click undercounted (the plain-clicked
node now seeds the multi-selection) and the tray rendered an unimported Icon.
Main-session captures then showed the graph fitting small because unconnected
components drifted to the corners: isolated nodes now sit faded on an outer
ring (`forceRadial`), and the fit fills the pane. Expanding a selected group
clears the selection; collapsing re-selects it; the count label reads "Nodes"
at mixed grain.

Toolbar folding is no longer a window-width guess. `ViewWorkspaceLayout`
measures the row and gives ground in order: search shrinks to an icon, counts
hide, switches fold into Configure. At the default 1280×800 window Connections
keeps all three switch groups on one row.

Stage C started. `GroupActionBar.vue` rewritten as the shared tray: "N
components selected" · **Create group** (inline name prefilled "Group N",
Enter creates, Esc cancels, ⌘G / Ctrl+G opens it) · Add to ▾ · Remove from
groups (when applicable) · clear. `defineExpose({ startCreate })` lets a view
(Connections' context menu, ⌘G on a single selection) hand a selection to the
tray. Wired in Connections (all representations), Metrics (checkbox rows) and
Hotspots (treemap shift-click and drag selection; not at directory grain).
Later the same night: Cycles' "Save cycle as group" now hands the cycle's
nodes to the tray with "Cycle N" prefilled (`startCreate(name?)`);
`CreateGroupModal.vue` is deleted. The component detail Dependencies tab
supports shift/cmd-click on neighbour rows and pair-table rows with the same
tray. The tray has no transform on its host, so its "Add to" click-away
backdrop covers the viewport; `create()` resets state in a `finally` so a
store error can never leave it in naming mode. Still open for Stage C: the
Java Classes view (classes are not groupable as such; a "group the files of
the selected classes" action is the candidate) and author detail tabs.

## 13. Stage D, 2026-09-18: dimensions, the tree, cycles in place

Ryan's morning critique: nodes belong to more than one group (a controller
that is also part of Audits); Groups / Components / Files is a hierarchy, not
three views; cycles should be visible while drilling down. Decisions: named
dimensions; presets plus per-node open/close; cycles hidden, all, or only
through the selection.

Built:
- `stores/groups.ts`: `SavedGroup.dimension` (default "Groups", normalised on
  load), `dimensions`, `componentDimensions`, `groupsByDimension`,
  `createGroup(type, name, members, dimension)`.
- `stores/scope.ts`: many groups; union inside a dimension, intersection
  across ("Audits or Shipments and Controllers"). `ScopeBar` renders "or" /
  "and" between chips; the sidebar buckets groups by dimension; the tray's
  naming mode has a dimension select with "New dimension…"; the Groups
  manager edits a group's dimension.
- `utils/connections.ts`: URL state `level`, `by`, `color`, `cycles` (old
  `grain` links still resolve); `buildTreeNodes`, `treeResolver`,
  `presetOpenIds`, `levelOf`; `reindexEdges(…, directed)`; Tarjan
  `stronglyConnectedSets`, `cycleEdgeKeys`, `edgeKey`; cycle selection
  `cycle:<member>`.
- `useConnectionsModel`: one tree (roll-up groups ⊃ components ⊃ files) opened
  per node; file rows load only once a component is open, and then carry the
  whole edge picture; colour dimension separate from roll-up; cycle sets at the
  current level, marked keys by mode, badges for cycles folded inside closed
  groups, hulls for open roll-up groups.
- `connections.vue`: Level menu (roll up by, colour by, open everything to),
  Cycles menu (hidden / all / only through the selection, count of nodes in
  cycles), double-click opens a node one level, menu closes it; Enter opens
  detail; inspector shows one chip per dimension, an "In a cycle with N
  others" section with "Show the cycle", and a cycle card listing members
  with "Open in Cycles".
- Renderers: graph tints cycle edges softly in all-mode (loop markers only on
  mutual pairs) and strongly for one chosen cycle; badges on closed groups;
  hulls from the roll-up dimension. Matrix outlines cycle cells and reddens
  cycle headers, with badges on closed rows. Chord paints cycle ribbons red.

Open: the Groups manager's create form still uses the default dimension;
file-level cycles inside a closed component are not counted (needs file rows).

## 14. Stage E, 2026-09-18: Classes beyond Spring, lanes that hold, a real explorer

Ryan's brief: frameworks other than Spring (JEE, Apache Beam, …) in CLI and
UI; "Services & Other"; nodes bounded by their lane; the next layer without
overload; Explore by default with a proper seed selector.

- **Engine** (archstats repo, `extensions/treesitter/java/java.go`):
  `javaFrameworkFactQueries()` emits neutral snippets per type:
  `java__class__annotation`, `java__class__extends`, `java__class__implements`
  (content = simple name, scoped and generic types unwrapped). Fixture
  `TestFramework.java` and `TestFrameworkFacts` cover annotations on class /
  interface / record / enum, generic superclass, scoped interfaces. Existing
  snapshots keep working through the legacy Spring/JPA snippet types.
- **`utils/javaFrameworks.ts`**: profiles Spring (Controllers · Services &
  Other · Repositories · Entities), Jakarta EE (Endpoints · Beans & Other ·
  Messaging · Repositories · Entities), Apache Beam (Pipelines & Options ·
  Transforms · DoFns · IO & Coders · Other) and By naming (Entry points ·
  Logic & Other · Data access · Models). `detectFramework` votes per class,
  generic below three votes; `classify` is structure first, naming second,
  fallback last. Tested.
- **`utils/javaRelevance.ts`**: `via`, `hub` (in-degree ≥ 12), `test`;
  same-component ×1.25, one-lane-away ×1.15, tests ×0.3 unless exploring tests.
- **`ClassGraph.vue`**: lanes from `laneDefs`, evenly spaced; nodes pulled to
  the lane centre and clamped inside the lane on every tick.
- **`SeedPicker.vue`**: palette with search, lane and component filters,
  suggested sections (Recent seeds, first lane, Most connected), keyboard
  (↑↓, Space, Enter, Esc), footer chips, "Start exploring".
- **`classes.vue`**: Explore is the default (`?mode=top` for Top N); Configure
  has a Framework select (Auto · detected, or any profile; `?fw=`); toolbar
  "Seeds"; the Explore tab shows Explored with lane chips, a filter past
  twelve and a 30-row cap, and Next layer as the strongest dozen with "via
  <class>", relevance bars, + per row, "Add top 5", and weak / hub / test
  classes folded behind counts.

**Stage E follow-up, 2026-09-18.** Ryan: classes from the previous workspace
stayed on screen after switching; "by naming" is hit or miss; support the top
Java frameworks. Fixes: `data.datasetKey` (the open scan id) is watched by
`useAsyncQuery`, the Classes, Connections, Overview and Summary views, so a
snapshot swapped for another without `hasData` reading false in between still
reloads and resets picks; the Classes view also prunes explored ids that the
new class map does not know. The registry now has Spring, Jakarta EE, Quarkus,
Micronaut, Vert.x, Dropwizard, Android, Apache Beam and "By structure";
detection is by imports first (distinctive imports such as `io.quarkus` are
weighted over the shared Jakarta standard), and classification runs facts →
imports → structural rules (main method, in/out-degree, records, field-to-
method ratio) → naming → fallback. The class loader also reads imports, main
methods, record and interface declarations, and field and method counts.

**Framework confidence, 2026-09-18.** Ryan: Elepy (a framework itself, built on
CDI) was read as Jakarta EE; when the UI is not sure it should ask. Detection
signals are now graded: strong (web, boot, runtime packages; stereotypes;
supertypes) versus weak (CDI, injection, validation, JPA). A verdict is
confident only with strong evidence in three or more classes, a noticeable
share of the codebase, and a clear lead over the runner-up on strong votes;
Jakarta EE is demoted whenever Quarkus, Micronaut or Dropwizard show strong
evidence. Unsure means lanes by structure plus a prompt at the top of the
Classes view listing the candidates with their counts and the reason in one
sentence; the answer is remembered per workspace and editable in Configure,
which also shows the reason and per-profile counts. `detectFramework` returns
`{ id, confident, candidates, total, reason }`; tests cover the Elepy case.

**One group concept, 2026-09-18.** Ryan: merge file groups and component
groups, tie the Java views into groups, and make grouping a set of classes
quick. Decisions: mixed membership (a group holds whole components next to
single files; a class is its file); lanes become a dimension on request, not
live; unify first, Classes tray and lasso next. Done in this stage: the groups
store keeps one list with typed members `{ kind: 'component' | 'file', name }`,
persisted as `{ version: 2, groups }` and migrated from the old two-list shape
on load; every reader resolves through `filesOf`, `componentsOf` (with a
`Coverage` of files / total / full), `componentGroupIndex` and
`fileGroupIndex` (whole or partial inclusion) or `directGroupsOf` (what the
tray removes). Scope resolves the same way, so a class group scopes every
component view to the components those classes live in and every file view to
exactly those files. Connections rolls a partially held component into the
group holding most of its files and shows "K of N files" on membership chips
and in the group card; the tray takes a `kind` and lists every group by
dimension under "Add to". The manager is rewritten on the design vocabulary:
one list by dimension, one create form with a dimension, a members tree
(component rows noting "all N files" or "K of N files" with the files nested)
and one search that adds components or files. Open: the Classes view still
saves the explored set through its own button; the tray, shift-click and lasso
in that view are the next stage.

**Smarter suggestions, 2026-09-18.** Ryan: "Suggest groups" should be a lot
smarter, a penalty/boost system that also reads the files inside components,
tweakable with presets, aware of vertical versus horizontal slicing.
Decisions: the affinity engine runs in the frontend from tables already in
the snapshot; file-level splitting ships in the first version; all five
presets ship. Built: `utils/suggest.ts` turns the snapshot into units
(components, or files when splitting) and candidate pairs carrying nine
normalised signals: references, co-change, shared domain types (files
importing the same entity or model classes), rare name tokens (idf-weighted),
package proximity, same lane (framework role; cosine of lane profiles at
component grain), same depth (longest path from the entry points over the
condensed graph), cycles, and same authors. A preset is a cut plus weights
from strong penalty to strong boost, a granularity, a minimum size, whether
shared hubs get their own group, whether components may be split, and the
dimension to land in. Vertical cuts cluster the weighted graph with a
deterministic Louvain (`utils/louvain.ts`, resolution from granularity);
horizontal cuts band units by lane or depth. Files roll up to components: a
component with 80 percent or more of its files in one cluster joins whole,
otherwise it splits into parts, which the unified group model stores as
mixed members. Every suggestion carries its top three reasons with real
numbers, a name from its rarest common token, lane, or top author, and
"K split" when components are only partly in. `useSuggestModel` loads the
tables once per snapshot (imports, class facts and lanes through the shared
`utils/javaFacts.ts` loader, authors per file) and caches the pair signals
per grain, so dragging a dial costs one clustering pass. `SuggestPanel.vue`
holds the dials: presets, dimension, cut, granularity, minimum, two toggles,
the signal rows, "Save as preset" (custom presets persist globally, the last
dials per workspace) and Clear. Dashed hulls show name, count, split count
and the strongest reason; the banner names the dimension and accepts all.
The engine's community numbers are no longer used anywhere.

**Suggestions, second pass, 2026-09-18.** Ryan: suggested groups are hard to
read on the graph, sizes are unbalanced (Elepy by domain gave three "auth"
groups), and the panel is daunting. Done: suggested hulls now pull their
members together twice as hard as open groups and hull centres keep their
distance, so each dashed region has its own ground; hovering a hull label or
a list row lights that group's members and fades everything else. The
inspector gains a Suggestions tab while outlines are on screen (opened
automatically) listing each suggestion with its reasons, an expandable member
tree ("all N files" / "K of N files" with the files), Accept, drop and
Accept all. The engine balances: a cluster several times the median is cut
again on its own edges at a finer resolution, clusters under half the median
fold into their best-connected neighbour, and clusters that would carry the
same rare name merge into one, so one domain is one group. The panel's
everyday surface is one choice (a radio list of presets with their cut and
hint), one field (dimension) and one slider (how fine); Fine-tune folds away
the method, smallest group, balance, split and shared toggles, the signal
weights and Save as preset. The footer accepts all or clears.

**Draft builder, 2026-09-18.** Ryan: the suggestion view should be a group
builder: rename, move components and files between groups, add a group,
reshuffle around the current groups. Decisions: one editing surface that
also loads existing dimensions; reshuffle honours locks; moves by drag and
by menu. Built: `stores/draft.ts` holds a draft of one dimension (groups
with parts, locks, reasons, the saved group each came from), session-local
per workspace. Suggest fills it (`fromSuggestions`, keeping locks and edits
by key), "Or edit what you have" loads a saved dimension (`fromDimension`),
and `commit` creates or updates the groups and deletes dropped ones in one
step; `commitGroup` saves one. `move(component, files | null, to | null)`
is the single edit primitive: whole moves, file moves that split a
component, and a component that gets all its files back becomes whole
again. Louvain now takes a starting partition and frozen nodes; `suggest`
takes `Constraints` (placed units, locked keys, names): locked groups keep
their members and names, other groups seed the clustering, and balancing
never splits, folds or merges a frozen cluster. `placeRest` puts every
unplaced unit with the group it has the strongest affinity to, with the
signal as the reason. `DraftBuilder.vue` is the Draft tab: dimension input,
status, Save dimension / Reshuffle / Place the rest / New group / Discard,
group rows with lock, inline rename, drop, reasons, expandable parts with
files, drag and drop between groups and out to Not placed, a Move-to menu
on every row (`MoveMenu.vue`), and a Not placed section with closest-group
hints. On the graph a node dragged into another dashed region moves into
that group; hull labels show a lock mark and Save. Live re-suggest stops
once the draft is edited; Reshuffle applies the dials again. Names never
use a word most of the codebase carries, and the loader re-reads the
snapshot key after a workspace switch.

**Dimensions as a first-class concept, 2026-09-18.** Ryan: dimensions are
not first class; the UX between suggesting, drafting and groups feels
scattered. Decisions: a global lens per workspace that views may override,
cross-cut cells show coupling, sidebar and lens first then cross-cut; then
the full restructure with the builder in the Connections inspector. Built:
`stores/lens.ts` (the active dimension per workspace, falling back to the
first one). The sidebar section is now Dimensions: one row per dimension
with an eye mark for the lens, coverage "41/47", Edit and a menu (edit,
rename, delete; deleting moves groups to the default dimension), a plus for
a new one, and the groups folded under each as scope toggles. Connections
rolls up and colours by the lens unless the URL says otherwise; Metrics,
Hotspots and Cycles legend and colour by the lens (other dimensions stay
hidden from the marks); Classes gets Colour by the lens and "Lanes →
dimension", which saves every lane as a file group in Layer. The Suggest
toolbar popover and the banner over the graph are gone: the builder is the
one place a dimension is made or changed. Its first step is Start from
(`SuggestDials.vue`: presets, saved presets, Empty, Copy of…, How fine,
Fine-tune), open while the draft is empty and folded once it has groups;
the head reads "<name> · draft" or "· editing" with one Save. The sidebar
opens the builder through `?build=new` or `?build=<dimension>`. Cross-cut
is the fourth representation (`utils/crosscut.ts`,
`ConnectionsCrosscut.vue`, `CrosscutInspector.vue`): rows by the roll-up
dimension, columns by another (`x` in the URL), cells count files, coupling
exchanged with other cells (in and out for static), or cycles touching them
(`measure`); hovering tints partner cells; a last row and column collect
what neither dimension covers; the inspector shows the cell's numbers, the
cells it talks to, its components, Scope views and Open in graph. The
Groups manager no longer edits membership; it points to the builder. Fixed:
a suggestion run that began before a workspace switch could land in the new
workspace's draft; runs are now discarded when the snapshot or workspace
changed underneath them.

**Critique follow-up, 2026-09-18.** A dual-agent critique of building and
managing dimensions scored 26/40 and named the root: the dimension was a
string on each group, the default was the feature's own name, and shortcuts
bypassed the builder. Done (P0 and P1): dimensions are records
(`Dimension { name, cut, order, hue, description }`) stored as version 3
next to the groups; every dimension a group names exists as a record, empty
dimensions still show, rename onto an existing name merges, delete removes
the dimension and its groups (inline confirm in the sidebar row, inline
rename too, no browser dialogs). The legacy "Groups" default migrated to
"Ad hoc"; the tray and the Custom preset land in the lens dimension, "Ad hoc"
only when nothing exists. Colours are per dimension: each record has a hue
offset and the next colour walks the palette from there, so two dimensions
side by side in the cross-cut start on different hues. The draft carries the
preset's cut and records it on the saved dimension; saving makes the
dimension the lens, the sidebar row flashes "Saved Domain · 8 groups" for a
moment and scrolls into view. "Lanes → dimension" now fills a Layer draft
(one group per lane, whole components where a lane holds all their files)
and opens the builder; the explored set in Classes goes through the same
tray as every other selection ("Create group…" with a name and dimension).
The manager shows an import error instead of logging it. Left for a later
pass (P2): the 12px floor, leading and type-scale findings from the
detector.

**Telling the kinds apart, 2026-09-18.** Ryan, looking at a mixed level in
Connections: files, components and groups were indistinguishable. They were
all the same circle, and colour was already spent on the dimension, so kind
had no encoding at all. Now the mark carries it: a group is a rounded box
filled at a quarter opacity with a 2px stroke in its colour, a component a
filled disc with a surface ring, a file a hollow ring filled with the page
ground. Three size bands (group from 17, component from 7.5 to 26, file from
4 to 15) keep them apart at a glance, and a group also grows with how many
files it holds. Labels speak per kind: sans semibold and always visible for
a group, mono for a component, smaller and quieter mono for a file. A key in
the corner of the canvas names the marks, showing only the kinds on screen,
and the node tooltip ends with the kind word. The Matrix row headers carry
the same three glyphs. Fixed alongside: reopening the builder on an empty
draft never re-ran the suggestion (the dials only announce themselves when
they mount), which left a large workspace sitting at "0 groups · N not
placed".

**The inspector earns its width, 2026-09-18.** Ryan: the Connections sidebar
looked useless next to what it could say about a group, a component or a
file. It showed four bare numbers and one flat, paginated list of every
connection, with no direction and nothing about contents. Now a selected node
answers three questions in order. What is this: the kind mark, the name, the
dimension chips. How big, in context: the same headline numbers, under them
"1% of the 411,889 lines in view · 15th largest of 448 components". What is
inside: the eight hottest files of a component (or the largest components of
a group) with a lines bar and a health dot, the count, and the way in; one
small query per selection. How it sits: the connections split into Depends on
and Used by, each ranked by references with a weight bar, the partner's own
kind mark, and cycle partners drawn in red; a two-colour bar and one sentence
read the balance ("Mostly depended on. Changes here ripple outward"). The
cycle block now says how much of the node is in the loop: "18 of its 23
connections stay inside the loop. Those are the edges to cut." `KindMark.vue`
carries the Kind Rule into HTML so the inspector, the cycle list, the pair
card and the Matrix headers all draw a group, a component and a file the same
way.

**Names focus in place, 2026-09-18.** Ryan: clicking a link in the inspector
left the graph for the component or file page. Now every name in the panel
points back into the picture. Clicking one opens whatever holds it (a group,
then the component), selects it, and centres it: `focusNode` on the graph
waits for the layout to place a node that was only just revealed, then eases
the viewport to it without pulling back from a framing the architect chose;
the Matrix scrolls the row into view instead. The node's own name re-centres
it, and the detail page moved to a small external-link control beside the
kind tag, so leaving is deliberate rather than accidental.

**Cycles say how to break them, 2026-09-18.** Ryan: the cycle card, and cycle
information in general, could be much better. It read "Cut one edge inside to
break it" and then listed names, never saying which edge. Now
`feedbackEdges` in `utils/connections.ts` runs a weighted greedy feedback arc
set (Eades, Lin and Smyth) over the subgraph the members induce, preferring
light edges, and returns the ones pointing backwards in that order: a set
whose removal provably leaves nothing circular, which a test asserts by
re-running Tarjan on the remainder. The card now opens with what is caught
(members, edges inside, lines caught, cuts needed), then "Cheapest way out"
listing those edges lightest first, each one selecting that pair so the graph
marks it; then the members ranked by their in and out degree inside the loop.
Both lists cap with a "Show all" so a 179-member tangle stays readable, and
the copy adapts: one edge reads "Reverse or remove it and the loop is gone",
191 reads "191 edges hold this loop shut, 907 references in all. The lightest
are below." The pair card gained direction: "depends on · 1 reference" and
"and back · 4 references", with a line naming a mutual pair as a cycle of its
own, which also removes the mismatch between a cut's cost and the pair total.

**The dimension studio, 2026-09-18.** Ryan: building a dimension was neither
clear nor fast, and the suggested groups were sometimes plain wrong. The
answer was to stop partitioning and start sorting. `/views/dimensions` is a
surface of its own: the groups rail on the left with a number key each and a
coverage bar, the map in the middle, and the work panel on the right. Sort
asks one question at a time about the largest unsorted bundle, where a bundle
is a set of package siblings, so one answer places several components at once;
the engine's guess sits under Enter and every group is one number key away,
with Later and Not in this cut as first-class answers so nothing stalls. Grow
is seed and expand for one group: strongest neighbours with their reason, a
refusal remembered for good. Grab takes what you already know through a
search or the package tree, any size in one act. `utils/studio.ts` holds the
engine: an affinity index over the suggester's signals, bundling by shared
package with a cut when a bundle is too big to judge, closest-group by
density rather than raw sum so a large group cannot swallow everything,
candidate ranking minus refusals, and the unplaced pool as a collapsed tree.
The draft store gained standing (proposed against confirmed), the Later and
Out piles, per-group refusals and an undo stack; a preset run now only ever
proposes, and "Propose a first pass" fills ghosts you sweep with the same
keys. Measured on BroadleafCommerce: four keystrokes produced Common, Catalog,
Order and Offer, correctly named from their packages, covering 49 of 454
components.

**The studio, second pass, 2026-09-18.** Five things the first pass begged for.
The level delimiter is now read off the names rather than assumed: `pathStyle`
detects `.`, `\`, `/` or `::` and every prefix comparison runs level by level,
so PHP namespaces, file trees and Rust paths bundle, name and take correctly,
and `core.orders` is no longer swept up by a take on `core.order`. Grab's search
keeps the tree: matches come back as branches with their counts, so "controller"
across five domains is five takeable branches instead of one flat list of forty.
The three ways to work became the sidebar's own tabs — Sort, Grow, Grab, each
with a line saying what it is for, Tab cycling between them — instead of an
unlabelled segmented control. Sort gained the rest of its potential: the guess
now comes with its runners-up and their reasons, the queue says how many
questions are left and names the next three, a question too coarse to answer
can be split into its branches (S), one that needs thinking about can be skipped
to the back (→), and the rail reports lines covered as well as components, since
a third of the components can be a twentieth of the code. And the map became the
fourth way in: shift-drag a box or shift-click nodes, and a bar appears over the
graph carrying every answer — any group by name or number, a new group named
after what the selection shares, later, out — plus drag a node onto a group's
hull to move it there.

**Ways of cutting, 2026-09-18.** Sort and Grow both leaned on a single blend of
signals that added up to a domain cut, so any other kind of dimension was being
built against the grain. The way is now chosen first, in the toolbar, and three
things follow from it: what a question is, what "close" means, and which preset
a first pass runs. Domain bundles package siblings as before. Layer bundles by
the framework role when the lanes are known, else by the word that recurs across
packages — scored by spread weighted by rarity, so a root package token cannot
crown itself — else by distance from the entry points, and its weights push
references apart rather than together, because a controller and its service
belong to different layers. Ownership bundles by the hands in the commit
history, Change by strongest tie under co-change weights with clusters capped so
one question stays answerable. Each way reports what it will actually go on in
this snapshot, and one that has no basis is offered disabled with the reason.
Verification on Broadleaf then showed the first version picking the lane basis
and putting 429 of 454 components in one bundle called "Services & Other",
because almost nothing there carries a framework role. Bases are no longer tried
in a fixed order: each is scored on how evenly it divides the pool, how much of
it it can speak for, and whether its groups have real names, so a degenerate
lane basis loses to the shared word, and depth has to divide distinctly better
before numbered groups beat named ones. Three defects found in verification were
fixed alongside: nodes now carry an
invisible hit target that stays ten screen pixels wide at any zoom, since the
painted disc was too small to shift-click in a 454-node graph, and a drag onto a
draft group's hull now lands (it had only ever been wired to suggestion hulls).
Grow's rows were rebuilt to lead with the tail of a name and carry the path
quietly behind it, clipped from the left so the informative end survives. The
way picker's sheet is hung off the body: the toolbar clips its overflow, which
had made the whole control invisible.


**Two modes, and a lap, 2026-09-18.** Grow was a transpose of Sort, not a
different job: Sort walks the unplaced and routes each to a group, Grow fixes a
group and walks its neighbourhood. Making that a third tab left a group with no
home of its own, which is why it could not be renamed or deleted. Grow is now
what a group *is*: click one in the rail and the sidebar drills into its name,
its members, and what wants in next, with rename and delete on the row and in
the panel, and Esc to come back. Two tabs remain, Sort and Grab. Skip went the
same way — it and Later both meant "not now", so Later is the only deferral, and
it is a lap rather than a pile: what is set aside comes round again once
everything else is placed, unless nothing has landed since, in which case the
card offers to bring it back rather than handing over the same question. The
queue also re-aims after every placement, leaning towards whatever leans towards
the group just added to. Four bugs went with it: Grab was disabled until a group
existed (a take now starts one named after what was taken), a flat package of
forty siblings was being cut into forty questions of one, `fromSuggestions` and
`rename` could both mint duplicate names, and deleting a group took no undo
snapshot. Verification then caught a fifth: a take of one branch was named after
the package above it, because the shared-name rule compared parents and the
branch node was itself in the take.

**Bonds, 2026-09-19.** "Strongly related" meant "at least half of whatever the
top candidate scored", which says nothing when the top candidate is weak, and
the score behind it was a plain weighted sum of pair values: no hub penalty, no
transitivity, co-change as a raw log-scaled count. `utils/bond.ts` replaces it,
following the Classes explorer's relevance engine. Every count is divided by the
geometric mean of both ends' totals, so a component's *share* of coupling counts
rather than its volume; static coupling, co-change and kinship are scored as
separate channels, weighted by the way being cut by and reported individually;
one hop counts at half weight through the strongest go-between; and hubs are
shaved by the log of their degree. Bands are now measured against the group's own
cohesion — the median bond among its members — so "strongly related" means "binds
about as hard as this group already binds to itself", with an honest fallback
while a group is still one component. The guess under Enter runs the same engine,
because two scorers would eventually disagree in front of the user. Along the way
the suggester stopped assuming the JVM: `::` reads as a namespace separator, the
pair key no longer uses `::` as its own delimiter, and file extensions are
filtered as name tokens — the old strip ran after the split and so never matched,
which left every PHP file "sharing a name" with every other one. Verification
also found d3 reading the svg's own width attribute for its zoom extent, which
throws whenever the pane is not rendered, and the lap counter living in the view
rather than the draft, so it reset on reload.


**Proximity, 2026-09-19.** A group called Storage — s3, gcp, firebase, mongo,
uploads — reported twenty-four components as "strongly related", which was every
component in the codebase, each explained with the same sentence. The cause was
`path`, scored as shared segments over the longer name: in a single-root codebase
every pair shares `com.elepy`, so every pair scored around 0.6 for proximity and
kinship swamped the rest. Proximity is now information: each prefix is weighted
by how much it narrows the pool down (-log of the share of units under it), and
the total is measured against a prefix unique to one unit, which is as specific
as a location can be. A root everything shares now scores zero; a package two of
seven sit in scores 0.64. Two earlier attempts at the denominator are worth
recording as dead ends — dividing by each unit's full depth diluted every score
by the unique leaf segment, and dividing by the parent depth scored every pair
of siblings 1 regardless of how common their package was. Alongside: kinship is
averaged over its seven signals rather than summed, so it cannot drown two
channels that are single associations; shift-click in the group board takes
everything ranked above the clicked row, since adding removes the anchor and a
positional range could never survive the re-rank; and the svg is sized in
attributes as well as CSS, because a relative length throws when the pane is not
rendered and providing a zoom extent had not been enough.

**One builder, 2026-09-19.** The inline builder in the Connections view was
retired: the Draft tab, `DraftBuilder`, `SuggestDials`, the debounced suggest
runs, the hint pass and the dashed suggestion hulls all went with it, and the
toolbar button now carries an open draft through to the studio rather than
opening a second place to do the same work. Connections keeps what it is for —
reading the graph through the lens, opening groups, cycles and the inspector.
The d3 `SVGLength` error took four attempts and was worth the last one. The
stack pointed at `timerFlush`, which is the frame loop rather than the fault,
and the error appeared on views with no connections graph at all — two on
Metrics, five on Connections. That ruled out every guess so far. The cause:
d3-zoom resolves its extent *inside the transition's tween*, so only a zoom
**transition** on a CSS-sized svg throws, and when it does the transition dies
silently. Six graphs shared the defect and none of them showed it, because the
only symptom was a zoom animation that did not arrive. Every zoom now states its
extent; the console is clean on a fresh load of every view. `fit()` also refuses
degenerate framing — a pane with no box, or positions the simulation has not
produced — but skips unplaced nodes rather than abandoning the fit, an earlier
over-correction that left the graph framed by a stale transform.

**What the data said, 2026-09-19.** Querying the BroadleafCommerce snapshot
directly settled four arguments that reasoning had not. Co-change carries 19,052
pairs against 2,603 reference pairs, so it decides everything wherever it fires
— and 45% of those pairs share exactly one commit, while 70% of all the evidence
comes from 2.3% of commits. Eleven commits touching 21-100 components each
produce 3,559 pairs between them. That is how a vendor monitor handler became
the closest thing in the codebase to the catalog domain, at 719 shared commits:
a licence header, not a relationship. Co-change is now computed from `git_commits`
with each commit weighted 1/(n-1) and sweeps above twenty components dropped,
which takes the table from 19,052 pairs to 6,615 and that false pair from 719 to
a weight of 0.75. Second, `component_communities` already holds PageRank, HITS
hub and authority scores, betweenness, closeness and 24 precomputed communities;
the bond engine had been dividing by log(degree) as a hand-rolled proxy for
exactly that, and now uses the measured scores where they exist. Third,
exclusivity: a bond scored against one group cannot say whether the component
leans harder somewhere else, which is the only question a cut asks, so every
candidate is now measured against the rival groups too, marked "wants <group>"
when its place is elsewhere, and barred from the strong band. Fourth,
`utils/cutQuality.ts` measures the finished thing — Newman-Girvan modularity,
the share of references kept inside, the crossing weight, the giant group, the
singletons — reported in the rail while building. It takes a partition and
edges and knows nothing of the studio, which makes it the harness for judging
any future change to the algorithm instead of asserting one.

**Measured, 2026-09-19.** The relevance engine was benchmarked on the real
BroadleafCommerce snapshot rather than argued about. Ground truth: the 24 domain
packages holding six or more components, 299 of 454 in total. Method: seed three
members of a domain, rank every other component, measure precision@10 and
recall@10 against the held-out members of that domain, averaged over all 24.

    naive counts, no normalisation      p@10 0.088   r@10 0.191
    association normalisation           p@10 0.325   r@10 0.644
    + commit-size weighted co-change    p@10 0.354   r@10 0.681
    + the engine's HITS scores          p@10 0.329   r@10 0.642

Association normalisation is the engine: it nearly quadruples precision on its
own. Commit-size weighting is a real but modest further gain, 9% on precision.
And reaching for the engine's own HITS hub and authority scores was a regression
— worse than the degree penalty it replaced, and worse again when rescaled by
community size. The reason is in the column name: `community__graph__hits__hub_score`
is normalised *within* each community, so every community's strongest hub scores
about 0.3 whether it holds five components or eighty-nine, and the number cannot
be compared across the graph. That change is reverted, with the figures recorded
in `bond.ts` so it is not tried again.

The cut measure was checked the same way, against partitions whose quality is
known independently:

    random partition, same shape        modularity -0.009   2.6% kept inside
    domain packages (108 groups)        modularity  0.217    26% kept inside
    top-level packages (9 groups)       modularity  0.263    54% kept inside
    the engine's own communities (24)   modularity  0.419    61% kept inside

which is the ordering it has to produce to be worth reporting, and maps onto the
wording the rail uses. `utils/relevance.bench.test.ts` keeps the two proven wins
honest on a planted graph: that a focused commit outweighs a sweep, and that a
stranger never outranks a domain's own members.


**Two corrections, 2026-09-19.** Live checking of the four changes found both of
them. Exclusivity never fired once across two real groups, because a bond is a
sum over members and an eighteen-member group out-sums an eight-member one for
every candidate alive: nothing could ever "want" the smaller group. It is now
compared by density, dividing by the square root of the size exactly as the
guess under Enter already did, with a test where a candidate bound hard to a
pair and barely to a crowd of eight is correctly said to want the pair. And the
scorecard read 0.02, "little better than arbitrary", for a clean cut of Common
against Catalog — because it counted every reference to the four hundred
components not yet placed. Measured over the partition's own graph, the same cut
reads 0.105 with 96% of references staying inside. The rail now leads with that
share, since it is the number an architect feels, and modularity, which cannot
be high across two or three groups whatever they do, says "too few groups to
judge yet" rather than passing sentence.


**Where the ceiling actually is, 2026-09-19.** Having a benchmark made it
possible to stop guessing, and the three experiments that followed were mostly
negative, which is the useful part.

First, every hand-picked constant was swept against the 24-domain ground truth:
the one-hop factor, the degree penalty exponent, and the ratio between the
reference and co-change channels, 175 configurations in all. The best of them
scores precision@10 0.358 against the shipped 0.338 — a gain inside the noise of
24 samples. The constants chosen by intuition were already near-optimal, so the
knobs are not where the headroom is.

Second, personalised PageRank was tried in place of the direct-plus-one-hop sum,
on the grounds that a random walk uses the whole graph rather than two hops of
it. It is worse at every restart probability tested, 0.30 at its best against
0.358, because on a graph whose hubs touch everything a walk diffuses into them.
Rejected on the numbers.

Third, and this is the finding: how well the engine recovers a domain correlates
0.507 with how much of its own referencing that domain keeps inside itself.
core.search keeps 48% and is recovered at 0.70; admin.server keeps 3% and is
recovered at 0.10. The domains the engine "fails" are the ones that are not
coupled units at all. No ranking of couplings can recover a group from coupling
that does not exist, so the remaining distance to the ceiling is mostly not
addressable by better mathematics on the same signals — it needs different
information, which means the architect's own decisions.

The product consequence is the opposite of a defect: an open group now reports
how much of its own work stays home, and says plainly when the answer is that it
is barely a unit. That a package keeps three percent of its references inside
itself is exactly what an architecture tool exists to tell someone.


**Direction, and what a refusal is worth, 2026-09-19.** Both ideas were
measured before they were built, and a second ground truth was needed to do it:
BroadleafCommerce names the role in the last package segment, giving 13 layers
over 228 components, independent of the 24 domain packages.

Direction turned out to be two separate ideas with opposite fates. Reciprocity —
counting a mutual reference for more than a one-way one — changes nothing
measurable on either truth, and was not built. Structural equivalence, which
compares who uses two components and what they use rather than whether they
touch, doubles precision@10 on the layer truth, 0.200 against 0.100, and costs
precision on the domain truth, 0.317 against 0.358. That is the whole point:
adjacency finds domains and equivalence finds layers, and using the wrong one
halves the answer. It ships as a fourth channel whose weight the way decides —
two for Layer, nothing for Domain, a half for Free.

Learning the channel weights from the architect's own decisions was simulated
over 600 decisions and does not pay: 0.198 to 0.222, about 1.5 standard errors,
which is noise. The labels are better spent another way. Treating the refused
pile as a set to be repelled from, rather than merely skipped, took the share of
right answers from 0.198 to 0.274 while asking 11% fewer questions — 146 correct
placements from 533 questions against 119 from 600 — which is four standard
errors and better on both axes at once. That ships.


**How many questions are worth asking, 2026-09-19.** Challenged on whether the
refusal work pays at the scale an architect actually works — twenty decisions,
not six hundred — the curve was measured per decision rather than in total.

    decisions      1-5     6-10    11-15   16-20   21-25
    filter only    0.525   0.250   0.133   0.050   0.033
    repel          0.550   0.292   0.176   0.127   0.120

Repulsion cannot help before anything has been refused, so the first five are
unchanged; it earns its keep from the sixth on, and most of it late. Over a
realistic twenty decisions it converts 115 correct placements into 136, an 18%
gain for no runtime cost, which is worth keeping but is not the headline.

The headline is the decay itself. Suggestion quality falls by an order of
magnitude across twenty questions, and the band that was supposed to mark where
to stop marked nothing: inside "strongly related" precision measured 0.122
against 0.142 for the fifteen that came after it, on bands ranging from nothing
to 277 items. The cohesion ratio does not predict; rank does. The strong band is
now capped at eight however the scores fall, so the surface stops inviting
judgement at about the point it stops deserving it.


**Splitting a component, 2026-09-19.** The draft store had supported divided
components since the old builder — `DraftPart.files`, `move(component, files,
to)`, `partsOfComponent`, `splitCount` — and the studio had never used any of
it, writing `files: null` every time. The capability was not the problem; being
clear about it was, because once a component can be half here and half there,
every count, mark and colour can lie.

Three rules carry it. A split component is drawn on the map as the groups that
hold it, one wedge each in the share each holds, over the node rather than
instead of it — so it keeps its place and its size and only stops being one
colour, and no node can read as wholly belonging to a group that has part of
it. A share of a component is never listed under the bare name: it carries its
fraction and wears a dashed ring filled to that share rather than the solid disc
a whole one gets, and a group's count reads 16+2 rather than 18. And splitting
is a deliberate act: a sheet that names what stays behind and where the rest is
going, offering the directories first because a split usually follows one, with
Rejoin to undo it in a click.

Measured on the live snapshot: splitting a five-file component three ways to
two gives a rail reading `12/454 · 12 confirmed · 442 left · 1 split across
groups`, the remainder tagged 2/5, and the node on the map drawn as two wedges
in the two groups' colours. One count had to be corrected to get there —
`standingCounts` was counting parts, so a component cut in half read as two
confirmed against a coverage of one, which is exactly the disagreement the rules
above exist to prevent. It counts components now, and a component with any part
still only proposed counts as proposed.

Still to build, and the reason the feature is worth having: the engine should
find the components whose files disagree with each other and offer the split
itself, which is what the old `splitFiles` setting was reaching for.


**Grain: the dimension says what it is made of, 2026-09-19.** Splitting a
component is the right answer to one question and a wrong one to most. A
package belongs to one domain, one team, one release train, and dividing it
there is a lie about the codebase; a layer is the single question one package
answers two ways at once, because it routinely holds a controller and the
repository that controller calls. So the grain is not a preference and not a
feature flag: it is a property of the way being cut, it follows the way, and
the architect may overrule it.

Three decisions make it unconfusing. It is named in the toolbar beside the way
— "Made of Whole components" — so whether this dimension can divide anything is
readable at a glance rather than inferable from what happens to be on screen,
and while anything is actually divided the button carries the count. At
component grain the splitting vocabulary is absent rather than dimmed: no split
gesture, no fraction badge, no dashed ring, no "split across groups" line, on
the grounds that a greyed-out button keeps asking a question the mode has
already answered. And the lock lives in the store, not the buttons: `move` at
component grain reads a file list as "move the component", so no caller,
keystroke or restored draft can leave behind a part the interface says cannot
exist.

Leaving the mode is the part that could have trapped someone, so it does not.
Going back to whole components rejoins every divided component into the group
already holding most of its files, says how many and what will happen before it
does it, and lands in one undo step — and undo restores the grain with the
parts, or they would reappear in a dimension that says it cannot hold them. The
way defers to work already done: picking Domain after splitting something
leaves the grain alone rather than silently rejoining. And what is on the board
outranks what was stored — a restored draft holding parts is a file-grain
draft however it was saved.

Four existing store tests had to declare `setGrain("file")` to keep passing,
which is the default asserting itself: every one of them was testing division.
211 tests, 174 modules.

Verified live across three rounds on the Broadleaf snapshot. Cutting by Layer
flips the grain to "Components and parts" and back with the way; at whole-
component grain a hovered member row offers twenty "Move to" buttons and "Take
out" and no Split at all; splitting two of seven files puts a count on the
toolbar button and the amber rejoin warning in the sheet; clicking "Whole
components" rejoins it and the component returns as a plain row with no
fraction and no dashed ring.

Three defects came out of that verification, all of them mine. The label was
"Files may split", which cannot finish the sentence "Made of ___" that it sits
in — a mode name that will not complete its own frame will be misread, so it is
"Components and parts" now. Escape did not close either picker: a window
listener registered in the capture phase still lost the race to the page's own
Escape, and rather than keep diagnosing it the sheet now takes focus when it
opens and handles the key itself, which is what it should have done for
keyboard users anyway. And the file rows in the split sheet — which are the
checkboxes — had no accessible name; they now read "<path> — staying in
<group>".

The fourth was not a defect but a hole. Picking the grain by hand set
`grainByHand` for the life of the draft, so the way never decided again and
nothing on screen said so: a setting outliving the reason for it. The release
rule is better than a reset button would have been — asking for the grain the
way already wants is agreement rather than an override, so it hands control
back. Overriding is something you do, not a state you get stuck in.

Still unattributed: three identical `Cannot read properties of undefined
(reading 'label')` on a clean load of this view, before any interaction, with
no action in a 147-step run producing another. It wants a bisect, not another
guess.


**The split detector, measured before it was built, 2026-09-20.** The question
was whether a detector could improve the quality of a cut without forcing bad
splits to justify itself. Answered on the live Broadleaf snapshot before
writing any of it.

The snapshot decided the shape. Imports are recorded file -> COMPONENT, not
file -> file, which is better than what was planned for: every edge has an
exact source group (the file's own) and a distributed target group. One rule
prices both — an edge is kept in proportion to the share of the target
component's files sitting in the source file's group — and on an unsplit cut it
reduces to the ordinary "references that stay inside a group". So the
detector's score IS the cut measure. Nothing correlates with anything; a split
that does not improve the partition scores zero and is never offered. The rule
is also self-limiting, which is what stops the search running away: dividing a
component dilutes every edge pointing at it, so splitting something widely
depended on costs more than it pays.

Round one shattered components into as many parts as there were opinions —
14/14/11/10/2/2/2/1/1/1/1 for core.catalog.domain. That is noise wearing a
design's clothes, and it is exactly the failure the feature had to avoid, so a
split is now two parts or it is not offered.

IN-SAMPLE, against the package tree (true by construction, since the search
climbs it) and with a control arm:

    kept, whole components      26.13%
    kept, 65 accepted splits    34.00%   (+7.87 points)
    control: same components,
    same shapes, random targets 20.01%   (BELOW the baseline)

The control is the part that matters: splitting always buys freedom, and taking
that freedom at random makes the cut worse than not splitting at all.

HELD OUT, against git co-change, which the detector never sees (it reads only
static imports). For each accepted split, how much of the component's own
co-change weight crosses the line the detector drew, against 400 random
bipartitions of the same shape:

    depth  minPart   kept whole -> split   splits   crossing vs chance   beat null
      3       3       53.7 -> 61.7  (+8.0)    36      26.8% vs 43.0%      31/35  89%
      4       3       26.1 -> 34.0  (+7.9)    65      34.7% vs 46.4%      45/63  71%
      5       3       10.2 -> 21.4 (+11.2)    72      32.2% vs 46.9%      48/69  70%
      4       2       26.1 -> 35.7  (+9.6)    94      34.1% vs 44.6%      60/86  70%
      4       5       26.1 -> 30.5  (+4.4)    24      35.3% vs 47.6%      19/24  79%

Tear lines found in imports land on co-change boundaries in every
configuration, 10 to 16 points below chance (binomial z = 3.4, p = 0.0003 at
depth 4). And the answer to the question that prompted this: the stricter the
guard the HIGHER the hit rate — 89% at a coarse partition, 79% at a minimum
part of five, against 70% at two. Being conservative is not merely safer here,
it is more accurate. The detector refuses 58% to 72% of what it is shown.

The clearest real case is org.broadleafcommerce.common.time, and it is now the
test fixture. Nine files: five BroadleafEnumerationType implementations that
import the common module, four TimeSource classes that import almost nothing.
The enums and the clock, filed together because they share a word. Git agrees
and was never asked: 0% of its co-change crosses that line, against 56% by
chance.

One thing the numbers also say, which changes the UI: the destination the
detector picks is often "what these files use" rather than "where they belong"
— half of core.catalog.dao leans at common.extension because those files are
extension handlers, but they are catalog's extension handlers. So the detector
proposes the LINE and the architect chooses the destination, which is what the
split sheet's "New group" was already for.

Nine tests, and they were mutation-checked rather than trusted: dropping the
sliver guard, accepting every split regardless of gain, letting a silent file
vote to leave, and scoring outgoing edges only (removing the dilution penalty)
each break a test. 222 tests, 176 modules.


**Surfacing the detector, 2026-09-20.** A marker, not a queue. A second queue
of proposals would compete with the sort questions, and the studio already
asks more than an architect wants to answer; the components are in front of
you already, so the mark goes on the row and the mark IS the offer. Clicking
it opens the split sheet with the line already drawn and a sentence saying
what it found. At whole-component grain there is no mark anywhere, per the
grain rule — but the "Made of" sheet carries one line, "70 components have
files that disagree", because that is a fact about the cut rather than an
offer and the grain control is the one place it could be acted on.

Scoring made that possible and also constrained it. A full sweep costs 70ms on
the snapshot — fine once, far too much on every click — so the scored path runs
only over the open group's members, and scores each independently rather than
chaining off other splits the engine might also like. That is the truer
question anyway: a person at a row is asking "if I do this, what does it buy?",
not "what if I took all twelve of your suggestions". Two routes into one
measure, so a test asserts they do not disagree.

Verifying it live found three faults, and the third was an algorithm fault.
The banner printed a group KEY where a name belonged ("They lean towards 4"),
and expressed the gain as "0.1%" when it could say "stops 12 references
crossing a boundary". Both were engine units leaking into a sentence meant for
a person. The third: markers reading 22/26 and 22/27. Twenty-two of twenty-six
files wanting out is not a torn component, it is a misplaced one, and offering
to split it dresses a misplacement up as a design.

That needed measuring, not patching. A bare majority rule was the obvious fix
and the wrong one — it refuses common.time, which leaves five of nine and is
the best-validated tear in the snapshot. Sweeping the threshold:

    leaving >= N x staying     splits   in-sample   beat their null
    off                          65      +7.87 pts   45/63   71.4%
    1x  (bare majority)          46      +4.55 pts   34/45   75.6%
    1.5x                         58      +5.87 pts   43/57   75.4%
    2x                           62      +6.47 pts   45/60   75.0%
    3x                           62      +6.47 pts   45/60   75.0%

Two refuses exactly the lopsided ones and keeps everything else: held-out hit
rate rises from 71.4% to 75.0% for 1.4 points of in-sample gain. It is now a
named constant with that table behind it, and both halves are pinned by tests
— that a 22-of-26 lean is refused as "misplaced", and that a five-of-nine lean
is still offered. 227 tests, 176 modules.


**The sidebar was two axes in one header, 2026-09-20.** The tab strip said
Sort | Grab — how you work — while the content was decided by what was
selected: a group, a pile, or nothing. So you sat on the tab marked "Sort"
looking at a group editor. Removing the panel's "Back to sorting" link earlier
had treated the symptom; the collision was the cause.

The rail is the dimension now and the sidebar is intake. A group opens in
place under its own row — cohesion, members, per-member move, split, rejoin
and refuse — and renaming happens on the row, because the row is the identity.
Piles open the same way. The sidebar is three tabs that are all the same job,
getting components IN: Sort, Grab, and Nearby, which is "what leans towards
this group" — always intake wearing a group's clothes. GroupPanel.vue split
along that seam into GroupInside and NearbyPanel and no longer exists.

Selection was the other half. Grab's tree had one verb, take, which committed
on click: no picking three of seven, no accumulating across two searches, no
reviewing before committing. Meanwhile the map lasso could select but not
search. Two selection models that never met, with "start a group from a
considered set" falling in the gap. The tree now has tri-state checkboxes that
write into the same set the lasso fills, and the existing selection bar acts on
it — one basket, two ways to fill it, one set of verbs. A branch whose children
disagree shows a dash rather than rounding to on or off.

Three faults found by verifying, all mine. A stray closing tag in GroupInside;
`npm run check` reported the file "ok", which is how I learned it verifies
module resolution and not template compilation — SFCs are compiled directly
now. A merge that kept the wrong name: the store rule was "keep the bigger
real name", written before the UI existed, and then the UI asked "keep which
name?" and offered chips. Clicking Persistence produced Payment. A heuristic
must never overrule an explicit instruction, and the chip is the instruction;
the placeholder rule survives only because a placeholder is the absence of a
choice rather than a choice. And `draft.merge is not a function` in the live
app while the tests passed — Pinia keeps the store instance it already built
when a module is hot replaced, so every action added while the dev server ran
was missing from the live store until a reload. All seven stores call
acceptHMRUpdate now. 233 tests.


**A first pass that refuses, 2026-09-20.** Two complaints, one cause. The map
was overwhelming, and the engine "proposes smaller, sometimes one-node, very
ugly groups — it never leaves components out". The second is the reason for
the first: no fold can rescue a cut made of ninety-six fragments.

Measured on BroadleafCommerce, with the signals the live app actually feeds it
(2,603 reference pairs, 6,372 weighted co-change pairs, authors):

    Domains, as it stood   47 groups · 454/454 placed · median 7 · five of size 3
                           · 11 placeholder names · modularity 0.173 · kept 30.2%
    >= 4 members & 15%     20 groups · 202/454 placed · modularity 0.348 · kept 55.9%
    >= 5 members & 20%     11 groups · 130/454 placed · modularity 0.768 · kept 90.6%

So it placed every last component and kept under a third of references inside.
Demanding four members and fifteen percent roughly doubles both measures and
hands back 252 components — which is the honest answer, because the engine did
not find structure there and saying so beats handing over a group to undo.

Two things the measurement settled that argument would not have. First, a
naming gate — "if the engine cannot name it, do not propose it" — sounds right
and is worthless: on Domains it moved modularity 0.348 to 0.346, and on Modules
it made things worse, 0.220 to 0.161. Dropped. Second, cohesion is the WRONG
demand for a layer, whose members deliberately do not reference each other; the
same gate on Layers moved modularity by 0.001 and threw away 194 components.
The horizontal preset carries a size floor and no minKept, which is the
adjacency-finds-domains rule showing up as a setting.

The gate refuses proposals, never decisions: a group holding anything a person
has already touched is exempt. It also judges a group in the grain the
dimension is made of, since a file-grain group holding eight files of two
components is not a group of two.

Twenty-one existing suggester tests failed on this, and rightly: their
fixtures are miniatures where three components make a feature, so they now
stand the policy down explicitly and test the clustering mechanism. The policy
has its own tests, which drive `worthProposing` directly rather than through
louvain — an early attempt drove it through clustering and merely proved that
louvain absorbs loose components, which is not what was being asked.

Also this round: the folded map drew groups, package clusters and components
as the same disc, breaking the Kind Rule the renderer already implemented. A
group wears the group's box again, a package of unsorted things wears it
dashed, a component is a disc. 250 tests, 179 modules.


**The folding map, removed, 2026-09-20.** Tried and rejected. The numbers were
good — 454 bubbles and 2,603 edges became 10 and 20 with nothing sorted, 9 and
13 once the cut had nine groups — and it was still the wrong answer, because
it was confusing to use. Three kinds of thing (a group, a package of unsorted
components, a component) shared one canvas at three levels of abstraction,
clicking each meant something different, and what a bubble stood for changed
as you worked. Fixing the marks so each kind looked like itself helped and did
not rescue it: the model itself asked a person to hold too much.

Worth keeping from it, for whatever replaces it:

  - The measurement stands. 454 nodes / 2,603 edges is four times what a
    force-directed layout can carry, 21 components have degree above 20, and
    half the components hold three files or fewer.
  - The complaint about crowding and the complaint about the first pass
    proposing 47 small groups were the same complaint. The proposal gate is
    the part that survived, and it is the part that mattered.
  - A view that folds has to say what it is standing in for, and folding by
    itself is not the hard part — keeping one meaning per mark is.

The remaining options, unbuilt, are a stable package treemap coloured by group
(position never moves, so the map can be learned) and a group-ordered DSM,
which is the notation this problem actually has. Both change what the map IS
rather than how much of it is drawn, which is probably the right kind of
answer.


**Three benches, and what the first two found, 2026-09-20.** Performance and
quality were both being argued from impressions, so both got a harness. The
rule they follow: a bench runs the shipped code against a real snapshot, and
prints rather than asserts, because a quality suite that fails on a tenth of
a point teaches you to loosen the threshold.

  1. `npm run bench` — `bench/engine.bench.ts`. Loads a scan off disk through
     the production loader (`loadSignalSources`, extracted from the composable
     for exactly this reason) and runs every preset's first pass. Reports
     per-stage timings, the slowest SQL, and for each pass: groups, coverage,
     smallest, median, singletons, modularity, kept-inside — plus the same
     numbers with the gate switched off, and the same numbers at the other
     grain. `ARCHSTATS_DB` picks the snapshot; the default is the largest the
     desktop app has scanned.
  2. `node bench/frames.mjs` — headless Chrome against `wails dev`, driving
     the real view. Turns on `src/utils/perf.ts`, a stopwatch the app carries
     permanently and runs only when asked, and reports where a frame goes.
  3. (unbuilt) the Go side. The engine bench already times every query the
     suggester issues, which is where the data cost has shown up so far.

**The gate was never running, 2026-09-20.** `worthProposing` looked up each
component in `input.refsOut`, which is keyed at the grain being clustered — so
on a file-grain pass every lookup missed, the gate concluded there was nothing
to judge, and passed everything. It also sized groups in files, so four files
of one component read as a group of four. Both bugs pointed the same way:
every group proposed, none judged.

  BroadleafCommerce, Domains   91 groups / 452 of 454 / Q 0.143 / 17.2% kept
  qp visualizer, Domains      242 groups / 611 of 611 / Q 0.194 / 29.4% kept
  qp visualizer, Ownership    499 groups              / Q 0.019 /  4.2% kept

Fixed by rolling file references up to their components before asking, and by
counting a group in contributing components — not files, which let everything
through, and not majority owners either, which broke layer bands that own
nothing. Both wrong answers were caught by tests that already existed.

**File grain was costing quality everywhere, 2026-09-20.** With the gate
working, the bench could answer a question nobody had asked: is splitting
components paying for itself? It is not. Every preset scored worse split than
whole, on a real snapshot, on both measures:

  Domains     file  55 groups / Q 0.181 / 22.1%   component   9 / Q 0.227 / 42.6%
  Ownership   file  25 groups / Q 0.233 / 30.0%   component   9 / Q 0.346 / 53.1%
  Custom      file  50 groups / Q 0.201 / 23.9%   component  12 / Q 0.216 / 38.6%

So Domains, Ownership and Custom are whole-component presets now, which is
what the Way system already said they were — `GRAIN` gave only a layer file
grain, and the presets had been contradicting it. Layers keeps file grain
because that is the point of a layer: one package holds a controller and a
repository. A first pass also follows `draft.grain` now instead of the
preset's, since the grain control is the architect's answer to that question
and a pass that ignores it answers a question nobody asked. Domains on
BroadleafCommerce: 55 groups of median 7 became 9 of median 39, and the pass
got eight times faster as a side effect.

**The frame loop, 2026-09-20.** Measured before and after with the same
sampler, 454 nodes and 2,603 edges, first 150 frames from opening the view:

                      before      after
  graph.tick mean     11.7ms      8.4ms
  graph.tick total     3.34s      1.91s
  frame gap p50       36.6ms     16.7ms      (27fps → 60fps)
  frame gap p95       45.7ms     18.0ms
  worst frame        146.3ms     32.6ms
  hover → frame p50   21.7ms     18.4ms

Four causes, all of them the loop doing work it had already done:

  - Eight `selectAll` per frame. Each one walks the DOM and allocates an array
    of every match; only `rebuild` changes which elements exist, so the
    selections are resolved there and reused.
  - `.attr()` called four times on 2,603 lines is four passes and four closure
    calls per line. One `each` writes all four, and works out the arrow-head
    inset on the way instead of recomputing the same square root per axis.
  - `sizeHits` rewrote the radius of 454 hit discs every frame, though it
    depends only on the zoom, which already called it.
  - Cycle markers and badges were positioned every frame while hidden — 2,603
    writes for something nobody had asked to see. They are placed by `restyle`
    on the frame they appear, so they cannot be stale.

First attempt at the frame-gap number sampled after the settle, which measured
an idle page and swung between 17ms and 30ms for the same build depending on
whether the layout had stopped. It samples from the moment the view opens now.

Two defects the frame work introduced or exposed, both found by driving the
running app rather than by reading it: `restyle` placed cycle markers before
any frame had worked out where an edge ends, writing NaN into 2,603 circles
and 5,206 console errors on every rebuild — the marker placement asks for the
endpoints now instead of assuming someone has produced them. And the
connections page's inspector had been wired to a `focusNode` that was never
defined, so picking a partner did nothing and Vue warned on every render. The
view's console is silent now. Final: tick 7.2ms mean, 43% of a frame budget.


**Groups by query — stages 1, 2, 4, 5 and 6, 2026-09-20.** A group stops being
a list of ids and becomes a description. Plan and reasoning in
`tasks/query-language-plan.md`; what landed:

  - `src/utils/query.ts` — parse and run the language. Lines union, `!` lines
    subtract and always apply last, `where … and …` intersects inside a line.
    Segment-aware globs over the delimiter `pathStyle()` detects, so the same
    text reads naturally over `.`, `/` and `::`. No dependency: the semantics
    are ours, and a glob library would have been fought rather than used.
  - `generalise()` — a set of ids back into the shortest patterns that say
    exactly it. This is the bridge between the engine and the architect.
  - `SavedGroup` gains `query`, `mode: 'live' | 'fixed'` and `foundBy`.
    Storage 3 → 4; anything written before queries existed migrates to fixed
    with no query, because we do not know how it was made and inventing one
    would silently rewrite a decision. The v3 payload is kept under its own
    key, since the migration is one-way.
  - `lensHealth()` — coverage, components two groups both claim, queries that
    match nothing, and what a frozen group's watchlist would catch now.
    Reported and offered; never absorbed, never applied.
  - `QueryEditor.vue`, `SaveToLens.vue`, `LensHealth.vue`.

Two bugs the tests caught before any of it ran: `Number("")` is 0, so a
half-typed `where lines >` parsed as `lines > 0` and matched everything while
the architect was still typing; and `[^::]` is a character class of one colon
rather than "not a scope break", which would have made every C++ query wrong.

**Generalisation measured, 2026-09-20.** The design rested on an unproven
claim — that a set the engine found can be said as a few patterns. Measured
with `npm run bench` over every proposed group on two real snapshots:

                      groups   said exactly   ≤3 lines   median lines
  qp-visualizer         102        100%         75.5%          1
  BroadleafCommerce      39        100%         20.5%         10

It never lies, but how well it reads depends entirely on whether the grouping
agrees with the namespace. Shipdoc is 39 components in two lines. Broadleaf's
biggest proposal needs 44 lines — and the engine called it "Group A", because
it could not name it either.

That is worth keeping: **the number of lines a group needs is a readability
measure of the grouping itself.** A boundary a person would recognise can be
said shortly. One that takes 44 lines is a list wearing a pattern's clothes,
and the engine should probably be saying so.

Not built: the relational predicates (`uses()`, `@Group` references, cycle
detection). Designed, then cut — they serve findings, most findings do not
want to be groups, and the one case that justified them is better frozen. The
grammar is additive, so nothing written today blocks adding them later.

**Queries reach the UI, 2026-09-20.** Two surfaces, one for each persona.

The selection tray (every view) now offers the selection back as a pattern:
pick twelve components and it shows `com.fedex.qp.booking.** +2 more lines`
as a chip, Alt+Enter takes it, and the group is saved as a query instead of a
list. Offered, never assumed — pointing at twelve of fourteen things is not
the same as meaning "everything under booking", and only the person pointing
knows which they meant. It appears only when the pattern is genuinely shorter
than the selection, because a "pattern" that is the same twelve ids with
punctuation is a worse list.

The groups manager gained a **Defined by** section: the query, a Query /
These members toggle, a "Describe with a query" button that generalises the
existing members, and the watchlist line for a fixed group whose own query has
moved on — offering what it would catch, never adding it. `LensHealth` sits
under the header for the selected group's lens.

The three components written yesterday were off the design system and had to
be rebuilt on it before integrating: raw Tailwind borders instead of
`ui-input`, `text-[11px]` instead of the 11px `text-xs` step, and — the real
bug — `bg-white` on the save sheet, which would have stayed white in dark
mode, since the tokens flip on `prefers-color-scheme`. Two invented icon names
(`wand`, `box`) would have rendered nothing; the set has `braces` and
`component`.

Not yet verified in the running app: `wails dev` was down for this stretch.

**Queries reach the builder, 2026-09-20.** The previous pass integrated into
`GroupActionBar` and the `groups` store — neither of which the dimension
builder uses. It has its own selection bar and its own `draft` model, so
nothing was visible on the one surface the work is actually done on. The
integration went to where the code was easiest to find rather than where the
architect works, which is a failure of aim, not of code.

Now in the builder:

  - `DraftGroup` carries `query` and `mode`, and both save paths (`commit`
    and `commitGroup`) hand them to the saved group. What was meant outlives
    what was on screen.
  - `draft.describe(key)` generalises what a group already holds, so a group
    built by pointing becomes one that explains itself without retyping.
  - `SelectionBar` offers the selection back as a pattern, beside "New group".
  - `GroupInside` gained a **Defined by** section: the query, a Query /
    These members toggle, and Describe / Edit.
  - `fromSuggestions` attaches a generalised query to every proposal, and
    leaves the mode fixed — the group is still the parts on screen until the
    architect says otherwise.

**`scripts/sfc-check.cjs`, 2026-09-20.** The checks kept missing the class of
bug that actually ships: `npm run check` reads module resolution, and a plain
`compileTemplate` matches tags without parsing what is inside an expression.
This one compiles every SFC the way Vue does — `prefixIdentifiers` on, the
TypeScript plugin on for `lang="ts"` — so a `v-for` variable used out of scope
or a stray non-null assertion fails here instead of at runtime. 134/134.

**A query is a scope, 2026-09-20.** The remaining stages, done by finding the
abstraction that was already there instead of adding one beside it.

`stores/scope.ts` already meant "a lens on any view" — its own comment said
so — and connections, metrics and hotspots already filtered through
`componentInScope` / `fileInScope`. So the query went INTO the scope rather
than into each page: `scope.query` narrows the way another dimension does,
because that is what it is, one more thing that must also be true. Every
surface that already filtered by scope now filters by a typed question
without knowing queries exist.

`QueryBar.vue` is one control on all three pages: a monospace field with the
match count inside its right edge (the question and what it came to are one
thought), `Keep` to promote a finding into a group, Esc to clear. It reuses
`SaveToLens`, so the live/fixed choice is asked in exactly one place.

A test caught the one real bug: a file-shaped question like `**/*Dao.java`
must scope component views to the components holding those files, but must
NOT then widen file views back to every file those components hold. The
matches keep `direct` and `holders` apart for that reason.

**Stage 3, the rename.** Visible copy only, by a pass that rewrites text
nodes and static attributes and leaves identifiers, bound props and the
stored `dimension` field alone — 47 occurrences across 10 components, plus
the bound template literals by hand. The model still says `dimension` where
it is a field name; the architect only ever reads "lens".

**The rest of the stages, 2026-09-20.**

*Stage 6* — `LensSwitch.vue` turned out to be mounted nowhere, so the lens
header went where the lens already lives: the sidebar rows. Each carries a
small amber count when something needs reviewing — a query that stopped
matching, a component two groups both claim, a frozen group whose query has
moved on — with the detail in its title. Quiet until there is something,
because a badge that is always lit is a decoration. Computed once for every
lens rather than per row: each call runs every group's query over the whole
snapshot.

*Stage 7* — `QueryBar` on all five scope-aware views: connections, metrics,
hotspots, cycles, java classes.

*Stage 8* — the studio says what it is for. Its empty rail now points at the
faster path when the architect already knows the shape, instead of letting
someone hand-sort 611 components before discovering they could have said
`**.controller`.

**Cleaning up after six iterations, 2026-09-20.** The feature worked and had
grown four pairs of near-duplicates, all of them mine, each from a round that
built the better version and left the worse one wired up.

  - **Two query editors.** `QueryComposer` (rows, colour, suggestions) was in
    the toolbar; `QueryEditor` (a plain textarea) was what the groups manager
    and the builder actually used — so editing a group's query gave a worse
    tool than typing the same query in the toolbar. `QueryEditor` deleted;
    the composer grew an `inline` mode and now serves all three.
  - **Two "Defined by" blocks**, same three states, two editors, two sets of
    words. Now one `GroupDefinition.vue`.
  - **Two pattern offers**, one per selection tray, with the same threshold
    and the same "is it actually shorter" test written twice. Now
    `usePatternOffer`.
  - **Two health readouts.** `LensHealth` gained a `compact` mode and the
    sidebar's hand-written badge went; one component, two densities.
  - **Three copies of the query world** — snapshot, separator, metric lookup,
    suggestion sources — assembled independently by each editor, which is
    exactly how they drifted apart. Now `useQueryWorld`.

Removed outright: the **Grab** tab and its tree. Four paths to the same
outcome was most of the builder's bloat, and a query says
`com.fedex.qp.booking.**` faster than walking to that node — the query bar is
on this view too. The **grain picker** folded into the Way picker: every way
but Layers measured worse dividing components, so it is a consequence of the
cut rather than a decision that earns a place in the toolbar.

138 components → 134, with the duplication gone rather than merely smaller.
303 tests, 188 modules.

**The builder's rail, revamped 2026-09-20.** A screenshot showed what the code
had not: the rail was a list and a detail panel at once, which is exactly what
"One Surface, One Axis" forbids — and I had written that rule.

Opening a group filled the 320px column with a segmented control that clipped
its own label ("These members" wrapping inside its button), a query block cut
off at the right edge, and a dozen member rows truncated to `…r.strategy` —
pushing six remaining groups below the fold. Above it, coverage was said five
ways and quality three.

  - The rail is a list now: progress, groups, piles, new group. No expansion.
  - The inspector follows **what is in focus** and nothing else — a group
    (its definition, its members, and what is nearby, together), a pile, or
    the queue's question when nothing is open. It was tabbed by mode while its
    contents were decided by selection; the tab bar is gone, Escape leaves a
    group, and a single tab renders no tab strip.
  - Coverage: five statements → the fraction, the bar, how much of the CODE is
    placed, and how much is left. Quality: three → the number and its reading,
    plus the warnings that take you somewhere.
  - The hotkey badge hid on hover and showed at rest, so every row carried two
    unlabelled numbers. Now it appears only when a pointer is there to use it.
  - Member rows drop the prefix every member of the group shares, so the part
    that distinguishes them is the part on screen.
  - "These members" → "Members", which fits the control it is in.

134 components, 303 tests, 188 modules.

**The crash, and the check that should have caught it, 2026-09-20.** Clicking
a group blanked the panel. `_ctx.shorten is not a function` — the member-name
helper was inserted against an anchor (`const editing = ref(false)`) that an
earlier cleanup had already deleted, so the replacement silently did nothing
and the template kept calling a function that was never defined. It compiled
clean, 303 tests passed, and it broke the moment a real group was opened.

`scripts/sfc-check.cjs` now compiles each template with its script's
`bindingMetadata` and fails on anything Vue leaves on `_ctx` — exactly the
identifiers the setup block does not define. It found a **second** live crash
immediately: `NearbyPanel` built a tooltip from `group.name`, a prop it has
never had, sitting one component away from the first.

This is the third identifier-scope bug this session (the `v-for` crash in the
rail, `focusNode` on the connections page, now these two). `npm run check`
reads module resolution and a plain template compile matches tags; neither
reads inside an expression. This one does.

**Cohesion, not Quality, 2026-09-20.** The rail called it Quality and showed
it on every lens. It measures one thing — how much of a group's referencing
stays inside it — which is the test for a domain or a module and the wrong
test for a layer, whose members deliberately do not reference each other. The
engine already knew: `minKept` is left unset for horizontal cuts for exactly
this reason. A layer lens now says so in words instead of scoring itself badly
for doing its job, and the per-row bars are hidden there too.

**Propose a lens cut, 2026-09-20.** "Cutting by" in the toolbar and "Propose a
first pass" beside it were two controls for one decision, and neither said
what the decision would produce. One dialog now runs every way that fits and
shows what each comes to — groups, coverage, kept-inside, and the first few
group names — before any is taken. The grain went in with it, since a layer is
the only way that pays for dividing a component. The toolbar states the
current cut rather than offering a picker.

`WayPicker` and `GrainPicker` are gone; their decision lives where its
evidence is.

**The dialog that mounted nowhere, 2026-09-20.** `ProposeSheet` was placed as
a child of `ViewWorkspaceLayout`, which renders only named slots — so Vue
dropped it. `proposing` went true against an element that had never been
created: no error, no warning, nothing in the DOM. A verification pass spent
an hour proving the modal "is conclusively not appearing" while the source
looked correctly wired, because it was.

`scripts/sfc-check.cjs` now also fails on content handed to a component with
no default `<slot>`, walked on the parser's own tree — a first attempt by
regex mis-read `<template #activity>` wrapping a nested `<template v-if>`, and
a second made every HTML `<table>` a finding because a file is named
`table.vue`. Three classes of silent template bug are covered now:

  - an identifier the script never defines (`shorten`, `focusNode`, `group`)
  - a `v-for` variable used outside its scope
  - children dropped into a component with no default slot

All three shipped this session, all three compiled clean, and none of them
could fail a unit test.

**The accessibility batch, 2026-09-20.** From the critique's measured P1:

  - Contrast, computed rather than eyeballed. Separators were rgb(101,107,121)
    on rgb(43,47,56) — 2.51:1 against a 4.5:1 floor. `neutral-500` only
    reaches 4.24:1; `neutral-550` reaches 5.1:1, so that is what they are.
  - The row is a real combobox: `role`, `aria-expanded`, `aria-controls`,
    `aria-activedescendant`, and ids on every option. Arrowing the list used
    to move a highlight a screen reader could not see.
  - A polite live region speaks the running match count and any parse
    complaint, which previously existed only in a `title` attribute.
  - `!` and `#` carried meaning in colour alone. The row's accessible name now
    says "excludes" or "switched off", and the toggle's glyph differs by shape.
  - Targets: 13×13 and 20×20 against the WCAG 2.2 AA 24×24 floor, now 24×24.
  - The suggestion list is grouped under "Start with", "Recent" and "Saved
    groups" instead of thirteen flat rows told apart by a small icon.

**The proposal preview, 2026-09-20.** "9 groups · 389/454 placed" says nothing
about the shape of a cut: nine even groups and one giant plus eight scraps
read identically. Each row now draws the partition to scale — every group as a
slice in the colour it would be given, with what it leaves behind in grey —
and lists the groups with their sizes, all of them on the chosen row.

It paid for itself on the first run. Layers on BroadleafCommerce reads
`6 groups · 453/454 placed`, which looked *better* than Domains' 389/454 under
the old preview. With sizes: `Services & Other 424 · Repositories 10 ·
Foundations 6 · Entities 5 · Controllers 5 · Middle 3` — 94% of everything in
one bucket named after not knowing. Domains now admits 4 of its 9 groups are
unnamed, which is the same signal the generalisation bench found: a group
nobody can name is a group nobody would recognise.

Also said plainly, where the decision is made: **a proposal fills a draft and
saves nothing.** The footer says what it would replace and that undo brings it
back, or — with an empty draft — that everything it proposes can be renamed,
merged, split and dropped first.

One bug on the way, caught by the running app rather than the checker: a
`const total = () => props.total` helper shadowed the `total` prop inside the
template, so every width computed to NaN and the count rendered the function's
own source.
