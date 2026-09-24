# Dogfooding Archstats on archstats-ui: by hand vs. through the app

2026-09-24. The same job was done twice on the same commit (`cffe84f`): restructure
the frontend, which the owner called "poorly structured, lots of utils, very
hard to navigate".

| | Branch | How the findings were made |
| --- | --- | --- |
| **By hand** | `refactor/manual-modules` | Reading code, plus small scripts over it (import graph, reachability, `unimport`, bundle grep, `git log`). No Archstats. |
| **Through the app** | `refactor/archstats-guided` | Three Sonnet agents with the Archstats desktop app as their only window into the code: two explorers (structure, history), then one synthesiser who turned their reports into a move map. They could use every view and the app's SQL console, but no files, `git` or `grep`. The plan was implemented exactly as written. |

Material: `tasks/archstats-dogfood/` (brief, both reports, plan, move map,
screenshots). The by-hand account is `tasks/refactor-manual.md` on the other
branch, with its review in `docs/modularity-review/2026-09-24/`.

## Verdict

**By hand was better, by a wide margin on the outcome.** The app was faster
at orientation and found three things the manual pass missed, but its plan was
structurally unsound. That was not bad judgement by the agents. The app could
not see most of the code's dependencies, so the plan could not be checked
against them.

| Outcome | By hand | Through the app |
| --- | --- | --- |
| Top-level modules | 22 features + `shared` + `platform` | 15 |
| Pairs of modules that depend on each other | **5**, each documented | **26** |
| Violations of the plan's own layering rule | **0** (enforced by a test) | **46** (`ui-kit`, `catalog` and `data-access`, declared as foundations, import stores, features and the shell) |
| Unreachable code | 41 files (~3,000 lines) deleted | all kept; the app cannot tell what is unused |
| Hidden (auto-import) dependencies | 5 found and made explicit, auto-scan off | none found; the move broke 4 views at runtime (see below) |
| Duplicated business rules | found (`isTestPath` ×2, language ×3), documented | not found |
| Misnamed modules | `javaFrameworks` → `frameworks/frameworkProfiles` | kept as `java-analysis/javaFrameworks` |
| Tests | 709 pass (767 − 62 in deleted files + 4 architecture tests) | 767 pass |
| Runtime (36 routes rendered headless) | identical to the original | 4 routes blank until fixed (Rules, Activity, Timeline, Authors) |
| Diff | 435 files, +2,900 / −5,155 | 432 files, +2,612 / −1,505 |
| Cost | one session, ~20 analysis commands before the plan | 3 agents, 99 app calls, ~47 min, ~555k tokens |

The runtime breakage deserves a sentence. Both plans moved files out of
`utils/`, `composables/` and `components/`. That silently ended Nuxt's
auto-imports from them, and five files relied on those. The app's plan had
no way to know. The standard verification (tests, build, route sweep)
caught three of the five. The other two only break on interaction. They
were fixed in a separate commit and labelled as carried over from the manual
review.

## The two approaches, side by side

**By hand** was a loop: build a graph → classify → move → measure the new
graph → move again. The measuring is what made it good. After the first
move, the module graph showed groups↔lens-builder and groups↔rules cycles,
and `shared/ui` components reading feature stores. Each came down to one
misplaced function or component, and was fixed and re-measured. A fitness test
now holds the result. The domain classification itself came from reading
the header comment of every `utils/` module.

**Through the app** was a survey: views and SQL for sizes, hotspots, cycles,
co-change and authors, then `file_contents` in the SQL console to read the
same header comments. That was the only way to find out what a file is
about. There was no loop. The app cannot evaluate a proposed structure, so
the plan's layering rule was stated but never checked, and 46 violations went
unseen. The synthesiser also merged groups with the lens engine (a 44-file
module) specifically "to avoid recreating a cross-module cycle". The manual
pass found that the cycle came from one function in the wrong place.

What the two shared: in both, the classification of the 90 `utils/` modules
came from their doc comments, not from any metric. The app added nothing
there beyond giving access to the text.

## Findings, how easy each was, and what would have helped

"Calls" counts app invocations (probe runs) for the app, and commands for the
manual pass.

| # | Finding | By hand | Through the app | What would have made it easier in Archstats |
| --- | --- | --- | --- | --- |
| 1 | `utils/` is one bucket of ~17 unrelated concerns | Easy: import-graph script + reading 90 headers (3 commands) | Size: easy (Files table, Hotspots treemap, 1–2 calls). Concerns: some digging, 5 batched `file_contents` queries to read doc comments | A directory "what's inside" panel: each file's first comment and exports, grouped by who imports it. Components finer than one-per-directory, so `utils` is not a single node. |
| 2 | Each feature is smeared over 3–8 folders | Easy after classifying (1 script over the move map); `git log` confirmed it (46 of 67 commits touch ≥3 layers) | Some digging: SQL on `git_directory_shared_commits` (utils co-changes with pages 28×, stores 24×, composables 22×) | A "feature smear" view: file-grain co-change clusters, drawn over the directory tree, so a cluster spanning 4 folders is visible at once. |
| 3 | `utils → stores → composables` tangle; `utils/java.ts:1` closes it | Easy (script listed 17 upward imports) | **Easy, the app's best moment**: the Cycles view named the tangle and the exact closing import in 1–3 calls | Nothing; this worked. |
| 4 | 5 files depend on code they never import (Nuxt auto-imports) | **Hard**: build warnings → ran `unimport` over every file and triaged the false positives → built with registration off and grepped the bundle | **Not possible** | Read `.nuxt/imports.d.ts` and `.nuxt/components.d.ts` (or the framework's equivalent) as edges, and flag files that use a symbol without importing it. |
| 5 | Same name exported by several modules (`Edge`, `Finding`, `Query`, `isTestPath`, `languageOf`); two different `isTestPath` rules | Some digging (the build warnings pointed at it, then read both) | Not found | A "same exported name in N files" list from the units table. Cheap, and it points straight at duplicated rules. |
| 6 | 41 files (~3,000 lines) unreachable, 6 of them tested | Easy once the graph existed (reachability script, 1 command) | **Not possible**; the agents rightly refused to guess | Reachability from entry points (pages, layouts, plugins, `main`), which needs #A below. |
| 7 | `javaFrameworks` is really every language's framework catalogue | Easy (its header) | Missed; placed in `java-analysis` | Showing who imports a module, by feature (Units imports it 11×), hints that a name no longer fits. |
| 8 | `components/component/` vs `components/components/` confusion | Easy | Easy (Files table) | — |
| 9 | Groups↔lens-builder cycle comes from one function (`detectSeparator`) | Easy, but only because the loop re-measured after moving | Not found; merged the modules instead | What-if at file grain: apply a move map, recompute cycles and mutual dependencies (#C below). |
| 10 | Fat pages and hotspots (`components/[name]/index.vue` 845 lines, score 67) | Easy (`wc -l`), no score | Easy (Hotspots / SQL), with scores and health | — |
| 11 | Single author, big-bang commits (a commit touches 13–33 files) | Not looked at | Easy (Authors, Activity) | A commit → files-by-directory rollup; the agent rebuilt it from the Activity table row by row. |
| 12 | Go backend and `frontend/src/utils` change together in 45% of utils' commits with no import between them | **Missed** | **Easy**: Hidden coupling view, 1 call | Show which files drive a component-level pair (here: the generated Wails bindings and `models.ts`). |
| 13 | `utils/cycles.ts` and `utils/boundaryFlow.ts` are missing from the scan (a literal NUL byte makes them "binary") | **Missed**: `grep` printed "Binary file matches" for both and I read past it | Surfaced indirectly and hard: two tests import files the app says don't exist. Root cause found by the implementer. | Never drop a file silently: record skipped files and why in the snapshot, and show them in "About this snapshot". |
| 14 | The workspace store orchestrates every feature store, and they read it back | Easy (module graph) | Not found; put the workspaces store in the `data-access` foundation | Needs the `.vue` edges, then the Connections view would show it. |
| 15 | `useEmitter` is dead (only a dead modal uses it) | Found (reachability) | Wrong: read it and its plugin side by side and concluded "producer/consumer pair, not dead" | Same as #6. |

Tally: of 15 findings, the manual pass got 12 and missed 3 (#11, #12, #13).
The app got 7 fully (#1, #2, #3, #8, #10, #11, #12) and 1 partly (#13), and
missed or got wrong 7 (#4, #5, #6, #7, #9, #14, #15). The three the app found
alone are all history or engine facts that a code-first approach never looks
at.

## How Archstats helped

- **Orientation in minutes.** Sizes, the hotspot treemap, the Cycles view
  and Authors gave an accurate first picture before reading any code.
- **The Cycles view** named the one import that closes the tangle, with file
  and line. It was the single most useful screen.
- **History as evidence.** Co-change quantified the "feature smear" (#2) and
  found the Go↔frontend coupling (#12). Neither was in the manual pass.
- **The SQL console with `file_contents`** made the agents' work possible at
  all. It is also where the "only the app" rule turned into reading code
  through SQL.
- **It found a bug in itself** (#13), and exercising it found an app bug
  (`openScan` has no guard against overlapping loads; a task has been queued).

## What Archstats is missing, in priority order

**A. Parse `.vue` (and `.svelte`) files.** This is the one that decided the outcome. The engine has no
handling for single-file components. All 217 `.vue` files in this snapshot
have no component and no import edges, so half the frontend, the whole UI
layer, is invisible to every structural view. Every placement of a `.vue`
file in the app's plan rested on its comment and folder, never on an edge.
That is where the 46 layering violations came from. The fix: run the
TypeScript/JavaScript grammar over the `<script>` / `<script setup>` block,
offset the line numbers, and treat template tags that name imported
components as uses.

**B. See framework-implicit dependencies.** Nuxt auto-imports and
auto-registered components are real dependencies with no import statement
(finding #4). Reading the generated declaration files (`.nuxt/imports.d.ts`,
`.nuxt/components.d.ts`) would turn them into edges. The same idea covers
Spring's component scan and Laravel's facades.

**C. A structure what-if at file grain, with a verdict.** The manual pass won
because it could move files and re-measure. The app has a sandbox for
components but not for "apply this move map". The missing loop: paste or
build a move map (the lens builder at file grain would do), then see new
cycles, pairs of modules that depend on each other, and violations of
declared layer rules before touching the code. The structure agent wanted
exactly this and could not try its proposal in the app. The group builder
only offered the 21 directory components.

**D. Components finer than directories.** With one component per directory,
`utils/` (159 files) is one node, so the question the owner asked cannot be
asked at component grain. Options: a depth or size cap that splits big
directories, or treating files as components under a threshold.

**E. Never drop a file silently.** The NUL-byte heuristic (git's) skipped two
TypeScript files that a language pack claims. At least record skipped files
and the reason in the snapshot, and list them in "About this snapshot". Better:
don't apply the binary test to extensions a pack parses.

**F. Reachability and dead code.** From entry points (pages, layouts, plugins,
`main`) over the import graph. It needs A and B to be trustworthy.

**G. Duplicate exported names across files** (#5): one query over the units
table, and it surfaces duplicated rules.

**H. Smaller gaps the agents hit:**
- Hidden coupling is component-grain only, and its threshold reads as a
  control but is fixed text. The file-pair co-change table has a floor of 3
  shared commits, so one-shot histories (most files here have 1 commit) show
  no pairs at all.
- Churn is a chart with no table, so it can't be read as text.
- `unresolved_edges` is empty for the whole snapshot. That is either correct
  or unpopulated for TypeScript; worth checking.
- Abstractness reads ~1.0 for TypeScript composables and stores. It is
  class-based, so it is noise for functional code.
- "Dependency matrix" opens the same force graph as Connections.
- The scope query (`**.controller`) persisted from another workspace shows
  on every page and reads as an applied filter.
- The SQL console has no schema or column browser; `from`/`to` columns need
  quoting and were found by trial.
- Reported by one agent and not reproduced: `LIKE '%…'` queries and large
  unbounded `ORDER BY` results came back as `{}` through the harness. This is
  probably shell quoting in the test harness, not the console.

## What each approach missed, and why

- **By hand missed history and the scanner's own gaps** (#11, #12, #13):
  nothing in reading code points at co-change with the Go backend. The
  NUL-byte files were visible (`grep` said "Binary file matches") and
  ignored.
- **The app missed everything that needs a complete import graph** (#4–#7,
  #9, #14, #15): with A and B missing, the graph it had covered the 120 `.ts`
  files and none of the 217 `.vue` files. It also could not test its own plan
  (C).

With A, B and C, the app would have had everything the manual pass had, plus
history. That combination would beat either approach alone.

## Method notes, for the next run

- The headless harness (`probe.mjs`) had a race that mixed in another
  workspace's data. It was fixed mid-run, the agents were told, and they
  re-checked. Their reports note it. It came from the real `openScan` race.
- Subagents could not write report files (policy). Their reports were copied
  from their final messages into `tasks/archstats-dogfood/`.
- The "only the app" rule allowed the SQL console, and `file_contents` in it
  is effectively a file reader. Without it, the app's plan would have been
  name-guessing. That is itself a finding for D and for finding #1's
  suggestion.
- `persona-roadmap` gained three commits during the run (`f4db285`,
  `b906fa2`, `9906210`). Both branches start at `cffe84f` and need a rebase
  before either is merged.
