# Modularity Review

**Scope**: archstats-ui frontend (`frontend/src`, Nuxt 3 SPA inside the Wails desktop shell) at commit `cffe84f`: 431 `.ts`/`.vue` files, about 64k lines. The Go side (`app/`) only as the frontend's backend seam.
**Date**: 2026-09-24

## Executive Summary

Archstats Desktop reads a scanned codebase's snapshot (a SQLite file) and lets an architect explore its structure and history: metrics, connections, cycles, units, git history, groups and lenses, and reports that carry their evidence. The frontend's [modularity](https://coupling.dev/posts/core-concepts/modularity/) **needs attention**. Its folders sort code by kind of file (`utils/`, `composables/`, `stores/`, `components/`), not by what it is about, so every feature is spread across three to eight folders while each folder holds unrelated features side by side. That is [low cohesion](https://coupling.dev/posts/core-concepts/balance/) in the most [volatile](https://coupling.dev/posts/dimensions-of-coupling/volatility/) part of the product. The most important finding is that the structure also *hides* coupling: Nuxt auto-imports let files use code they never import, several business rules exist twice with different logic, and "utilities" reach up into global application state. A reader cannot trust search or an import graph to show what depends on what.

## Coupling Overview

| Integration | [Strength](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | [Distance](https://coupling.dev/posts/dimensions-of-coupling/distance/) | [Volatility](https://coupling.dev/posts/dimensions-of-coupling/volatility/) | [Balanced?](https://coupling.dev/posts/core-concepts/balance/) |
| --- | --- | --- | --- | --- |
| Feature code within one feature (e.g. cycles: page, `CycleMap.vue`, `utils/cycles.ts`, `utils/untangle.ts`) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) / [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | High (logical): 3–8 folders per feature | High (core) | No: strongly coupled code kept far apart |
| Unrelated features inside `utils/` (90 modules), `composables/` (31), `components/components/` | None | Low: same folder | High | No: low cohesion |
| `GroupActionBar.vue`, 3 pages → `utils/subject`, `utils/query`, `ViewWorkspaceLayout.vue` (via Nuxt auto-import) | [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/), implicit | Low | High (groups) | No: implicit |
| `fileRole.isTestPath` ↔ `findings.isTestPath`; `languages` ↔ `libraries` ↔ `javaFrameworks` (language by extension) | [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (duplicated rule) | Medium: different features | Medium | No: implicit |
| `utils/provenance`, `history`, `codeSearch`, `durable`, `commitPattern`, `scopeSql` → Pinia stores; `utils/java` → `useChartTheme`; `useComponentJava` → a `.vue` file's types | [Intrusive](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (global state) | Low | High | No: layering inverted, forms the `utils → stores → composables` tangle |
| `stores/workspaces.select` → groups, lens, scope, draft, authors, state stores (and back) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Low | Medium | Tolerable, but two-way |
| groups (store, query language, scope) → lens studio (`detectSeparator`) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Medium | High | No: knowledge owned by the wrong module, creates a cycle |
| Units components → `utils/javaFrameworks` (11 importers) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Low | Medium | Yes, but the name misstates the contract |
| Views → `utils/sql` (`sqlLiteral`, `sqlIn`) | [Contract](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Low | Low | Yes |
| Views → `stores/data.query()` → Wails `QueryService` | [Contract](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | High (process boundary) | Low | Yes |

## Issue: Features are scattered across technical-layer folders

**Integration**: every feature → `utils/`, `composables/`, `stores/`, `components/*`
**Severity**: <span class="severity severity-critical">Critical</span>

### Knowledge Leakage

A feature's knowledge (for cycles: what a tangle is, how a cut plan is chosen, how the map draws it) is shared by [model coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) between its page, its components, its composable and its logic. The folder structure puts those pieces as far apart as the codebase allows. Measured on this commit: metrics code sits in 8 folders, shell code in 8, connections and reports in 6 each, git, groups and trends in 5. Meanwhile `utils/` holds 90 modules about 17 unrelated subjects, from Louvain clustering to keyboard shortcuts to PDF report cells. `components/components/` and `components/component/` add a second grab-bag with near-identical names.

### Complexity Impact

A change to one feature starts with a search across four trees, and nothing in a file's location says which feature it serves. Opening `utils/` shows 157 files (with tests). A developer has to hold the feature's map in their head, which is well past the 4±1 units of working memory. That is where [complexity](https://coupling.dev/posts/core-concepts/complexity/) comes from: nobody can predict what a change touches without reading everything.

### Cascading Changes

`git log` confirms it: of the 67 commits that touched `frontend/src`, 46 touched at least three of `utils/`, `stores/`, `composables/`, `components/` and `pages/`, and 10 touched all five. Of the 51 commits that touched `utils/`, 50 also touched another of those folders. A feature change is a change in several places. The [distance](https://coupling.dev/posts/dimensions-of-coupling/distance/) is only logical (one repository, one author), so each change is cheap to make but expensive to find and review.

### Recommended Improvement

Reduce distance for what is strongly coupled: move each feature's logic, composables, stores and components into `src/features/<feature>/`. Keep product-agnostic helpers and the UI kit in `src/shared/`, and put the runtime seam in `src/platform/`. Pages stay in `pages/` because Nuxt routes by folder. The trade-off is a large one-time diff (every import path changes) and a convention to hold. Both are cheap next to the navigation cost, and a test can hold the convention (see below).

## Issue: Coupling that no search can find

**Integration**: `GroupActionBar.vue` → `utils/subject.detectSeparator`, `utils/query.generalise`; `pages/views/rules.vue`, `git/activity.vue`, `git/authors/index.vue` → `ViewWorkspaceLayout.vue`; `hotspots.vue` → `GroupsGroupActionBar`
**Severity**: <span class="severity severity-significant">Significant</span>

### Knowledge Leakage

Nuxt auto-imports every export of `utils/` and `composables/` and registers every component under `components/`. Five files use code they never import. The dependency exists, but it is [implicit](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/). The same mechanism resolves name collisions silently: `Edge`, `Finding`, `Query`, `isTestPath`, `languageOf` and `edgeKey` are each exported by two or three modules, and the build warns that one of each "has been ignored".

### Complexity Impact

Search, "find usages", dead-code checks and any import graph (including Archstats' own) under-report these files' dependents. Moving or renaming a module can break a view at runtime with no build error.

### Cascading Changes

Rename `generalise` or move `utils/query.ts`, and the group action bar fails only when a user opens it.

### Recommended Improvement

Make every dependency explicit: add the five missing imports and turn off scanning of project folders (`imports: { scan: false }`, `components: { dirs: [] }`). Vue, Nuxt and Pinia auto-imports stay on. The only cost is writing import lines, and 99% of files already do.

## Issue: The same business rule, written twice

**Integration**: `utils/fileRole.isTestPath` ↔ `utils/findings.isTestPath`; `utils/languages.languageOfPath` ↔ `utils/libraries.languageOf` ↔ `utils/javaFrameworks.languageOfFile`
**Severity**: <span class="severity severity-significant">Significant</span>

### Knowledge Leakage

"Is this a test file" and "what language is this file" are rules of the product's vocabulary. Each is implemented more than once with different logic. `fileRole` mirrors the engine's test-path rules; `findings` has its own (it also treats `spec`, `e2e` and capitalised `FooTest` names). That is [functional coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) with no link between the copies.

### Complexity Impact

The Production/Tests switch and the Units findings can disagree about the same file, and a reader has no way to know which rule a number used.

### Cascading Changes

When the engine changes what counts as a test (it did at analysis revision 2), one copy follows and the others silently drift.

### Recommended Improvement

Own each rule once, in the snapshot vocabulary (`features/snapshot/fileRole.ts`, `languages.ts`), and have the other features call it. Merging changes behaviour (the rules differ today), so it needs a decision on which rule is right. A behaviour-preserving restructure should document the copies rather than merge them silently.

## Issue: "Utilities" that depend on application state

**Integration**: `utils/provenance` → data, workspaces, lens, scope and state stores; `utils/history` → data and workspaces stores; `utils/java` → `composables/useChartTheme`; `utils/moduleGraph`, `unitFindings` → `composables/useUnitsModel`; `composables/useComponentJava` → `components/java/ComponentWiringGraph.vue`
**Severity**: <span class="severity severity-significant">Significant</span>

### Knowledge Leakage

A module in `utils/` promises to be a leaf. These ones read global Pinia state, which is [intrusive coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) to other modules' internals, and they turn the `utils → stores → composables → utils` folders into one strongly connected tangle.

### Complexity Impact

No layer can be understood or tested without the others. A pure-looking helper needs an active Pinia and an open snapshot.

### Cascading Changes

Changing a store's shape (e.g. how the scope is held) reaches into "utilities" nobody would think to check.

### Recommended Improvement

Once code is grouped by feature, these stop being "utilities" and become feature code that may use its feature's stores. The layering that matters becomes enforceable: `shared/` and `platform/` import nothing from features. Types a composable needs from a component (`WiringNode`, `WiringEdge`) move into the feature's logic module.

## Issue: Workspace selection orchestrates every feature, and every feature reads it back

**Integration**: `stores/workspaces` ↔ `stores/groups`, `lens`, `scope`, `draft`, `authors`
**Severity**: <span class="severity severity-minor">Minor</span>

### Knowledge Leakage

`workspaces.select()` knows each feature's loading protocol (`initForProject`, `load`, `hydrate`, `clear`), and those features import the workspaces store to learn the active workspace. That is two-way [model coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/).

### Complexity Impact

Adding a feature with per-workspace state means editing the workspace store. Load order is implicit in the order of lines in `select()`.

### Cascading Changes

A new per-workspace feature, or a change to one feature's load API, changes the workspace store.

### Recommended Improvement

A workspace-selected hook that features register with would invert the dependency. It changes store initialisation order, so it is a behaviour change to make on its own and test. Until then, [volatility](https://coupling.dev/posts/dimensions-of-coupling/volatility/) is moderate and the distance is low, so the imbalance is tolerable. Record it as known debt.

## Issue: Naming knowledge owned by the lens studio

**Integration**: groups store, group query language, scope store, go-to index → `utils/studio.detectSeparator`
**Severity**: <span class="severity severity-minor">Minor</span>

### Knowledge Leakage

How a codebase joins name segments (`.`, `/`, `\`, `::`) is snapshot vocabulary. It lives in the lens studio's `subject.ts`, so the groups feature depends on the lens builder, while the lens builder depends on groups.

### Complexity Impact

This is the only reason the groups↔lens-builder cycle exists.

### Cascading Changes

A refactor of the studio can break group queries.

### Recommended Improvement

Move `detectSeparator` to `features/snapshot/names.ts`. Move the lens-edge readers (`resolveLensEdges`, `lensGroups`) from rules into groups. Move the scope query bar, which composes groups with the lens draft, into the shell.

## Issue: Dead and misnamed modules

**Integration**: 41 unreachable files; `utils/javaFrameworks` (framework profiles for Java, TypeScript, Python, C#, PHP and more)
**Severity**: <span class="severity severity-minor">Minor</span>

### Knowledge Leakage

About 3,000 lines are unreachable from any page, layout or plugin: `unitFindings`, `regionMatrix`, `regionReading`, `findingGraph`, `javaRelevance` and `path` are tested but used by nothing live, plus 32 components (old buttons, cards, d3 wrappers, class graph, seed picker). `javaFrameworks` is the framework catalogue for every language, yet its name tells the Units feature (its main user) that it is Java-only.

### Complexity Impact

Dead code costs reading time and test time, and it misleads anyone looking for the implementation of a feature.

### Cascading Changes

None at runtime, which is why it accumulates.

### Recommended Improvement

Delete what is unreachable, with its tests. Rename `javaFrameworks` → `features/frameworks/frameworkProfiles.ts` and `javaFacts` → `classFacts.ts`.

---

_This analysis was performed using the [Balanced Coupling](https://coupling.dev) model by [Vlad Khononov](https://vladikk.com)._
