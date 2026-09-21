# Component detail: full assessment

Written 2026-09-21. Evidence: the running app on the BroadleafCommerce snapshot
(454 components, 3,464 files, 11,718 commits, Java/Spring/JPA) and the snapshot
schema read straight from `scans/…/*.db`. No proposals here have been built.

Scope: `frontend/src/pages/views/components/[name].vue` and its six tabs.

---

## 1. What the page is today

`DetailFrame` chrome (back, breadcrumb, mono title, `Component` tag, three
header stats, tab strip, Hotspots action) over six tabs:

| Tab | What it shows | Data it reads |
|---|---|---|
| Overview | 6-cell stat strip · 14-row rank table "among 454" · group chips · every metric dumped by family | `components` row only |
| Dependencies | Hop selector, walk trail, dependents \| centre \| dependencies, 313-row pair table with refs/hops/shared/co-change/similarity/path | `component_connections_direct` (aggregated), `_indirect`, `component_matrix`, `git_component_shared_commits` |
| Files | File list with line counts, header stats, code viewer | `files where component = …` |
| History | Year heatmap, commit table, contributors rail | `git_commits where component = …` |
| Cycles | Cycle paths with size / shared commits / severity | `allCyclesExpanded` in the store |
| Java | Roles, structural flags, wiring force graph, class table | `snippets`, `java_class_connections_*` |

What is genuinely good and should survive any redesign: the walk trail in
Dependencies, the History tab as a whole (heatmap + contributors rail is the
best-composed surface in the drill-down), the Java wiring graph, and the
file-list-plus-source pairing in Files.

---

## 2. Everything the snapshot knows about one component

This is the complete inventory, verified against a real `.db`. Marked
**unused** where nothing on the component page reads it today.

### 2.1 The component row (`components`, ~70 columns)

| Family | Columns | On the page |
|---|---|---|
| complexity | `files`, `lines`, `indentation__avg/count/max/volatility` | strip + dump |
| codesmells | `code_health`, `hotspot_score`, `bumpy_road`, `static_complexity_score` | strip + dump |
| modularity | `coupling__afferent/efferent/dependents/dependencies`, `abstractness`, `instability`, `distance_main_sequence`, `component__declarations/imports`, `types__total/abstract` | dump |
| cycles | `short__count/avg/max` | dump |
| graph | `page_rank`, `betweenness`, `hits__hub_score`, `hits__authority_score`, `harmonic_centrality`, `farness_centrality`, `residual_closeness` | dump |
| git | `commits/authors/additions/deletions/unique_file_changes` × `total` **and `last_30/90/180_days`**, `age_in_days`, `repository` | totals only; **windows unused** |
| java | `class/field/method__declarations`, `jpa__entities`, `spring__beans/components/configurations/controllers/repositories/services`, `spring__request_mappings__{get,post,put,patch,delete,total}` | dump + Java tab |
| js | `react__components` | dump (noise on a Java project) |

### 2.2 Relationships

| Table | Carries | Status |
|---|---|---|
| `component_connections_direct` | from, to, **file**, reference_count | the `file` column is aggregated away by `group by from, to` — **unused** |
| `component_connections_indirect` | shortest_path_length, **shortest_path** (full "A -> B -> C" string) | only the length is used; **the path itself is unused** |
| `component_matrix` | linguistic_similarity, git_co_changes, path_distance | used in the pair table |
| `git_component_shared_commits` | shared_commits + % of each side's commits, **× 30/90/180-day windows** | totals only; **windows unused** |
| `component_connections_furthest` | furthest_component, distance, full shortest path | **unused anywhere in the app** |
| `component_communities` | community_nr, community_size + 13 community-level aggregates | **unused in any view** (only the lens suggester reads it) |
| `component_strongly_connected_groups` | group, group_size + 13 group-level aggregates | **unused anywhere in the app** |
| `component_cycles_shortest` + `git_component_cycles_shortest_shared_commits` | cycle membership, size, shared commits per window, severity | Cycles tab (totals only) |

### 2.3 Contents

| Table | Carries | Status |
|---|---|---|
| `files` | 45 metrics per file + `directory`, `component` | Files tab reads all of it, displays lines only |
| `directories` | full metric row per directory | **unused on this page** (a component spans directories) |
| `file_matrix` | file↔file similarity, co-change, path distance | **unused here** — this is internal cohesion, the thing a component page is for |
| `snippets` | every typed fragment with begin/end position: imports, declarations, types, abstract types, methods, fields, annotations, extends/implements, JPA entities, Spring mappings | Java tab only |
| `file_contents` | source | code viewer |

### 2.4 History and beyond

- `git_commits` — file, component, hash, time, author, message, additions, deletions. Used in History.
- `git_authors` — project-wide author totals including `unique_component_changes`. Unused here (History derives its own contributor list).
- **Scan history** — several immutable snapshots per workspace, identical schema. Nothing on the page is cross-snapshot.
- **App-side**: groups and the lens/dimension model, the scope bar, the selection tray. The page shows flat group chips and nothing else.

---

## 3. Findings

### 3.1 Two defects

1. **The Main Sequence distance never renders.** `RANKED_KEYS` in
   `[name]/index.vue` asks for `modularity__distance_from_main_sequence`; the
   column is `modularity__distance_main_sequence`. The row is silently dropped —
   14 rows render where 15 were intended. It is the one Martin metric that
   summarises the other three, and it is missing.
2. **Junk rows in "All metrics."** The dump iterates every column, so a Java
   project shows `java_class` → "Java Class —" and `js__react__components` → 0.
   `HIDDEN` filters five keys; it does not filter identity columns or
   zero-valued foreign-language families.

### 3.2 The Overview is a dump, not a reading

Sixty-plus numbers in a two-column definition list, a 14-row rank table with
identical neutral bars whether a percentile is good or bad, and no visual at
all. The product principle is "evidence over verdicts" — but this is evidence
with no reading offered, which is the opposite failure. The crown-jewel
visualisations exist everywhere in the app except the one page dedicated to a
single component.

Four un-asked questions the Overview should be answering, all answerable from
data already in the file:

- **What kind of thing is this?** afferent/efferent/instability/abstractness
  place every component in one of a handful of roles (leaf, hub, bridge,
  orphan, zone of pain, zone of uselessness). Today the user computes that
  themselves from four numbers in a list.
- **Where does it sit in the system?** Community 11 of 52 members; strongly
  connected group 102 of **50 members**; furthest reach 8 hops. For
  `core.catalog.domain` that SCC membership — a 50-component tangle — is the
  single most important fact about it, and the page never mentions it.
- **Is it moving?** The 30/90/180-day windows are all there. "347 commits, 1 in
  the last 180 days" is a different component from "347 commits, 40 in the last
  30." Both read identically today.
- **How is it built inside?** No cohesion measure, no directory spread, no API
  surface (public types, abstract types, methods), no health distribution
  across its own files.

### 3.3 Dependencies stops one step short of action

The pair table is strong, but the two facts that let someone actually cut a
dependency are discarded in the query:

- **Which file causes the edge.** `component_connections_direct.file` is
  aggregated away. For `core.catalog.domain`, three files (`CategoryImpl`,
  `SkuImpl`, `ProductImpl`) produce most outgoing references — that is the
  refactoring target, and it is one `group by` away.
- **What the indirect path actually is.** `shortest_path` holds the full chain;
  only its length survives. "Why does A reach B?" is unanswerable in the UI.

Snippets carry begin/end positions, so the chain can run all the way down to
the import line.

### 3.4 Groups are first-class everywhere except here

The sidebar is built on lenses and groups; this component belongs to "Shared."
The page shows a chip. It never says how much of its coupling stays inside its
group versus leaks outside, which is the question groups exist to answer, and
it offers no way to act on the component from here (add to group, start a group
from its neighbours) even though the shared selection tray already exists in
the Dependencies tab.

### 3.5 Smaller gaps

- Files tab sorts by name and shows lines only — health, hotspot, churn and the
  internal `file_matrix` are all available per file.
- Cycles tab repeats the global cycles table; nothing frames *this component's*
  role in the cycle (is it the cut point? which edge is cheapest to remove?).
- No cross-snapshot read, despite scan history being a headline capability.
- No component-level actions: copy name, open folder in editor, copy the SQL
  that produced the view (the open-data-contract claim), explain a metric.
- Tabs are router links; no keyboard traversal in a product whose brief says
  dense and keyboard-friendly.
- Multi-repo workspaces carry `git__repository` per component; the page never
  says which repo a component came from.

---

## 4. What could be included — the menu

Grouped by what it would cost.

### Tier 1 — new reading, data already loaded in the store

- **Role band**: classify from afferent/efferent/abstractness/instability, name
  the role, one line of plain evidence.
- **Main Sequence plot**: all components as a scatter, this one lit. The canon
  chart for the canon metric, at last rendered.
- **Percentile strip** replacing the 14-row table: one compact row per family,
  direction-aware colour (high betweenness is not the same kind of "high" as
  high code health).
- **Activity trend**: 30/90/180 windows as a small bar set plus "cooling /
  steady / heating" derived from them.
- **Bus factor / ownership** from the contributors already computed in History.
- Fix the Main Sequence key and the junk-row filter.

### Tier 2 — one query each, new facts

- **Position card**: community (nr, size, rank inside it), strongly connected
  group with size, cycle count, furthest reach with the actual path.
- **Edge provenance**: expand any dependency row into the files (and, via
  snippets, the import lines) that cause it.
- **Indirect path display**: show `shortest_path` as a chain of chips, walkable.
- **Internal cohesion**: `file_matrix` restricted to this component's files —
  a small matrix or force graph; cohesion ratio against external coupling.
- **Group-relative coupling**: inside-group vs outside-group split of afferent
  and efferent, with the leak list.
- **API surface**: snippet-type counts for the component — declared types,
  abstract types, methods, exported names.
- **Directory spread**: which directories the component's files live in.
- **Recency-weighted co-change**: the 30/90/180 columns in
  `git_component_shared_commits` — "coupled historically, but not lately."

### Tier 3 — new surface or new structure

- **Cross-snapshot compare**: the same component in two snapshots, deltas on
  every metric. Storage already supports it; v1 scope says deferred.
- **A "Inside" tab**: composition, cohesion, API surface, directory spread —
  everything about what the component *is* rather than what it touches.
- **Cut analysis on the Cycles tab**: rank the edges of each cycle this
  component sits in by how cheap they are to remove (reference count × shared
  commits), i.e. "cut here."
- **Component-scoped SQL console** honouring the open-data-contract claim.

---

## 5. Three shapes the page could take

**A. Reference sheet, repaired.** Keep the structure; fix the two defects,
replace the rank table with the percentile strip, drop the dump behind a
disclosure. Cheapest; leaves the "no reading" problem intact.

**B. A reading on top of a reference.** Overview becomes composed: role band,
Main Sequence plot, position card, activity trend, internal composition — with
the full metric table moved behind "All metrics" or into its own tab. Tabs
otherwise unchanged, plus Tier-2 upgrades to Dependencies and Files. This is
the proposal the evidence points at.

**C. Restructure around questions.** Six tabs become four, named for what the
user is asking: *Reading* (what it is, where it sits, whether it moves),
*Connections* (dependencies, cohesion, group leak, cut analysis), *Inside*
(files, API surface, source), *History*. Java folds in as sections rather than
a tab. Biggest change, best fit with the question-based direction already taken
for the top-level views in `views-plan.md`.

---

## 6. Open decisions

1. The primary job of the page: triage ("should I worry?"), structural reading
   ("how is this wired?"), change-safety ("can I touch this?"), or reference.
2. Shape A, B or C.
3. Which Tier-2 additions earn a place in the first round.
4. Whether cross-snapshot comparison enters now or stays deferred.

---

## 7. Direction (confirmed 2026-09-21)

Answers: the page serves all four intents, selected by the user rather than by
the design; shapes **B and C together**; first-round additions are **position**,
**edge provenance and indirect paths**, and **internal cohesion plus group
leak**; **cross-snapshot deltas are in**. Activity windows (30/90/180) were not
chosen and are not part of the round.

### Job and audience

Both PRODUCT users arrive here the same way — from a table, a hotspot, a
matrix cell, a cycle — carrying one of four intents: *what kind of thing is
this*, *where does it sit*, *can I change it safely*, *should I worry about it*.
The page cannot guess which. It answers all four in one screen, at one headline
fact each, and routes to depth.

The named risk: "serve every intent" is how today's dump happened. The rule
that prevents the repeat — **one band per intent, one headline fact, one
visual, one route. No band may degrade into a list of numbers.** The complete
metric table lives behind a disclosure and nowhere else.

### Outcome and proof

Primary action: read the component in under ten seconds, then leave for the tab
that owns the question. Success is the user clicking through, not dwelling.

Proof is the snapshot only. Every headline fact traces to a column or a query
named in §2. No score the app cannot explain (Principle 4). Role names are
descriptions of coordinates, not grades.

### Selected direction

Structure (C): six tabs become four, named for the question.

| Tab | Owns |
|---|---|
| **Reading** | the five bands below, the delta column, All metrics behind a disclosure |
| **Connections** | dependents \| this \| dependencies with the walk trail, pair table, edge provenance, indirect paths, cycles with cut ranking, Java wiring and structural flags |
| **Inside** | files list + source, classes, API surface from snippets, cohesion, directory spread, health distribution |
| **History** | unchanged — heatmap, commits, contributors |

Java stops being a tab: roles and classes land in Inside, wiring and structural
flags in Connections, each section rendering only when the snapshot has Java.
Cycles stop being a tab: cycle membership is dependency structure and belongs
with Connections. Old routes redirect.

Composition (B) — the Reading tab, top to bottom:

1. **Shape** — role read from afferent/efferent/abstractness/instability, with
   the Main Sequence scatter: all components, this one lit. The canon chart for
   the canon metric, rendered at last. → Connections
2. **Position** — community nr and size, strongly connected group and size
   ("inside a 50-component tangle"), cycle count, furthest reach with the real
   path. → Connections
3. **Blast radius** — direct dependents, transitive reach, the top dependents,
   and the files that carry the coupling (edge provenance, summarised).
   → Connections
4. **Standing** — health, hotspot, churn and centrality as one direction-aware
   percentile strip: high betweenness and high code health are not the same
   kind of high, and must not render the same. → Inside, History
5. **Composition** — files, lines, API surface, cohesion ratio against external
   coupling, group leak, directory spread, health spread over its own files.
   → Inside
6. **All metrics** — collapsed. Family-grouped, definitions on hover, junk rows
   filtered.

Deltas: every headline number carries a change chip against the previous
snapshot of the same workspace, baseline selectable. This is the only place in
the app where "come back next week" becomes visible at component scale.

### Scope and boundaries

In: the four tabs, the five bands, the three chosen additions, deltas, both
defects from §3.1.

Untouched: `DetailFrame` chrome, the walk trail, the History tab, the wiring
graph, the code viewer, the selection tray and group actions, the sidebar,
every other view.

Anti-goals: no dashboard of equal cards; no grade, score or letter the app
cannot derive from a named column; no new npm dependency; no verdict copy the
evidence does not carry; no band that becomes a number list; no loss of the
walk trail or History.

### States and ranges

Component count 1 to ~5,000. Names up to ~60 characters, dotted, slashed or
`::`. Must hold: no git in the snapshot (History, deltas, churn all absent);
no Java; a single snapshot with no baseline; the component absent from the
baseline (reads "new"); zero dependents and zero dependencies; an SCC of 50 and
an SCC of none; a dormant repo where every recent window is zero; 313 pairs and
3 pairs; 1 file and 400 files.

### Interaction and layout

Wide native window, 1280px and up, dense and quiet. Bands are hairline-
separated strips down one column at a readable measure, not a card grid; each
band's route is a right-aligned link in its own header. Tabs traversable from
the keyboard, and the four tab names must survive a narrow window. Light and
dark both, following the OS. Deltas are sign-coloured only where a direction is
defensible, neutral elsewhere.

### Constraints and open decisions

Vue 3, TypeScript, Pinia, Tailwind, D3, existing `.ui-*` vocabulary and tokens;
all data through `store.query` and `useAsyncQuery`; offline; no new
dependencies without asking.

A builder must not invent: whether the 30/90/180 activity windows appear at all
(currently out — the History band carries them at near-zero cost if wanted);
how the delta baseline is chosen in the UI; whether folding the Java tab away
is acceptable for Java-heavy workspaces, which is the one reversible-but-loud
consequence of shape C.

---

## 8. Build log (2026-09-21)

Built on branch `shell/workspace-sidebar`, uncommitted, verified against the
BroadleafCommerce snapshot (454 components) and qp-visualizer (611 components,
two snapshots, no git history).

### Tabs

`Overview · Dependencies · Files · History · Cycles · Java` became
`Reading · Connections · Inside · History`. The four old routes are kept as
redirect pages so older links still land: `/dependencies` and `/cycles` →
`/connections`, `/files` and `/java` → `/inside`.

### New

- `utils/componentRole.ts` (+ tests) — role and Martin-zone naming from the
  four coordinates, with percentile ranking.
- `utils/delta.ts` (+ tests) — the comparison arithmetic and its wording,
  pure and away from the fetch.
- `composables/useComponentDelta.ts` — baseline row from an earlier snapshot.
- `composables/useComponentPosition.ts` — community, strongly connected group
  and furthest reach; the three tables nothing read before.
- `composables/useComponentJava.ts` — the old Java tab's data layer, lifted out
  so wiring can live in Connections and classes in Inside off one query each.
- `components/component/` — `ReadingBand`, `MainSequencePlot`, `PercentileStrip`,
  `DeltaChip`, `ComponentWiring`.
- `pages/…/[name]/connections.vue`, `pages/…/[name]/inside.vue`.

### Changed

- `pages/…/[name]/index.vue` — the five-band Reading tab.
- `components/detail/StatStrip.vue` — optional delta per cell (additive).
- `components/coupling/PairTable.vue` — optional `inspectable` row action
  (additive; every other caller is untouched).
- `app/query/query.go`, `app/services.go` — `QueryIn(scanID, sql)` reads a
  second snapshot through its own cached handle, leaving the open one alone.
  **The bound facade in `app/services.go` is the one that matters**: adding the
  method to `query.Service` alone produces no binding and a Vite 500 on the
  stale generated file.
- `stores/data.ts`, `utils/db.ts` — `queryIn` beside `query` at the same seam.

### Defects fixed

- `modularity__distance_from_main_sequence` → `modularity__distance_main_sequence`.
  The Main Sequence distance now ranks and renders.
- The metric dump drops identity columns and any non-core family that is
  entirely zero, so a Java project stops reporting `java_class —` and
  `js__react__components 0`.

### Verified

Role and zone naming, the Main Sequence plot with its perpendicular, community
and strongly connected group, furthest path, blast radius with the files that
carry each import, edge provenance and indirect paths, cycles, wiring, file
list with roles and sorting, cohesion, group leak, file-health spread, the
metric disclosure. Light and dark. Edge cases seen live: a leaf on the main
sequence, a snapshot with no git, a component in no cycle, a 50-component
tangle. 356 unit tests pass; the Impeccable detector is clean.

**Deltas**: the seam is verified live — `QueryIn` reads an earlier snapshot
while the open one stays open and queryable. No change chip has yet been seen
on screen because the only workspace with two scans holds two identical scans;
every delta is zero, which is correctly rendered as silence. The arithmetic and
wording are covered by `utils/delta.test.ts`.

### Left open

- Activity windows (30/90/180) remain unused, as chosen.
- `git__repository` still unshown for multi-repo workspaces.
- Keyboard traversal of the tab strip is unchanged.

---

## 9. Connections rebuilt (2026-09-21, same day)

The first cut of Connections failed on its own terms: three panes showing one
dataset three times, 823 rows over 17 pages, and a click whose meaning changed
with the row it landed on. Verified on `Sylius\Component\Core\Model`, which has
443 dependents.

### The defect underneath it

`modularity__coupling__afferent` counts the **files** that import a component,
not the components — proven against both snapshots: for `Core\Model` it reads
1,405, which is exactly `count(*)` and `count(DISTINCT file)` of its incoming
rows, while 443 components import it. `modularity__coupling__dependents` is the
distinct component count (443, matching `count(DISTINCT "from")`), and
`dependencies` likewise. The engine's own `short_description` for afferent
("Number of components that depend on this component") is the misleading part.

Everything that says *components* now reads dependents/dependencies, with an
exact fallback counted from the connection rows the store already holds. The
Reading tab's Shape lede was overstating by 3–4× on every project; it is right
now. `afferent` still appears, named "Importing files", which is what it is.

### What Connections is now

- **A coupling flow.** Dependent groups on the left, dependency groups on the
  right, the component between them as a wedge. Both sides share one vertical
  scale, so 443 in against 16 out is the picture rather than a caption; the
  only licence is a floor per band so a small side stays labelled. Rolled up by
  name depth (1–3 segments) or by the user's own groups when a lens exists.
- **One list, not three.** The same roll-up as a list: group row, bar, counts;
  expanding shows members with the group prefix stripped, so the rows differ
  from each other instead of repeating `Sylius\`.
- **One inspector.** Selection explains itself in the right rail: references,
  shortest path, shared commits, co-change, the files that carry the import in
  each direction, and the indirect path when no import exists.
- **One click, one meaning.** A row or a band *selects*. Nothing navigates on
  its own. Leaving is two labelled buttons in the rail — **Open** and **Walk
  here** — and the walk trail only appears once a walk has started.
- Dead columns are gone: `Similarity` was `0.00` on all 1,017 Sylius pairs,
  `Hops` was `1` everywhere visible. `PairTable` (still used by other views)
  now drops any column where every row is null or zero.

### New

`utils/neighbours.ts` (+17 tests) — roll-up by path or lens, prefix-relative
names, tail folding, band heights. `components/component/CouplingFlow.vue`.

### Verified

Sylius `Core\Model`: the shape, a band click selecting and expanding its group,
a member selecting into the inspector with its 14 importing fixture factories,
Walk here recentring onto `Fixture\Factory` (6 in, 38 out — the asymmetry
flips and the scale follows), the trail and its way back. Light and dark. 373
tests pass; the detector is clean.

---

## 10. Connections round two (2026-09-21)

### Roll up by name was broken on any codebase with a shared prefix

Depth counted segments from the left of the raw name, so on Broadleaf — where
every component starts `org.broadleafcommerce.` — depth 1 and depth 2 both
answered "org", one group of 48. Depth now counts segments **after the prefix
every component shares** (`segmentPrefix` trims the store's character-level
common prefix back to a whole segment), and group labels drop that prefix.
Broadleaf at depth 2 now reads `core.web · core.order · core.catalog ·
core.search · admin.server · admin.web · core.inventory · core.pricing ·
core.checkout · admin.persistence · core.promotionMessage` — eleven groups.

### Groups keep their colour

Rolled up by lens, every band, bar and dot carries that group's own colour, on
both sides of the flow and in the inspector. A band with no group reads
neutral rather than borrowing the blue that means "incoming" in name mode.

### Tabs: five, not four

`Reading · Connections · Cycles · Inside · History`.

- **Cycles is its own tab**, with its count in the strip. It opens on a
  reading — "In 50 cycles, 2 to 5 components long, with 25 other components.
  The heaviest runs through core.order.domain." — then the components it is
  most often tangled with as chips, then every cycle, sortable, with a
  shortest-only filter. Fifty cycles should not be something you scroll past.
- **Wiring moved to Inside**, behind a `Files | Wiring` switch. It describes
  the classes *inside* the component, so it belongs beside them; Connections is
  now purely component↔component.

### The wiring graph

- Above 24 classes, only the busiest eight are labelled, plus the selection and
  its neighbours; every node keeps its tooltip and the legend says so.
- Columns are built from the roles actually present and spread across the
  width. All 21 catalog.domain classes are Entities, which used to stack them
  into the rightmost eighth of an empty canvas; with one role the layout now
  lets the charge spread them instead.
- The selection wins outright in a crowd: bigger, ringed, with everything it
  does not touch at 0.12.
- It opens on the busiest class, not the alphabetically first — landing on one
  with no edges used to dim the entire graph to make its point.
- **When there are no edges at all, there is no graph.** catalog.domain records
  no import between its own classes, so the 21 floating dots are now an empty
  state that says exactly that and points at the external-wiring switch.

---

## 11. Connections round three (2026-09-21)

- **The list hover did nothing.** `.bg-ground` *is* `--c-neutral-50`, and the
  member rows hovered to `bg-neutral-50` — the same token as their own
  background. They now hover to `neutral-200`, which lifts as far on ground as
  the app's `.ui-table` hover lifts on surface.
- **A band now takes you to its group.** Clicking a lane scrolls its row into
  view (`block: "nearest"`, so the diagram stays put when the row is already
  visible) and expands it.
- **"Both ways" reaches its cycle.** A mutual import is a two-component cycle,
  so selecting one offers **Cycle** beside Open and Walk here, landing on
  `/cycles?with=<other>`: the Cycles tab filters to the cycles the two share,
  shows a removable chip, and re-reads — "8 of its 53 cycles also run through
  elepy.auth.authentication, 2 to 4 components long." The partner chips there
  now filter in place instead of navigating away.
  The first attempt put a `router-link` inside the row `<button>`; that is
  invalid HTML, the parser lifts it out, and the tag vanished from the
  accessibility tree. The row keeps a plain tag; the action lives in the rail,
  which is the rule the page already follows.
- **1 / 2 / 3 read as hops.** The control is now labelled **Segments**, carries
  a title saying it is name segments after the shared prefix and *not* a hop
  count, and prints what it currently produces — `e.g. elepy.auth`.
- **Prefix trimming.** `getComponentName` cuts the shared prefix by character,
  leaving a leading separator on every name and an empty label for the
  component that *is* the prefix (`elepy` rendered as ""). The Cycles tab now
  trims on a segment boundary and falls back to the full name.

### Worth knowing

The open snapshot is **global backend state**, but every frontend keeps its own
idea of which workspace it is in. With the native window and a browser tab open
at once, switching workspaces in one makes the other query a different
snapshot: component rows come from memory, fresh queries come from the new
file, and a component reads "0 dependents" while its metrics still show. It bit
this session three times. Not fixed — it is outside the component detail work —
but it is a real defect of the shared dev setup.

---

## 12. Connections round four (2026-09-21)

### Full names, with the shared part muted

Stripping the group's prefix off member rows left fragments that name nothing
— `eqs`, `br`, `mapper` — while a row that happened to *be* its group kept its
whole name, so the same list mixed two conventions. Rows now carry the full
component name, with the part the group already said in `neutral-500` and the
distinguishing tail in `neutral-800`:

```
com.elepy.auth.authentication      ← "com.elepy.auth." muted, "authentication" not
com.elepy.auth.users
```

`relativeName` is gone; `splitSharedPrefix` replaces it (+ tests), falling back
to muting the project prefix when a row is its own group, so nothing is ever
muted away entirely. Measured on both themes: 4.98:1 dark, 4.58:1 light.

### The walk always says what it is showing

`Walk from…` swapped the subject and left **no trace at all**: it reset the
trail to a single entry, and the trail row only rendered from two entries up.
The page header said one component while everything under it described
another, with nothing on screen to explain it or get back.

There is now one subject row, always present, directly under the toolbar:

- at rest — `Showing [elepy.http]  Select a neighbour, then Walk here to
  follow the chain`, which is also where the walk explains itself for the
  first time;
- mid-walk — the trail with its relationships, plus `Back to elepy.http`;
- after a jump — `Showing [auth.authorization]  Back to elepy.http`.

`Walk from…` is renamed **Show another…**, moved out of the metric toolbar into
that row, and titled "Point this view at a different component, without leaving
this page".

### Note for searching this tree

`grep -r` silently skips `pages/views/components/[name]/` in this sandbox — the
bracketed directory name. Two edits looked like no-ops because of it. Walk the
tree in Python when checking whether a symbol is still used.

---

## 13. Cycles revamped (2026-09-21)

Fifty-three rows that all opened and closed on the same component name, sorted
by an unexplained score. The page listed cycles; it never helped decide
anything.

### The reading it should have had

Breaking a cycle means removing **one edge**, and a component's cycles overlap
heavily — the same one or two imports hold most of them together. So the page
now leads with **Where to cut**: a greedy set cover over the edges of this
component's cycles, ranked by how many it breaks, tie-broken on how few import
references it costs. For `com.elepy.http`:

```
1  elepy.http → elepy                      32 broken   2 refs · 40 shared   21 left
2  elepy.annotations → elepy.http          14 broken   1 ref  · 17 shared    7 left
3  elepy.http → elepy.auth.users            4 broken   2 refs · 17 shared    3 left
4  elepy.schemas → elepy.http               2 broken   4 refs ·  1 shared    1 left
5  elepy.auth.authentication → elepy.http   1 broken   2 refs · 103 shared   none left
```

— "2 imports hold 46 of the 53 together — 3 import references in total. All 53
come apart in 5."

Selecting a cut filters the list to exactly the cycles it removes (32 for the
first) and expands to the files carrying that import — for cut 1,
`HttpServiceInterceptor.java` and `DefaultHttpContext.java`, one reference
each. Fifty-three cycles to two lines of code to change.

### The rest

- **The cycles are written from the component outwards.** Every path started
  and ended on the same name; the column now reads "Through — from elepy.http
  and back" and lists only what the cycle passes through. A two-component
  cycle reads `mutual · elepy`.
- **Participants** rank by cycles shared and filter in place.
- **Severity is labelled as ours.** It is not an engine metric — the view
  computes `size × (1 + shared commits) × (1 + average hotspot)` — so the
  column and the sort now say so on hover rather than presenting a bare score.
- New `utils/cycles.ts` (+16 tests): `edgesOf`, `edgeUsage`, `cutPlan`,
  `participantsOf`, `pathWithout`.

### Dev-environment trap, cost an hour

New Tailwind classes in a **recreated** file are not picked up by the dev JIT:
`w-[190px]` and `sm:flex` resolved to nothing, so the cut-plan bars had zero
width and the column was `display:none`, while `w-[120px]` (used elsewhere in
the app) worked fine. The content globs are correct — `fast-glob` matches the
bracketed directory — it is purely a watcher staleness thing on files that were
deleted and rewritten. `touch frontend/nuxt.config.ts` (the project's own
documented restart) fixes it.

Consequence worth knowing: **round three's list-hover fix could not have been
rendering when it was verified**, because `hover:bg-neutral-200` was new in a
recreated file. It resolves now. Any visual check of a newly created file in
this session should be re-run after a Nuxt restart.

---

## 14. Cycles, second pass (2026-09-21)

The cut plan told the architect *which edge*. It did not tell them what that
edge is made of, which is the thing you need before you can act.

### A cut now names what to delete

The snapshot records import declarations as snippets, with the imported symbol
and its line. Attributing a symbol to the **longest component name that
prefixes it** (`symbolOwner`) separates `com.elepy.Elepy` from
`com.elepy.i18n.ElepyInterpolator` — the first belongs to the target, the
second does not. So selecting a cut now reads:

> Breaking it removes 32 of the 53 cycles. 2 files import one name from
> elepy: `com.elepy.Elepy`.
>
> **What to break** `com.elepy.Elepy` · 2 files
> **Where** `HttpServiceInterceptor.java:3` · `DefaultHttpContext.java:3`

Thirty-two cycles, one class, two lines. Class-level symbols only exist where
the language extension records import declarations — Java does; PHP and Python
record the component only — so the file-and-line sites carry the answer either
way, and the symbol list simply does not appear.

### Three smaller things, all in the same direction

- **The rows read as sentences.** `elepy.http` **imports** `elepy`, not a bare
  arrow whose direction the reader has to infer.
- **Co-change is read as a share of history.** 103 shared commits means
  nothing on its own; against this component's 103 total it means the two have
  never changed apart. That edge's number now takes the amber ink, and the
  expansion says it in words. The other four stay neutral.
- **The count is calibrated.** "That is more than 94% of the components in this
  snapshot", from the engine's own `cycles__short__count` — so a reader who has
  never seen another component knows whether 53 is a lot.

`utils/cycles.ts` gains `symbolOwner` and `lineOf` (+6 tests). 403 total,
detector clean.

---

## 15. Cycles, drawn (2026-09-21)

Rejected on sight: "just a bunch of tables that require a lot of reading",
links that "take me random places", "no visuals". All three were fair. The
page had grown by accretion of sentences and tables, on a product whose own
principles say the visualizations are the crown jewels.

### The map

Every cycle leaves this component and returns to it, so it sits in the middle
and the components its loops pass through ring it. `CycleMap.vue`, pure SVG:

- **Orange leaves, blue returns, grey runs between the others.** Width is how
  many cycles use that import.
- **Only the cut candidates are drawn brightly**; every other edge is context
  at 16% opacity. The map argues the same thing the plan does rather than
  depicting all 60 edges equally.
- **Choosing a cut dashes that edge and fades everything that drops out of
  every cycle.** The tangle visibly comes apart — the claim proves itself.
- Ring capped at 16 components by involvement, the rest declared in the
  legend. Labels take the shortest tail that keeps them **distinct**: two
  different components had both truncated to `service.workflow`, which is a
  map telling a lie.

### The page

`reading line → map → where to cut → (Every cycle)`. The chip row is gone —
the ring is the chip row. The table is behind a disclosure. The whole
argument now fits one screen.

### Links

Component names in the cycle paths used to navigate away to another
component's Reading tab, losing the page. They now filter in place, like
everything else here; a chosen ring component gets a strip with an explicit
**Open**. One click, one meaning — the rule Connections already follows.

### Verified

Captured through the headless Chrome left over from an earlier session over
CDP, because the desktop app's browser pane was closed. On
`core.catalog.domain` (50 cycles, 25 components): the map, the legend, the
plan, and the cut-selected state — edge dashed, dependents faded, and the
expansion resolving to one class in `Sku.java:32` breaking 15 of 50 cycles.
403 tests, detector clean.

---

## 16. Cycles: the count bug, and a map that explains itself (2026-09-21)

### `cycles__short__count` counts positions, not cycles

A stored cycle path repeats its first component at the end
(`dao -> domain -> solr -> dao`), and `component_cycles_shortest` carries one
row per position, so whichever component **starts** a cycle is counted twice.
`cycles__short__count` is that row count:

| component | column | distinct cycles | ratio |
|---|---|---|---|
| `openadmin.dto` | 106 | 53 | 2.00 |
| `core.catalog.domain` | 95 | 50 | 1.90 |
| `core.order.domain` | 96 | 72 | 1.33 |
| `common.web` | 81 | 80 | 1.01 |

The inflation differs per component, so it distorts ranking as well as the
count — and the Reading tab was ranking it while its own Position band showed
the honest number. `cycleCountsByComponent` now derives the real count once
from the expanded cycles, and both the Cycles calibration and the Reading
tab's standing row use it. The Cycles lede also stops claiming "more entangled
than 100%": when a component is the worst, it says so.

### The map now answers its own questions

Asked what the lines mean, how 35 is defined, and how the cuts were chosen —
none of which the page said anywhere.

- **Every cut carries its number on the line.** A pill on the arrow reads
  `35`, and the sentence under the map defines it: "the number on each says
  how many of these 53 cycles it breaks".
- **One rule, one colour.** Bold accent = an import worth removing; faint grey
  = the rest of the subgraph. The blue "it imports me" hue is gone: direction
  is already in the arrowheads, and a second hue explained nothing.
- **The subgraph is drawn whole.** The ring cap is removed — a web missing 22
  of 38 components depicts nothing anyone should trust.
- **The method is stated.** "A cycle breaks if you remove any one import in
  it. These are chosen greedily: the import that appears in the most
  still-standing cycles first, ties going to the one with fewest references to
  rewrite, repeated until no cycle is left."
- **Every number has a column name**: Import to remove · Cycles it breaks ·
  Work to remove it · Still looping. The cell reads `35 of 53`, not `35
  broken`.

---

## 17. The engine fix, and proving the cuts (2026-09-21)

### Fixed at the source

`core/component/shortest_cycles.go` closes a cycle by repeating its first
element (`value = append(value, value[0])`), and both consumers ranged over
that slice directly — counting the component a cycle *starts at* twice.

- `extensions/components/graph_metrics.go` → `cycles__short__count` inflated.
- `extensions/components/shortest_component_cycles_view.go` → a duplicate row
  per cycle in the exported `component_cycles_shortest` table, so anyone
  querying the snapshot got the same wrong answer.

Both now use a new `Cycle.Components()`, which returns each component once, so
the next consumer cannot repeat the mistake. `extensions/components/graph_metrics_test.go`
asserts the metric counts cycles rather than path positions; **restoring the
old line makes it fail with `expected: 1, actual: 2`**, which is what makes it
a regression test rather than a passing assertion.

*(Engine repo touched, which PRODUCT.md says needs asking first — taken as
asked when the fix was requested.)*

### Proving the cuts actually break the cycles

Two levels, because the first is not enough.

**The algorithm.** `cutPlan` is now covered by tests asserting the invariant
directly: after applying the plan, every input cycle has lost at least one
edge, and the per-step `breaks` counts sum to exactly the number of cycles.

**The real graph — which falsified the page's claim.** The plan reasons over
`component_cycles_shortest`, and that view lists only the *shortest* cycles.
Removing their edges can leave a longer loop standing. Measured against real
snapshots:

| component | listed cycles | listed cycles left | still in a cycle? |
|---|---|---|---|
| `com.elepy` | 37 | 0 | no |
| `openadmin.dto` | 53 | 0 | no |
| `com.elepy.http` | 53 | 0 | **yes** |
| `auth.users` | 22 | 0 | **yes** |
| `core.catalog.domain` | 50 | 0 | **yes** |
| `common.web` | 80 | 0 | **yes** |

So "All 53 come apart in 5" was false for four of six. The page now checks the
full dependency graph itself (`cycleThrough`, `stillCycles`) and keeps cutting
until it is clear (`extendCutPlan`, cheapest edge of each surviving loop),
reporting one of three verified outcomes:

- no cycle runs through it after the listed plan, or
- *N* more cuts clear the rest — shown below a separator, labelled by the
  length of the loop each was found in, never mixed into the "of 53" column, or
- longer loops remain beyond what a short plan can undo (`com.elepy.http`:
  still tangled after 12 further cuts).

On `core.catalog.domain` the app now says 9 cuts clear every listed cycle and
1 more clears the graph — matching an independent Python check over the
snapshot exactly.
