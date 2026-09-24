---
version: 1
slug: "frontend-src-pages-views-units-vue"
primary_target: "frontend/src/pages/views/units.vue"
related_targets: ["frontend/src/composables/useUnitsModel.ts","frontend/src/components/units"]
---

Scope: the Units view. Visitor mode: Operate.

Audience: an architect returning to their own codebase, and a consultant meeting
an unfamiliar one. Task: read the named things in a codebase — types, functions,
modules — across six languages, at scales from 200 units to 5,800.

Constraints the user pinned: groups and the lens tray, framework lanes, seed-and-
expand exploration, and the scope/query bar all survive.

Unresolved: which of the three structures ships. All three are built so the user
can compare them in the running app; the loser(s) are deleted, not kept as modes.

## Direction contract

THESIS: A unit view is a reading instrument, not a picture of a graph. It refuses
the force-directed dot field the old view led with — 180 nodes, 137 invisible
edges, most labels dropped — because a layout that cannot be read at 3,241 units
is decoration. Three structures are built and compared in place: Worklist,
Atlas, Spine.

OWN-WORLD: DESIGN.md unchanged. Surface on white over ground, hairlines as the
only structure, Inter 13/18 for chrome and JetBrains Mono for every identifier and
number. Lane colour comes from the five data hues through chartTheme(); orange
stays the selection and nothing else.

STORY: The visitor arrives cold, sees the shape of the codebase in the first
screen without interacting, finds the unit that matters, and walks its
dependencies.

FIRST VIEWPORT: A 40px toolbar carrying the view name, a mono count, the
structure switcher, and the query field. Below it the chosen structure fills the
window edge to edge. A 340px inspector on ground holds the selected unit's
evidence. No empty canvas at any scale.

FORM: Worklist, Atlas, Spine — indices 1, 6, 7 of the ranked list; the roll dealt
6, 7, 1 with 6 leading. Seed key 679d10a3.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Round: make it useful (2026-09-22)

The complaint was "no insights, just a list w symbols, I see no connections".
Verified on the LibreChat snapshot (3,538 units / 1,799 edges), both themes,
1024–1440.

What changed:

- **Findings open onto their evidence.** Each card in the strip is a button;
  clicking narrows the view to exactly the units the claim was read off, with
  a standing bar naming the filter and a way back out. A finding that only
  states a fact is a report; one that puts its own evidence on screen is a
  tool. The cycles finding takes 3,538 rows down to the 5 tangled ones.
- **Blast radius.** The inspector answers "what breaks if I change this"
  transitively, not at one hop: "Changing this can reach 17 units, up to 2
  hops away." One BFS per selection, bounded at 6 hops.
- **The unconnected finding bypasses the hide filter**, so opening "2,087
  units have no import-level connection" shows them rather than nothing. It
  also demonstrates the caveat: they are nearly all methods (`_call`, `_get`,
  `_post`), which an import graph cannot reach by construction.

Defects found and fixed in the inspection round:

- `bg-accent-tint` was a **dead class** — it resolved to `transparent`, so
  selection had no highlight in four places, the worklist row included.
  Replaced with `bg-accent-50`, the token `.ui-table tr.is-selected` uses.
- Zero counts were `text-neutral-300`, measured at **1.61:1** against the
  ground: the Uses column read as empty. A zero here is a finding, so it is
  now `text-neutral-500` (4.59:1) — quieter than a count, not invisible.
- The findings strip squeezed four columns into three-line headlines below
  ~1200px. Now `auto-fit` at a 17rem minimum, with hairlines drawn on the
  cells rather than as a grid gap (a gap paints the empty area of a
  part-filled last row as a grey block).
- The Lane cell wrapped "Utilities & Other" to two lines inside
  fixed-height virtualized rows. Truncated.

Tests: 22 in `unitInsights.test.ts` (blast radius shortest-path, cycle
termination, depth bound, and that every finding carries non-empty evidence),
476 across the suite, `vue-tsc` clean.

Still true, and not a bug: the graph is structurally sparse outside
TypeScript and Java because methods are *called*, not imported.

## Round: revamp — the file is the node (2026-09-22)

Shaped, confirmed, built. Mode: Operate. Jobs: orientation, zoom-under-
Components, refactoring workbench. Engine untouched, as instructed.

**Thesis.** A unit graph draws every declared name as a node, which is the
wrong grain for every language but Java. What an import names is the module.
Rolling the same edges up to files, measured on the snapshots on disk:

| snapshot | units/file | units connected | modules connected |
|---|---|---|---|
| LibreChat | 2.9 | 41% | **74%** |
| django-oscar | 8.6 | 21% | **46%** |
| Spring (Java) | 1.0 | 59% | 59% |

Java is 1.00 per file, so the layer collapses and the view is unchanged —
which is why Java always looked first-class. It got this structure for free.
"Unconnected" went from 2,087 units (59%, noise) to 319 modules (26%, real).

**Structure.** One screen, a descent: Shape (the whole codebase) → Region (a
lane, a flow, a finding, a search) → Module (one file, its neighbours, and
what it declares). Findings are the stairs, not a banner. The path rides the
URL. List, Map and Chain are deleted, with `utils/treemap.ts` and
`utils/unitInsights.ts`.

**New:** `utils/moduleGraph.ts` (17 tests), `utils/graph.ts` (13),
`utils/findings.ts` (13), `LaneFlow`, `ShapeLanding`, `ModuleList`,
`ModulePanel`, `ModuleRelationList`, `DescentBar`.

Defects found and fixed in the inspection round:

- **Every one of the 8 lane arcs came out red** — every pair in LibreChat has
  traffic both ways, so "runs both ways" painted the whole diagram and meant
  nothing. A threshold then made 6-of-35 a tangle and 7-of-47 a layer, which
  is a coin toss dressed as a verdict. Replaced with the share against the
  grain drawn as a proportion, so there is no cutoff to tune.
- Arcs said two lanes were related but not which way. Added an arrowhead on
  the dominant direction.
- The region's note rendered after the module crumb, reading as though it
  described the module. Scoped to the region.
- `max-w-[68ch]` rendered 85 characters per line: CSS `ch` is the width of
  "0", wider than average lowercase, so Nch gives ~1.2N characters. 58ch.
- Third dead token found this session: `text-[--c-data-red]` does not exist
  either. The ramps are `red-500` etc. (`--c-data-*` was never defined.)

Verified on all three data shapes: LibreChat (2.9/file), Spring (1.0/file —
"Holds" column correctly absent, no crowded finding), and a snapshot with no
`unit_connections` table at all (no arcs, composition sentence says so, two
findings still land). 487 tests, `vue-tsc` clean, no horizontal overflow,
arcs inside their box.

**Not verified:** the pixel pass. The desktop app window cannot be captured
(no Screen Recording permission) and the Browser pane would not composite
while hidden, so spacing rhythm, the diagram's look and the narrow-width
composition were measured in the DOM rather than seen.

## Round: the descent kept losing the claim (2026-09-22)

Three things, from use: clicking a red curve landed on a list with no way to
tell where the cycles were; the framework selector was buried in a popover;
the layer viewer needed work.

**The claim travels down with the evidence.** Two changes, and the first is
the real one:

- *Evidence keeps its own shape.* "Seven references run back against the
  layer" is a claim about **pairs**. Flattening it into the fourteen modules
  at their ends destroyed the pairing, which was the whole point — you
  arrived at a list and could not see which module leaked into which. The
  layering, knot and flow regions now carry `references` and render as
  `From → To`, with both weights for a knot. Virtualized, because a one-way
  layer can be 1,585 rows.
- *The sentence is restated where you land.* `RegionClaim` sits under the
  breadcrumb. Lane, flow and search regions got claims of their own, so no
  descent arrives somewhere unexplained.

**The framework selector moved into the DescentBar** as "Read as". The lanes
are a reading, not a fact, and every level is coloured by it; in a settings
popover it looked like a property of the codebase. The popover now explains
the current reading and points at the bar.

**Layer viewer.** The bug in the screenshot: bars and counts were laid out at
fixed widths inside a flexible column, so a long label pushed the count under
the arcs. Rows are now a grid whose middle column is the only flexible one —
it cannot overflow. Plus: lane and arc cross-highlight on hover, the arrowhead
turns red once most traffic runs against it, the track is a fill inside a
rail, and the column widened to 440.

Defects found and fixed in the inspection round:

- "Against the grain first" sorted by the flow parameter's lane order, which
  is alphabetical — it only put the minority direction first by accident.
  Now sorted by which lane the minority actually starts from.
- The note ran into the claim's detail: Vue's compiler strips a leading
  `&#32;` between interpolations. It is a separate thought, so it is now a
  separate line.
- That new line was `text-neutral-400`, 2.72:1. Raised to the app's muted
  level, 4.59:1.
- Java directories are ~90 characters of package ceremony and CSS truncates
  the wrong end: `repos/eai-3540597-qp-aud…` says nothing. `dirTail` keeps
  the last three segments — `…/audit/service/impl`.

494 tests, `vue-tsc` clean, no overflow, nothing clipped. Verified on the
Spring snapshot from the report: clicking the reddest arc gives "Services &
Other imports Repositories 680 times, and Repositories imports Services &
Other 231 back · 25% against the grain", then the 231 as pairs, minority
first.

Still unverified: the pixel pass. The Browser pane would not composite.

## Round: duplication, cycles, and where a control belongs (2026-09-22)

**The reference list was mostly repetition.** One row per (from, to) pair
printed the source module once per target: `QuoteCommentsUtil` filled seven
consecutive rows, beside 1,674 identical arrow glyphs and a Refs column of
all 1s. Now grouped by the importing module — but a source with a single
target collapses back to one row, because a header above one child costs a
row and implies a hierarchy that is not there. In the 3-reference layering
region that is 3 rows; in the 1,674-reference flow region the repetition is
gone.

**The framework selector sits beside the lanes it produces.** It is still in
the descent bar, and now also in "How the layers lean", where it is the
control that decides what that diagram says. When detection fails — the
screenshot showed `By structure` with nothing explaining it — the diagram now
says so: *"No framework was recognised, so these lanes are folders. Naming
yours above regroups everything on this screen."*

**Cycles, and a thing I built that could not work.** I added a "N of these
import back · show only those" toggle to reference regions. Then measured:
LibreChat has exactly 3 mutual module pairs and all 3 are same-directory
(`Messages/Message` ↔ `Messages/MultiMessage`); the Spring repo's 17 are
likewise all intra-lane. A region built from traffic *between* lanes can
therefore never contain a cycle, and the toggle could not fire in any real
region. Deleted.

Cycles are now marked on the module instead, which is where they can actually
be seen:

- `ModuleNode.inCycle` holds the modules importing it back.
- The module list marks them, in every region.
- A lane region states it: *"Components holds 555 modules. 320 are imported by
  something else, and 5 are in a cycle with a neighbour."* — tone warn.
- The panel says it in words with both sides clickable: *"Imports Message and
  MessageContent, which import this back. Neither can be moved alone."*

**Hints.** Each region carries a line for what its rows do ("Click a module to
inspect it. Hold ⌘ to collect modules into a group instead. Red marks a
cycle."), and the diagram caption explains hover and click.

Also: Java directories truncated from the wrong end, so `dirTail` keeps the
last three segments.

496 tests, `vue-tsc` clean, no overflow. Verified on both snapshots.

**Not a defect:** a stale-region state I hit mid-session was my own harness
(repeated `closeScan`/`openScan` plus a forced profile in localStorage). On a
clean load the descent is correct at every step — checked before reporting it.

Still unverified: the pixel pass. The Browser pane will not composite while
hidden, so this round was measured in the DOM, not seen.

## Round: the reference table was a spreadsheet (2026-09-22)

The screenshot was bad and the worst of it was mine from the round before.

**Two row grammars were fighting.** Collapsing single-target sources onto one
line — done last round to save a row — meant a single-target source put its
target in the far-right column while a grouped source put the same thing
indented on the left. Same semantic role, opposite ends of a 2,000px row. The
row saved was not worth the incoherence. Every source now reads the same way:
a source line, its targets indented beneath it, always.

**It stopped being a table.** Two short names were stretched across two
thousand pixels with a `Refs` column of ~900 identical `1`s pinned to the far
edge, so connecting a name to its count meant crossing the screen. Now:

- No table header. It is a list, and column labels implied columns that were
  not carrying anything.
- The count sits at the end of the source line ("imports 4"), not in a column.
- A reference count only prints when it is above one (`×3`), so the
  exceptions read instead of drowning in a field of 1s.
- A hairline above each source binds its block without drawing a box.
- Content caps at 860px; the module table at 1100px. The width the list gives
  up goes to the panel, which widens to 440px above 1500px.

Measured at 1920: reference rows 1,221px → 860px, module table unbounded →
1,100px, no horizontal overflow, worst in-list contrast 4.59:1.

**A tooling trap worth recording.** `max-w-[54rem]` computed to `none` — the
class produced no CSS at all, the same silent failure as `bg-accent-tint` and
`text-[--c-data-red]` earlier this session. It resolved after a hard reload,
so it is Tailwind's JIT not picking up an arbitrary value added mid-session
rather than a permanently invalid class. Two consequences: **verify arbitrary
Tailwind values after a full reload, never on HMR**, and prefer explicit `px`
over `rem` here — this app's root font-size is 13px, so `64rem` is 832px, not
1024px, and every `rem` guess is off by a fifth.

I also briefly reported that an edit had silently failed to apply; it had
applied, and the page was serving a stale module. Corrected in place.

496 tests, `vue-tsc` clean.

## Round: the region was a selection, not an inquiry (2026-09-22)

"Bro is this useful? Is it clear? Restart."

No, and the honest diagnosis is that four rounds went into typography for a
screen that should not have existed in that form. Clicking a lane-to-lane link
produced 911 rows, every one reading "a service imports a repository" — which
is Spring working exactly as designed. Legible, and carrying no information.

**The concept error.** A region was built as a *selection*: everything
matching the thing you clicked. But you clicked a red arc because you wanted
to know *why it is tangled*. A region is reached by a question, so it has to
answer one. Enumeration is not an answer.

**What the dump was hiding.** `CountryRepository`, `UserRepository` and
`CommonMasterRepository` recurred through those 911 rows and nothing said so.
The same region now opens on:

> 911 references, from 295 modules into 216.
> A typical one imports 2; 6 import noticeably more.
> **CountryRepository alone is imported by 103 of them.**
>
> Carries the most of them — CountryRepository 103, CommonMasterRepository 67,
> QuoteRepository 55, UserRepository 52 …
> Reaches the furthest — QuoteV3DaoImpl, 28 imports

That is the service layer's real shape, and it was on screen and invisible.

`utils/regionReading.ts` (14 tests) ranks by **distinct modules**, not by
reference weight — a chatty pair carrying nine unit references is still one
dependency. "Reaches the furthest" is measured against the region's own
median rather than a fixed number, because a codebase where everything imports
eight things has no outlier at eight.

The enumeration survives behind "List all 911 references", gains its own
breadcrumb step, and the reading is one click back. Module regions keep their
sortable table: those are already ranked, so they were already readings.

510 tests, `vue-tsc` clean. Verified on the Spring snapshot from the report:
reading → click a ranked module → panel follows → list all → breadcrumb back.
At 1920 the two readings sit side by side in a centred 1000px column, panel
440px, no overflow; worst in-content contrast 4.59:1.

**Standing lesson for this surface:** when a level of the descent starts
needing layout work to be bearable, the content is wrong, not the layout.

## Round: relationships need a picture, not two lists (2026-09-22)

"Is a visualization maybe not better? I guess you're trying to show important
relationships."

Correct, and it names the error exactly. The previous round replaced 911 rows
with two ranked lists — "carries the most" and "reaches the furthest" — which
is the one thing a list structurally cannot do. Nothing on that screen said
whether `QuoteV3DaoImpl` was among `CountryRepository`'s 103 importers. Two
rankings are two independent facts; the edges between them were gone.

**Why a matrix and not a node-link diagram.** Measured first. Among the eight
widest importers and the eight most-depended-on modules of the
Repositories↔Services region, **59 of the 64 possible pairs exist**. Arcs at
92% density draw a filled rectangle. This is the sparse/dense trade-off
node-link diagrams lose: a grid reads the same fact instantly, and the *gaps*
— the pairs that do not exist — become the interesting part.

`DependencyMatrix.vue`: rows are the widest importers, columns the
most-depended-on, a square is one module importing another, square area is
how many unit references sit behind it. Row and column totals in the margins,
hover cross-traces a row and a column, clicking any name or filled cell opens
that module in the panel. At the real 10×10 cut it draws 43 of 100 pairs with
a dense top-left corner tapering off, which is the concentration story the
lists could only assert.

**A threshold that misread small grids.** `describeMatrix` first judged by raw
density, which called a 4×4 perfect diagonal — the *least* shared arrangement
possible — "overlapping", because a diagonal on an n×n grid is already 1/n
full. Replaced with how many columns a typical row touches, which is
scale-free.

Defects found in the inspection round:

- Rotated column labels escaped their gutter: 47px above the grid, into the
  prose, and 141px past its right edge, where the scroller clipped them.
  Names are now bounded at 22 characters and both gutters are sized from that
  bound rather than guessed.
- `min-w-0` on the figure let it shrink **below the grid it contains** — 392px
  holding 440px of cells — so the overflow container clipped at the figure's
  box instead of the content. It sizes to its content now.

519 tests, `vue-tsc` clean, nothing clipped, no page overflow. Verified on the
Spring snapshot from the report.

**Standing lesson, extending the last one:** ranked lists answer "which is
biggest". Only a picture answers "what is connected to what" — and which
picture is a measurement, not a preference.

## Round: the grid, made feature complete (2026-09-22)

"Take example of the grid in component connections."

`ConnectionsMatrix` already had everything: sticky row labels and column
headers, vertical (not rotated) column labels, weight-shaded cells, hover
cross-highlight, selection on headers, cycle rings, per-row cycle badges,
click-to-select-pair, double-click to open, lane stripes, scroll-into-view,
left-truncating labels. Rebuilding that would have meant maintaining two
grids and making the architect learn the same thing twice.

So the bespoke `DependencyMatrix` is deleted and the region uses the shared
one, fed by `utils/regionMatrix.ts` (12 tests) which adapts modules into
`CNode`/`CEdge`.

Two small additions to the shared component, both additive and verified not
to change Connections:

- **Optional `rowNodes` / `colNodes`.** Omitted, the grid is square as
  Connections uses it.
- **Tooltips read node labels, not ids.** An id is a component name in
  Connections and a file path here, and a tooltip naming two full Java paths
  is unreadable. This improves Connections at file grain too.

**Getting the axes right took two attempts, both measured.** Square first, on
the argument that it would show the 231 back-references as a block below the
diagonal. On the real region that was **93% empty: 20 of 40 rows were
repositories, which are imported constantly and import nothing**, and no
back-reference had both ends among the kept modules, so the picture showed
nothing extra for its emptiness. Ranking by total degree had also flooded the
grid with the most-imported modules, leaving 27 empty rows.

Now the axes are the two sides of the dependency — rows the widest importers,
columns the most imported, chosen separately and unioned:

| | fill | empty rows |
|---|---|---|
| square, by total degree | 7% | 27 of 40 |
| square, split ranking | 7% | 21 of 40 |
| **bipartite, split ranking** | **27%** | **1 of 20** |

The honest cost, recorded in the file: a reference running back the other way
only renders when its source is also a row. The count is in the claim above
the grid and every one is in the list behind it.

522 tests, `vue-tsc` clean. Verified on the Spring snapshot: 20×20 at 27%
fill, sticky headers hold on scroll, cell click opens the module, tooltip
reads "CustCallerDaoImpl uses ErrorResponse: 1 reference". Connections
re-checked under its own cap: still square, 14×14, labels and tooltips right.

## Round: what a cell is actually for (2026-09-22)

"Focus on what the user would want to inspect."

The grid said *CustCallerDaoImpl uses ErrorResponse*. The question that always
follows is **which code does it**, and that was the one thing the picture
could not draw — while sitting unused in the model the whole time, as
`ModuleEdge.via`.

**Clicking a cell now opens the dependency itself.** A `DependencyPanel`
replaces the module panel: both ends, clickable, and the declarations that
create the coupling. On LibreChat:

> OpenAIClient → handleText · 2 references
> `chatCompletion` → `addSpaceIfNeeded`
> `setOptions` → `isEnabled`
> *"Remove these and the dependency is gone."*

That is the actionable bottom of the descent. `ModuleGraph.between` indexes a
dependency by its two ends so a cell resolves in one lookup; the pair rides
the URL like every other step.

**It adapts to the language, which is this whole project's theme.** Where a
module declares one thing — every Java file — naming the declarations just
repeats the header, so the list collapses to a sentence: *"QuoteV3DaoImpl is
the only thing this module declares, so the dependency is the type itself: 1
reference to ErrorResponse."*

**Ordering.** `orderNodes` sorted the axes alphabetically, scattering the
structure the degree-ranking existed to create. Explicit axes are now used in
the order the caller chose, so the dense corner sits top-left: rows open
`QuoteV3DaoImpl, QuoteServiceImpl, OrderServiceImpl…`, columns
`CountryRepository, CommonMasterRepository…`.

**A caption that had gone false.** It still read "the block below the diagonal
is the traffic running back against it" — true of the square grid, meaningless
in the bipartite one. An earlier replacement had silently not matched. Now:
"Rows are the modules importing most here, columns the ones most imported,
both ordered by how connected they are."

523 tests, `vue-tsc` clean, no overflow. Verified on both snapshots: Java
collapses the redundant list, TypeScript names the declarations, header
clicks select a module and clear the pair.

**Worth remembering:** the deepest thing the user wanted to inspect was
already in the model and had never been surfaced. Before adding a data source,
check what the existing one is still holding back.

## Round: the grid becomes the screen (2026-09-22)

The grid was right; the screen around it was not. Measured at 1920: a 570px
figure in a 2000px window, ~290px of stacked prose above it, ~400px of dead
space below. It was an illustration inside an essay.

**Layout.** The reading collapses to one line with the rest behind a
disclosure; the grid takes every pixel that leaves; the controls sit under it
where a chart's controls belong.

| | before | after |
|---|---|---|
| grid | 570 × 620 | **1208 × 853** |
| chrome above | ~290px | 187px |
| dead space below | ~400px | 40px |

**The action that was missing.** Every other view feeds the group tray, and
`ConnectionsMatrix` has supported shift/meta multi-select all along — this
view was passing it an empty set and discarding the modifiers. ⌘-click on a
row or column now collects it, the grid marks what is collected, and the tray
offers *Create group*. Spotting a cluster and turning it into a group no
longer means leaving the view. Groups are this app's slicing concept; a
picture of structure that cannot produce one is a dead end.

**Escaping the arbitrary cap.** 20 / 40 / 80 per axis, in the URL.

Defects found in the inspection round:

- **The grid vanished entirely.** A `python` string replacement silently
  no-opped — the attribute order in the file was not what the search string
  assumed — so `size` never reached the component, arrived as `undefined`,
  and `Math.floor(NaN / 2)` sliced both axes to nothing. The grid disappeared
  behind its own "only one module imports anything here" empty state, which
  read as a data condition rather than a wiring bug. Two fixes: the builder
  now falls back to its default for a cap that is not a usable number, and
  **every scripted replacement from here asserts its target is present before
  writing** — this was the third silent no-op this session.
- `ROW USES COLUMN`, the key to reading the whole matrix, sat at 2.6:1 in
  light. It is the faintest thing on a screen the grid now owns. Raised to
  the app's muted level; Connections gets it too.

524 tests, `vue-tsc` clean, no overflow, nothing clipped, verified in both
themes at 1440 and 1920.

## Restart: Units is about what the code declares (2026-09-22)

"BRO START FROM SCRATCH."

**The root cause, found before writing anything.** Connections already has
file grain (`Grain = "group" | "component" | "file"`) and a matrix, plus
`files/dependencies.vue`, `components/matrix.vue`, `components/cycles.vue`.
"Which files import which, as a grid" is `Connections?rep=matrix&level=files`.
The round before this one literally imported Connections' own matrix into
Units. Every fix bounced because the screen was a duplicate, and no amount of
layout work fixes that.

**What only this grain knows** is the inside of a file. Confirmed against both
snapshots before designing:

| | LibreChat | Spring |
|---|---|---|
| declarations | 3,538 in 1,217 files | 5,438 in 5,438 files |
| repeated name | `handleCheckedChange` in 18 files | **`Output` in 49 files** |
| crowded file | `data-service` declares 120 | — (one per file) |
| overgrown type | `BaseClient`, 31 members | — (no members recorded) |

**The shape, from the user:** navigate the findings at unit level, and reach
Connections from any of them. So: a rail of specific claims, an evidence
panel, and a handoff.

Six kinds, each a concrete claim rather than a category — written more than
once, files doing too much, types that have grown, load-bearing declarations,
declarations that use each other, nothing imports these. The sections that
appear differ by language, which is the point: Java gets no "types that have
grown" because it records no members, and no "files doing too much" because
it is one type per file.

**The inline Connections** is the same matrix, over just the finding's files.
When they have no edges between them it says so, and that is itself the
reading: *"None of these 49 files imports another. Whatever they have in
common, it is not a dependency — so this is repetition rather than a shared
idea."*

Defects found in the inspection round:

- **The handoff landed on a cap guard.** Setting a draft group did not scope
  anything, so Connections opened on all 5,513 files and said "too many nodes
  to draw". Replaced with the scope query, which is line-based, so the
  finding's files become the scope itself — visible in the chip, clearable,
  and needing no concept Connections lacks.
- **The button lied.** "Open these 19 files" delivered a 134×134 matrix,
  because Connections scopes by *component* and then expands to files. The
  label is now "See these in Connections" with the real numbers under it, and
  the representation is chosen from what will actually be drawn rather than
  from the finding's own count.
- `constructor` is in 42 LibreChat files and is the top "repeated name" unless
  language ceremony is filtered out. It is.

**Deleted:** ShapeLanding, LaneFlow, RegionReading, RegionClaim, ReferenceList,
ModuleList, ModulePanel, ModuleRelationList, DependencyPanel, DescentBar,
`regionReading.ts`, `regionMatrix.ts`, `findings.ts`, `graph.ts` and their
tests — the whole descent. Twelve components became two. The separate-axes
props added to the shared `ConnectionsMatrix` last round were reverted, since
nothing passes them now; its tooltip-label fix stays, because that one
improves Connections on its own.

**Kept:** `useUnitsModel`, `moduleGraph`, the framework profiles.

489 tests, `vue-tsc` clean, no overflow, verified on both snapshots.

**The lesson worth keeping:** before designing a view, check whether the app
already has it. I rebuilt Connections for most of a day.

## Round: a boundary is a relationship, not a grid (2026-09-22)

The brief named it: *"how the selected groups relate"*. Clicking the link
between two lanes landed on a twenty-by-twenty grid of individual modules —
two grains below the question, with the relationship itself never stated.
The "list all" dump behind it was the same mistake again.

**The page now answers about the two groups.**

1. **The relationship, drawn.** Both lanes named with their module counts, and
   the traffic between them as two rules whose thickness scales with the
   count, so the imbalance reads before either number does. The
   against-the-grain rule is red and clickable.
2. **What to look at.** Anomalies, ranked, each opening onto its own
   dependencies: cycles first (the thing you cannot pull apart), then traffic
   against the grain, then a receiver that most of the boundary shares, then
   a module reaching too widely to be using an interface. On LibreChat's
   Components↔Utilities boundary that reads: *"28 references run from
   Utilities & Other back into Components — 20 modules are responsible"*,
   *"cn carries 137 of the 177 crossings"*, *"AppService reaches 12 modules
   across the boundary"*.
3. **Who actually crosses.** Both sides ranked with proportional bars.
   Measured first: a boundary is long-tailed — 1,391 file dependencies over
   622 senders, most carrying one or two and a handful carrying fifteen to
   twenty-two. The handful is the story and a grid buried it.

**Clicking gives clear info.** An anomaly opens a panel naming its kind, its
claim, and every dependency behind it — both ends clickable to the module,
the count clickable to the declarations that create it.

`utils/relationship.ts` (14 tests) reads the grain from the counts rather than
from the order the lanes were named, counts each cycle once, and says *"Nothing
is wrong at this boundary"* rather than showing an empty list, because an
absent warning reads as a screen that failed to load.

Fixed while building:

- A layering region carried only the offending direction, which leaves the
  relationship half-drawn: "28 against the grain" with nothing to weigh it
  against. It now carries both.
- The claim band repeated in prose what the relationship header states
  visually — the duplication this screen has been called out for before.
  Suppressed for boundary regions.
- Clickable reference counts in the anomaly panel sat at 2.44:1.

The grid and the enumeration are gone from this page. `RegionReading.vue`,
`ReferenceList.vue` (still used for the knots region), `regionReading.ts` and
`regionMatrix.ts` remain on disk; nothing but the knots list references them
now. **Left in place deliberately** — nothing in this session is committed, so
a delete is unrecoverable, as this session already proved.

558 tests, `vue-tsc` clean, no overflow, nothing clipped, both themes.

## Round: the boundary is drawn, not listed (2026-09-22)

"Use visualization. Lists should be secondary unless they are the BEST way to
show the information."

Fair hit, and worth naming precisely: the previous round put two rules and
some 72px bars on the page and called it visual. The substance was still
three ranked lists. Every quantity an architect asks at a boundary — how much
crosses, who sends most, what it all lands on, how much comes back — **is a
length**, and a list makes each one a number to compare by reading.

**The boundary is now a flow diagram.** Two columns of modules, bands between
them whose thickness is the traffic, back-traffic in red. `d3-sankey` is not
in the bundle and a dependency needs asking, but two columns need no layer
solver — `utils/boundaryFlow.ts` (12 tests) stacks cumulatively and draws
beziers.

It makes the findings visible instead of asserted: on Components↔Utilities,
`cn`'s band is 242 units tall against its neighbours' 16 and 11. The sentence
"cn carries 137 of the 177 crossings" is now the picture.

**Anomalies are marks on the diagram, not a list beside it.** They are chips
above it; opening one lights its modules red, draws a warning triangle beside
each, and fills the panel with every dependency behind it. The chip and the
picture are one finding.

Defects found in the inspection round:

- **The diagram rendered nothing.** A setup function named `flow()` shadowed
  the `flow` **prop** of the same name, so `flow.ribbons` in the template read
  a property off a function and every `v-for` produced null vnodes. Vue
  reported it as "Cannot destructure property 'type' of 'vnode'", which names
  the symptom and not the cause. Renamed to `labelFor`.
- **Labels rendered at 4.5px.** A fixed 1000-unit viewBox letterboxes: the
  diagram scaled with the window instead of the type staying put. The viewBox
  is now measured in real pixels, so one unit is one pixel and a label is 11px
  at any size; the label gutters scale with it and clip names rather than
  shrinking the drawing.
- **The measurement watched the wrong element.** The ResizeObserver was on the
  svg, whose height is derived from the viewBox that measurement sets — it
  watched a value that depended on the observation and never re-fired. Moved
  to a plain wrapper.
- A unicode ⚠ stood in for an icon, which the craft floor bans outright. The
  warning mark is an authored path now, positioned on the node rather than on
  a text baseline.
- Chip text measured 3.55:1 in the light appearance.

Verified at 1920 (1208px diagram, labels 11px, 20 nodes, 39 bands, 6 red) and
at 1100 (488px, labels 11px, two names clipped), both themes, no overflow.
570 tests, `vue-tsc` clean.

**Note:** `wails dev` had died, so the dev server is now plain `nuxt dev`
started here. Restart `wails dev` when you want the Go backend back.

**Standing lesson, third time in this brief:** the encoding follows the
question. A ranking is a list; a relationship is a matrix; a flow is a flow
diagram. Reaching for a list first and decorating it with bars is the habit
to break.

## Round: hierarchy, structure, navigation (2026-09-22)

The flow was right; the ink was spent on the wrong things.

**The folded tail was eating the diagram.** "147 more" and "191 more" took
three quarters of the height — the one thing nobody can act on was the
loudest — while the ten named modules were six-pixel slivers crushed at the
top, and the tail was painted *red* because it happened to carry a
back-reference. Three fixes: every node gets a minimum height with the
remainder shared proportionally, so the biggest is still visibly biggest and
the smallest still carries its label; the tail is never marked as an anomaly;
and twelve modules a side are named by default, with 12/24/48 offered.

| | before | after |
|---|---|---|
| smallest node | 6px | 21–24px |
| folded tail's share | 68% | 26% |

**The accent was spent on everything.** Every ribbon took it, so 153 of them
overlapped into mud with nothing traceable. Now the default is neutral, red
means one thing only — against the grain — and the accent belongs to whatever
is in focus. Clicking a module traces its bands in accent and recedes 56 of
59 others to 5% opacity.

**Magnitudes are readable without hovering.** Each node carries its reference
count beside its name, and the three heaviest a side are set in medium, so
two modules can be compared by looking rather than by pointing.

**Navigable.** The diagram is focusable and arrow keys walk it: up and down
through a column's ranking, left and right across the boundary. Verified:
↓ moves to OpenAIClient, → crosses to handleText, and the panel follows.

**It fills the room.** The drawing was 390px in a 1080px window; it now takes
its height from the stage — 896 of 944.

Defect found and fixed in the inspection round:

- Sizing the diagram *from* the stage while measuring it *against* the stage
  created a feedback loop through the scrollbar: the height changed the
  scrollbar, the scrollbar changed the width, and the ResizeObserver stopped
  delivering mid-oscillation — labels fell back to 6px. Broken by reserving
  the scroll gutter and reading the live width on the next frame.

574 tests, `vue-tsc` clean, both themes, labels 11px and node minimum ~21px at
1280 and 1920, no overflow, worst in-diagram contrast 4.82:1.
