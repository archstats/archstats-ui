# Refactor workbench: what a restructure needs, built into Archstats

Branch `feature/refactor-workbench` (archstats-ui); engine work on
`persona-roadmap` (archstats).

**Why:** on 2026-09-24 the same frontend restructure was done three times.
See `tasks/dogfood-comparison.md`. By hand won, because it could see the whole
graph, and could re-measure after every move. Both runs through the app
planned from file names and ended with 26–32 mutual module pairs and 46–51
violations of their own layering rule, against 5 and 0 by hand. This spec
closes that gap. It follows the arc of a restructure: see the whole graph,
understand the grab-bags, design the target, validate it, execute it, then
hold the line.

Each section names the issues it closes (`tasks/ui-dogfood/ISSUES.md`) and the
scenario that checks it. Scenario 06 is the standing regression.

## Principles

- **Say what the data does not cover.** Every view that draws conclusions
  from imports shows the import coverage when it is below about 95%. A
  confident answer on half a graph is how both app runs went wrong.
- **Use one projection engine.** The planner, the Sandbox and the checks all
  project through `features/sandbox/sandbox.ts` `project()`. A plan is a list
  of moves, whatever screen made it.
- **Groups stay first-class.** A cluster, a slice or a planner module can
  become a group in one step (the product rule in `CLAUDE.md`).
- **The plan is data.** It is persisted per workspace (durable state),
  exported as a move map, and checkable again on the next scan.

## 1. See the real graph

| Item | What | Where | Data |
| --- | --- | --- | --- |
| 1.1 | **Import coverage.** Per extension: production files, files with import data, files with declared units. A **banner** when the files with no import data are ≥ 5% and ≥ 10 files: "Import data covers 216 of 433 production files. 217 `.vue` files are not analysed: dependencies, dead code and rules can miss them." The banner links to About. | `features/snapshot/coverage.ts`, `ImportCoverageBar.vue` in the default layout, a section in About this snapshot | `files`, `units`, `unit_connections`, `component_connections_direct` |
| 1.2 | **Parse `.vue` and `.svelte`** (E1), **drop no file silently** (E4), **resolve Go imports correctly** (E3) | engine | in progress in separate sessions: `claude/*` worktrees |
| 1.3 | **Framework auto-import edges** (E2): for a Nuxt project, identifiers used without an import that match what Nuxt auto-imports (`composables/*`, `utils/*`, `components/**` by prefixed name) become edges of kind `auto`. The banner and the checks count them separately. | engine extension `nuxt`, after E1 | file contents plus units |
| 1.4 | **Implicit dependencies per file**: the `auto` edges listed on the file's Imports tab, labelled "used without an import". | file detail, Imports tab | the 1.3 edges |

## 2. Understand a grab-bag: Folder X-ray

| Item | What | Where | Data |
| --- | --- | --- | --- |
| 2.1 | **Folder X-ray.** One row per file in a folder: its first comment line, its exports, who uses it (grouped by top folder or lens group), what it uses, and its top co-change partners. Sortable, with an Export button. | new view `/views/xray?dir=…`, opened from Metrics → Directories, from component detail, and from ⌘P | `file_contents`, `units`, `unit_connections`, `git_commits` |
| 2.2 | **Topic clusters**: Louvain over the folder's files, weighted by shared importers and imports (file-level), co-change, and shared name tokens. Each cluster is named by its common token, with cohesion shown. **Create group** and **Send to planner** work per cluster. | X-ray, top section | the 2.1 data plus `lens-builder/louvain.ts` |
| 2.3 | **Structure checks**, each with a coverage caveat: **Layer inversions** (imports from a lower to a higher layer, where layers are inferred from framework folder conventions and can be edited); **Reachability** (from framework entry points: unreachable files, and files reached only from tests); **Duplicates** (the same exported name in 2+ files, and same-named files). | new view `/views/checks` under Architecture | file-level edges, `units`, and the conventions table |

## 3. Design the target: Restructure planner

A new view, `/views/restructure`, under Architecture.

- **Target modules.** Each has a name, an optional layer (its order), and a
  definition: glob lines in the group query language (`query.ts`) plus
  explicit files. A file goes to the first module that claims it; files
  nobody claims are **unplaced**.
- **Two panes.** The current tree on the left, with each file tagged by its
  target module and unplaced files highlighted. The target modules on the
  right: create, rename, reorder layers, edit lines, and a count per module.
  Files can be assigned by selection, by glob, by an X-ray cluster, or by a
  suggestion.
- **Live checks,** recomputed on every change: module-to-module dependencies,
  **mutual pairs**, **cycles**, **violations of the layer order**,
  **cohesion** (the share of each module's imports that stay inside it), the
  **import sites to rewrite**, and the unplaced count. They are shown as a
  strip plus a list of problems, worst first.
- **"Why does A depend on B?"** Select a pair to see the files and the
  **declared names** that cross it (from `unit_connections` via `units`), with
  a one-click "move this file to B" or "move it to a new module".
- **Placement advisor.** Select a file to see its pull towards each module
  (imports in and out, co-change, name), the best fit, and a flag when it is
  ambiguous.
- **Suggestions.**
  - *Slices from entry points*: per page or route, the files only it reaches
    form a feature slice; files reached by several slices go to `shared`.
  - *From X-ray clusters.*
  - *From a lens*: the groups become modules.
- **Stored per workspace** as `restructure:plan` (durable state). **Export**
  the move map (the `restructure.py` format), a `git mv` script, and the
  bundled import rewriter for TS/JS/Vue.

## 4. Validate

| Item | What | Closes |
| --- | --- | --- |
| 4.1 | **The Sandbox takes plans:** moves from a selection, from a search or glob, or from the planner, and into **new** components. A "why still tangled" panel lists the edges and names of each remaining tangle. The graph highlights the projected tangles. Pin works inside the panel. | U7–U10, U20 |
| 4.2 | **File-level groups behave:** counters count files; Query mode persists after save; no `**` pre-fill on a new line; per-line "matches N files". The lens menu is a real, accessible menu. Declare warns when some groups are left out. Rules and Cycles agree on the same lens (reproduce, then fix). | U1–U6 |

## 5. Execute

| Item | What |
| --- | --- |
| 5.1 | Plan export (see 3). The import rewriter is bundled and documented: `python3 restructure.py <map> <frontend>`. |
| 5.2 | **Compare through a lens.** In Changes, pick a lens or the saved plan and compare two snapshots at module level: module dependencies, mutual pairs, cycles, and violations before and after. Scan a branch with Rescan (a commit or a branch name). |

## 6. Hold the line

| Item | What | Where |
| --- | --- | --- |
| 6.1 | **Rules as code.** Export a lens's groups and declaration as `archstats-rules.json`. `archstats check --rules archstats-rules.json <dir>` evaluates the same queries and crossings in the engine, prints file:line violations, and exits non-zero. The docs include a CI snippet. | app export; engine CLI `cmd/check` |
| 6.2 | **Drift on rescan.** When a newer comparable snapshot opens, compare its lens crossings with the previous one: "3 new imports cross Target's declared order since 24 Sep". It links to Rules and can be pinned. | shell banner and Rules |

## Build order

Each stage is committed, tested and checked in the harness before the next.

1. **S1** coverage (1.1, then 1.4 once the engine has E1/E2)
2. **S2** Folder X-ray (2.1, 2.2)
3. **S3** Structure checks (2.3)
4. **S4** Restructure planner (3), the biggest stage
5. **S5** Sandbox for plans and group fixes (4.1, 4.2)
6. **S6** Compare through a lens (5.2) and drift (6.2)
7. **S7** Rules as code: the export and `archstats check` (6.1, engine)
8. **S8** Nuxt auto-import edges (1.3) once E1 lands, then scenario 06
   re-run as the acceptance test

**Acceptance for the whole:** re-run ui-dogfood scenario 06 (guided,
standard). It must beat the 2026-09-24 baseline:

- coverage of the 17 findings better than 12/17;
- the implemented plan has fewer than 10 mutual pairs and under 10
  violations of its own rule.
