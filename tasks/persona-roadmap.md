# Archstats Desktop: three-wave roadmap for the gap analysis

*This is a plan only; no files were edited. Sources: the gap analysis (`gaps-report.md` and `gaps-full.json`, which keep 47 gaps and drop 20), the eight cluster briefs, and two critiques (principles and UX; feasibility). I checked it against both repos on 2026-09-24. This revision applies both critiques. Where I only partly agreed with a point, or disagreed, the reason is in [Appendix A](#critique-notes).*

---

## 1. Summary

- **Wave 1: trust the numbers and get them out.** Both repos are committed, tagged and buildable without a local `go.work`.
  - Correct git history.
  - A commit and a revision recorded on every snapshot.
  - Health scores that show how they were computed.
  - A metric reference and an "About this snapshot" page.
  - CSV, Markdown, PNG and SVG export, each with a provenance caption.
  - Pseudonymised authors, shipped in the same release as the exports they protect.
  - A native menu, which fixes ⌘C and ⌘V in macOS release builds.
- **Wave 2: compare and read the structure.**
  - The architect gets:
    - one "Changes" rail row with Compare and Over time. A comparison can re-scan the baseline commit, so the first comparison always works.
    - a baseline, and snapshot import and sizes.
    - declared architecture checked against the code.
    - the levelized matrix and system-shape numbers.
    - group pages.
    - commit footprint.
    - hidden coupling, shown inside Connections.
    - custom history ranges.
    - saved graph arrangements.
  - Both personas get one global production/test control, code age, and the first four "Extremes in this snapshot" rows.
- **Wave 3: the engagement kit and power tools.**
  - Evidence board and Markdown report.
  - Directory tree, build modules as a proposed lens, libraries, CODEOWNERS, Find in code.
  - Knowledge concentration.
  - SQL console, ⌘P, the what-if sandbox, and backfill of tags and batches.
- **Sequencing logic:**
  - Correctness comes before comparison, and comparison before reporting.
  - Every engine revision is tagged before the UI release that uses it.
  - The engine release that changes what numbers mean (rev 2) lands in Wave 1, so Wave 2 comparisons start on a clean revision boundary.
  - Shared foundations are built once, early: the app.db migrator and state, comparability, provenance, SaveFile, the history anchor, query caps and handles.

## 2. Principles for this roadmap

1. **Every number that leaves the app carries its provenance.** There is one model, `buildProvenance()`, and one component, `ProvenanceLine.vue`, in two forms:
   - The **short form** goes under figures and tables: workspace · date · `sha7` · `rN`, plus lens, scope and role only when they are set.
   - The **full form** goes in CSV preambles, the Markdown methodology block and pin detail.
   - The local folder path never appears in any export by default.
   - The identity line on scan rows and in the Overview header is a prefix of the same model, not a second formatter.
2. **No comparison crosses a comparability boundary silently.**
   - One function, `comparability(a, b)`, returns `{ok, reasons[]}`.
   - It is used by the Changes gate, Trends breaks, pin status, DeltaChip, the sandbox and the hotspot delta.
   - Revision 0 means "unknown", never "equal".
   - One snapshot never mixes two time anchors, and one chart never mixes two time bases.
3. **Evidence over verdicts.**
   - Every derived number states its formula, threshold and inputs within one hover, and links to the rows behind it.
   - There are no composite scores, and no words like "risk", "bug", "bus factor", "public", "orphaned" or "violation" (for SDP).
   - **Green and red ink appear only on git line counts (±lines).** Changes, Trends, pins, DeltaChip and the sandbox use neutral ink with `+`/`−` glyphs and `12 → 9` in mono.
   - Rows are named by their sort key and filter, never by the tool's judgement.
4. **The snapshot is the contract.**
   - A fact about the code goes into the engine schema and is documented in `DESCRIPTION.md`.
   - A number the app computes goes into `utils/derivedMetrics.ts` with the SQL that reproduces it. The same registry backs Overview, Trends, Changes and pins.
   - Old snapshots are read defensively (`hasColumn`, `snapshotInfo`) and make no new claims.
5. **One pattern per kind of surface.**
   - A view uses `ViewWorkspaceLayout` with a `ui-table` and an inspector.
   - A reading is a `ReadingBand`.
   - Everything that leaves a view goes through **one Export menu (⌘E)**, with one feedback pattern.
   - Every component or file list supports multi-select, which feeds `GroupActionBar`. When the selection came from a query, the bar offers "Keep as live query".
   - Consequential choices use a sheet; small settings use a popover.
   - Per-workspace state lives in app.db `workspace_state`; global preferences live in `settings`.
   - One global role facet sits next to the scope chip.
6. **Design for the second scan.** Baselines, re-scanning a baseline commit, stable arrangements, re-checked pins, saved queries and the HEAD-moved nudge all assume the user comes back.
7. **No new dependencies.** Every item here can be built with the current npm and Go modules, including:
   - SVG rasterization through the browser canvas
   - `regexp()` through go-sqlite3's `ConnectHook`
   - a hand-written CODEOWNERS parser
   - static platform-module lists

   Any exception found during implementation is flagged in its brief and asked about first, as PRODUCT.md requires.
8. **Words:**
   - "Pin" and the pin icon belong to the evidence board only.
   - The baseline is "Baseline", marked with a flag glyph.
   - Graph positions are "Arrange", "Place" and "Unplaced".
   - "Tangle" means a strongly connected set of 2 or more components.

## 3. Shared foundations (each one is specified here and nowhere else)

<a id="fd-a"></a>
**FD-A · app.db versioned migrator and state service** (UI, S–M)

`app/store/store.go` runs numbered migrations that read `PRAGMA user_version`. The existing `CREATE IF NOT EXISTS` becomes migration 0. Foreign keys are already on (`?_foreign_keys=on`, `store.go:35`).

**Connection settings and safety:**
- Add `_busy_timeout=5000&_journal_mode=WAL` to the DSN. Debounced state writes, `FinishScan` and `scan_readings` writes would otherwise contend on the pooled `database/sql`.
- Copy `app.db` to `app.db.bak-v<N>` before each migration.
- Add a `store_test` that upgrades a v0 fixture that has rows.
- `--selfcheck` (`app/selfcheck.go:33`) runs the migrations.

| Migration | Wave | Adds |
|---|---|---|
| m1 | W1 | **`scans` columns:** `label`, `origin` (`scan` \| `import` \| `backfill`), `head_commit`, `branch`, `head_time`, `head_time_source` (`head` \| `max_commit` \| `scan`), `dirty_files`, `analysis_revision`, `extensions`, `ignore_globs`, `revision_ref`.<br>**`workspaces.baseline_scan_id`** (ON DELETE SET NULL).<br>**`settings(key, value)`** for global preferences. PRODUCT.md claims this table exists, but it does not.<br>**`workspace_state(workspace_id, key, value JSON, updated_at, PK(workspace_id, key))`**, cascade on workspace. |
| m2 | W2 | `scan_readings(scan_id, reading_id, value, analysis_revision, reader_version, PK(scan_id, reading_id))`, cascade on scan |
| m3 | W3 | `evidence_pins`: cascade on workspace, **ON DELETE SET NULL on scan**. `saved_queries`: cascade on workspace. |

- **Filling scan columns:**
  - `FinishScan` and `ImportSnapshot` fill the identity columns from `_snapshot`, so ScanPanel never opens a snapshot.
  - A one-time startup job fills `head_time` for existing rows from `max(commit_time)` (`head_time_source='max_commit'`), or from the scan time when the snapshot has no git data.
- **Snapshot sizes** are not persisted; `ListScans` calls `os.Stat`.
- **`StateService.Get/Put/Delete`** ships in W1:
  - The frontend awaits an **async hydrate gate** before lens and draft apply.
  - Writes are debounced (about 300 ms) and flushed in `OnBeforeClose`.
- W2.1 moves the existing localStorage stores onto `workspace_state`.

<a id="fd-b"></a>
**FD-B · Snapshot info, revision reasons, comparability and scan order** (UI, S)

- **Snapshot info.** `stores/data.ts` `_initializeState` loads every `_snapshot` key for the open report into `snapshotInfo`, and every table's columns (`PRAGMA table_info`) into `hasColumn(table, col)`.
- **Revision reasons.** `utils/revisions.ts` maps each revision to a one-line reason. `OutdatedSnapshotBar.vue` shows the reasons for every revision between the snapshot and the engine, replacing the hard-coded copy.
- **Comparability.** `utils/comparability.ts` `comparability(a, b) → {ok, reasons[]}`:

  | Reason | Effect |
  |---|---|
  | Revision differs, or either side is 0 | Blocks |
  | `ignore_globs` differ | Blocks |
  | `extensions` differ | Warns: listed, but not blocking (auto-detection follows the code) |

  Every comparing surface calls it. Across a block, DeltaChip shows no delta and its `title` gives the reason.
- **Scan order.** `utils/scanOrder.ts` `scanOrderKey(scan) = (head_time, scanned_at)`, with `head_time_source` shown in tooltips. It is used by:
  - ScanPanel order
  - "previous" and "newest" snapshot
  - HEAD moved
  - the Changes swap
  - `useComponentDelta` (which today takes list position among older scans only, `useComponentDelta.ts:20-29`)
  - Trends
  - backfill

  Trends uses **one** basis per chart: commit time if every point has it, otherwise scan time for all points. The basis is captioned.

<a id="fd-c"></a>
**FD-C · Provenance model** (UI plus one binding, S)

`frontend/src/utils/provenance.ts` `buildProvenance()` returns:
- workspace name
- snapshot label or time
- `branch@sha7` and `+N uncommitted`
- `analysis rN` (with "(outdated)" when behind)
- lens (`lens.active`)
- scope (group names plus `scope.query`)
- role facet
- "Authors pseudonymised" when that is on
- route and view state
- app version

`components/ui/ProvenanceLine.vue` renders the short form. `provenanceMarkdown()` renders the full form.

New `AppService.Version()` returns `main.version` (`main.go:26`). `release.yml:104-105` already stamps it with `-X`, and `:93-96` stamps `wails.json`, so `wails.json` is not edited.

<a id="fd-d"></a>
**FD-D · File and clipboard seam** (UI, S)

- `app/files_service.go`, following the ctx-func pattern in `app/workspace_service.go:17-22`:
  - `SaveFile({defaultName, title, filters, content | base64}) → path`
  - `SaveBundle(dir, files[])`
  - `OpenFile(filters) → path`
- `utils/clipboard.ts` uses the Wails `ClipboardSetText` first, with `navigator.clipboard` as the fallback. Every "Copy …" goes through it.
- **One feedback pattern for every save:**
  - the button reads "Saved" briefly, and the menu gains "Reveal last export"
  - dialog cancelled: nothing changes
  - write failed: an inline error on the button row
  - zero rows in scope: the item is disabled, with the reason
  - chart still loading: the Figure items are disabled
  - there is no toast system
- `GroupsManager.vue`'s Blob/anchor export moves onto `SaveFile`.

<a id="fd-e"></a>
**FD-E · History anchor** (UI, S; ships in the same release as E2 and E3)

`frontend/src/utils/history.ts` holds:
- `historyAnchor()`
- `anchorSql()`
- `anchorLabel()`
- the only period list, All · 1y · 180 · 90 · 30, which replaces `CommitHistory`'s list and `AUTHOR_PERIODS`
- the custom range from [G63](#b-g63)

The engine's `DayBuckets` are 30, 90 and 180 only (`extensions/git/extension.go:59`). "1y" and custom ranges are therefore computed by the UI from `git_commits` and never exist as precomputed columns. Metrics columns stay 30/90/180 and say so.

**Rule (Decision 1):**
- Revision 2 and later: anchor at `_snapshot.git_based_on`, which is `max(HEAD committer time, newest commit)` across the repos.
- Older snapshots: anchor at scan time, matching their `time.Now()` precomputed columns. Anchors never mix inside one snapshot.

**Labels:**
- Revision 2 and later: "Last 90 days to 2 Jun 2026 (3f2a91c)".
- Older snapshots: "Last 90 days to scan time". The OutdatedSnapshotBar reason line explains the change.
- When the anchor is more than 90 days before the scan, one note says so ("the scanned commit is 112 days older than the scan").

**Call sites:**
- `utils/authors.ts:41-43`
- `CommitHistory.vue:152-155` (and its stale comment near line 150)
- `pages/index.vue`, which ends its chart at `new Date()`

**Multi-repo:** use the newest HEAD across repos, and list each repo's HEAD on About this snapshot.

<a id="fd-f"></a>
**FD-F · Derived metrics and readings registry** (UI, S)

`frontend/src/utils/derivedMetrics.ts` gives each app-computed number an id, name, short and long text, and the SQL that reproduces it. The Metric reference lists them as "Computed by the app".

The same ids are the **readings**: `scan_readings` stores them, and Overview System shape, Trends, the Changes header, Extremes rows and pins all read them.

| Kind | Ids |
|---|---|
| Structure | `app__components`, `app__components_in_tangles`, `app__lines_in_tangles_share`, `app__largest_tangle`, `app__cross_component_edges`, `app__propagation_cost`, `app__dependency_levels`, `app__median_instability`, `app__median_distance`, `app__rule_findings` |
| History | `app__last_changed_days`, the effort shares |
| Tests | the test-import count |

<a id="fd-g"></a>
**FD-G · Query caps and snapshot handles** (UI, S; engine brief E11, which lives in the UI repo)

- **Caps.**
  - `app/query/query.go` `runQuery` switches to `QueryContext` with a deadline.
  - `Query` and `QueryIn` get a **300k-row, 60 s** cap that returns an explicit error.
  - Sizing: fineract has 203,514 co-change `file_matrix` rows and 2,527,824 `component_connections_indirect` rows. A 1M-row `[]map` over the Wails bridge would be hundreds of MB.
  - No reader ever selects `component_connections_indirect` unfiltered; counts use `count(*)`.
  - Before fixing the numbers, log the largest legitimate result on fineract and sakai.
- **Limited queries.** New `QueryLimited(sql, maxRows, timeoutMs) → {columns[], rows[][], truncated, elapsedMs}` returns ordered columns. Truncation is always shown on screen.
- **Handles.**
  - Replace the single `altDB` handle with a small **LRU keyed by scanID** (about 4 handles), shared with FD-I.
  - Handles are closed before any file delete: `DeleteScan` (`app/store/scans.go:147-158`), `DeleteWorkspace` (`workspaces.go:149`) and the Storage sheet. Windows cannot delete an open file.
  - This also stops `altMu`, which is held for each whole query, from thrashing when two bases are read at once.

<a id="fd-h"></a>
**FD-H · File roles and the global role facet** (engine rev 2 plus UI, M)

- **Engine:** a `files.role` string column (production, test, generated, third_party, non_code) plus count rollups. See [E5](#e5).
- **UI:**
  - `utils/fileRole.ts` reads the column when `hasColumn`. Otherwise it falls back to `isTestPath`, labelled "by path convention".
  - `stores/fileRole.ts` holds **one** per-workspace facet, All · Production · Tests, in `workspace_state` key `fileRole.facet`.
- **Placement:** in ScopeBar, next to the scope chip. It shows nothing when set to All (following the scope-chip rule), and feeds "N of M" and the provenance line.
- **Default is All, everywhere.** There are no per-feature role defaults. Third-party and generated files are already left out of health and the hotspot rankings.
- **Interim:** none. W2.2 depends on W2.1.

<a id="fd-i"></a>
**FD-I · Changes data layer** (UI, M)

- New Go package `app/changes`, which reads snapshots through the FD-G handle LRU (`query.Service.OpenReadOnly(scanID)`, with no ATTACH).
- `Compare(baseID, headID) → ChangeSet` computes set differences in Go maps and caches them per pair.
- A readings service computes the FD-F readings into `scan_readings`, on the first Over time visit and on `scan:done`.
- It is used by:
  - Changes
  - Over time
  - lens violations in Changes
  - the storage sheet

<a id="fd-j"></a>
**FD-J · `groupEdges`** (UI, S)

`frontend/src/utils/groupEdges.ts` (pure, with tests) resolves each `runtimeComponentEdges` row to `{fromGroups, toGroups, ambiguous}` for a lens:
- **Source side:** decided by the importing file, through `groupsStore.filesOf`.
- **Target side:** decided by the target component. When groups split that component, use `unit_connections.to_file`; otherwise mark the row ambiguous.
- **Overlapping groups** yield several pairs.
- **Import lines:** one batched `snippets` query on `modularity__component__imports`, reading `begin_position`.

It is used by G07, G67, G13 and G20.

<a id="fd-k"></a>
**FD-K · Co-change interim guard, every reader** (UI, S; can go today)

Until E13 lands, every reader of the co-change nil-intersection bug is guarded:

| Reader | Guard |
|---|---|
| `useConnectionsModel.ts:76` | Drop pairs where either `percentage_of_all_commits_pair_*` is 0 |
| `components/[name]/connections.vue` `shared` query (`:339-340`, merged at `:382-389`) | Same |
| `git_component_cycles_shortest_shared_commits` (`stores/data.ts:310`, `pages/views/components/cycles.vue:554`, `components/[name]/cycles.vue:307`) | This table has no percentage columns. Join the members' `git__commits` and treat any 0 as 0 shared. |

Broadleaf has 3,942 rows with `shared_commits > 0` and a 0% side.

Two related fixes:
- `undirectedSharedCommitEdges` (`utils/connections.ts`) takes the **max** of the two directions, not the sum. Its test is fixed to match; `cycles.vue` already does this.
- `reindexEdges` sums `sharedCommits` across member pairs (`utils/connections.ts:309-311`), so group-grain co-change counts one commit several times. FD-K labels it "sum of pair counts"; G42 replaces it with distinct commits.

<a id="fd-l"></a>
**FD-L · Binding checklist** (every UI item that adds a backend service)

Today three services are bound (`main.go` `Bind`), and `frontend/wailsjs` is tracked in git. CI runs `npm test` before `wails build` (`ci.yml`). Every new service ships with:
- its `Bind` entry
- regenerated and committed `wailsjs`
- updated vitest mocks (`stores/data.test.ts`)
- the ctx-func pattern when it needs dialogs, the clipboard or events

The new services are App, Files, Menu, State, Editor, Changes/Trends, Backfill, Evidence, and `QueryService.QueryLimited`/`Console`.

**Canonical names** (these settle conflicts between the briefs):

- **`_snapshot`**
  - Now keyed by `(report_id, key)`; see [E3](#e3).
  - Identity: `analysis_revision`, `scanned_at`, `report_id`, `git_head_commit` (full 40-character sha; the UI shows 7), `git_branch` (`detached` when detached), `git_head_time`, `git_dirty_files`, `git_based_on`.
    - `git_dirty_files` is the line count of `git status --porcelain --untracked-files=normal`.
  - Co-change sweep limit: `git_max_changes_per_commit`, `git_sweeping_commits`.
  - Scan settings: `git_since`, `git_after`, `extensions`, `ignore_globs`.
  - What the walker left out: `walker_ignored_files`, `walker_ignored_dirs`, `walker_ignored_top` (JSON, top 20).
  - Size limits: `truncated_views`.
- **Per-repo `git_repos` columns:** `git__head_commit`, `git__branch`, `git__head_time`, `git__dirty_files`, `git__sweeping_commits`. `git__shallow_clone` already exists.
- **Health columns:**
  - File-only: `codesmells__health__deduction__size`, `…__deduction__max_nesting`, `…__deduction__avg_nesting`, `codesmells__health__threshold__max_nesting`, `…__threshold__avg_nesting`.
  - `codesmells__hotspot__raw` is on files and **rolled up as max** for components and directories.
- **Role columns:** `files.role` (a file column, not a stat), plus the summed count rollups `complexity__files__test` and `complexity__lines__test`.
- **Commit columns:** `git_commits.path_at_commit`, `git_commits.change_kind` (add, modify, delete, rename).

## 4. Waves

Effort: S = up to 2 days, M = up to a week, L = more than a week. Repos: **UI** = archstats-ui, **EN** = archstats engine. "E*n*" in Depends means that engine PR is merged. The engine is tagged before the UI release that ships the item.

### Wave 1: trust the numbers, get them out

**Goal.** Every number is correct, explained and attributable. Every table and the named figures can be exported. Authors can be pseudonymised before anything leaves the app. A macOS release build behaves like a desktop app, and CI builds without a local `go.work`.

**Exit criteria.**
- CI builds and tests the UI with `GOWORK=off` against the tagged engine.
- A `wails build` on macOS, Windows and Linux passes the menu, clipboard, ⌘Z, SaveFile and delete-while-open checks.
- The reference set (gin, django-oscar, LibreChat, Sylius, nopCommerce, BroadleafCommerce) has been rescanned at rev 2. The acceptance invariants in `archstats/tasks/data-audit/acceptance/` pass on it.
- OutdatedSnapshotBar names the rev 2 reason.
- The `DESCRIPTION.md` guard test passes.
- PRODUCT.md is updated.

| ID | Item | Persona | Effort | Depends on | Repo | Brief |
|---|---|---|---|---|---|---|
| W1.0 | Step 0: land, document and tag both repos | both | M | – | EN, UI | [§5 Step 0](#step0) |
| W1.1 | app.db migrator m1 + StateService + hydrate gate | both | S–M | – | UI | [FD-A](#fd-a) |
| W1.2 | Snapshot info, revision reasons, `comparability()`, `scanOrderKey` | both | S | W1.1 | UI | [FD-B](#fd-b) |
| W1.3 | Co-change interim guard, every reader | both | S | – | UI | [FD-K](#fd-k) |
| W1.4 | Query caps + snapshot handle LRU | both | S | – | UI | [FD-G](#fd-g) |
| W1.5 | Native menu + "?" shortcut sheet (G49) | C must, A should | S | – | UI | [B-G49](#b-g49) |
| W1.6 | File and clipboard seam | both | S | – | UI | [FD-D](#fd-d) |
| W1.7 | Provenance model, `ProvenanceLine`, `Version()` | both | S | W1.2 | UI | [FD-C](#fd-c) |
| W1.8 | Engine rev 2: ordered PRs E13 → E3 → E2 → E1 → E6 → E14 → E4 → E5 (+E15 if approved), one bump | both | L | W1.0 | EN | [§5](#engine) |
| W1.9 | History anchor | both | S | W1.2, E2, E3 | UI | [FD-E](#fd-e) |
| W1.10 | Snapshot identity: label, baseline, HEAD moved (G04) | both | M | W1.1, W1.2, E3 | UI | [B-G04](#b-g04) |
| W1.11 | Export menu, tables and the W1 figure set (G40) | C must, A should | M+ | W1.6, W1.7 | UI | [B-G40](#b-g40) |
| W1.12 | Reveal, copy path, save a copy (G45 slice 1) | both | S | W1.5, W1.10, W1.4 | UI | [B-G45](#b-g45) |
| W1.13 | Derived metrics registry, MetricHint, Metric reference (G37) | C | S | W1.2, W1.6 (E14 for categories) | UI | [FD-F](#fd-f), [B-G37](#b-g37) |
| W1.14 | Why this health score (G35) | both | M | E6, W1.2 | UI | [B-G35](#b-g35) |
| W1.15 | Dependency kinds (G15) | C should, A could | M | – | UI | [B-G15](#b-g15) |
| W1.16 | About this snapshot + Copy methodology (G32 + G33) | C | M | W1.2, W1.7, W1.11; phase 2: E3, E4, E5 | UI | [B-G33](#b-g33) |
| W1.17 | Open in editor at file:line (G46) | A | S | W1.1 | UI | [B-G46](#b-g46) |
| W1.18 | Pseudonymised authors (G60) | C should | M | W1.1, W1.7; ships with W1.11 | UI | [B-G60](#b-g60) |

### Wave 2: compare, and read the structure

**Goal.** A second scan is useful from the first attempt. Drift, declared architecture, and history crossed with structure are visible. The production/test split works everywhere. Snapshots get smaller.

**Exit criteria.**
- Changes and Over time work on gin, django-oscar and Sylius at rev 2, and gate or break correctly on `comparability()`.
- "Rescan baseline commit" turns an r0 baseline into a comparable one.
- Lenses, groups and arrangements survive a webview storage wipe.
- Rev 3 ships with measured before/after sizes and view parity. Broadleaf is below 300 MB, which requires the `java_class_connections_indirect` cut; fineract's target is set from the E8 measurement.
- Hidden coupling holds its invariants: no pair has a 0% side, and the count equals the checked-in SQL.

| ID | Item | Persona | Effort | Depends on | Repo | Brief |
|---|---|---|---|---|---|---|
| W2.1 | Move existing stores onto `workspace_state` + config export/import (G10) | A should | M | W1.1, W1.6 | UI | [B-G10](#b-g10) |
| W2.2 | Global role facet + test ratio (G34) | both | M | E5, W2.1 | UI | [FD-H](#fd-h), [B-G34](#b-g34) |
| W2.3 | Code age (G66) | C should | S | W1.9, W1.13 | UI | [B-G66](#b-g66) |
| W2.4 | Changes data layer (m2) | A | M | W1.1, W1.2, W1.4 | UI | [FD-I](#fd-i) |
| W2.5 | Rescan one commit (G03 slice 1) | both | M | E3, W1.10, W1.4 | UI | [B-G03](#b-g03) |
| W2.6 | Changes: Compare (G01 phase 1) | A must | M+ | W2.4, W2.5, W1.10, W1.11 | UI | [B-G01](#b-g01) |
| W2.7 | Changes: Over time (G02) | A should | M | W2.4, W2.6, W1.13 | UI | [B-G02](#b-g02) |
| W2.8 | Snapshot sizes and cleanup (G54, UI part) | A | S | W2.4 | UI | [B-G54](#b-g54) |
| W2.9 | Import snapshots (G45 slice 2) | both | M | W1.12 | UI | [B-G45](#b-g45) |
| W2.10 | `groupEdges` | both | S | – | UI | [FD-J](#fd-j) |
| W2.11 | Levelized matrix (G12) | both | M | – | UI | [B-G12](#b-g12) |
| W2.12 | Declared architecture on a lens (G07) | A must, C should | M | W2.10, W2.1 (W2.11 for "Save levels as a lens") | UI | [B-G07](#b-g07) |
| W2.13 | Lens findings new/fixed in Changes | A | S | W2.12, W2.6 | UI | [B-G07](#b-g07) |
| W2.14 | System shape numbers (G14) | both | S–M | W2.11, W1.13 | UI | [B-G14](#b-g14) |
| W2.15 | Scope-aware Authors, Activity and Rules, then the group page (G67) | both | M | W2.10, W1.9 | UI | [B-G67](#b-g67) |
| W2.16 | SDP edges line (G13) | could | S | W2.10 | UI | [B-G13](#b-g13) |
| W2.17 | Used from outside (G52) | both | S–M | W1.0 | UI | [B-G52](#b-g52) |
| W2.18 | Commit footprint (G27) | both | M | W1.9 | UI | [B-G27](#b-g27) |
| W2.19 | Connections List rep (G42, surviving part) | C should | S–M | W1.11, W1.3 | UI | [B-G42](#b-g42) |
| W2.20 | Hidden coupling in Connections (G23) | both | M | E13, W2.18, W2.19 | UI | [B-G23](#b-g23) |
| W2.21 | Custom history range (G63) | both should | S | W1.9 | UI | [B-G63](#b-g63) |
| W2.22 | Arranged graph layout per lens (G64) | A should | M | W2.1 | UI | [B-G64](#b-g64) |
| W2.23 | Extremes in this snapshot, rows 1–4, then row 6 after W2.20 (G31) | C should | M | W2.2, W2.14 | UI | [B-G31](#b-g31) |
| W2.24 | Engine rev 3 (E8 measurement, E7, E9, E8 slimming, approved extras) | A | L | W1.8 | EN | [§5](#engine) |
| W2.25 | Workspace settings sheet: ignore globs (G50) | C should | M | W2.24, W2.1 | UI | [E7](#e7) |
| W2.26 | `exportFigure()` on the remaining charts | C | S–M | W1.11 | UI | [B-G40](#b-g40) |

### Wave 3: the engagement kit and power tools

**Goal.** A consultant can go from the first hour to a defensible Markdown report. An architect can query, try refactors and backfill history.

**Exit criteria.**
- A board built on nopCommerce exports a Markdown report whose methodology header, pins, figures and glossary render on GitHub, with authors pseudonymised when that is on.
- A backfill of gin tags leaves the user's repository untouched.
- The sandbox passes its zero-edit parity test on Broadleaf and gin.

| ID | Item | Persona | Effort | Depends on | Repo | Brief |
|---|---|---|---|---|---|---|
| W3.1 | Evidence board (m3) (G38) | C should | M | W1.7, W1.11, W2.1, W1.2 | UI | [B-G38](#b-g38) |
| W3.2 | Board to Markdown report (G39) | C should | M | W3.1, W1.16, W1.13, W1.18 | UI | [B-G39](#b-g39) |
| W3.3 | SQL console + saved queries (G43) | C should | M | W1.4, W2.1, W1.11 | UI | [B-G43](#b-g43) |
| W3.4 | Go to anything, ⌘P (G48) | A should | S–M | W2.1 | UI | [B-G48](#b-g48) |
| W3.5 | Fix-commit filter (G26) | could | S | W2.1 | UI | [B-G26](#b-g26) |
| W3.6 | Where change effort goes (G25) | both | M | W3.5, W1.9 | UI | [B-G25](#b-g25) |
| W3.7 | Knowledge concentration (G29), plus Extremes row 5 | C should | M | E1, W2.1, W2.23 | UI | [B-G29](#b-g29) |
| W3.8 | Directory tree in Metrics (G58) | C should | M | W2.2 | UI | [B-G58](#b-g58) |
| W3.9 | Build modules as a proposed lens + manifest declaration (G16) | C should | M | module identity (rev 3 extra or rev 4), W2.12 | UI | [B-G16](#b-g16) |
| W3.10 | Libraries (G17) | C should | S–M | – | UI | [B-G17](#b-g17) |
| W3.11 | CODEOWNERS as a lens (G65) | C should | S | – | UI | [B-G65](#b-g65) |
| W3.12 | Find in code (G55) | C should | M | W1.4, W3.4 | UI | [B-G55](#b-g55) |
| W3.13 | Function outline (G57) | could | S UI, M engine | engine spans (rev 3 extra or rev 4) | UI, EN | [B-G57](#b-g57) |
| W3.14 | What-if sandbox (G20) | A should | L | W2.10, W2.12, W1.2 | UI | [B-G20](#b-g20) |
| W3.15 | Backfill tags and batches (G03 slice 2) | both | M | W2.5, W2.24, W2.7 | UI | [B-G03](#b-g03) |

**Explicitly deferred (not in any wave):**
- G36 "Why this lane" (no brief)
- G42's keyboard-reachable marks

Each needs a brief before it can be scheduled. G63 is now briefed and scheduled (W2.21).

<a id="engine"></a>
## 5. Engine batch

Every change that alters scan output bumps `core.AnalysisRevision` **once per release** and adds one line to `core/revision.go`. The same PR set updates `DESCRIPTION.md`, `docs/metrics.md` and `utils/revisions.ts`. Snapshots are never migrated.

Each release is **tagged**, and the UI bumps `go.mod`/`go.sum` to that tag before its own release. Items marked "(needs approval)" are outside the owner's four approved changes; see [Decision 16](#d16).

<a id="step0"></a>
**Step 0: land, document and tag both repos (no new bump; W1.0).**

1. **Engine.** The engine has 68 modified plus 30 untracked entries (`archstats/tasks/PENDING-COMMITS.md`), and `core/revision.go` is untracked, so revision 1 has never been released. Commit that work together with:
   - `unit_connections_view.go`, `unit_uses_view.go` and `identity.go`
   - the third-party and generated flags
   - `git__shallow_clone`
   - **E10 (needs approval):** make `--snippet` work. `common.Analyze` compiles `CommonFlags.Snippets` into `regex.Extension`, and an invalid pattern exits non-zero.
   - **E12 (needs approval):**
     - Clear the `DESCRIPTION.md` backlog. It is 218 lines and documents none of `_snapshot`, `units`, `unit_connections`, `modules`, `rules`, `unresolved_edges` or `git_repos`.
     - Add the guard test in `cmd/export/sqlite`, which fails when a registered view or `_snapshot` key is missing from `DESCRIPTION.md`.
   - **Revision 1 log amendment (needs approval; Decision 2).** The entry names two output changes it does not mention today:
     - `shortest_path_length` now counts hops, not nodes.
     - Commits over 100 files stay in `git_commits` but are left out of co-change.
2. **Tag the engine** `v0.4.0`.
3. **UI.** Bump `go.mod`/`go.sum` from `v0.3.1`, which has no `core.AnalysisRevision` even though `app/services.go` already calls it. Commit the UI's pending work.
4. **CI.** Add a job that builds and tests with `GOWORK=off`. `go.work` is gitignored (`.gitignore:27`), so today `ci.yml` and `release.yml` cannot build the tree.

**Rev 2: "what the numbers mean" (Wave 1).** Ordered PRs, one bump, one tag (`v0.5.0`).

| # | Change | Tests |
|---|---|---|
| E13 (needs approval; git correctness) | **Co-change nil-intersection fix** in `extensions/git/commits/shared_commits.go` `SharedCommitsForGroup` (`:38-50`): a nil set means empty. It inflates 51% of Sylius component pairs and 60% of nopCommerce pairs, and covers the component, directory and file tables plus `git_component_cycles_shortest_shared_commits`. | Unit test with a component that has no commits; no pair reports more shared commits than either side has |
| <a id="e3"></a>E3 | See the E3 details below the table. | See below |
| E2 | `BasedOn = max(HEAD committer time across repos, newest commit_time)`, set in `Init` before `splitAll`. With no git it stays `time.Now()`. Written as `git_based_on`. Optional CLI `--git-based-on=head\|now`. | Scanning the same commit a day apart gives identical `git__*__last_N_days`; a dormant fixture has a non-empty 30-day window |
| E1 | Rename-following: `parse.go` replaces `--no-renames` with `-M -z`. Walks commits newest to oldest per repo, keeping an alias map to the current path. **The alias map also covers the `--cc --raw` merge pass**, where merges report only files that differ from every parent. Adds `path_at_commit` and `change_kind`. Pure-rename rows are kept but left out of commit counts and co-change (Decision 3). About 1 to 1.5 weeks. | `-z` rename rows; chain A→B→C; path reused after a move; multi-repo prefixes; **a merge-resolution fixture**; an e2e `git mv` fixture; `git__commits__total` equals `git log --follow --no-merges` on the engine repo; Broadleaf scan time grows by less than 25% |
| E6 | See the E6 details below the table. | Invariant `health = max(1, 10 − Σ deductions)` on the fixtures; **component and directory rows carry no summed thresholds or deductions**; component raw hotspot equals the max of its files |
| E14 (needs approval) | Export `category` on `definitions` and `_metric_definitions` (`definitionsView` drops it today). Existing CLI databases get `ALTER TABLE ADD COLUMN category`, because the table is created `IF NOT EXISTS`. Rename the category "Code Scene Style Code Smells" to "Code health". | Snapshot test for the definitions view; appending to a pre-E14 CLI database works |
| E4 | Walker `GetAllFiles` returns what it ignored, grouped by source (VCS, .gitignore, .archstatsignore, workspace): `walker_ignored_*`. Git records `git_sweeping_commits`, the threshold, and per-repo `git__sweeping_commits`. | `walker_test` checks the reported source; LibreChat lists `node_modules/` as one directory |
| <a id="e5"></a>E5 | See the E5 details below the table. | Table-driven cases per ecosystem; role counts sum to the `files` row count |
| E15 (needs approval) | `git__last_change_age_in_days` as an engine column (Decision 7) | Matches `app__last_changed_days` on gin |

**E3 details: snapshot identity.**
- Add `Analyzer.SetSnapshotInfo(key, value)` in `core/analyzer.go` and `core/results.go`. Today `saveSnapshotInfo` (`cmd/export/sqlite/sqlite.go:225-231`) writes only `analysis_revision`; it will write every key, **explicitly including `scanned_at` and `report_id`**.
- **`_snapshot` gains a `report_id` column, keyed `(report_id, key)`** (Decision 17). The exporter recreates a legacy `_snapshot` in place when it appends to an older CLI database.
- The git extension records:
  - `git_head_commit`: the **full sha**, from `rev-parse HEAD`, not the `%h` in `parse.go:158`
  - `git_branch`, `git_head_time`, `git_dirty_files` (porcelain v1 with `--untracked-files=normal`) for the root repository
  - the per-repo `git_repos` columns
  - the scan settings
- Tests: `sqlite_test` asserts the keys, including on a CLI export and on a two-report append.

**E6 details: health inputs.**
- Health deduction and threshold columns as **file-only** columns, plus `codesmells__hotspot__raw`, with definition YAMLs.
- **Register accumulators for every new stat.** Without one, a stat falls back to `SumStatMerger` (`core/stats/stat_accumulator.go:13-48`), so a 30-file component would show a threshold of 120. Only four codesmells stats are registered today (`extensions/codesmells/extension.go:44-47`).
- `RollUpCodeSmells` (`extensions/util/codesmells_rollup.go`) rolls `__hotspot__raw` up as **max**, the same as `codesmells__hotspot_score`.
- Fix the stale "commits*lines" comment.

**E5 details: file roles.**
- `core/file/role.go` produces `files.role`, a **file column, not a stat record**, plus the count rollups (summed, registered explicitly).
- The non-code extension list moves out of codesmells into core.
- Precedence: third_party > generated > test > non_code > production. Per-ecosystem rules are in [B-G34](#b-g34).

Rev 2 notes:
- `revision.go` line: "History follows file moves; time windows count back from the scanned commit; co-change no longer credits commits a component never had; files carry a role; health shows its deductions."
- **UI items depend on specific PRs:**
  - W1.9 on E2 and E3
  - W1.10 on E3
  - W1.14 on E6
  - W1.16 phase 2 on E3, E4 and E5
  - W2.2 on E5
  - W2.20 on E13
  - W3.7 on E1

  They can be developed against the PR branch through a local `go.work`, but they release only after the tag.

**Rev 3: "shape and size" (Wave 2).**

1. **E8 measurement first.** Add a `tasks/data-audit` dbstat script and take a rev 2 baseline for fineract, sakai, BroadleafCommerce and Sylius. Broadleaf today (720 MB, from dbstat):

   | Table | Size |
   |---|---|
   | `file_matrix` | 350 MB |
   | `java_class_connections_indirect` | 130 MB |
   | `component_connections_indirect` | 41 MB |
   | `snippets` | 40 MB |
   | `git_commits` | 30 MB |

2. <a id="e7"></a>**E7: per-workspace ignore globs.**
   - `core.Config` (today only `RootPath` and `Extensions`, `core/config.go:8-13`) gains `IgnorePatterns`, applied as a root ignore layer.
   - `GetAllFiles` takes the same options, and **all four call sites** pass them:
     - `walker.WalkDirectoryConcurrently` (`core/walker/walker.go:15-18`)
     - `app/scan/scan.go:174` `extensionsFor`
     - `cmd/common/enabled.go:47`
     - `tasks/data-audit/appscan.main.go:20`
   - The app's `scan.go` passes the workspace globs into both `extensionsFor` and `core.Config`.
   - New CLI flag `--ignore`. Written to `_snapshot.ignore_globs`.
   - Ignored files' rows are removed from `git_commits` too, and that is recorded.
   - CODEOWNERS files are never ignored.

3. **E9:** `git_file_shared_commits` with a floor (shared ≥ 3 and ≥ 10% of the smaller side), one row per unordered pair. Do not register `file_coupling_view` as it stands.

4. **E8 slimming.**
   - **`file_matrix`** keeps only rows with `git_co_changes > 0`: 111,550 of 1,252,577 on Broadleaf, bringing it to about 400 MB. This also drops `linguistic_similarity` and `path_distance` for pairs that never co-changed (`extensions/matrix/matrix.go:390-398`). No UI reads them; `DESCRIPTION.md` says so.
   - **`java_class_connections_indirect`** is off by default or floored (Decision 19). **Getting Broadleaf below 300 MB requires this cut.**
   - **`component_connections_indirect.shortest_path`** becomes `next_hop`. Keep `shortest_path_length`, which G14 and G23 read, and delete the dead `SelectPathModal.vue`.
   - **`git_directory_shared_commits`** gets a floor of shared ≥ 2, or is off by default.
   - Any remaining cut is recorded in `truncated_views`.
   - Test: every view on Broadleaf and fineract shows the same numbers before and after.

5. **Extras, if approved** (Decision 8). Otherwise they become rev 4 in Wave 3.
   - Module identity keyed by directory, one ecosystem per manifest (G16).
   - Content-less method and function spans for Java, C#, PHP and Go (G57).

Rev 3 `revision.go` line: "Smaller snapshots; workspace ignore globs apply; file-grain shared commits." Tag `v0.6.0`.

**E12 with every release:** `DESCRIPTION.md` gains the DDL for every new column, key and table, and the guard test enforces it.

## 6. Detailed briefs

Every brief uses the same headings: **Job**, **Surface**, **Data**, **States**, **Integration**, **Acceptance**, **Depends / effort**, **Decisions**. All UI paths are relative to `archstats-ui/frontend/src` unless they start with `app/` or `main.go`.

**Acceptance rule.**
- Every local snapshot of a named workspace is revision 0, and rev 2 changes git-derived numbers (E1, E13) and the definition counts (E5, E6, E14).
- **Checks are therefore invariants with checked-in SQL** in `archstats/tasks/data-audit/acceptance/`, run after the reference rescan.
- Values marked "(r0: …)" were measured today and are references only.
- Non-git numbers (G12, G13, G14, G17, G55) are expected to hold as stated.

**Section titles** inside panels use `ui-section-title`, which is the Overline typography style (`DESIGN.md:340`). It is not a component.

<a id="corrections"></a>
### 6.0 Corrections to the gap analysis (consolidated)

1. **Co-change inflation (engine).** `SharedCommitsForGroup` treats a nil set as "all of the partner's commits".
   - Sylius: 25,598 of 50,361 pairs are affected.
   - Broadleaf: `common.email.service.exception` has 0 commits but shares 719.
   - G23's "4,864 of 5,209 Sylius pairs" rests on this bug; with it fixed, about 322 pairs remain (r0 reference).
   - It also feeds `git_component_cycles_shortest_shared_commits`.
   - Fixed by E13; FD-K guards every reader until then.
2. **Shared commits doubled (UI).** `undirectedSharedCommitEdges` sums both directions, and `reindexEdges` sums across member pairs at group grain (FD-K).
3. **Component and directory hotspot is the hottest file (max)**, per `RollUpCodeSmells` (`codesmells_rollup.go:55-61, 80-83`). Component health is a line-weighted mean. The "commits*lines" comment is stale.
4. **History windows.** The UI and the engine both anchor at scan time today (`max(timestamp)` and `time.Now()`); they agree only by accident. The engine buckets are 30, 90 and 180 only.
5. **`snapshot_path` already reaches the frontend** in `models.Scan`; it is just never rendered.
6. **Blob download.** Groups Export probably does nothing in a macOS release build.
7. **ConnectionsMatrix is an HTML `<table>`**, not SVG. HotspotsTreemap is d3 SVG.
8. **The Wails `EditMenu` role** includes Undo and Redo and may take ⌘Z away from the lens builder.
9. **app.db** has no migrations, no `settings` table, and no busy timeout or WAL. Foreign keys are already on.
10. **CLI exports can hold several `report_id`s**, and `_snapshot` is keyed by `key` alone today.
11. **Edges have no line column.** Lines come from `snippets.begin_position`. `component_connections_direct` has one row per (from, to, file), so diffs must key on the pair.
12. **Most strongly connected groups have one member.** Always filter `group_size > 1`.
13. **dbstat is unavailable in the app's go-sqlite3 build.** On fineract `file_contents` and `snippets` are only about 4%; `file_matrix` and the indirect tables dominate.
14. **`isTestPath` misses Sylius Behat** (catches 12 of 906). Test co-location holds for Go and TS, not for C# or PHP.
15. **The `directories` table disagrees with `files`.** Broadleaf `admin`: 779 vs 1,096 files. Build trees from `files`.
16. **`modules.name` is not unique** (Sylius has 18 `example/test-application`), and the nearest manifest wins across ecosystems.
17. **Function spans are stored only for Python and JS/TS.**
18. **`git_commits` stores** abbreviated hashes (key on `(repository, commit_hash)`), author time, and subject lines only.
19. **Between 69% and 95% of all-time changed lines** went to paths not in the snapshot, which is what `--no-renames` produces.
20. **`rules.vue:64`** links without `#L{line}`.
21. **`$EDITOR` is not usable** from a GUI app.
22. **`mode=ro` does not block ATTACH.** The console needs `SetLimit(ATTACHED, 0)` plus an authorizer.
23. **G13 counts** should be distinct component pairs.
24. **G14 must state whether it includes the diagonal.** gin is 23.4% without it and 35.9% with it.
25. **G12's "depth" preset** counts hops from entry points, not namespace depth.
26. **G66 evidence.** `parse.go:401` is the partial-clone probe; age is `dayDiff(BasedOn, t)` in `commits.GetStats`.
27. **The >100-file filter** now applies only to co-change: "left out of co-change", not "dropped".
28. **`utils/cycles.ts` reads as binary** to grep; use `grep -a`.
29. **G03 must use an isolated `--shared` clone**, not `git worktree`.
30. **`workers/db.worker.ts`** is dead code.
31. **Merges** report only files that differ from every parent (`--cc --raw`). They are not diffed against the first parent.
32. **Stats without a registered accumulator are summed** at component and directory grain.
33. **The UI's `go.mod` pins engine `v0.3.1`**, which predates `AnalysisRevision`. Builds work only through the gitignored `go.work`.
34. **`/views/git/coupling` is a redirect stub** to `connections?rep=chord&source=git`.
35. **DeltaChip uses good/bad inks** by metric direction (`DeltaChip.vue:24-25`).

---

### Evidence out and identity

<a id="b-g49"></a>
#### G49 · Native menu and "?" shortcut sheet (rescoped)
**Job.**
- Consultant (must): copy names, paths and values. A macOS release build has no Edit menu, so ⌘C, ⌘V, ⌘A and ⌘Q do nothing.
- Architect (should): paste a glob into ⌘K, and discover the existing shortcuts.

**Surface.**
- New `app/menu.go`, wired as `options.App.Menu`, **macOS only**:
  - App role.
  - File: New workspace ⌘N · Open snapshot… ⌘O (with G45 slice 2) · Scan again ⌘R · Reveal snapshot ⌥⌘R · Save a copy of snapshot… · Export… ⌘E.
  - Edit role.
  - View: Back ⌘[ · Forward ⌘].
  - Window role.
  - Help: Keyboard shortcuts · Metric reference.
- Callbacks emit `menu:<id>`. `composables/useMenuCommands.ts`, mounted in `layouts/default.vue`, maps each event to a store action.
- On Windows and Linux, the same commands are bound by a keydown handler, with no menu bar.
- Set `EnableDefaultContextMenu: true`. The existing custom context menus call preventDefault and are unaffected.
- `components/shell/ShortcutSheet.vue`:
  - A Teleport modal with `ui-popover` styling, one `ui-kv` per area, and mono key chips.
  - Reads the single registry `utils/shortcuts.ts`, with modifier labels from `usePlatform`.
  - Opens on `?` (read `event.key`, ignored while an input has focus) and from Help.
  - A footer link opens the Metric reference, which is the entry point on Windows and Linux.

**Data.** `MenuService.SetState({hasSnapshot, scanning})` calls `runtime.MenuUpdateApplicationMenu`. Binding per FD-L.

**States.** No workspace: Scan again and Reveal are disabled. While a scan runs: Scan again is disabled.

**Integration.** `main.go`, `app/menu.go`, `layouts/default.vue`, `composables/useMenuCommands.ts`, `utils/shortcuts.ts`, `components/shell/ShortcutSheet.vue`.

**Acceptance.**
1. In a `wails build` .app, ⌘C copies a component name from Metrics and ⌘V pastes it into ⌘K.
2. ⌘R starts a scan, and the item is greyed out while it runs.
3. ⌘Z still undoes a lens-builder edit. If the native Undo takes ⌘Z, route it through `menu:undo`: `execCommand('undo')` when an input has focus, lens undo otherwise.
4. `?` lists ⌘K, ⌘G, ⌘Z and ⌘↵ with the right modifier on each OS.

**Depends / effort.** None · S.

<a id="b-g04"></a>
#### G04 · Snapshot identity: label, baseline, HEAD moved
**Job.** Architect and consultant (should): which commit is this, which scan was "before split", and how far behind HEAD am I.

**Surface.**
- **ScanPanel rows**, ordered by `scanOrderKey`:
  - Primary text: the label, or `formatScanTime`.
  - Mono secondary line from `ProvenanceLine`'s identity prefix: `main @ 3f2a91c · +4`, or "3 repositories".
  - The baseline row carries a **flag glyph** and a `ui-tag` "Baseline".
  - Hover shows an icon button, Compare with… (GitCompare; lands with G01).
  - The lone trash button becomes a quiet overflow `ui-menu`: Rename (inline; Enter saves, Esc cancels) · Set as baseline / Clear baseline · Compare with… · Reveal · Copy path · Save a copy… · separator · Delete.
- **SummarySection header:** the identity line, `main @ 3f2a91c · committed 3 days before the scan · 4 uncommitted files`, a neutral `ui-tag` "shallow clone" (explained in its tooltip), and an "About" link to [G33](#b-g33). A later "Since baseline" summary goes on this meta line, not in a new strip.
- **HEAD moved:** a second reason in `OutdatedSnapshotBar`, "HEAD moved 14 commits since this snapshot", with Scan again. It appears only when the newest snapshot by `scanOrderKey` is open, and can be dismissed per scan.
- **Baseline:** `useComponentDelta` uses the baseline, then `route.query.baseline`, then the previous snapshot by `scanOrderKey`, whether older or newer, and checks `comparability()` first.

**Data.**
- Engine E3 and the app.db m1 columns.
- Bindings (FD-L):
  - `SetScanLabel(scanID, label)`
  - `SetBaseline(workspaceID, scanID)`
  - `HeadDrift(workspaceID) → {status, ahead, headSha, branchChanged}` in `app/gitprobe.go`, using `git -C folder rev-list --count <sha>..HEAD`

**States.**
- No git: the identity line and the drift check are hidden.
- Pre-rev-2 snapshots: time only.
- Detached HEAD: `detached @ sha`.
- **HeadDrift failures:**
  - The sha is not local (shallow clone, force-push, rebase): "HEAD moved: unknown (history rewritten or not fetched)". Never 0.
  - Folder missing: "Folder not found".
  - git not on PATH: the check is hidden, with a note in About.

**Integration.** `app/store/{store,scans,workspaces}.go`, `app/workspace_service.go`, `app/gitprobe.go`, `components/shell/ScanPanel.vue`, `components/SummarySection.vue`, `components/shell/OutdatedSnapshotBar.vue`, `stores/{data,workspaces}.ts`, `composables/useComponentDelta.ts`, `utils/scanOrder.ts`.

**Acceptance.**
1. LibreChat reads `main @ <sha7>`, matching `git rev-parse --short HEAD`, and `_snapshot.git_head_commit` is 40 characters.
2. Editing a tracked file and rescanning shows `+1`.
3. With a nopCommerce baseline set, DeltaChip compares against the baseline, and shows no delta with a reason when the baseline is r0.
4. A new commit in gin shows "HEAD moved 1 commit". After a force-push that drops the snapshot's sha, it shows "unknown".

**Depends / effort.** W1.1, W1.2, E3 · M.

<a id="b-g40"></a>
#### G40 · The Export menu: tables and figures with provenance
**Job.** Consultant (must): complete tables and captioned figures for the report. Architect (should): ADRs and tickets.

**Surface.**
- **One Export button** (download icon) in `ViewWorkspaceLayout`'s `actions` slot, also opened by ⌘E. It opens a `ui-menu` built from whatever the view registers through `useExportables()` (provide/inject):
  - Table: Copy as Markdown · Copy as CSV · Save CSV….
  - Figure: Save PNG (2×)… · Save SVG….
  - Document: views register their own Markdown outputs here. Examples: About's Copy methodology, the Reference's Markdown glossary, the sandbox plan, the board's report, Changes sections, console results.
- **Inspector lists** (PairTable, NeighbourList, PartnerList, the rules and cycles lists, Authors, Knows best) get a header overflow menu with the table items only.
- **Tables** export all rows after filter, scope, role and sort, not the 25-row page (ElementTable `sortedElements`).
  - CSV headers are metric ids, with a full-form provenance preamble (`# key: value`).
  - Markdown headers are `_metric_definitions` names, followed by the short-form caption.
- **Figures:**
  - SVG: serialize with computed styles inlined, then rasterize at 2× through the canvas for PNG.
  - Canvas (`ConnectionsGraph`): redraw offscreen at 2×.
  - Each chart exposes `exportFigure()` via `defineExpose`. A footer band carries its legend and the `ProvenanceLine`.
  - Light theme by default, with an "As shown" option.
- **W1 figure set:** ConnectionsGraph, ConnectionsChord, HotspotsTreemap, GitActivityChart. **W2.26:** CycleLoopChart, MonthlyChangesChart, ComponentPlotterDiagram, ClassGraph and the rest. Over time registers its own in W2.7.
- Feedback and states follow FD-D. Author names go through `displayAuthor()` (G60) at export time.

**Data.** No queries. FD-D, FD-C.

**States.**
- Empty table: disabled, with the reason.
- More than 1,000 rows as Markdown: confirm first.
- Chart still loading: Figure items disabled.
- ConnectionsMatrix: CSV only for now; an SVG drawn from its data later.
- Outdated snapshot: the caption carries `analysis rN (outdated)`.

**Integration.** `utils/{export,figure}.ts`, `composables/useExportables.ts`, `components/ui/ExportMenu.vue`, `ViewWorkspaceLayout.vue`, `ElementTable.vue`, `PairTable.vue`, `NeighbourList.vue`, `PartnerList.vue`, the W1 chart set, `GroupsManager.vue`.

**Acceptance.**
1. Save CSV on Sylius Metrics writes every row in scope.
2. Copied Markdown renders on GitHub with its caption.
3. The django-oscar Connections PNG is 2× and has a legend and caption.
4. The HotspotsTreemap SVG opens correctly in a browser.
5. Groups Export works in a release build.
6. Cancelling the dialog changes nothing.
7. With pseudonymisation on, an Authors CSV contains no real names.
8. No export contains the workspace folder path.

**Depends / effort.** W1.6, W1.7 · M+. Mermaid and DOT are deferred past v1.

<a id="b-g45"></a>
#### G45 · Reveal, save a copy, import snapshots
**Job.** Both (should): the .db is the contract. Show it, hand it over, and open the ones CI produces.

**Surface.**
- **Slice 1 (W1, S):** the row menu and the File menu offer Reveal (`open -R`, `explorer /select,`, `xdg-open <dir>`), Copy path, and Save a copy….
  - Save a copy states what leaves with the file: "contains the source of 5,214 files, import snippets, commit subjects and author emails".
  - "Without source": `VACUUM INTO` a copy, then on the copy `DELETE FROM file_contents` and `VACUUM`. `VACUUM INTO` followed only by a delete does not shrink the file.
  - Save a copy stays in the row and File menus, not the view Export menu, but uses the FD-D feedback pattern.
- **Slice 2 (W2, M): import.** Three entry points:
  - ⌘O
  - dropping a .db on the window (`DragAndDrop.EnableFileDrop` plus `OnFileDrop`)
  - `archstats-desktop x.db` (`main.go` args, `SingleInstanceLock.OnSecondInstanceLaunch`)

  macOS `OnFileOpen` normally needs `CFBundleDocumentTypes`, which conflicts with Decision 11. It is dropped unless a spike shows it works without them.
- **`ImportSnapshotSheet.vue`** (a sheet) shows scanned time, commit, revision, file count, git yes/no and source yes/no, plus a workspace picker.
  - The picker is pre-selected by `report_id` matching the workspace name, or by file-path overlap.
  - Low overlap: warn, don't refuse.
- The snapshot is copied **through the SQLite backup API** to `scans/<ws>/<id>.db`, so WAL content is kept. It takes its place by `scanOrderKey` and carries an "imported" `ui-tag`.
- Deferred: snapshot-only workspaces, the hand-over bundle, folder batch import.

**Data.**
- Bindings (FD-L): `RevealSnapshot`, `SaveSnapshotCopy(scanID, withSource)`, `InspectSnapshot(path)`, `ImportSnapshot(path, workspaceID)`.
- `scans.origin = 'import'`.
- Validation:
  - `_metric_definitions` and the core view tables are present.
  - Exactly one distinct `report_id`.
  - Revision no higher than the engine's; a lower one imports and raises the outdated bar.
- Scan time is `_snapshot.scanned_at`, falling back to `max(timestamp)`.

**States.**
- Not SQLite, or a foreign schema: refused, with the reason.
- Already imported (same `report_id` + `git_head_commit` + `scanned_at`): "Already imported", with Open.
- `--store-content=false` exports: the code viewer shows its missing-content state.
- Large copies run in the backend.

**Integration.** `app/workspace_service.go`, `app/store/scans.go`, `main.go`, `ScanPanel.vue`, `components/shell/ImportSnapshotSheet.vue`, `layouts/default.vue`, `stores/workspaces.ts`.

**Acceptance.**
1. Reveal selects the gin .db.
2. A copy without source has no `file_contents` rows and is smaller than the original.
3. A dropped CLI BroadleafCommerce export, still with an unmerged WAL, shows the CLI's component count.
4. A two-report .db is refused, with the reason.
5. A second launch with a .db opens the sheet in the running window.
6. Importing the same file twice says "Already imported".

**Depends / effort.** Slice 1: W1.5, W1.10, W1.4 · S. Slice 2: W1.12 · M.

**Decision.** Do not register a `.db` file association.

<a id="b-g46"></a>
#### G46 · Open in editor at file:line (narrowed)
**Job.** Architect (should): act on a finding without retyping `Foo.cs:212`.

**Surface.**
- A quiet hover icon (`ui-btn-icon ui-btn-quiet`) next to every file:line:
  - `rules.vue`
  - cut-plan sites (`components/[name]/cycles.vue:146`)
  - `DependencyPanel` and `ModulePanel`
  - the file `DetailFrame` actions
  - `FileCodeViewer` ("Open in editor" at the highlighted `#L`)
- Secondary action: Reveal in Finder/Explorer.
- The editor is chosen once, from the first click, in a `ui-menu`: VS Code, Cursor, JetBrains Toolbox, system default.

**Data.**
- New `app/editor_service.go`:
  - `Open(workspaceID, relPath, line, col) → {changedSinceScan}`, comparing mtime with scan start.
  - `Reveal`
  - `Get/SetEditor` in `settings`
- Launches `vscode://file/…:L:C`, `cursor://file/…` or `idea://open?file=&line=` via `BrowserOpenURL`.
- Refuses paths outside the workspace folder, and uses `filepath.FromSlash`.
- Also fix `rules.vue:64` to link with `#L{line}`.

**States.**
- "Not on disk any more".
- "Changed since this snapshot; the line may have moved".
- **The scheme may not be registered.** `BrowserOpenURL` fails silently, so after each launch the icon's menu shows "Didn't open? Choose another editor" for a few seconds.

**Acceptance.**
1. A nopCommerce rule finding opens VS Code at its line.
2. A path with `..` is refused.
3. Works with a Windows backslash folder path.
4. With Cursor not installed, "Choose another editor" is reachable.

**Depends / effort.** W1.1 · S. `$EDITOR` is not supported.

<a id="b-g60"></a>
#### G60 · Pseudonymised authors (display and export)
**Job.** Consultant (should): works-council-safe evidence, in place before the first export leaves the app.

**Surface.**
- An Authors toolbar toggle, "Show as Author 1…N", stored in `workspace_state` key `authors.pseudonymise` (m1) and shown in the provenance line.
- Labels are deterministic: alias-merged authors in order of first commit.
- Emails are hidden. Handles in commit subjects are masked.
- **What follows the toggle:**
  - every author surface (CommitHistory, Authors, Knows best, GitActivityChart, the suggest model)
  - every export
  - later, Who knows it, ⌘P author search, and the board and report, which re-render names at export time
- A pin note that contains a real author name warns before export (with W3.1).

**Data.** One `displayAuthor()` in `utils/authors.ts` (+test). Exports call it; they never read raw names.

**Integration.** `CommitHistory.vue`, `pages/views/git/authors/**`, `GitActivityChart.vue`, `useSuggestModel.ts`, `utils/export.ts`.

**Acceptance.**
1. All Broadleaf authors are relabelled; the count equals the SQL alias-merged author count (r0: 141).
2. The rendered DOM and every export contain no real name or email.
3. Toggling off restores the names.

**Depends / effort.** W1.1, W1.7; ships in the same release as W1.11 · M.

### Trust and explain

<a id="b-g37"></a>
#### G37 · Metric definitions and Metric reference
**Job.** Consultant (should): learn HITS or residual closeness where the number appears, and paste definitions into a glossary.

**Surface.**
- `components/ui/common/MetricHint.vue`, a `ui-popover` on `useAnchoredPanel`:
  - Opens after about 500 ms of hover, or on focus.
  - Shows name, mono id, short text and an expandable long text.
  - Actions: Copy definition · Open in reference.
- It replaces the native `title=` in `ElementTable.vue:17`, `StatStrip.vue` `dt`, the `SummarySection.vue` strip and "More metrics", and the file Overview metric wall.
- Route `/views/reference`, **with no rail row**. It is reached from Help › Metric reference, the shortcut sheet, MetricHint's "Open in reference", and ⌘P (W3.4).
  - Toolbar search ("Search 72 metrics").
  - Left list grouped by category (`ui-section-title`). Categories come from E14 if approved, otherwise from the id prefix.
  - Right pane shows the definition.
  - Derived metrics (FD-F) appear with "Computed by the app" and their SQL.
  - "Markdown glossary" is registered in the Export menu.

**Data.** `store.definitions`, plus `category` after E14. It reads the open snapshot, so definitions match its numbers.

**States.**
- No snapshot: "Definitions come from a snapshot; open one."
- Undefined metric: its id and "Not defined in this snapshot".

**Integration.** `utils/definition.ts`, `pages/views/reference.vue`, `ElementTable.vue`, `StatStrip.vue`, `SummarySection.vue`, `ShortcutSheet.vue`.

**Acceptance.**
1. The Broadleaf "Closeness (Dangalchev)" header shows its definition on hover or Tab.
2. The reference count equals `count(*) from _metric_definitions` plus the FD-F entries (r0: 72 on Broadleaf, 55 on gin).
3. Searching "closeness" finds both closeness metrics.
4. Copy yields `**Name** (\`id\`): short` followed by the long text.
5. No native `title` remains on metric labels.

**Depends / effort.** W1.2, W1.6 · S. Direction and range ("higher is worse") stay out.

<a id="b-g35"></a>
#### G35 · Why this health score
**Job.** Both (should): answer "why 6.3?" and "what is hotspot 64?" with inputs, not a verdict.

**Surface.**
- **File Overview:** a "Why this score" band under `StatStrip`, in `ReadingBand` style.
  - A `ui-table` with one row per deduction (Size, Max nesting, Avg nesting). Columns: Input · Threshold · Rule · Points, e.g. `1,240 lines · over 500 · 0.01/line, cap 3 · −3.0`.
  - A sum row: `10 − 3.0 − 1.5 − 0 = 5.5 (floor 1)`.
- **Hotspot sentence:** "log2(26+1) × 9,620 lines, relative to the hottest file in this snapshot (`Foo.java` = 100)", with the file linked.
- **Component page:**
  - Health `title`: "line-weighted mean of N scored files".
  - Hotspot: "**hottest file: `X` (64 of 100)**", with the file linked. This follows the engine's max roll-up.
- **Inside tab** (`components/[name]/inside.vue`): health dots get the three deductions as a tooltip.
- The nesting gutter and bumpy road are out.

**Data.**
- E6 columns. No copy of the formula lives in the UI.
- Hottest file: `ORDER BY codesmells__hotspot_score DESC LIMIT 1`.
- A rev 0 or 1 snapshot shows the inputs plus "Rescan to see the deductions".

**States.**
- Non-code, third-party and generated files: nature line only.
- No git: "no commits, so no hotspot".

**Integration.** `pages/views/files/[...name]/index.vue`, `pages/views/components/[name]/index.vue`, `inside.vue`, new `components/files/HealthBreakdown.vue`, `utils/delta.ts`.

**Acceptance.**
1. The deductions sum to the shown health within 0.05 on the hottest django-oscar file and on the least healthy Broadleaf file.
2. LibreChat `.tsx` shows thresholds 6 / 2.5; gin `.go` shows 4 / 1.5.
3. Hotspot = 100 names exactly one file.
4. `.po` files show no breakdown.
5. A component's raw hotspot equals its hottest file's.

**Decision.** The component hotspot DeltaChip (`[name]/index.vue:289`) compares numbers normalised per snapshot. It switches to the delta of `codesmells__hotspot__raw` (max roll-up) when both sides have it and `comparability()` is ok; otherwise it shows no delta.

**Depends / effort.** E6, W1.2 · M.

<a id="b-g33"></a>
#### G32 + G33 · About this snapshot (composition and coverage)
**Job.** Consultant (should): write the report's first sentence and state the limits of the evidence. Architect (could): see why a number moved.

**Surface.**
- Route `/views/snapshot`, a document column of `ReadingBand` sections:
  1. **Composition:** a `ui-table` of lines and files by language, with a stacked role bar per row. Each row is multi-selectable into `GroupActionBar` and links to Metrics filtered to those files.
  2. **Repositories:** HEAD, branch, dirty files, commits, first and last commit, and a neutral "shallow clone" `ui-tag`.
  3. **Manifests:** counts by kind; the list behind a disclosure.
  4. **Frameworks:** one per language, loaded lazily with `detectFramework` over `loadUnits`.
  5. **Dependency evidence:** import, dynamic-only and type-only pairs, plus unresolved lookups ([G15](#b-g15)).
  6. **What the scan left out:** ignored paths by source and top pruned directories, commits left out of co-change, and third-party, generated and non-code counts.
  7. **Analysis:** revision, extensions, ignore globs, scan duration, CODEOWNERS file read (W3.11).
- Copy methodology (the early slice of G39) is registered in the Export menu.
- **Entry points:**
  - the "About" link on the Overview identity line
  - OutdatedSnapshotBar
  - n/a and empty states elsewhere
  - **No Overview Composition panel:** composition lives only here.

**Data.**
- **Phase 1 (no engine):**
  - `files` (non-code = `code_health IS NULL`; third-party and generated flags)
  - `git_repos.git__shallow_clone`
  - `modules`
  - `component_connections_direct.kind`
  - `unresolved_edges`
  - `_snapshot`
  - app.db scan times
  - new `utils/languages.ts`. `languageOfFile` cannot be reused: it maps `.js` to TS and returns null for non-code.
- **Phase 2:** role, per-repo HEAD, `extensions`, `walker_ignored_*`, `git_sweeping_commits`.

**States.** No git: "Not a git checkout". Pre-rev-2: "Rescan to see …" inline. Sylius (11,725 files) is grouped client-side.

**Integration.** Engine: E3, E4, E5. UI: `pages/views/snapshot.vue`, `utils/languages.ts`, `SummarySection.vue`, `OutdatedSnapshotBar.vue`, `app/scan/scan.go` (persist `scans.extensions`).

**Acceptance.**
1. django-oscar shows 876,814 of 996,736 lines as `.po` and 74,353 as Python.
2. Sylius shows 60 composer and 5 node manifests.
3. django-oscar shows 18 unresolved lookups; LibreChat shows 293 type-only edges.
4. After a rescan: HEAD sha and "N sweeping commits left out of co-change only".
5. Copy methodology includes the shallow note and no folder path.

**Depends / effort.** W1.2, W1.7, W1.11; phase 2: E3, E4, E5 · M (phase 1 is S).

<a id="b-g15"></a>
#### G15 · Dependency kinds
**Job.** Consultant (should): how far to trust the coupling numbers. Architect (could): runtime-string coupling that a refactor breaks silently.

**Surface.**
- **Overview Structure panel:** one `ui-kv` row, only when relevant, e.g. "188 of 516 only by runtime lookup · 18 lookups unresolved", linking to [G33](#b-g33).
- **ConnectionsGraph:** dynamic-only pairs are dashed; pairs with any static import stay solid. A legend entry appears only when dynamic pairs exist. Matrix and inspector tooltips read "12 refs (9 dynamic)".
- **Component Dependencies tab** (not Reading): a section "Dependencies it can't place" when rows exist. It is a `ui-table` of mono `file:line` (links to `/views/files/<file>/source#L<n>`), name used, and reason.
- The type-only hairline toggle stays dropped.

**Data.**
- `component_connections_direct.kind` (import, type_only and dynamic are actually emitted).
- `unresolved_edges`.
- Dynamic lines from `snippets` with `snippet_type = 'modularity__component__imports__dynamic'`.
- Add `dynamicRefs` to `CEdge`; group `useConnectionsModel.ts:76` by kind.
- Fix the stale comment at `stores/data.ts:160`.

**States.** Java, C#, PHP and Go are 100% import, so nothing renders. LibreChat: "21 dependencies are types only, left out of coupling". No `kind` column: nothing renders.

**Integration.** `SummarySection.vue`, `utils/connections.ts`, `composables/useConnectionsModel.ts`, `ConnectionsGraph.vue`, `ConnectionsMatrix.vue`, `ConnectionsInspector.vue`, `components/[name]/dependencies.vue`.

**Acceptance.**
1. django-oscar shows 188 of 516 and exactly 188 dashed edges.
2. The `src/oscar/apps/customer` Dependencies tab lists `receivers.py:6`, which opens at line 6.
3. Broadleaf shows no caveat and no legend entry.

**Depends / effort.** None · M.

<a id="b-g34"></a>
#### G34 · Production/test facet and test ratio
**Job.** Both (should): tell "the product hurts" apart from "the tests hurt", and see whether a component is tested.

**Surface.**
- **The global facet** ([FD-H](#fd-h)) in ScopeBar applies to:
  - Hotspots
  - Metrics (a component is a test component when all its files are tests)
  - author files
  - `files/table.vue`, which also gets a Role column
  - Connections, Changes, Extremes, the directory tree and Find in code
- Counts read "N of M". The provenance line adds `role: production` when set.
- **Component Reading, Standing band:** "Tests: 1,240 lines in 8 files here · 14 test files elsewhere import it".
- **Component Reading, Position band:** "N of M dependents are test components".
- **File nature line:** "Test code."

**Data.**
- E5 role rules:
  - JVM: `src/test/**`, `*Test(s)|IT.java`
  - .NET: `*.Tests` projects
  - PHP: `tests/`, `spec/`, `Behat/`, `*.feature`, `*Test.php`, `*Spec.php`
  - Python: `tests/`, `test_*.py`, `conftest.py`
  - Go: `_test.go`, `testdata/`
  - JS/TS: `*.test|spec.*`, `__tests__/`, `e2e/`, `cypress/`
  - django migrations: generated
- Test files importing a component:
  `SELECT d."to", count(DISTINCT d.file) FROM component_connections_direct d JOIN files f ON f.name=d.file WHERE f.role='test' GROUP BY 1`.
- "Components no test references" is a count, not a list.

**States.** No tests found: the facet's Tests option is disabled with the reason. It only filters rows, so it stays cheap.

**Integration.** Engine E5. UI: `utils/fileRole.ts`, `stores/fileRole.ts`, `components/shell/ScopeBar.vue`, `hotspots.vue`, `metrics.vue`, `authors/[name]/files.vue`, `files/table.vue`, `components/[name]/index.vue`, `files/[...name]/index.vue`, `utils/findings.ts`, `utils/provenance.ts`.

**Acceptance.**
1. Sylius `src/Sylius/Behat` (906 files) reads as test.
2. Under Production, nopCommerce hides `Nop.Tests.*`.
3. gin shows 40 `_test.go` files.
4. LibreChat Hotspots under Production has no `.spec` or `.test` file.
5. Role counts sum to the file count.
6. One switch changes every view in the workspace.

**Depends / effort.** E5, W2.1 · M.

**Decisions.** Default All, with no per-feature defaults. Test-origin edges stay in coupling metrics for now (414 of 4,653 on nopCommerce) and are shown as evidence.

<a id="b-g66"></a>
#### G66 · Code age
**Job.** Consultant (should): "60% of billing untouched since 2021".

**Surface.**
- A "Last changed" column (days) in Metrics at file and component grain.
- A Hotspots "Code age" preset: sized by lines, coloured by days.
- File StatStrip: "Age" is renamed "First commit", and a "Last changed" cell is added.
- Component Standing band: one stacked bar for untouched > 1, > 2 and > 5 years.
- **One line in Activity** (not Overview).
- Captions are file-grained: "lines in files unchanged for > 2 y".

**Data.** `app__last_changed_days` in FD-F:
- `julianday(anchor) − max(julianday(commit_time))` per file, for files in `files`, where `file_additions + file_deletions > 0`. A pure rename then does not reset age.
- Components take the minimum over their files, plus line-weighted bucket shares.
- Joined into the `SELECT *` loads at `hotspots.vue:349` and `metrics.vue:216`.

**States.** No git: hidden. Shallow: a neutral note that ages stop at the fetched depth.

**Acceptance.**
1. Broadleaf bucket shares equal the checked-in SQL (r0: about 91 / 85 / 56% for > 1 / 2 / 5 years).
2. LibreChat is anchored at its `git_based_on` (rev 2 or later).
3. gin hides the feature.
4. The reference shows the SQL.

**Depends / effort.** W1.9, W1.13 · S.

### Compare over time

<a id="b-g01"></a>
#### G01 · Changes: Compare (phase 1)
**Job.**
- Architect (must): which dependencies, tangles and rule findings are new or gone since the baseline.
- Consultant (could): what changed since the start of the engagement.

**Surface.**
- **One rail row, "Changes"**, directly under Overview, with a `ui-segmented` **Compare | Over time**. These are two routes: `/views/changes?base=&head=` and `/views/trends`.
- **Choosing the two sides:**
  - `head` is the open scan.
  - `base` is the baseline, then the previous snapshot by `scanOrderKey`.
  - If `base` is later by `scanOrderKey`, the two swap and a note says so.
- `ViewWorkspaceLayout` (`queryable=false`, `show-config=false`):
  - Title "Changes" with mono `Sep 21 14:02 → Sep 22 09:49`; each side is a `SingleSelect`.
  - Stats from FD-F readings, in neutral ink: `+3 −1 components · +41 −12 edges · +2 tangles · +1 rule finding`.
- **A 1040 px column of sections**, each a `ui-section-title` and a `ui-table`:
  1. **Components added and removed** (linked through `componentPath()`).
  2. **Edges added and removed**, keyed on the pair: refs before→after and the importing files. A row expands to lazy `file:line` snippets.
  3. **Tangles** (`group_size > 1`) that formed, grew, shrank or dissolved, with the shortest cycles as evidence.
  4. **Rule findings**, new and gone. Lens findings are added after W2.13.
  5. **Largest moves**, before→after for I, D, Ca, Ce, dependents/dependencies, hotspot (raw where present) and health, with a metric switch. No composite.
- Neutral ink with `+`/`−` glyphs and mono `12 → 9` throughout.
- Rows in sections 1, 2 and 5 multi-select into `GroupActionBar`. A single click selects; opening a component goes to `componentPath(name)?baseline=<base>`.
- Every section registers Markdown/CSV exportables; the header registers a "Changes summary" Markdown document.
- **Comparability gate** (`components/changes/ComparabilityGate.vue`), shown when `comparability(base, head)` blocks. It lists each reason, e.g. "Written by different analyses (r0 → r2)" or "Ignore globs differ", then "Differences may come from the scan, not the code." Actions:
  - **Primary: "Rescan baseline commit 3f2a91c at r2"** (W2.5), which rebuilds the base at the same commit.
  - For an r0 base with no recorded sha, the commit is resolved from the reflog or `rev-list -1 --before=<scan time>` and shown before running: "HEAD at scan time was probably 3f2a91c".
  - **Secondary: Compare anyway.** It leaves a persistent notice strip in the OutdatedSnapshotBar style (`bg-accent-50` / `border-accent-200`) that names the reasons.
- Extension differences show as a notice line, not a gate.

**Data.** FD-I tables:
- `components`
- `component_connections_direct` (sum refs by pair, keep the file set)
- `component_strongly_connected_groups` (matched across snapshots by member overlap)
- `component_cycles_shortest.cycle` (already rotated to a stable key)
- `rules`, keyed (rule, from, to, file) without the line
- `_snapshot`
- snippets for expanded rows, following `cycles.vue:528`
- the global role facet

**States.**
- One snapshot: EmptyState "Changes needs a second snapshot", with Scan again and "Scan an earlier commit…" (W2.5).
- Identical: "No structural changes between these snapshots."
- Base deleted, or a failed scan: "The baseline snapshot is gone", with Choose another.
- No rules table in the baseline: "Rules were not checked in the baseline."
- Loading: "Comparing snapshots…".
- Tables page at 50 rows.
- Java and C# renames show as removed plus added.

**Integration.** `app/changes/changes.go` (+test), `app/services.go`, `main.go`, `app/query/query.go`, `pages/views/changes.vue`, `utils/changes.ts` (+test), `components/changes/ComparabilityGate.vue`, `ScanPanel.vue`, `NavBar.vue`, `useComponentDelta.ts`.

**Acceptance.**
1. nopCommerce r0 vs r0 shows the gate. "Rescan baseline commit" produces a comparable base and the gate clears. After "Compare anyway" the notice strip stays.
2. gin scanned twice at rev 2: "No structural changes".
3. Adding one cross-app import in django-oscar gives exactly one new edge, with its `file:line`.
4. Compare with… sets `base`, and DeltaChip agrees with it.
5. Removing a violating Sylius import moves the finding to Gone.
6. Changing ignore globs between scans triggers the gate.

**Depends / effort.** W2.4, W2.5, W1.10, W1.11 · M+.

**Deferred to phase 2:** rename pairing, scoping by lens or group, and a "Since baseline" summary on the Overview identity line.

<a id="b-g02"></a>
#### G02 · Changes: Over time
**Job.** Architect (should): is the architecture getting better or worse, with evidence for management.

**Surface.**
- `/views/trends`, reached through the Changes row's Over time segment.
- A D3 stack of 72 px small multiples (`components/trends/TrendRows.vue`) on one x-axis, using `chartTheme()`. Each shows its latest value and the change since the first comparable point, in neutral ink.
- Series, all FD-F reading ids:
  - components
  - components in tangles
  - lines in tangles
  - largest tangle
  - cross-component edges
  - propagation cost
  - rule findings
  - median I and median D
- **x-axis:** one basis per chart (FD-B), captioned "by commit time" or "by scan time".
- **Breaks:** at each comparability break the line breaks, with a labelled vertical hairline (`analysis r2`, `ignore globs changed`). r0 points are hollow, unjoined dots.
- **Interaction:** click selects a point; Open switches to that snapshot. Shift-click a second point offers Compare, which opens Compare.
- A `ui-segmented` switches Chart | Table.
- It registers `exportFigure()` and the table in the Export menu.

**Data.**
- FD-I `scan_readings` by reading id, through `TrendsService.Readings(workspaceID)`.
- Medians are computed in Go.
- A missing `rules` table is a gap, not 0.
- Repeated scans of the same commit and revision show one point, the newest.

**States.**
- Fewer than 2 scans: "Over time needs two snapshots."
- Only one comparable point after a break: "One point since analysis r2; rescan an earlier commit to extend the line", with W2.5.
- fineract: per-scan progress on the first run.
- No git: scan-time axis, captioned.

**Integration.** `app/trends/trends.go` (+test), `app/scan/scan.go` post-scan hook, `pages/views/trends.vue`, `utils/trends.ts` (+test), `NavBar.vue`.

**Acceptance.**
1. django-oscar's r0 dots are unjoined, and a break precedes the rev 2 point.
2. The largest tangle equals `max(group_size)`.
3. Propagation cost equals Overview's for the same snapshot.
4. Shift-click opens Compare with the right base and head.
5. A second visit reads only the cache.
6. Table equals chart.

**Depends / effort.** W2.4, W2.6, W1.13 · M.

<a id="b-g54"></a>
#### G54 · Snapshot sizes and cleanup (UI part)
**Job.** Architect (should): 9.9 GB of scans, and which can go.

**Surface.**
- A mono size in each ScanPanel row's tooltip and aria-label.
- Footer `12 snapshots · 1.3 GB` with a quiet Manage….
- `components/shell/StorageSheet.vue`, a sheet with a `ui-table` of workspaces and their nested scans: date, revision, size, checkbox.
  - The open scan and the baseline cannot be selected; the sheet says why.
  - "3 pins cite this snapshot" appears on affected rows (after W3.1). The pins keep their values.
  - Select all but newest 3 · Delete selected (danger, with an inline confirm of the total freed).
  - One line for "Scan again to shrink" when a snapshot is over 1 GB and below the current revision.
- WorkspaceSwitcher rows show each workspace's total. No compaction.

**Data.**
- `SizeBytes` via `os.Stat` in `ListScans`, not persisted.
- `StorageSummary()` and `DeleteScans(ids)`, which close handles first (FD-G).
- `scan_readings` cascade; pins are set null.
- **`DeleteWorkspace`** also removes `evidence/<ws>/` figures and `backfill/<ws>/` clones.

**Acceptance.**
1. fineract shows 3.8 GB, and the total is within 1% of `du`.
2. The open scan is disabled, with the reason.
3. Deleting 2 nopCommerce scans frees about 465 MB, including on Windows while another view has one of them open.

**Depends / effort.** W2.4 · S. The actual cure is rev 3.

<a id="b-g03"></a>
#### G03 · Rescan a commit, then backfill tags
**Job.**
- Consultant (should): structural history on day one.
- Architect (should): a comparable baseline right away, and a clean series after a revision bump.

**Surface.**
- **Slice 1 (W2.5): one commit.** "Rescan this commit" in the ScanPanel row menu, and as the Changes gate's primary action. A compact confirmation sheet shows the sha, commit date, estimate, and "this scans a clean checkout; the original's 4 uncommitted files are not included".
- **Slice 2 (W3.15): tags and batches.** "Scan tags…" opens a **sheet**, not a popover:
  - tags and commit dates with checkboxes, and an estimate ("8 scans · ~24 min · ~6 GB")
  - queue rows (queued, running, done) in ScanPanel
  - "Stop after current", because the engine has no cancellation
- Backfilled rows show the tag or sha and the commit date, placed by `scanOrderKey`.

**Data.**
- `app/backfill/backfill.go`:
  - slice 1: `ScanAtCommit(workspaceID, sha)`, `ResolveCommitAt(workspaceID, time)`
  - slice 2: `Revisions` (`for-each-ref refs/tags --sort=-creatordate`), `Enqueue`, `Queue`, `StopAfterCurrent`
  - `backfill:*` events
- **Each ref:**
  - `git clone --shared --no-checkout` into `app-data/backfill/<ws>/<sha>`
  - `checkout --detach`
  - scan with the workspace's current ignore globs
  - save, then delete the clone
- A startup sweep removes orphaned clones, alongside `MarkInterruptedScans`.
- `scans.origin='backfill'` and `revision_ref`. `app/scan/scan.go` takes `RootPath` as a parameter.

**States.**
- Partial clone: a network warning.
- Shallow: nothing older than the cutoff is offered; a sha that is not present is disabled with the reason.
- Multi-repo parent folder: disabled.
- The estimate uses the last snapshot's size.

**Acceptance.**
1. gin at v1.9.0 and v1.10.0: `git_head_commit` equals each tag's full sha, and the windows are anchored at the tag's commit time.
2. The user repo's refs, `worktree list` and `status` are unchanged.
3. The clone is removed after success, after failure, and after a crash (on the next start).
4. A rescanned baseline makes the Changes gate clear.

**Depends / effort.** Slice 1: E3, W1.10, W1.4 · M. Slice 2: W2.5, W2.24, W2.7 · M.

<a id="b-g63"></a>
#### G63 · Custom history range
**Job.** Both (should): "since the engagement started", "the quarter before the reorganisation".

**Surface.**
- The period `ui-segmented` in CommitHistory, Activity, Authors and the group History tab gains "Custom…".
- It opens a `ui-popover` with Since and Until date inputs, plus quick picks: "Since the baseline commit" and "Since <last custom>".
- Until is capped at the anchor.
- The label reads "2 Mar 2026 – 2 Jun 2026 (3f2a91c)".
- Stored per workspace in `workspace_state` `history.range`, and shown in provenance.

**Data.** `anchorSql()` with explicit bounds over `git_commits`. Metrics' precomputed `git__*__last_N_days` columns are unaffected and say "30 / 90 / 180 only".

**States.** An empty range: "No commits between these dates." Until before Since: an inline error.

**Acceptance.**
1. Commit and author counts for a custom range equal the checked-in SQL on Sylius.
2. The range survives a restart.

**Depends / effort.** W1.9 · S.

### Structure

<a id="b-g07"></a>
#### G07 · Declared architecture on a lens (plus its Changes integration)
**Job.**
- Architect (must): write down the agreed layering and see every import that breaks it.
- Consultant (should): test the client's stated layering with file:line.

**Surface.**
- A "Declare dependencies…" sheet (`components/groups/DeclareSheet.vue`), opened from the NavBar lens ⋯ menu and from Connections at matrix/group grain:
  - **Layer order** (horizontal cuts only): an ordered list with drag handles and ⌥↑/⌥↓. GroupsRail drag is not used, because it means merge there.
  - **Pair grid:** `ConnectionsMatrix` in declare mode. Each cell shows actual refs; a click cycles unset → forbidden → allowed.
  - Matrix cell context menu: "Forbid A → B".
- **Results:**
  - a "Lens rules" section in `rules.vue`, one `ui-panel` per crossing pair with From, To, How and Where (`atLine`); its rows multi-select into `GroupActionBar`
  - a Connections "Show crossings" toggle (red ramp, distinct from `is-cycle`)
  - a neutral mono line next to `LensHealth`: "N imports cross the declared order", with no level colour
- **W2.13:** new and gone lens findings in Changes. The current lens is applied to the baseline through `QueryIn`, keyed (from_component, to_component, file).

**Data.** `runtimeComponentEdges` and snippets via FD-J. The declaration goes on the `Dimension` record: `order?`, `pairs?: {from, to, verdict}[]`, `unset: 'unjudged'|'forbidden'`, and `source?: 'user'|'manifests'` (G16). It persists through G10.

**States.**
- Unplaced components: "not judged".
- Split targets: "ambiguous".
- Dynamic edges: file only, no line.
- `type_only`: "also N type-only", not counted.
- Fewer than 2 groups: EmptyState.
- It follows the global role facet.

**Integration.** `stores/groups.ts`, `DeclareSheet.vue`, `ConnectionsMatrix.vue` and `ConnectionsGraph.vue` (`markedKeys`), `connections.vue`, `rules.vue`, `NavBar.vue`, `utils/changes.ts`.

**Acceptance.**
1. Broadleaf web > service > domain lists every upward import with file:line, and the count equals the upward cells in the matrix.
2. A declaration survives a rescan.
3. django-oscar dynamic edges never show "line 0".
4. Deleting a group drops its pairs and says so.

**Decisions.** Relaxed layering; unset means not judged. Accepting or baselining findings stays out (G08 was dropped).

**Depends / effort.** W2.10, W2.1 · M. W2.13 · S.

<a id="b-g12"></a>
#### G12 · Levelized matrix with tangle boxes
**Job.** Both (should): the layers the code really has, and where it loops.

**Surface.**
- An `Order: Name | Levels` `ui-segmented` in the Connections toolbar (matrix rep only), kept in the URL.
- Topological sort of the condensation of the visible nodes: callers on top, with a mono level in the row gutter.
- Tangles are boxed on the diagonal (hairline-strong). A box click sets `{type:'cycle'}` and opens the existing cut plan.
- Declared-lens crossings show as marks on the wrong side of the diagonal.
- Optional: "Save levels as a lens", which feeds G07.

**Data.** `levelize(ids, edges)` in `utils/connections.ts`; `model.cycleSets`.

**States.** `source=git`: disabled, "Co-change has no direction". The 200-node `MATRIX_CAP` still applies.

**Acceptance.**
1. Every edge lies on one side of the diagonal or inside a box.
2. Levels: django-oscar 8, LibreChat 9, Broadleaf 14 (group grain), gin 4.
3. A box click opens the same cut plan.

**Depends / effort.** None · M. Levels is the default at group grain.

<a id="b-g14"></a>
#### G14 · System shape numbers
**Job.** Both (should): entanglement numbers they can defend and track.

**Surface.** A "System shape" `ui-kv` in the Structure panel of `SummarySection.vue`, which also holds the one dependency-kinds row (G15). No grade, colour or threshold. Each row has a mono value, a MetricHint with its formula and inputs ("6,400 + 122 / 122²"), and an evidence link:
- **Propagation cost:** (reachable ordered pairs + N) / N², including the diagonal.
- **Components in tangles:** count and share.
- **Lines in tangles:** share.
- **Largest tangle.**
- **Dependency levels.**

**Data.** FD-F readings:
- `count(*)` from `component_connections_indirect` (never an unfiltered select)
- `components`
- groups with `group_size > 1`
- `levelize`

**States.** Missing table: "—" with the reason. Under the Production facet, the rows recompute on production components.

**Acceptance.** Reproduces these values, with every number linked:

| Workspace | Propagation cost | Lines in tangles |
|---|---|---|
| Sylius | 2.4% | 2% |
| nopCommerce | 22.5% | 28% |
| gin | 35.9% | 0% |
| django-oscar | 43.8% | 44% |
| Broadleaf | 50.6% | 53% |
| LibreChat | 64.9% | 78% |

**Depends / effort.** W2.11, W1.13 · S–M. Core/periphery and keystones stay dropped.

<a id="b-g67"></a>
#### G67 · Group page and scope-aware history views
**Job.** Both (should): read "billing" as one unit, one report section per area.

**Surface.**
- **Step 1 (S):** `git/activity.vue`, `git/authors/index.vue` and `rules.vue` read `useScopeStore()` through a shared `scopeWhere()`, show the ScopeBar chip, and switch to "N of M".
- **Step 2:** route `/views/groups/[id]` with `DetailFrame` (kind "Group"), crumbs to the lens, and Components, Files and Lines stats.
  - **Overview tab:**
    - `StatStrip` with Ca and Ce in files, I, and the share of references staying inside
    - Depends on / Used by as a `PairTable` via FD-J
    - tangles touching members
    - the hottest files
    - Knows best reversed (`authorStatsSql(where)`, through `displayAuthor()`)
  - **History tab:** `CommitHistory` with a `where` clause.
  - **Rules tab:** findings plus G07 lens findings.
- `groupPath` in `utils/routes.ts`.
- Entry points: NavBar lens rows, GroupsManager, the ConnectionsInspector group node, double-click.

**Data.** Prefer `component IN (…)` for whole-component groups.

**States.** No git, an empty query, or a deleted group each get an EmptyState with an action.

**Acceptance.**
1. A scoped Sylius Activity reads "N of M".
2. django-oscar group Ca and Ce match hand-run SQL.
3. Broadleaf group Knows best covers only that group's files, with aliases merged.
4. Every name on the page is a link.

**Depends / effort.** W2.10, W1.9 · M. Ca and Ce count files outside the whole group.

<a id="b-g13"></a>
#### G13 · SDP edges line
**Job.** Could: where stable code leans on something more volatile.

**Surface.**
- One line in the Position band: "N of its dependencies are less stable than it". It expands to rows with Ca, Ce and I for both ends.
- A Connections edge-marker toggle, with an option to leave out edges inside tangles.
- The word "violation" is never used.

**Data.** Runtime edges joined twice to `components`, plus tangle membership.

**Acceptance.** Distinct pairs:
- Broadleaf 339 (243 inside tangles)
- Sylius 124
- django-oscar 52 (42 inside)

**Integration.** `composables/useComponentPosition.ts`, `components/[name]/index.vue`, `connections.vue`.

**Depends / effort.** W2.10 · S.

<a id="b-g52"></a>
#### G52 · Used from outside (the surface half)
**Job.** Both (should): "only 4 of billing's 60 types are used from outside".

**Surface.**
- A block in the Blast radius band of `components/[name]/index.vue` (`components/component/UsedSurface.vue`).
- Lede: "N of M units are used from outside".
- A `ui-table` of mono unit name, kind tag, caller components and caller units. Rows expand to callers grouped by component, and multi-select into `GroupActionBar`.
- A footer line: "N units used only inside". It is a count, with no list.
- Never "public".

**Data.** `unit_connections WHERE to_component=X AND from_component<>X` ⋈ `units`. Distinct pairs, no lines.

**States.** No rows: "Unit references are not recorded for this language in this snapshot." A Java wildcard caveat. Pages of 50.

**Acceptance.**
1. Broadleaf `core.catalog.domain` reads "43 of 59".
2. Sylius before a rescan shows the not-recorded state.

**Depends / effort.** W1.0 · S–M. Wiring for Java, Go and C# stays out.

**Component page band order** (applies to G34, G13, G52, G29 and G66): Standing (with the test composition line and the code-age bar), Position (with the SDP line), Blast radius (with Used from outside), Who knows it.
- Conditional bands and lines render only when non-empty.
- "Dependencies it can't place" lives on the Dependencies tab.
- Evidence notes show collapsed as one line under the DetailFrame header.

### History crossed with structure

<a id="b-g27"></a>
#### G27 · Commit footprint
**Job.** Both (should): go from one commit to its architectural footprint.

**Surface.**
- In `CommitHistory` (Activity, and the component, file and author History tabs), a single click selects a row (Orange Tint) and the 260 px aside becomes a **Commit** panel (`components/git/CommitFootprint.vue`):
  - mono hash, subject, author link, date, ±lines
  - "9 components · 23 files"
  - components with their files nested
  - "Not in this snapshot"
- Panel actions:
  - **Create group** from the touched components, directly.
  - **Show in Connections**: a new `hl` param in `parseConnectionsQuery`/`toConnectionsQuery` seeds `multi`.
  - **Copy hash**.
  - Esc returns to Contributors.
- The route takes `?commit=`.
- A Components column, a **Date | Widest** sort, and "N sweeping commits hidden" from Widest behind a toggle.

**Data.**
- Add `count(distinct component)` to the grouped query (0.09 s on Sylius).
- The panel reads by `(repository, commit_hash)`.
- **Merge commits list only the files that differ from every parent**, as the engine's `--cc --raw` pass records them. The panel says "merge: files resolved in the merge".

**Acceptance.**
1. Sylius Widest puts first the commit with the most distinct components (r0: 69 components in 86 files), and the count equals the checked-in SQL.
2. Create group and Show in Connections both arrive with all of them selected.
3. A component's History tab panel lists every component the commit touched.

**Depends / effort.** W1.9 · M. No commit route in v1.

<a id="b-g42"></a>
#### G42 · Connections List rep (surviving part)
**Job.** Consultant (should): the top couplings as a complete, quotable table. It is also the surface for hidden coupling (G23).

**Surface.**
- A fifth rep, **List**, using the same state as the others and with no cap.
- `PairTable.vue` extended with From → To columns: References, Shared commits, Co-change %, Hops, Weight, Kinds, in-tangle.
- A row click sets `sel`. Shift- or ⌘-click feeds `GroupActionBar`.
- Tables are registered in the Export menu.

**Data.**
- `model.edges` plus a kinds query (`group_concat(distinct kind)`).
- Git pairs are undirected (max of the two directions).
- **At group grain, shared commits are distinct commits** from `git_commits` (member files of both groups within the sweep limit), not the sum of pair counts.

**Acceptance.**
1. Broadleaf's row count equals the edges drawn.
2. django-oscar's git ranking at component grain matches `git_component_shared_commits` (after E13).
3. At group grain, no pair exceeds either side's distinct commit count.
4. Export writes every row.

**Integration.** `connections.vue`, `utils/connections.ts` (`Rep` gains `"list"`; the `reindexEdges` fix), `PairTable.vue`, `useConnectionsModel.ts`.

**Depends / effort.** W1.11, W1.3 · S–M.

<a id="b-g23"></a>
#### G23 · Hidden coupling: co-change without an import, inside Connections
**Job.** Both (should): implicit contracts to argue from, and a finding no other tool gives.

**Surface.**
- **No separate view.** Connections with `source=git` gains:
  - a **Relation** filter: All pairs | Without an import
  - a floors popover in the toolbar, always visible and editable: "≥ 10 shared · ≥ 30% of the smaller side"
  - the period (All / 180 / 90 / 30, the precomputed columns)
- The List rep (G42) is the default with Relation = Without an import. Hops shows "none".
- **The inspector** shows both sides, then the shared commits as evidence (`components/git/SharedCommitList.vue`), each opening G27's panel.
- **Actions:** Export and `GroupActionBar` come from the rep.
- **Component Connections tab** gets "Changes with, doesn't import". It removes the `!byName.has(other)` guards in the matrix and shared loops at `components/[name]/connections.vue:377-389`, which drop co-change-only partners today.
- **`/views/git/coupling`** stays a redirect stub, retargeted to `connections?source=git&rep=list&relation=no-import`. The NavBar and inbound links are updated.
- A caveat line: co-change cannot be seen across repositories.
- Phase 2: "imports that never change together".

**Data.**
- `git_component_shared_commits` with `pair_1<pair_2` and `'.'` dropped.
- Left join `component_connections_direct` on min/max of the pair.
- `min(shortest_path_length)` for Hops.
- Evidence: commits where both components appear, within the sweep limit.
- The global role facet applies. There is no test-side default.

**States.** gin: the no-git EmptyState.

**Acceptance.**
1. On Sylius, no pair has a 0% side, and the pair count equals the checked-in SQL (r0 reference: about 322).
2. For any listed pair, the number of evidence commits equals its Shared column (r0: Telemetry `Collector` ↔ `Provider\Business`, 20).
3. nopCommerce has no pair whose shared count exceeds either side's commits.

**Integration.** `pages/views/connections.vue`, `pages/views/git/coupling.vue` (redirect target), `utils/cochange.ts` (+test), `NavBar.vue`, `components/[name]/connections.vue`, `useConnectionsModel.ts`, `components/git/SharedCommitList.vue`.

**Depends / effort.** E13, W2.18, W2.19 · M.

<a id="b-g26"></a>
#### G26 · Fix-commit filter ("commits matching")
**Job.** Could: where fix work lands, with the pattern checkable.

**Surface.**
- A "Matching fix pattern" chip in the `CommitHistory` controls. Its popover (`components/git/MessagePattern.vue`) shows:
  - the editable mono regex. Default: case-insensitive `\b(fix(es|ed)?|bug(fix)?|hotfix|revert)\b`
  - "N of M match"
  - 5 matches and 5 near-misses ("Fixture")
  - "subject lines only"
- The meta line reads "Commits matching /…/ 5,555 of 27,363". Never "bugs".

**Data.** Matched in JS over grouped rows (no `REGEXP`). Stored in `workspace_state` key `git.fixPattern`.

**States.** An invalid regex shows an inline error, and the last valid pattern stays in use.

**Acceptance.**
1. On Sylius the match count equals the checked-in SQL-plus-regex script (r0: about 5,555 of 27,363), and no Fixture-only message matches.
2. The pattern is per workspace.

**Integration.** `CommitHistory.vue`, `utils/commitPattern.ts` (+test).

**Depends / effort.** W2.1 · S. No commit bodies.

<a id="b-g25"></a>
#### G25 · Where change effort goes
**Job.** Both (should): one quotable sentence about what change costs.

**Surface.**
- Activity gets **Commits | Effort**. `components/git/EffortShare.vue` has:
  - a window (default 90 d) and "Health below [5]"
  - a `StatStrip`: changed lines; share into files below the threshold next to their file share; into tangle members; into commits matching G26; into files not in the snapshot; "no health reading"
  - a copyable lede, e.g. "In the 90 days to 18 Sep 2026, 16% of changed lines went into files with health below 5 (34% of files)"
  - a per-window `ui-table`
  - monthly bars of the low-health share
  - a link to the Hotspots "Churn against health" preset
- **The Activity summary line** carries the lede. There is no Overview line.
- The top-hotspot slice is dropped: it is circular.

**Data.** `git_commits` with `NOT_BOT_SQL` ⋈ `files.codesmells__code_health`, plus groups with `>1` member. Registered in FD-F.

**Acceptance.**
1. Sylius 90 d shares equal the checked-in SQL (r0: about 16% below 5, 18% not in snapshot, 2% tangle members). After rev 2, "not in snapshot" falls because of rename-following.
2. Broadleaf's tangle-member share equals its SQL (r0: about 12%).
3. Changing the threshold recomputes the figures.

**Integration.** `activity.vue`, `utils/effort.ts` (+test), `useHealth.ts`.

**Depends / effort.** W3.5, W1.9 · M.

<a id="b-g29"></a>
#### G29 · Knowledge concentration per component
**Job.** Consultant (should): the key-person section and whom to interview.

**Surface.**
- A Reading band **"Who knows it"** (`components/git/WhoKnowsIt.vue`), after Blast radius:
  - Lede: "3 authors added 80% of the lines; the main author's last commit was Mar 2024, 190 days before the scanned commit."
  - Top 5 authors with share bars and a mono last-commit date plus "N d before the anchor". No status dot.
  - A fixed caption: "Lines added, not blame · bots hidden · aliases merged".
- Authors view gets an **Authors | Components** grain:
  - authors, fewest covering 50% / 80%, main author share and last commit, hotspot, reached-by
  - a stated floor on lines added
  - multi-select into `GroupActionBar`
- **Extremes row 5:** "Fewest authors covering 80% of lines, among components with ≥ [N] lines added".
- Everything goes through `displayAuthor()`. No "island", "orphaned" or "bus factor".

**Data.** `knowledgeSql` in `utils/authors.ts` (window functions, 0.07 s on Sylius), `components.codesmells__hotspot_score`, `component_connections_indirect` (filtered).

**Acceptance.**
1. Broadleaf `core.catalog.domain` counts equal the checked-in SQL (r0: 50 authors, 4 cover 50%, 9 cover 80%).
2. Merging aliases updates these figures.
3. Sylius renders in under 1 s.

**Depends / effort.** E1, W2.1, W2.23 · M.

### Consultant first read

<a id="b-g31"></a>
#### G31 · Extremes in this snapshot
**Job.** Consultant (should): where to look in the first hour, as sorted evidence the consultant judges, not the tool.

**Surface.**
- `components/overview/Extremes.vue` sits between SummarySection and Views. It is one `ui-panel` titled **"Extremes in this snapshot"**, with fixed rows.
- Each row is named by its sort key and filter:
  1. **Highest hotspot · production files.** The row states its own role filter; the global facet is untouched.
  2. **Largest tangle.**
  3. **Highest Ca among components with I > [0.5].** The threshold is editable in place.
  4. **Most rule findings.**
  5. *(W3.7)* **Fewest authors covering 80% of lines.**
  6. *(after W2.20)* **Most shared commits without an import.**
- Each row shows one sentence naming its metric and threshold, up to 3 mono evidence links, and "Open in …".
- There is no ranking across rows, and a null result still shows.
- The panel respects scope ("N of M"), the role facet and the bots toggle.
- **Overview budget:** identity line + About, Structure panel (System shape + kinds row), Extremes. Nothing else is added.

**Data.** Per-row queries in `utils/extremes.ts` (+test), using the `utils/findings.ts` shape and FD-F ids where they exist.

**States.** No git: the history rows say so. Rev < 2: row 1 falls back to "by path convention" and says so.

**Acceptance.** On Broadleaf:
1. No `.js` or `.css` file appears in row 1.
2. Row 2 equals `max(group_size)` (r0: 61 components).
3. Row 3 equals the checked-in SQL (r0: `common.payment.service`, Ca 16, I 0.71).
4. A group scope changes all rows.

**Depends / effort.** W2.2, W2.14 · M. Rows 5 and 6 arrive with W3.7 and W2.20.

<a id="b-g58"></a>
#### G58 · Directory tree in Metrics
**Job.** Consultant (should): an outline of a 5k-file codebase.

**Surface.**
- A **Directories** grain in Metrics (`components/metrics/DirectoryTree.vue`). A collapsible `ui-table` tree compacts single-child chains.
- Columns, each with its rollup rule in a MetricHint:
  - Files
  - Lines
  - Components
  - Commits in period
  - Max hotspot
  - Lowest health
  - Edges out
- Rows multi-select into `GroupActionBar`, which offers "Keep as live query" (`dir/**`).
- The inspector shows top files and the components that outgoing edges reach.
- The Plot rep is disabled.

**Data.** Built from `files`, never `directories`, in `utils/dirTree.ts` (+test). Commit counts load lazily per expanded node. An edge "leaves" when the target component has no files in the subtree. The role facet applies.

**Acceptance.**
1. Broadleaf `admin` shows 1,096 files and 231,757 lines.
2. The Java chain is one row.
3. The CSV includes the rollup rules.

**Depends / effort.** W2.2 · M.

<a id="b-g16"></a>
#### G16 · Build modules as a proposed lens, plus a manifest declaration
**Job.** Consultant (should): the declared build units, and whether the code respects them.

**Surface.** There is no `/views/modules` and no Architecture rail gate.
- **"Build modules"** is a reading under "From the repository" in `ProposeSheet`, like CODEOWNERS (G65). It creates one group per module, standing "proposed".
  - A "Show 18 test fixtures" toggle.
  - It states the ecosystem per module.
- **Manifest-declared dependencies** seed a G07 declaration labelled "declared by manifests" (`source: 'manifests'`). Declare mode then shows the neutral cell states "declared, never imported" and "imported, not declared (via X)", and the Lens rules section lists the evidence.
- The manifest list stays in About › Manifests.
- ShapeLanding's "modules" is renamed "files".

**Data.** `modules`, `files.module`, observed edges. It needs the module-identity engine fix (Decision 8).

**States.** 0 modules: the reading is disabled with the reason. gin: "declares one module". django-oscar: "no build modules; observed structure only".

**Acceptance.**
1. Broadleaf proposes 13 maven modules.
2. admin-module → common reads "imported, not declared", with its refs and files listed (r0: 172 refs in 82 files, via open-admin-platform).
3. nopCommerce proposes 40 modules.

**Integration.** `components/groups/ProposeSheet.vue`, `utils/modules.ts` (+test), `utils/studio.ts` (WayId `manifests`), `stores/groups.ts`, `components/units/ShapeLanding.vue`.

**Depends / effort.** Module identity (rev 3 extra or rev 4), W2.12 · M.

<a id="b-g17"></a>
#### G17 · Libraries (narrowed)
**Job.** Consultant (should): which components are welded to framework X.

**Surface.**
- `/views/libraries`, a rail row under Code. Rows are import prefixes as written, with a roll-up depth `ui-segmented` (1 | 2 | 3 | As written).
- Columns: Imports · Files · Components.
- Tags:
  - "Platform", with exact rules only: Go (no dot in the first segment), Python `stdlib_module_names` (static list), Node builtins, Java `java/` and `jdk/`
  - "Looks internal"
- Nothing is hidden.
- The inspector lists the components that use the library. They multi-select into `GroupActionBar`.
- A component's Dependencies tab gets an "External" section.

**Data.** `snippets WHERE snippet_type='modularity__component__imports' AND content NOT IN (SELECT name FROM components)`. PHP uses `\`.

**Acceptance.**
1. Sylius `Symfony\Component\Form` shows 688.
2. Broadleaf `jakarta/persistence` shows 2,050.
3. gin `net/http` is Platform.
4. Verify LibreChat's `api` (891) resolution artifact.

**Integration.** `pages/views/libraries.vue`, `utils/libraries.ts` (+test), `components/[name]/dependencies.vue`, `NavBar.vue`.

**Depends / effort.** None · S–M.

<a id="b-g65"></a>
#### G65 · CODEOWNERS as a lens (narrowed)
**Job.** Consultant (should): who owns what, on day one.

**Surface.**
- A "Declared owners" reading under "From the repository" in `ProposeSheet`: one file-grain group per owner set, standing "proposed".
- An "Unowned paths" list, whose rows multi-select into `GroupActionBar`.
- About this snapshot names the file that was read.

**Data.** `utils/codeowners.ts` (+test from GitHub's examples) parses `.github/`, root, `docs/` and `.gitlab/` CODEOWNERS from `file_contents`: gitignore semantics, last match wins, `[Section]` headers. Ignore globs never drop CODEOWNERS (E7).

**States.** No file: "No CODEOWNERS in this snapshot (looked in …)". A `*`-only file: say so.

**Acceptance.**
1. Sylius: one group at 100%, flagged as a single rule.
2. A multi-rule fixture resolves the last match.

**Depends / effort.** None · S.

<a id="b-g55"></a>
#### G55 · Find in code
**Job.** Consultant (should): where the payment gateway or raw SQL lives, rolled up by component and lens.

**Surface.**
- `/views/search`, **with no rail row**. It is reached from ⌘P's last row, "Find "x" in code" (JetBrains Search Everywhere style), not from ⌘K.
- A mono input with Aa / .* / word toggles.
- Grain: Components | Groups | Files.
- The inspector shows hit lines with one line of context, linked to `#L`.
- Rows multi-select into `GroupActionBar`, which offers "Keep as live query" (writes `contains "X"`).
- It respects the role facet.

**Data.**
- `file_contents ⋈ files` via `instr`.
- Regex via a `regexp()` registered with go-sqlite3's `ConnectHook` in `app/query/query.go` (no new dependency).
- A `contains` source in `utils/query.ts`, resolved asynchronously into a cache keyed by (snapshot, needle).
- Capped at 5,000 hits, with the truncation stated.

**Acceptance.**
1. Broadleaf's top component is `common.payment.service` (41 files, 165 hits).
2. An invalid regex shows an inline error.

**Integration.** `pages/views/search.vue`, `utils/query.ts`, `stores/{scope,groups}.ts`, `FileCodeViewer.vue`, `GoToAnything.vue`.

**Depends / effort.** W1.4, W3.4 · M.

<a id="b-g57"></a>
#### G57 · Function outline (narrowed)
**Job.** Could: which functions matter in a 9,600-line hot file.

**Surface.**
- The Source tab splits: a 260 px Outline pane (`components/files/FileOutline.vue`) with start–end, Lines and Max nesting, sortable. A click scrolls to `#Lx-Ly`.
- A "Largest functions" section on the file Overview.
- Top 3 functions on hot-file rows in the Inside tab.

**Data.** `*__declaration__span` snippets. Today only Python and JS/TS have them; Java, C#, PHP and Go need content-less spans (Decision 8). Nesting is computed from the `file_contents` slice with the engine's indentation rule (`utils/outline.ts`).

**States.** "No function spans for Java in this snapshot."

**Acceptance.**
1. A django-oscar outline matches its `def` lines.
2. Broadleaf `AdminBasicEntityController.java` has an outline after the engine change.

**Depends / effort.** Engine spans · S UI, M engine.

### Report, power tools, durability

<a id="b-g10"></a>
#### G10 · Workspace state in app.db and config export (narrowed)
**Job.** Architect (should): months of lens work survive a reinstall. Consultant (could): hand a lens to the client.

**Surface.**
- No new screen. "Export workspace config…" and "Import…" are in GroupsManager and the WorkspaceSwitcher row menu. They are workspace-level, so they stay there rather than in the view Export menu, and use the FD-D feedback pattern.
- **Import opens a sheet** (not a popover): Merge or Replace, with counts of groups, lenses, aliases and arrangements.
- No repository file.

**Data.**
- `workspace_state` keys:
  - `groups` (the `STORAGE_VERSION` 4 blob, stored opaque)
  - `lens.active`
  - `authors.aliases`, `authors.showBots`, `authors.pseudonymise`
  - `git.fixPattern`
  - `fileRole.facet`
  - `history.range`
  - `java.framework`
  - `layout:*`
  - `recents`
  - `scan.ignoreGlobs`
- **Global preferences go in `settings`:** `stores/panes.ts`, the `metrics.vue:271` column prefs, `utils/perf.ts`, and the editor choice.
- The draft stays in sessionStorage.
- Bindings: `StateService` (W1), `ExportConfig`, `ImportConfig`.
- Export format: `{format:"archstats-workspace", version:1, groups, dimensions, authorAliases, layouts, savedQueries}`.

**Migration rules.**
- Stores hydrate asynchronously behind the FD-A gate. Today they load synchronously: `stores/workspaces.ts:230-232`, `groups.ts:278-292`, `lens.ts:26-28`, `stores/authors.ts:21`.
- Copy localStorage up **only when app.db has no row for that key**, then set a `migrated` flag.
- The `STORAGE_VERSION` upgrade and its `-vN` backup stay in the frontend.
- The old copy is kept for one release.
- Dev (`localhost:3000`) and production webview origins have separate localStorage; this is documented, not merged.

**States.** Writes are debounced (about 300 ms) with an inline error on failure, and flushed on close. Last write wins.

**Integration.** `app/store/state.go`, `app/state_service.go`, `stores/{groups,authors,lens,workspaces,panes}.ts`, `utils/javaFacts.ts`, `GroupsManager.vue`, `WorkspaceSwitcher.vue`, `components/shell/ConfigImportSheet.vue`.

**Acceptance.**
1. Clearing webview storage keeps Sylius lenses, groups, merges and arrangements.
2. Export then import reproduces the groups.
3. Deleting a workspace removes its rows.
4. A second launch never re-copies stale localStorage over newer app.db rows.

**Depends / effort.** W1.1, W1.6 · M.

<a id="b-g48"></a>
#### G48 · Go to anything (⌘P)
**Job.** Architect (should): jump to `billing` or `OrderServiceImpl`.

**Surface.**
- `components/shell/GoToAnything.vue`: a centred `ui-popover` with a mono input and results grouped by kind, with `ui-tag`s (Views, Metric reference, Components, Files, Units, Authors, Groups/Lenses).
- Empty input shows recents.
- The last row is always "Find "x" in code" (G55).
- ↑/↓, ↵, Esc.
- A group applies scope; a lens runs `lens.set`.
- It is kept apart from ⌘K, which stays the scope query only. There is no ">" mode.

**Data.** `composables/useGoToIndex.ts`, lazy and cached per `datasetKey`:
- component names
- `_fileComponents`
- `units`
- alias-folded authors through `displayAuthor()`
- groups
- metric definitions
- a static view list moved into `utils/routes.ts`

Subsequence matching weights the last segment (`detectSeparator`). Top 50 results.

**Acceptance.**
1. On Broadleaf, "ordsvcimpl" ranks `OrderServiceImpl.java` in the top 3, under 30 ms per keystroke.
2. gin units are findable.
3. ⌘P never opens print on Windows.
4. With pseudonymisation on, real author names are not searchable.

**Depends / effort.** W2.1 · S–M.

<a id="b-g43"></a>
#### G43 · Read-only SQL console with saved queries
**Job.** Consultant (should): answer what no view asks, inside the evidence context.

**Surface.**
- `/views/query` in a new "Tools" rail section.
- Left: `components/query/SchemaBrowser.vue` (tables and columns, with metric names on hover), with Saved queries below.
- Centre: a mono `textarea`, ⌘↵ to run, and a snapshot picker.
- `ResultGrid.vue` status line: "5,000 of 136,216+ rows · 412 ms · truncated".
- Results are registered in the Export menu, alongside "Save query…".
- When at least 80% of a column's values match component or file names, selected rows feed `GroupActionBar`. The result is a fixed group with `foundBy.sql` recorded.

**Data.**
- `QueryService.Console(scanID, sql)` on FD-G: ordered columns, 10 s, 5,000 rows, cells clipped at 4 KB, one statement.
- A console-only driver: `SetLimit(SQLITE_LIMIT_ATTACHED, 0)` plus `RegisterAuthorizer`, refusing ATTACH, DETACH and writes.
- `saved_queries` (m3). **They run on demand only**; each shows "last run on <snapshot>: 12 rows". Nothing re-runs automatically on a new snapshot.

**States.** Empty editor: the schema plus three working examples. Timeout: an inline error with elapsed time.

**Acceptance.**
1. `select * from snippets` on Broadleaf returns 5,000 rows, truncated, in under 2 s.
2. `ATTACH 'file:/tmp/x.db?mode=rwc'` is refused and creates no file.
3. A SQL-made group appears in the lens.

**Depends / effort.** W1.4, W2.1, W1.11 · M.

<a id="b-g64"></a>
#### G64 · Arranged graph layout per lens
**Job.** Architect (should): the same picture every month.

**Surface.**
- An "Arrange" toggle, available at group level or with 150 or fewer components.
- With Arrange on, dragging a node places it and saves the position.
- New nodes gather in an "Unplaced (3)" tray.
- `ui-menu` Reset arrangement.
- No diff tinting and no layer ordering yet.

**Data.** `workspace_state` `layout:<dimension|__components>`, with positions relative to the centroid. File nodes are never saved. A lens rename moves the key.

**Acceptance.**
1. The django-oscar group arrangement survives a rescan and a restart.
2. A new group lands in the tray.
3. A drag never changes membership.

**Integration.** `ConnectionsGraph.vue` (positions at 146, drag end at 227–236, `rebuild()`), `connections.vue`, `stores/groups.ts`, `composables/useSavedLayout.ts`.

**Depends / effort.** W2.1 · M.

<a id="b-g38"></a>
#### G38 · Evidence board
**Job.** Consultant (should): keep a finding together with where it came from. Architect (could): before and after.

**Surface.**
- `/views/evidence`, "Evidence (n)" in Tools.
- One column of hairline strips, never cards. Each strip has:
  - a title and an inline-editable note
  - a `ui-kv` of pinned vs now, in neutral ink
  - a `ProvenanceLine`
  - a status chip: "holds" · "was 14, now 3" · "gone" · "not comparable: <reason>" · "snapshot deleted, values as pinned"
  - Open, which replays the route
- Drag to reorder. Optional section **headings only**; no present or step-through mode.
- `components/evidence/PinButton.vue` (the only pin icon in the app) appears on:
  - `DetailFrame`
  - `ReadingBand` (a `pinnable` prop)
  - rule rows
  - cycle rows
  - the Connections inspector
  - Changes sections
  - "Pin this view"
- A pinned entity's notes show collapsed as one line under its DetailFrame header.
- The board and each strip register Markdown in the Export menu.

**Data.**
- `evidence_pins` (m3): kind, `entity_key`, route, scan (nullable, SET NULL), commit, revision, lens, scope, role, values, note, `figure_path`.
- **Re-checks run against the newest snapshot by `scanOrderKey`**, not whichever is open, and the status names it. Every status goes through `comparability()` first.
- A cycle holds if its member set still sits inside one SCC.
- View pins capture a 2× PNG via G40 into `evidence/<ws>/<pin>.png`.
- `EvidenceService.List/Upsert/Reorder/Delete/SaveFigure`.

**Acceptance.**
1. A pinned Sylius Ce and cycle read "holds" after a rescan at the same revision.
2. A Broadleaf cycle reads "gone" after the cut is applied.
3. Deleting the pinned snapshot keeps the pin as "snapshot deleted, values as pinned".
4. The board survives a restart.

**Depends / effort.** W1.7, W1.11, W2.1, W1.2 · M.

<a id="b-g39"></a>
#### G39 · Board to Markdown report
**Job.** Consultant (should): numbers they can defend in the report.

**Surface.** "Report as Markdown…" in the board's Export menu writes `<name>.md` and `<name>-figures/` via `SaveBundle`. No editor, HTML or PDF. Copy methodology already shipped in W1.16.

**Data.** `utils/report.ts` (pure, tested):
- **Methodology header (full-form provenance):**
  - workspace name (never the folder)
  - scan time
  - full sha, branch, dirty count
  - app version and revision
  - extensions, role counts, ignore globs
  - shallow flag
  - commit range and anchor
  - sweeping commits left out of co-change
  - "Authors pseudonymised" if on
- **Then the pins** in board order, each with its values table (pinned, now, snapshot) and captioned figure.
- **Then a glossary** of every cited metric id.
- Author names are re-rendered through `displayAuthor()` at export time. A note that contains a real name blocks export with a warning.
- Missing fields say "not recorded"; nothing is guessed.

**Acceptance.**
1. A rescanned nopCommerce header shows the sha and revision 2.
2. The glossary covers every cited metric.
3. Figure links resolve.
4. Renders on GitHub.
5. With pseudonymisation on, the file contains no real author names.

**Depends / effort.** W3.1, W1.16, W1.13, W1.18 · M.

<a id="b-g20"></a>
#### G20 · What-if sandbox (first slice)
**Job.** Architect (should): "if we move these files, is the cycle gone, is no new one formed, and how many import sites change?"

**Surface.**
- A Sandbox mode on Connections (component or file level, static source). The inspector becomes a Plan window (`components/connections/SandboxPlan.vue`):
  - the edit list: Move file (`SelectComponentModal`), Merge, Cut edge, with undo/redo like `stores/draft.ts`
  - a before → after `StatStrip`
  - a changed-components `ui-table` (Ca, Ce, I, A, D, and a neutral `DeltaChip`)
- Projected edges are drawn ghosted or in the accent.
- "Try this cut in the sandbox" from the cut plan.
- "Plan as Markdown" is registered in the Export menu with provenance.
- Plans live for the session only.

**Data.**
- `unit_connections(from_file, to_file)` ∪ `component_connections_direct(file, to)`, remapped.
- Engine definitions: Ca and Ce count files; A comes from `modularity__types__*`.
- Import sites by snippet matching (`cycles.vue:478–502`).
- Rules are not re-evaluated; lens findings are, via G07.
- Labelled "Projected from this snapshot's resolved imports".

**Acceptance.**
1. With zero edits, parity with the snapshot for every Broadleaf component and for gin.
2. The first cut-plan edge gives the predicted reduction.
3. Undo is exact.

**Integration.** `stores/sandbox.ts`, `utils/sandbox.ts` (tested), `connections.vue`, `components/[name]/cycles.vue`.

**Depends / effort.** W2.10, W2.12, W1.2 · L.

## 7. Doc updates

**PRODUCT.md** (with W1, then touched again each wave):
- **Replace** "Scan comparison and diff views: out of scope for v1…" with: "Scan comparison: Changes compares a snapshot against a baseline, and over time across snapshots. Both read existing snapshots and never change them; a baseline commit can be rescanned so that both sides share one analysis revision."
- **Add under Capabilities:**
  - Report output v1: CSV/Markdown for tables and PNG/SVG for figures, each captioned with provenance (workspace, snapshot, commit, analysis revision, lens, scope). An evidence board exports a Markdown report with a methodology header. No PDF in v1.
  - Pseudonymised authors in every view and export.
  - Native macOS menu.
  - Snapshot import and reveal.
  - Per-workspace ignore globs (Wave 2).
  - Rescanning a commit (Wave 2) and backfilling tags (Wave 3).
- **Operating Context:**
  - app.db holds workspace state, settings, pins and saved queries, with versioned migrations and a backup before each one.
  - Snapshots record `_snapshot` identity and settings keys per report.
  - History windows count back from the scanned commit.
  - Each engine revision is tagged, and the UI pins it in `go.mod`.
- **Positioning claim 3:** custom regex snippets are a CLI capability (`--snippet`, fixed by E10). The desktop does not expose them (G47 was dropped).
- **Dependencies:** this roadmap adds no npm or Go modules.
- **Terminology:**
  - *Baseline*: the snapshot Changes compares against, marked with a flag. Never "pinned".
  - *Analysis revision* and *Comparable*: same revision and ignore globs.
  - *Tangle*: a strongly connected set of 2 or more components.
  - *Lens*.
  - *Role*: production, test, generated, third-party, non-code.
  - *Pin*: evidence board only.
  - *Evidence board*.
  - *Arrange / Unplaced*: graph positions.
  - *Extremes*.
- *Group* becomes "a user-defined set of components or files".
- Retention stays "not planned"; manual cleanup is not a policy.

**DESIGN.md**, new component patterns:
1. **Provenance line:** one `ProvenanceLine` component. The short form is mono, 11px and muted, under figures and after Markdown tables. The full form appears only in documents. It is never styled as a toast or banner. The folder path never appears.
2. **Identity line:** the short form's prefix on scan rows and the Overview header, with the flag glyph and "Baseline" tag.
3. **Row overflow menu:** replaces lone destructive icons on list rows; Delete goes last, after a separator.
4. **Export menu:** download icon in `actions`, with Table, Figure and Document sections. One feedback pattern: Saved, Reveal last export, the inline error, disabled with a reason.
5. **Movement ink (named rule):** Green and Red Ink appear only on git ±lines. Every other movement uses neutral ink with `+`/`−` and mono `12 → 9`. DeltaChip follows this rule.
6. **Comparability gate and notice strip:** the gate lists its reasons. The "Compare anyway" strip reuses the OutdatedSnapshotBar notice style (`bg-accent-50` / `border-accent-200`). No amber in chrome; shallow is a neutral `ui-tag`.
7. **Trend rows:** 72 px small multiples, comparability hairlines, hollow r0 dots, one captioned time basis.
8. **Pin button and pin strip:** the only pin icon; ReadingBand-style strips with a status chip.
9. **MetricHint:** replaces native `title` on metric labels. The rule: no metric label uses `title`.
10. **Key chips and the shortcut sheet.**
11. **Deduction table:** input · threshold · rule · points, plus a sum row.
12. **Matrix annotations:** level gutter, tangle boxes, crossing marks, declare-mode cell states (unset, forbidden, allowed).
13. **Dashed edges** for dynamic-only dependencies.
14. **Commit panel** swapping in for an aside; the **Unplaced tray**; **Schema browser + result grid**.
15. **Global role facet** next to the scope chip, silent at All.
16. **Group from selection:** every component or file list multi-selects into `GroupActionBar`. "Keep as live query" appears when the selection came from a query.
17. **Sheet vs popover:** backfill, config import, snapshot import, declare and storage use sheets. Floors, patterns, ranges and editor choice use popovers.
18. **Component page band order:** Standing, Position, Blast radius, Who knows it; conditional bands render only when non-empty.
19. **Overview budget:** identity line, Structure panel (System shape), Extremes.
20. **Rail budget:** Changes (Compare | Over time), Libraries under Code, Tools (Query, Evidence). The Metric reference and Find in code have no rail rows.
21. **Named rule: "Formula in reach."** Every derived number exposes its formula and inputs within one hover.

**Memory to record** (`archstats-desktop-project.md`, or a new `roadmap-2026-09.md`):
- The three waves and their themes.
- History anchor: the scanned commit at rev 2 and later, scan time for older snapshots, and no mixing within a snapshot.
- Rev 2 = git truth, identity, role, deductions, co-change fix. Rev 3 = ignore globs and slimmer pair tables.
- Tag the engine before the UI release; CI builds with `GOWORK=off`.
- Role facet: one global control, default All.
- **Component hotspot is the hottest file (max).**
- Changes is one rail row over two routes; hidden coupling lives in Connections; there is no Modules view.
- Comparability is revision plus ignore globs, used everywhere including DeltaChip.
- "Pin" means evidence only.
- Report v1 formats.
- `_snapshot` key names are canonical and keyed by report.

## 8. Open decisions (each with a recommendation)

1. **History anchor.** E2's `BasedOn = max(HEAD time, newest commit)` *is* the "newest commit" anchor that G63 asked for, recorded as `git_based_on`.
   - *Recommend:* anchor at `git_based_on` from rev 2 on. Keep scan time for older snapshots, so windows never disagree with that snapshot's precomputed engine columns. Label every period with its anchor and sha. Custom ranges (G63) are bounded by the anchor.
2. **Revision 1 was never released** (`core/revision.go` is untracked). *Recommend (needs approval):* amend the revision 1 entry to name the hop-count semantics and the co-change-only sweep filter, instead of spending revision 2 on them. Only local dev snapshots (elepy) carry r1.
3. **Pure renames.** *Recommend:* keep them as `change_kind='rename'` rows, but leave them out of commit counts and co-change.
4. **Role rules.** *Recommend:*
   - Precedence third_party > generated > test > non_code > production.
   - Sylius Behat counts as test.
   - The facet is one global control, default All.
   - Test-origin edges stay in coupling metrics for now and are shown as evidence.
5. **Component hotspot.** *Recommend:* keep the engine's max and show "hottest file: X (n of 100)". E6 rolls up `__hotspot__raw` as max, and DeltaChip uses it when comparable, otherwise no delta.
6. **Role and deductions in rev 2, not rev 3.** *Recommend:* rev 2. It gives one bump for everything that changes what a number means.
7. **`git__last_change_age_in_days` engine column (E15).** *Recommend:* approve for rev 2, and keep the UI query as the fallback.
8. **Module identity by directory (G16) and content-less function spans for Java, C#, PHP and Go (G57).** *Recommend:* approve both for rev 3; otherwise they become rev 4 in Wave 3.
9. **`file_matrix` as one row per unordered pair.** *Recommend:* only after auditing every reader's direction handling. FD-K fixes the double-count now.
10. **Windows and Linux menu bar.** *Recommend:* no. Bind the shortcuts in the frontend.
11. **`.db` file association and macOS `OnFileOpen`.** *Recommend:* no association. Drop `OnFileOpen` unless a spike shows it works without `CFBundleDocumentTypes`.
12. **Export formats.** *Recommend:* a CSV `# key: value` preamble; figures light by default with "As shown"; Mermaid and DOT after v1.
13. **Matrix and shape defaults.** *Recommend:* Levels is the default order at group grain; propagation cost includes the diagonal; declared layering is relaxed and unset pairs are "not judged".
14. **Where preferences live.** *Recommend:* per-workspace preferences in `workspace_state` (from m1, W1) and global ones in `settings`. No localStorage interim for new keys. Both are included in config export.
15. **Knowledge concentration before rename-following?** *Recommend:* no. The wave order enforces this: G29 depends on E1.
16. <a id="d16"></a>**Engine work outside the four approved changes.** PRODUCT.md requires asking before any engine change.
    - **E13** (co-change nil fix): approve, as git correctness.
    - **E14** (definition categories and the "Code health" rename): approve. Until then, W1.13 groups by id prefix.
    - **E10** (`--snippet` fix): approve; it is a bug fix for an advertised CLI flag.
    - **E12** (DESCRIPTION.md backlog and guard test): approve; it enforces principle 4.
    - **Revision 1 log amendment:** see 2.
17. **`_snapshot` identity per report.** *Recommend:* add a `report_id` column keyed `(report_id, key)`. The exporter recreates a legacy table in place when appending. The alternative, last-writer-wins, silently corrupts multi-report CLI databases.
18. **DeltaChip's good/bad inks.** *Recommend:* retire them in favour of neutral ink. G37 keeps metric direction out of the definitions, so no metric states a direction the ink could rely on.
19. **`java_class_connections_indirect`.** *Recommend:* off by default, with a CLI flag to enable it. A floor alone may not reach the 300 MB Broadleaf target. Decide after the E8 measurement.
20. **What blocks a comparison.** *Recommend:* a different revision (or 0) and different ignore globs block; different extensions warn. Role rules are engine-side and change only with a revision.

## 9. Risks

1. **Rev 2 makes every existing snapshot outdated at once, and every local history is r0.** Users lose comparability right as Changes arrives.
   - *Mitigation:*
     - The Changes gate's primary action rescans the baseline commit (W2.5), so the first comparison works.
     - Over time breaks and pin "not comparable" states are built in from day one.
     - The reference set is rescanned at the end of Wave 1.
     - Backfill of tags (W3) rebuilds history on the current revision.
2. **Build and release coupling.** The UI builds only through a gitignored `go.work` today, and both repos carry uncommitted work.
   - *Mitigation:*
     - Step 0 commits and tags both repos.
     - CI builds with `GOWORK=off`.
     - Every engine revision is tagged before the UI release that consumes it.
3. **Wails platform unknowns.** The EditMenu role may take ⌘Z; darwin has no downloads; ⌘P could print on Windows; clipboard behaviour differs; `OnFileOpen` needs document types; Windows cannot delete open files.
   - *Mitigation:*
     - W1.5, W1.6 and W1.4 start with a release-build spike on all three OSes, before any feature that depends on them.
     - Handles are closed before every delete.
4. **Rename-following and partial clones slow scans** (12-minute scans are already blob fetches), and E1 is the largest single engine PR.
   - *Mitigation:*
     - Measure on fineract and sakai before merging, with a 25% budget on Broadleaf.
     - Keep `--no-renames` behind a CLI escape hatch if the budget is missed.
     - Warn about partial clones in backfill.
5. **Disk growth** from monthly scans plus rescans and backfill (4 GB snapshots).
   - *Mitigation:*
     - The sizes UI ships in W2.
     - Rev 3 slimming is measured before and after, with view parity, and the Java table decision is explicit.
     - Backfill of tags waits for rev 3 and shows an estimate before it runs.
6. **Acceptance numbers drift across the rev 2 boundary.**
   - *Mitigation:* the checks are invariants with checked-in SQL, re-measured after the reference rescan. r0 values are references only.
7. **State migration loses user work** (the async hydrate, two sources of truth, dev vs production origins).
   - *Mitigation:*
     - Copy only when app.db has no row.
     - Back up app.db before each migration.
     - Keep the localStorage copy for one release.
     - Test the upgrade in `store_test` with a v0 fixture.
8. **Surface sprawl and inconsistency across about 60 items.**
   - *Mitigation:*
     - Rail and Overview budgets.
     - One Export menu, one group-from-selection pattern, one role facet, one comparability rule.
     - DESIGN.md additions merged before each wave's first UI item.
     - Items without a brief (G36, G42's keyboard marks) stay out until briefed.

<a id="critique-notes"></a>
## Appendix A · Critique notes

I applied every correction from both critiques. The notes below record where I applied one only in part, or chose between the options a critique offered.

- **UX 1 (comparability):** extension differences warn rather than block. Extensions are auto-detected, so they change when the code gains a language, which is a real code difference. "Role rules differ" is folded into revision, because the rules live in the engine and change only with a bump.
- **UX 2 (green and red):** I chose to retire DeltaChip's good/bad inks rather than confine them. G37 keeps metric direction out of the definitions, so no definition states a direction the ink could rely on (Decision 18).
- **UX 4 (single-ref backfill):** applied. r0 baselines have no recorded sha, so the gate resolves the commit from the reflog or `rev-list --before` and shows it before running.
- **UX 10 (one Export menu):** view outputs all go through it. Config export and "Save a copy" of a snapshot are workspace- and snapshot-level actions, not view outputs, so they stay in the row and File menus and share the same SaveFile feedback pattern.
- **UX 13 (G31):** renamed "Extremes in this snapshot", with rows 1–4 in Wave 2. The co-change row lands in Wave 2 too, because G23 is now in Wave 2 inside Connections.
- **UX 15 (pseudonymisation timing):** moved to Wave 1, the stricter of the two options. To avoid a localStorage interim, `workspace_state` moves from m2 into m1.
- **Feasibility 4 (group-grain co-change):** Wave 1 labels it "sum of pair counts" and G42 replaces it with distinct commits, instead of choosing only one.
- **Feasibility 6 (`_snapshot` identity):** I chose the `report_id` column over documenting last-writer-wins (Decision 17).
- **Feasibility 16 (size target):** the Broadleaf < 300 MB target is kept, and the `java_class_connections_indirect` cut is made explicit. The fineract target is set from the E8 measurement rather than fixed at 1.2 GB now.
- **Feasibility 18 (`OnFileOpen`):** dropped unless a spike shows it works without `CFBundleDocumentTypes`, which keeps Decision 11 intact.
- **Feasibility 20 / UX 8 (saved queries):** "run on demand only" satisfies both critiques. The console also does not re-run them when it opens.
- **G42 moved to Wave 2:** a consequence of UX 5. Hidden coupling is built on the List rep, so the List rep has to land first.