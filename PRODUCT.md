# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

**Form factor: desktop application, primarily.** The bare value above is the Impeccable schema's closest fit (the UI renders in a Wails webview), but the product is a native-windowed desktop app for macOS, Windows, and Linux, not a website. Design for that:

- Runs in a resizable native window, typically wide (1280px and up), often side by side with an editor or terminal. Phone widths are not a target; tablet widths are incidental.
- Uses OS affordances where they exist: native folder picker, native menus, window title, app icon, dock/taskbar presence, keyboard shortcuts with platform modifiers.
- Persistent local state across launches (workspaces, scan history, groups) is expected, the way an IDE remembers projects.
- No browser chrome, no URL bar, no page reloads. Hash routing is an implementation detail; the user never sees a URL.
- Dense, keyboard-friendly, IDE-like interaction is the norm for the audience. Tabs and split panes are deferred to v2, but the v1 shell (sidebar plus view area) should not fight that direction.
- Long-running work (scans) runs in-process with progress; the window must stay responsive.
- No web-only assumptions: no external font or CDN loads at runtime, no analytics scripts, works fully offline.

## Users

Two primary users, weighted equally (confirmed 2026-09-16):

- **Architect or tech lead stewarding their own team's codebase.** Returns to the same workspace over months to watch coupling drift, hotspots, and cycles, and uses the views as evidence when arguing for refactoring to teammates or management.
- **Consultant or reviewer facing an unfamiliar codebase.** Short engagement, no prior knowledge of the repo, needs a fast structural read and exportable evidence for a written report.

Both work on a developer machine with the source checked out locally. Both are comfortable with package/namespace vocabulary and software package metrics; neither should need to learn Archstats internals to get value.

Secondary audience, not designed for: an individual developer doing one-off curiosity exploration. They are served incidentally by the same flow.

## Product Purpose

Archstats Desktop is a local desktop application that scans a source folder with the embedded Archstats engine and lets the user explore the resulting architectural views: dependency matrices, chord and clustering diagrams, hotspots, cycles, a metric plotter, git churn/coupling/timeline/author views, file-level views, per-component drill-downs, and Java-specific views (OOP, JPA, Spring, class connections).

It replaces the former workflow of running the CLI, exporting a `.db`, and dragging it into a web app (app.archstats.io, now being retired). Workspaces point at one folder each. Every scan is stored as an immutable snapshot, and the full scan history persists across restarts so the user can revisit or compare earlier states.

Success: open the app, point it at a folder, press Scan, explore coupling/hotspot/cycle views. Come back a week later, re-scan, and flip between the two snapshots.

## Positioning

Four claims the user chose to defend (2026-09-16). Neighbouring tools (CodeScene, SonarQube, NDepend, Structure101) cannot truthfully make all four together:

1. **Local-first, no server, no account.** Everything runs on the user's machine. No upload, no SaaS, no login. The retirement of app.archstats.io is a deliberate move toward this.
2. **Open data contract.** Each scan is a plain SQLite file with a documented schema and embedded metric definitions (`_metric_definitions` table). The user owns it and can query it with any tool, including an LLM.
3. **Language-agnostic through regex snippets and extensions.** Users can define their own snippet types with named regex groups; a microkernel extension model adds languages (Java, Kotlin, Scala, PHP, C#) without touching the core. Custom regex snippets are a CLI capability (`--snippet`); the desktop does not expose them.
4. **Structure and history in one model.** Robert C. Martin package metrics, graph centrality (PageRank, betweenness, HITS), cycle detection, and git churn all land on the same component rows, so hotspot views combine static shape with change history natively.

## Operating Context

- **Engine seam:** the desktop backend imports `github.com/archstats/archstats` as a Go library. `core.New(&core.Config{RootPath, Extensions}).Analyze()` then `sqlite.SaveToDB()`. No CLI subprocess.
- **Storage:** `os.UserConfigDir()/archstats/` holding `app.db` (workspace and scan registry, settings) and `scans/<workspace-id>/<scan-id>.db` snapshots. Snapshot schema is identical to `archstats export sqlite` output; the schema is documented in the archstats repo's `DESCRIPTION.md`.
- **Data path:** the frontend sends SQL over Wails bindings to a Go query service; the `query(sql)` choke point in `stores/data.ts` is the single frontend data seam. No sql.js or WASM in the runtime path.
- **Scan behaviour:** a scan runs asynchronously with progress events; a mid-sized repo (roughly 5k files) must not freeze the UI. Extensions are auto-detected per scan in v1.
- **Related artifacts the user reads alongside the app:** the archstats CLI and its metric reference (`docs/metrics.md` in the archstats repo), ADRs in `docs/adr/`, and the SQLite export used by other tooling.
- **app.db** holds workspace state (`workspace_state`), settings, evidence pins, saved queries and cached readings, with versioned migrations and a backup before each one.
- **Snapshots** record their identity and settings in a `_snapshot` table per report: analysis revision, scanned commit and branch, uncommitted files, extensions, ignore globs.
- **History windows** count back from the scanned commit (`git_based_on`) from analysis revision 2 on, and from scan time for older snapshots; every period names its anchor.
- **Engine revisions** are tagged in the archstats repo, and the UI pins the tag it builds against in `go.mod`.
- **Platforms shipped:** macOS is the primary target. Windows (NSIS installer, zip) and Linux (tar.gz, deb, rpm) are built and verified on native runners. Builds are unsigned until an Apple developer account exists.

## Capabilities and Constraints

**Shipped or in progress (see `tasks/todo.md`):**
- Workspace registry with create, rename, and folder path (one folder per workspace; multi-repo handled by pointing at a parent folder).
- Async scan with progress, immutable snapshots, full history, manual delete.
- Read-only SQL query service over a selected snapshot.
- All view families ported from the web app (48 routed pages): components (walker, matrix, chord, clustering, comparison, cycles, group coupling, hotspots, plotter, table), per-component drill-down (circle of influence, component matrix, cycles, external/internal file matrix, files, git, java, static coupling), files (table, treemap, dependencies, per-file contents/git/imports/java), git (churn, coupling, timeline, authors with per-author components/files/timeline), groups (per-group explorer), java (class connections, JPA, OOP, Spring).
- Groups: user-defined sets of components or files, persisted per workspace; lenses (dimensions) of groups, proposed from the code, the history, CODEOWNERS or the build modules, with declared dependencies checked import by import.
- Scan comparison: Changes compares a snapshot against a baseline, and Over time across snapshots. Both read existing snapshots and never change them; a baseline commit can be rescanned so that both sides share one analysis revision.
- Rescanning a commit, and backfilling tags, each in a temporary clone that leaves the working copy untouched.
- Report output: CSV and Markdown for tables, PNG and SVG for figures, each captioned with provenance (workspace, snapshot, commit, analysis revision, lens, scope). Evidence is a set of reports written as notebooks (Markdown prose and evidence cells frozen at their run, re-runnable on a newer snapshot) drawing on one pool of pins; each exports as a PDF laid out natively and as Markdown with its figures.
- Pseudonymised authors in every view and export.
- Native macOS menu; ⌘P Go to anything; ⌘E Export.
- Snapshot import (⌘O, drop, command line) and reveal.
- Per-workspace ignore globs.
- Find in code, a read-only SQL console with saved queries, Libraries, a directory tree, and a what-if sandbox on Connections.
- Headless `--selfcheck` and `--version` flags for CI.

**Deferred or undecided:**
- Tabs and resizable split-pane IDE chrome: deferred to v2. v1 is a sidebar plus a single view area.
- Per-workspace extension/language configuration UI: v1 auto-detects; config UI later.
- Retention policies for old scans: not planned. Manual cleanup (the storage sheet) is not a policy.
- Several views carry known pre-existing breakage from the async-query migration (churn, timeline, plotter, walker, treemap, author pages, some Java pages); a parity sweep (T13) is open.

**Hard constraints:**
- Per-scan DB schema must stay compatible with `archstats export sqlite`.
- Nothing is stored outside the designated app-data directory.
- CGO is mandatory (tree-sitter and go-sqlite3), so Wails apps are built natively per OS.
- Nuxt 3 in SPA mode with hash routing; devtools disabled; `emitRouteChunkError: false`. Dist output only when `NUXT_DIST_OUTPUT=1`.
- Frontend stack is fixed: Vue 3, TypeScript, Pinia, Tailwind, D3 (+ d3-force), gridjs, splitpanes. Adding dependencies requires asking first. The persona roadmap (2026-09) added no npm modules; PDF reports use `github.com/go-pdf/fpdf`, already in the engine's module graph.
- Any change to the archstats engine repo requires asking first.

**Terminology (use consistently in UI copy):**
- *Workspace*: a named folder the user analyzes.
- *Scan*: one analysis run; produces a *snapshot* (immutable `.db`).
- *View*: a tabular or visual output of the engine (matrix, chord, hotspots, and so on).
- *Component*: the package/namespace/module unit; the physical manifestation of a software module (Mark Richards' definition).
- *Snippet*: the smallest analyzed unit of code, typed (`component:declaration`, `component:import`, `function`, `type`, `type:abstract`, or user-defined).
- *Group*: a user-defined set of components or files.
- *Lens*: a named way of slicing the code into groups (a dimension).
- *Baseline*: the snapshot Changes compares against, marked with a flag. Never "pinned".
- *Analysis revision*: the version of the engine's analysis a snapshot was read with. *Comparable*: same revision and same ignore globs.
- *Tangle*: a strongly connected set of two or more components.
- *Role*: production, test, generated, third-party or non-code, per file.
- *Pin*: a finding kept in the pool, and only that. *Pool*: a workspace's pins. *Report*: a notebook of prose and evidence cells drawn from the pool. *Cell*: evidence in a report, frozen at the snapshot it ran on.
- *Arrange* and *Unplaced*: graph positions kept by hand, and nodes not yet placed.
- *Extremes*: the Overview's fixed sorts, one per row.
- Metric names follow the engine's `family__metric` ids (for example `modularity__instability`, `graph__page_rank`, `git__commits__total`) with friendly names supplied by `_metric_definitions`.

## Brand Commitments

- Product name: **Archstats Desktop** (binary `archstats-desktop`). Company/brand: **Archstats**. Author: Ryan Susana.
- Tagline currently in `wails.json`: "Architecture insight for your codebase."
- Existing logo assets: `frontend/src/assets/logo/archstats-100-logo.png`, `frontend/src/assets/logo/archstats-logo-secondary-500.png`, `frontend/public/img/archstats/` (icon, wordmark, white variants), `build/appicon.png`. These are the current identity; no decision has been made to replace them.
- No explicit voice guide exists. Existing copy is plain, technical, and unhyped.
- **Visual bar (standing preference, 2026-09-17):** the app should sit alongside JetBrains IDEs (New UI) and Linear and be judged at their craft level: clean, sleek, dense but airy, quiet chrome, one restrained accent, conventions a category-fluent user trusts immediately. Ryan chose this as the direction in plain words ("premium desktop app… think JetBrains"); it is the canon played straight, not a stylistic experiment. The orange of the logo stays the single accent. The app ships light and dark appearances following the OS.

## Evidence on Hand

- Real analysis output: any snapshot `.db` produced by the engine; fixture repos under the archstats repo's `e2eTest/`.
- Metric definitions with descriptions: registered in the engine and rendered in `docs/metrics.md` (archstats repo).
- Architecture rationale: 16 ADRs in the archstats repo's `docs/adr/`.
- Release verification: `tasks/release-pipeline.md` documents per-OS smoke tests; draft v0.1.0 with 11 assets exists.
- **Absent, do not fabricate:** testimonials, customer logos, benchmarks against competitors, pricing, download counts, or user research beyond the confirmed answers above.

## Product Principles

1. **The user's machine is the product boundary.** No network dependency, no account, no telemetry assumptions. Anything that needs a server is out.
2. **The snapshot is the contract.** Views are queries over a documented SQLite schema; the schema outranks any single view's convenience.
3. **Repeat visits are the norm.** Design every flow for the person who comes back next week with a new scan, not only for first contact.
4. **Evidence over verdicts.** The app shows structure and history and lets the user draw conclusions; it does not grade codebases or issue scores it cannot explain.
5. **The visualizations are the crown jewels.** Matrix, chord, cousins, coupling flow, and plotter carry the value; shell and chrome exist to get the user to them and recede.

## Accessibility & Inclusion

No product-specific requirement established. The current frontend has no ARIA usage; keyboard navigation and screen-reader support for the D3 visualizations are undecided.
