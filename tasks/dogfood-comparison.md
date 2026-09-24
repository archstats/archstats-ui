# Dogfooding Archstats on archstats-ui: three ways to plan one restructure

2026-09-24. The same job was done three times from the same commit
(`cffe84f`): restructure the frontend, which the owner called "poorly
structured, lots of utils, very hard to navigate".

| Run | Branch | How the findings were made | Cost |
| --- | --- | --- | --- |
| **1. By hand** | `refactor/manual-modules` | Reading code, plus scripts over it (import graph, reachability, `unimport`, bundle grep, `git log`). No Archstats. | One session, about 20 analysis commands before the plan. |
| **2. App + SQL console** | `refactor/archstats-guided` | Three Sonnet agents using only the app. More than half their calls were SQL. `file_contents` let them read source through the console. | 99 app calls, about 47 minutes, about 555k tokens. |
| **3. UI only, as an architect** | `refactor/archstats-clicks` | An Opus lead architect and 14 Sonnet navigators. No SQL, no page scripting. They drove the real UI with clicks and screenshots, and used the intended workflows: groups by query, Declare → Rules, Cross-cut, Sandbox, pins. | About 1,000 UI actions in three rounds, about 2 hours of agent time, about 2.8M tokens. |

Material for each run:

- Run 1: `tasks/refactor-manual.md` and `docs/modularity-review/2026-09-24/`.
- Run 2: `tasks/archstats-dogfood/`.
- Run 3: `tasks/archstats-clicks/`, including every mission and report, the
  final plan, and the facilitator's notes separating harness, product and
  engine faults.

## Verdict

**By hand was clearly best on the outcome.** The two app runs landed in the
same place: plausible feature folders with broken layering underneath. The
UI-only run reasoned best (hypotheses, predictions, evidence per decision),
cost the most, and **found the most bugs in Archstats itself**. For the owner
of the tool, run 3 was the most valuable of the three.

| Outcome | 1. By hand | 2. App + SQL | 3. UI only |
| --- | --- | --- | --- |
| Top-level modules | 22 features + shared + platform | 15 | 16 (12 features, 3 core, shared) |
| Pairs of modules that depend on each other | **5**, documented | 26 | 32 |
| Violations of the plan's own layering rule | **0**, enforced by a test | 46 | 51 (core→features 6, shared→core 20, shared→features 25) |
| Unreachable code | 41 files deleted | kept | kept ("never imported" correctly distrusted) |
| Hidden auto-import dependencies | made explicit; auto-scan off | not seen; 4 views broke until fixed | not listed, but inferred (H4); auto-imports kept working by widening Nuxt's scan, which grew duplicate names from 6 to 82 |
| Workspace store calling feature stores | documented as debt | not seen | **inverted** (hooks + plugin), because the plan's rule demanded it |
| Duplicated business rules | found and documented | not found | not found |
| Tests | 709 (767 − 62 deleted + 4 architecture) | 767 | 767 |
| Runtime, 36 routes | identical to original | 4 blank until fixed | identical to run 1 |

**Why the app runs lost.** Both app plans were argued from file names and
doc comments. The app could not show the imports that decide layering:

- `.vue` files are not parsed, so 217 files (the whole UI layer) have no
  edges.
- Nuxt auto-imports are invisible.

Run 3 also could not *test* its plan in the app. The structure it declared as
a lens and checked with Rules was only a probe, because building file-grain
groups was so fragile. The Sandbox cannot create a component or move many
files at once.

## How the three approaches worked

- **By hand: a loop.** Graph → classify → move → re-measure → fix → hold it
  with a test. The re-measuring found two misplaced helpers that caused two
  cycles, and made them one-line moves.
- **App + SQL: a survey.** Views for orientation, then SQL and `file_contents`
  to read the code. There was no loop, and the plan's rule was never checked.
- **UI only: an architect's arc,** after a correction. Round 1 used the app as
  a table reader. After the switch to the architect stance and the product
  guide, the lead architect:
  1. oriented itself;
  2. stated five falsifiable hypotheses;
  3. sent navigators to test them with lenses, declarations, Rules, Cross-cut,
     the Sandbox and search;
  4. recorded confirmed, refuted or can't tell.

  The reasoning is the best of the three runs. Two of its conclusions came
  from the Sandbox and are not in run 1:
  - Moving all session stores down does not dissolve the tangle (the
    prediction was refuted).
  - The workspace store should stop calling feature stores (run 1 left this
    as debt).

  Execution was dominated by friction: most navigators overran their budget
  2–4×, on the group editor, the lens menu and the Sandbox form.

## Findings, per run: found?, effort, and what would have made it easier

Ease: easy / some digging / hard / not possible. For runs 2 and 3, "found"
means through the app.

| # | Finding | 1. By hand | 2. App + SQL | 3. UI only | What would have made it easier in Archstats |
| --- | --- | --- | --- | --- | --- |
| 1 | `utils/` holds about 12 unrelated features | easy (3 cmds) | some digging (SQL `file_contents` ×5) | some digging (Source tab per file, about 3 actions each; lens builder "Components and parts" did not split utils) | Components finer than directories; a directory "what's inside" panel (first comment, exports); a reading that splits a component by file topic |
| 2 | Each feature smeared over 3–8 folders | easy | some digging (SQL dir co-change) | some digging (Search + Connections → Git List; Cross-cut never reached) | File-grain co-change clusters drawn over the tree; Cross-cut that works with file groups |
| 3 | `utils→stores→composables` tangle, closed by `java.ts:1` and 14 `utils→stores` imports | easy | easy (Cycles) | **easy** (Cycles guide); full 9-file list via the matrix cell: some digging | Expand "And 9 more" inline |
| 4 | 5 files depend on code they never import (Nuxt auto-imports) | hard | not possible | inferred, not enumerable ("no framework packages imported" on About; every `.vue` shows 0 imports) | Resolve `.nuxt/imports.d.ts` / `components.d.ts` as edges |
| 5 | Duplicate exported names; two `isTestPath` rules | some digging | no | no | "Same exported name in N files" |
| 6 | 41 unreachable files | easy | not possible | not possible (Units "never imported" rightly distrusted) | Reachability from entry points, after `.vue` parsing |
| 7 | `javaFrameworks` is every language's framework catalogue | easy | missed | missed | Importers by feature |
| 8 | `components/component` vs `components/components` | easy | easy | easy (Metrics → Directories) | Expand-all under a path |
| 9 | groups↔lens cycle comes from one function | easy (loop) | missed | missed | File-grain what-if with a verdict |
| 10 | Fat pages and hotspots | easy (no score) | easy | easy (Overview links; no top-N table) | Sortable Hotspots top-N table |
| 11 | One author, big-bang commits | not looked | easy | easy (Authors) | — |
| 12 | Go backend ↔ `utils` co-change with no import | missed | easy | some digging (Connections → Configure → Git → List; the "Without an import" toggle is hard to find); files not attributable | Drill-down from a pair to its files and commits |
| 13 | Two files missing from the scan (NUL byte) | missed | hard, found indirectly | not found (a 159-vs-157 gap noticed, unexplained) | Record skipped files and show them on About |
| 14 | Workspace store calls every feature store | easy (graph) | missed | found via search + Sandbox What-if B, and **acted on** | A projected-cycle inspector in the Sandbox |
| 15 | `useUnitsModel` ↔ `moduleGraph` import each other | inside one module | yes (implemented) | **easy** (Units → pairs, 1 click) | — |
| 16 | `provenance.ts` imports 5 stores and calls the backend directly | easy | easy | easy (Cycles matrix cell + Source) | — |
| 17 | Go imports of `wails/.../runtime` resolve to `frontend/wailsjs/runtime` (engine bug) | missed | missed | **found**, hard (Declare on a Layers lens, then Rules) | — (fix the engine) |

Counts:

| Run | Got | Partly | Missed |
| --- | --- | --- | --- |
| 1. By hand | 13 of 17 | — | 11, 12, 13, 17 |
| 2. App + SQL | 9 | 1 | 7 |
| 3. UI only | 11 | 2 | 4, plus 3 not possible |

Run 3 found two things neither other run did: the engine's Go import bug
(#17), and acting on #14.

## What Archstats needs, merged from all three runs, in priority order

Every item below was verified against the code or the snapshot by the
facilitator (`tasks/archstats-clicks/FACILITATOR-NOTES.md`). Harness faults
are excluded.

### Engine (decides what any plan can see)

1. **Parse `.vue` / `.svelte` single-file components**: the script blocks,
   plus template tags that name imported components. 217 files had no edges.
   It is the root cause of both app plans' layering failures.
2. **Resolve framework auto-imports.** Nuxt's `.nuxt/imports.d.ts` and
   `components.d.ts` hold real dependencies with no import statement.
3. **Go imports must not resolve to same-named local directories.**
   `wails/v2/pkg/runtime` became `frontend/wailsjs/runtime`, a fake
   cross-language edge.
4. **Never drop a file silently.** NUL-byte files a language pack claims were
   skipped as binary. Record skipped files and show them.

### The workflows an architect relies on (UI)

5. **File-grain groups that behave:**
   - counters that count files, not only components;
   - no `**` pre-fill that typing appends to;
   - Query mode that persists after Save (it resets to Members);
   - per-line "matched N files" diagnostics;
   - an accessible lens menu (it is icon-only and closes before it can be
     used);
   - "Declare dependencies…" that warns when only some groups were placed
     (it silently placed 3 of 7);
   - Rules and Cycles that agree on the same lens (Rules said 0 crossings
     while Cycles showed a 3-group cycle).
6. **A Sandbox that can carve a feature:**
   - move many files at once, from a selection or a search;
   - move into a new component (today: "Both must be components");
   - explain a projected tangle ("why is this still tangled?");
   - redraw the graph for the plan;
   - clicking a node should not leave what-if mode;
   - a real autocomplete instead of a hidden `<datalist>`, with an error that
     says which path format it wants;
   - Pin inside the panel.
7. **File-level co-change**: on file pages ("changed together with") and as a
   drill-down from any component or group pair, including "Without an
   import".
8. **Direction-correct dependency counts.** "Depends on" and "Used by" show
   the same both-ways sum (`references` in `utils/neighbours.ts`).

### Smaller, cheap wins

9. **Complete lists:**
   - "And N more" expands inline;
   - Search results group by folder;
   - a sortable Hotspots top-N table;
   - an export for Units tables;
   - component names are links in the Metrics table;
   - a "Components" entry in the sidebar.
10. **Discoverability:**
    - explain disabled buttons visibly, not in a native tooltip (the
      Sandbox);
    - make the lens builder's "Cut by" either a control or plain text;
    - say when a reading declined to split a component;
    - show the `?` shortcut sheet on first run;
    - Hotspots search should not reset the chosen perspective;
    - pinned group evidence should render in reports;
    - "Who works on it" split one author into two identities.

## Method notes

- **Harness.** A sandboxed server (`serve-ui.mjs`) and a driver
  (`drive.mjs`) let agents use the real app safely: the owner's open
  snapshot never moved, and nothing was written. Both are reusable for
  agent-driven UI testing of Archstats.
- **Harness faults were separated from findings.**
  - The driver did not show native tooltips at first.
  - It could not clear fields at first.
  - One mission used a wrong route.
- **Round 1 of run 3 is not representative of the product's intent.**
  Navigators used it as a table reader until given the architect stance and
  the product guide. How hard the intended features were to discover without
  a guide is itself a finding.
- **Rebase needed.** All three branches start at `cffe84f`;
  `persona-roadmap`/`main` moved during the run.
