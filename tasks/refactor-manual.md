# Frontend restructure, done by hand

Branch `refactor/manual-modules`, from `cffe84f`. The companion branch
`refactor/archstats-guided` does the same job using only the Archstats app;
`tasks/dogfood-comparison.md` compares the two.

## The complaint

"Poorly structured. Lots of utils, very hard to navigate."

## How I found out what was wrong (no Archstats)

Everything came from reading the code and from small scripts over it:

1. **An import graph** (Python, regex over `import … from`, resolving `~/` and
   relative specifiers). For every `utils/` module it gave the lines, the folders
   that import it and what it imports. This showed that `utils/` was not a
   utilities folder but 90 feature modules, and that eleven of them import
   stores or composables (the layers above them).
2. **Header comments of all 90 utils**, plus their exports. The code is well
   commented, so the domains fell out: cycles, connections, groups and lenses,
   lens building, units, frameworks, Java, git, reports, export, SQL console,
   shell, workspace, snapshot vocabulary.
3. **Reachability from Nuxt's entry points** (pages, layouts, plugins,
   `app.vue`) over the import graph: 41 files, about 3,000 lines, unreachable.
   Six of them tested.
4. **The production build's warnings.** "Duplicated imports `Edge` …" showed
   that Nuxt auto-imports every `utils/` export and silently picks one when two
   modules export the same name.
5. **Hidden dependencies**, found two ways because grep cannot see them:
   - running `unimport` (the library Nuxt uses) over every file to list what it
     would inject, then checking each hit by hand (most were locals Nuxt shadows);
   - building with component auto-registration off and grepping the bundle for
     `resolveComponent("…")`.
   Result: five files depend on code they never import (`GroupActionBar.vue`
   uses `detectSeparator` and `generalise`, three pages use
   `ViewWorkspaceLayout`, `hotspots.vue` uses `GroupsGroupActionBar`).
6. **Duplicate names read side by side**: `isTestPath` exists twice with
   different rules; language-by-extension exists three times.
7. **`git log`**: of 67 commits touching `frontend/src`, 46 touched three or
   more of `utils/`, `stores/`, `composables/`, `components/`, `pages/`.

The review, in the Balanced Coupling format, is
`docs/modularity-review/2026-09-24/modularity-review.{md,html}`.

## What changed

The layout and its rules are in `frontend/src/README.md`. In short:

```
src/platform/        Wails/OS seam: db, files, durable state, commands, perf, state store
src/shared/          format, time, text, fuzzy, sql literals; shared/ui/ = the UI kit
src/features/<f>/    22 features, each with its logic, use*.ts, *.store.ts, components/
src/pages, layouts, plugins, assets, workers   unchanged (Nuxt conventions)
```

`utils/`, `stores/`, `composables/` and `components/` are gone.

| Before, each feature was spread over | Folders |
| --- | --- |
| metrics, shell | 8 |
| connections, reports | 6 |
| git, groups, trends | 5 |
| cycles, files, java, lens-builder, snapshot | 4 |

After: one folder each.

Beyond moving files:

- **Explicit imports only.** Added the five missing imports and turned off Nuxt's
  scanning of our own folders (`imports.scan: false`, `components.dirs: []`).
  The build's six "Duplicated imports" warnings are gone.
- **Dead code deleted**: 41 files and 6 tests that only covered them
  (`unitFindings`, `regionMatrix`, `regionReading`, `findingGraph`,
  `javaRelevance`, `path`, `useMetrics`, 32 components).
- **Misnamed modules renamed**: `javaFrameworks` → `frameworks/frameworkProfiles`
  (profiles for every language), `javaFacts` → `frameworks/classFacts`,
  `utils/shell` → `workspace/scanFlow`, `utils/modules` →
  `lens-builder/buildModules`, `stat_resolver` → `snapshot/statNames`.
- **Four cycles cut by moving knowledge to its owner**:
  - `detectSeparator` (how a codebase writes names) → `snapshot/names.ts`.
    It was the only reason groups depended on the lens builder.
  - `resolveLensEdges` and `lensGroups` → `groups/lensEdges.ts`. They were the
    only reason groups depended on rules.
  - `QueryBar` and `SaveToLens` → `shell`. They compose groups with the lens
    draft.
  - The Java wiring types moved from a `.vue` file into `java/java.ts`, so a
    composable no longer imports a component.
  - `MetricHint` and `ElementTable` left `shared/ui` because they read feature
    stores. `ReadingBand` joined `shared/ui` because it reads nothing.
- **A fitness test**, `src/architecture.test.ts`. It fails when shared/platform
  imports a feature, when a feature imports a page, when a
  utils/stores/composables/components folder reappears, or when a new pair of
  features starts depending on each other.

Behaviour is unchanged on purpose. The duplicated rules (`isTestPath` ×2,
language ×3) differ today, so merging them is a product decision. They are
documented instead.

## Verification

- `npx vitest run`: 709 passed, 1 skipped. That is 767 before, minus 62 tests
  in deleted files, plus 4 architecture tests.
- `nuxi build` passes with no duplicate-import warnings. With component
  auto-registration off, no project component is resolved by name.
- **Runtime sweep**: the generated site was served against the real Wails
  backend. Each of 36 routes (every view, plus a component's and a file's
  detail tabs) was rendered headless on the archstats-ui snapshot, and the page
  text was compared with the original build. See "Sweep" below.

## Known debt, left on purpose

Two-way feature dependencies allowed by the fitness test:

- `workspace` with `git`, `groups` and `lens-builder`: selecting a workspace
  loads every feature's per-workspace state. A workspace-selected hook would
  invert it, but it changes initialisation order.
- `git` with `groups`: `GroupsManager` hosts the workspace config
  import/export.
- `git` with `metrics`: effort reads health, and the directory tree reads
  commit windows.

Also left:

- Thick pages (`components/[name]/index.vue` 845 lines, `dimensions.vue` 910,
  `connections.vue` 784) still hold logic that belongs in their features.
- The duplicated rules above.

## Sweep

36 routes, each rendered headless against the archstats-ui snapshot, for the
original build (the running dev server) and the refactored build (generated
and served with the same Wails backend). Every route rendered, with no console
errors in either build. After setting aside the "N commits past this scan"
banner and relative times, 35 of 36 pages have identical text. The exception
is the Cycles view: its guide sentence differs because the dev server had
meanwhile picked up `f4db285` ("a guide that walks the cuts in plain words"),
committed on `persona-roadmap` after this branch started.

This branch starts from `cffe84f`. `persona-roadmap` has since gained
`f4db285`, `b906fa2` and `9906210` (the last also deletes `ClassGraph.vue`), so
rebase before merging. The moves are data, so they can be replayed on the new
base: `python3 tasks/restructure/restructure.py tasks/restructure/map-1-features.txt frontend`,
then `map-2-placement.txt` and `map-3-readingband.txt` with `--any`. The hand
edits (explicit imports, `names.ts`, `lensEdges.ts`, the wiring types, the Nuxt
config and the fitness test) are in the commit.
