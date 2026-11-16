# Changelog

What changed in each release of Archstats Desktop. The app shows these notes under Help → What's New, and the release workflow uses a release's section as its GitHub release notes. The engine has its own changelog in [archstats](https://github.com/archstats/archstats/blob/main/CHANGELOG.md).

Write a line under **Unreleased** when a change lands that a user would notice: what they can now do, or what reads differently. `scripts/release.sh` turns that section into the release's notes and adds the engine it pins and the commit list.

## Unreleased

- **Settings → About** names this version, the engine inside it and the analysis revision its scans are written with.
- When a newer release is out, a note in the corner says so. The app asks GitHub at launch and once a day; turn it off under **Settings → Check for updates**.
- The first time you open a new version, **What's new** lists what changed since the one you ran before. **Help → What's New** shows it again.
- **Help → Archstats Documentation** opens the guide at archstats.github.io/archstats.
- Exports and reports name the real engine version; they used to say v0.3.1.

## v0.12.0 (2026-10-29)

Engine v0.11.0, analysis revision 16 (was 15): snapshots taken before this release offer Scan again.

### Features

- cicd: a CI/CD view in place of Deployables
- cicd: the pipeline drawing as a figure, and a slot for it in reports
- files: open a file's line, or just the file
- cicd: Flags are Issues, counted on their tab

### Fixes

- units: a layer stack that stands the right way up
- cicd: give the drawing the room, and open files in Archstats too

## v0.10.1 (2026-10-03)

Engine v0.10.1, analysis revision 15 (was 13): snapshots taken before this release offer Scan again.

Maintenance only.

## v0.10.0 (2026-10-03)

Engine v0.10.0, analysis revision 13 (was 10): snapshots taken before this release offer Scan again.

### Features

- i18n: every string a message, in English and developer Dutch
- health: health read from the code, and files you can find your way through
- files, java: a file sidebar with neighbours, and a wiring graph that draws
- ask: landmarks an architect navigates by, in Ask, reports and MCP
- shell, files: go to anything on ⇧⇧ and ⌘P, and links that land on their line
- exhibits: names spelled as in the code, paths that keep their file name
- reports: readings that go past their headline, and a close look at the top components

### Fixes

- figures, reports: figures and report work from fix/figures-reports

## v0.9.0 (2026-10-01)

Engine v0.9.0, analysis revision 10.

### Fixes

- ask: keep Write the report on screen; serve-ui can target another backend
- ask: what the round-3 retest found
- ask: tune the claim checker against false flags

## v0.5.0 (2026-10-01)

Engine v0.8.0, analysis revision 10 (was 5): snapshots taken before this release offer Scan again.

### Features

- snapshot: say how much of the code the import graph covers
- xray: read a grab-bag folder file by file, and group it into topics
- checks: structure checks for layers, reachability and duplicates
- restructure: plan a target structure, try it in the Sandbox, fix groups
- changes: compare two snapshots through a structure, drift, and rules for CI
- mobile: Android, iOS, Flutter, React Native and KMP in the UI
- snapshot: what analysis revision 6 changed, for older snapshots
- reports: print-quality PDFs, template kit and report QA fixes
- hotspots: clearer chart and a figure drawn for the report page
- architecture: draw checks, the restructure planner and deployables
- units: fold the structure checks into Units
- units: merge the checks' pictures into the Units overview
- metrics: open on a summary, read the plot, add matrix, strips and profiles
- folder-map: hovering a file draws its references
- units: show which way the boundary figure's references run
- metrics: choose the metrics each overview draws
- units: keep a selected module's connections drawn on the map
- workspace: clone repositories, predictable scans, a compact rail
- reports: give each template slot the figure that reads best
- units: three screens over the folder map and the stack, and every framework profile tested
- git: Knowledge and People for authors; Work now, Breadth, Effort and Commits for activity
- sql: a console with a result grid, charts, a schema explorer, formatting, parameters and result diffs
- reports: live SQL cells, figures handed over from exhibit frames, and Vue in the ecosystem templates
- metrics: findings, metric links and overview glances
- trends: compare structure across snapshots
- deployables: Code, Ship and Run, read from build files, pipelines and configuration
- export: frame every figure and table as an exhibit, with its own button and legend
- ask: ask the snapshot, answered with cited exhibits
- ask: lead with the verdict, check the topic, carry the view along
- ask: repair before showing, rest on a figure, never lose a better answer
- units: give two lanes of one kind a deep tone
- ai: an AI switch, off until turned on, and a choice of model providers

### Fixes

- cycles: build tangles from the Production/Tests side of the graph
- units: draw each lane link once, red only on the smaller side
- metrics: keep the plot's zoom inside its data
- hotspots: let a link's preset win when grain changes with it
- hotspots: rank source code only at the file grain
- ask: what the second test wave found
- clone a local Windows path, and size the macOS disk image

### Other changes

- remove the restructure planner and the sandbox
- mobile: the running UI checked on two snapshots
- record the design and product changes above

## v0.4.0 (2026-09-28)

Engine v0.7.0, analysis revision 5 (was 0): snapshots taken before this release offer Scan again.

### Features

- units: the Classes view reads units, so every language has one
- units: framework lanes and a unit graph in every language
- registry: numbered migrations, scan identity and durable state
- snapshots: read every snapshot fact, and refuse comparisons across analyses
- query: cap results, time queries out, and keep a few snapshots open
- shell: a native menu, one command path, and a shortcut sheet
- files: save, copy and reveal through the desktop, not the browser
- provenance: every number can say where it came from
- history: one anchor for every period, the scanned commit when known
- scans: label, baseline, HEAD drift, reveal and save a copy
- export: one Export menu for tables and figures, and pseudonymised authors
- reference: metric definitions where numbers are read, and a metric reference
- health: say why a file scored what it did
- connections: say how each dependency was found
- snapshot: About this snapshot, and Copy methodology
- editor: open a finding's file at its line
- state: keep lenses, groups and merges in app.db, and export a workspace config
- roles: one Production/Tests switch every view obeys
- age: how long code has gone untouched
- changes: compare two snapshots, and cache each scan's readings
- scans: rescan one commit in a clean clone
- changes: Compare two snapshots
- changes: Over time
- storage: see what snapshots take up, and delete the ones that can go
- import: bring in a snapshot from a file
- connections: order the matrix by dependency levels, tangles boxed
- overview: system shape numbers
- lenses: declare a lens's architecture and see every import that crosses it
- changes: new and gone crossings of the active lens's declared order
- groups: a page for each group, and history views that follow the scope
- components: say where a component leans on something less stable
- components: which of a component's units the rest of the code uses
- history: a custom date range
- connections: a List of every pair
- connections: hidden coupling, co-change without an import
- history: a commit's architectural footprint
- overview: extremes in this snapshot
- connections: arrange the graph by hand, per lens
- export: every chart exports as a figure
- scans: a workspace's own ignore patterns, and analysis revision 3
- evidence: an evidence board, and a Markdown report from it
- tools: a read-only SQL console
- search: find in code, rolled up by component, group or file
- git: a fix pattern for commits, editable and checkable
- git: where change effort goes
- authors: who knows each component
- metrics: a directory tree, every number a stated rollup
- lens: CODEOWNERS as a proposed lens
- code: libraries, as the imports write them
- lens: build modules as a proposed lens, and their declared dependencies
- scan: backfill tags, one clean clone at a time
- connections: a what-if sandbox
- evidence: reports as notebooks, exported as PDF
- evidence: preview what you add to a report, in place
- evidence: preview the PDF before saving it
- evidence: report templates written for the codebase
- evidence: take a template's figures from their views
- sql: an editor that knows the snapshot
- cycles: read cycles as tangles, and plan their undoing
- cycles: a guide that walks the cuts in plain words
- navigation: focus on a neighbourhood, in every view
- deployables: what the workspace builds and ships

### Fixes

- co-change: skip pairs the engine inflated, and count a pair once
- authors: anchor author windows on one row, not one per commit
- evidence: an added figure shows at once
- figures: refuse blank figures, render light ones light, and check them all

### Other changes

- frontend: organise the code by feature, not by kind of file
- product and design notes for the persona roadmap
- tasks: add the comparison with the Archstats-made restructure
- tasks: compare all three restructure runs
- tasks: a persona-driven feedback loop for the UI (ui-dogfood)
- tasks: ui-dogfood scenario 07, a fit-gap of Apache Fineract

## v0.3.1 (2026-09-21)

Engine v0.3.1, analysis revision 0.

Maintenance only.

## v0.3.0 (2026-09-21)

Engine v0.3.0, analysis revision 0.

### Features

- components: rework the component detail drill-down
- rules: show every rule's verdict on the codebase

## v0.2.0 (2026-09-21)

Engine v0.1.7, analysis revision 0.

### Features

- app: scan, store and query service changes; engine v0.1.7
- frontend: query language, lens builder and groups as the slicing concept
- app: fail scans left running by a previous process

### Fixes

- keep frontend/dist tracked so the embed has something to match

### Other changes

- record verified release pipeline and draft v0.1.0

## v0.1.0 (2026-09-16)

The first release of Archstats Desktop, with engine v0.1.6.

