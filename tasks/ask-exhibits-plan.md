# Ask on exhibits and intents: the build plan

2026-09-30. It implements `ask-rethink.md` §6.2–6.10, §8.1 and §8.2. Two parts wait for a separate go-ahead:

- the message format and event log (§3);
- the Claude provider (§4), which adds the Go SDK dependency.

**Ground rules:**

- **The app keeps working after every step.** `wails dev` runs with hot reload; never `nuxi build`.
- **Views are not refactored.** Shared figure components get only additive changes, whose defaults are today's behaviour.
- **No new npm or Go dependencies.**
- **Every phase ends green:**
  - `npx vitest run src/features`;
  - the snapshot tests on 3 snapshots (elepy, archstats-ui, django-oscar);
  - `node scripts/sfc-check.cjs src`.
- **The old tools stay until the new ones match them.** `ASK_TOOLS=legacy` switches back, for the eval.

Test snapshots:

- elepy (Java, rev 7);
- archstats-ui (TS/Vue, rev 8);
- django-oscar (Python, rev 7);
- BroadleafCommerce (large Java, rev 9) for scale.

## Phase 0: the safety net (no behaviour change)

1. **Golden outputs.** Capture today's tool texts on the three snapshots into `features/ask/testing/golden/<snap>.json`:
   - `layers`, `mass`, `knowledge_map`, `tangles`, `untangle`, `cycles`, `graph`, `activity`, `cochange`, `knowledge`, `rank`, `component`, `files_of`, `file_outline`.

   A new definition must carry the same numbers as the tool it replaces.
2. **The routing set.** Write `features/ask/testing/routing.json`: about 100 real questions → the intent tool each should reach. Sources: the recipes, the eval, the capabilities, one question per view.
3. **Baseline.** Record the current vitest result.

## Phase 1: prepare the views (additive)

1. **A narrow `Snapshot`** in `features/snapshot/snapshot.ts`: `scanId`, `info`, `workspace`, `columns`, `query`, `components`, `connections`, `cycles`, `definitions`, `fileComponent`, `fileRole`. `World` extends it.
2. **Pure legends**, exported from each component's module and called by the component itself (same output):
   - `stackLegend` (StackDiagram);
   - `tangleLegend` (TangleGraph, TangleMatrix);
   - `matrixLegend` (ConnectionsMatrix);
   - `knowledgeLegend` (KnowledgeMap).

   FolderMap and ResultChart already take their legend as a prop.
3. **Seams (group C):** KnowledgeMap gets an optional `authorName` prop (default: the authors store).

Group B (force layouts) and group D (self-fetching figures) are not in this plan; they come when the chat needs them.

## Phase 2: the kernel (`features/exhibits/`)

- `schema.ts`: the `s` builder. Types, JSON Schema, validation, defaults.
- `types.ts`: `ExhibitDef`, `ExhibitSpec`, `Fact`, `Element`, `ResolveContext`, `Absent`.
- `engine.ts`:
  - `exhibit()` (an identity helper for typing);
  - `validate`, `resolve` (cached per scan + spec), `present` (id, capped facts, the model text, the exhibit part);
  - `highlightFor(facts)`.
- `catalog.ts`: `CATALOG`, `defOf(kind)`.
- `ExhibitView.vue`: draws any spec (a figure, or its table), with density, highlight, caption and Open in view.
- `render.ts` + `ExhibitRenderHost.vue`: a headless PNG through a host in the layout.
- `contract.test.ts`: every definition, on every test snapshot, meets the contract.

## Phase 3: definitions (feature-owned)

| Definition | Component | Data from | Replaces |
|---|---|---|---|
| `stack` (checks) | StackDiagram | the `layers` code, `areasOf` | `layers` evidence |
| `folders` (checks) | FolderMap | the `mass` code | `folders` evidence |
| `tangle` (cycles) | TangleGraph / TangleMatrix | `tanglesOf`, `planCuts`, `layoutTangle` | `tangle` evidence |
| `neighbours` (connections) | ConnectionsMatrix | the `graph` code (around, dependents, dependencies, path) | `graph` evidence |
| `knowledge` (git) | KnowledgeMap | the `knowledge_map` code | `knowledge` evidence |
| `timeline` (git) | generic columns | the `activity` code | `timeline` evidence |
| `table`, `bars` (exhibits) | generic | any rows | `table`, `bars` evidence |
| `card` (exhibits) | generic | a component or file reading | `component`, `file` evidence |
| `code` (exhibits) | generic | lines of a file | `code` evidence |

Each definition gets a golden test against Phase 0 and passes the contract test.

## Phase 4: intents (`features/ask/intents/`)

1. The twelve tools of §6.10:
   - `about`, `structure`, `dependencies`, `change`, `people`, `rank`;
   - `libraries`, `deployables`, `rules`;
   - `code`, `search`, `explain`.

   Plus `ask_user`. Shared modifiers: `of`, `since`, `vs`.
2. A rule table, (aspect × level of the subject) → exhibits. The model never names an exhibit.
3. Facts in the app's words, with ids `E3.4`. The loop, the checks and AskProse accept fact ids; `[E3]` stays valid.
4. `TOOLS` = intents by default; `ASK_TOOLS=legacy` keeps the old set for comparison.
5. A routing eval over `routing.json` (first tool call only, real model, opt-in).

## Phase 5: the chat draws exhibits

1. A turn stores `exhibits: ExhibitPart[]` next to the legacy `evidence` (old threads still render).
2. `render/blocks.ts`: an answer splits into prose and embed lines (`![caption](exhibit:E3)`). Cited-but-unplaced exhibits are auto-placed after their paragraph.
3. The highlight comes from the facts cited in the paragraph next to the figure.
4. The prompt teaches the embed line and fact citations. The facts check (number ⊂ cited facts, entity ⊂ cited facts) joins `checks.ts`.

## Phase 6: reports

1. `CellSpec` gains `{ type: "exhibit", kind, v, params, highlight? }`. `runCell` resolves it and renders it through the host.
2. `toReport` maps exhibit parts to exhibit cells. The writer reads facts.

## Phase 7: delete

This happens when the eval on intents matches or beats the legacy tools. Removed:

- the stage (`stage.ts`, `stageHost.ts`, `platform/stage.ts`, `plugins/0.stage.client.ts`, stage edits in db, state, data and workspaces);
- `EvView`, `EvFigures`, `EvTangle`, `EvGraph`;
- the legacy tools;
- `look_at_view` and `readView`.

## Status (2026-09-30)

**Phase 0: done.**
- Golden outputs for 3 snapshots are in `testing/golden/`.
- `routing.json` has 100 questions.
- Baseline: 1,106 tests passing, 241 SFCs compiling.

**Phase 1: done, with one change.**
- `Snapshot` is in `features/snapshot/snapshot.ts`, and `World` extends it.
- Instead of pure legends, `useExportables` got an optional **export scope** (`EXPORT_SCOPE`). The audit found TangleGraph, TangleMatrix and KnowledgeMap always register their figure, so they leaked into the page's ⌘E menu from the chat. With the scope, a figure drawn by an exhibit registers into its own scope, and headless render gets each component's own legend and render. The components are untouched.
- Helpers moved out of Ask, with re-exports left behind:
  - `areasOf` → `snapshot/areas.ts`;
  - `candidates`, `separatorOf`, `commonPrefix` and `shortName` → `snapshot/names.ts`;
  - measure words → `snapshot/measures.ts`;
  - recipes → `snapshot/recipes.ts`.

**Phase 2: done.** The kernel is in `features/exhibits/`:
- `schema.ts`, `types.ts` (`exhibit<Data>()({...})`), `engine.ts`, `catalog.ts`, `app.ts` (snapshot per scan), `words.ts`;
- `ExhibitView`, `ExhibitTable`, `ExBars`, `ExTimeline`, `ExCode`, `ExProfile`;
- the render host (`render.ts`, `ExhibitRenderHost`, `ExhibitRenderJob`), mounted in the layout;
- `contract.test.ts`.

Definitions load their component lazily (`load: () => import(...)`), so they run in Node with no Vue compiler.

**Phase 3: done. There are 17 definitions:**

| Feature | Definitions |
|---|---|
| checks | stack, folders |
| cycles | tangle |
| connections | neighbours |
| metrics | ranking |
| git | activity, cochange, authors, knowledge |
| deployables | deployables |
| rules | rules |
| exhibits/generic | profile, files, excerpt, matches, names, recipe |

- Thin wrappers where a view figure needs a stateful parent: `TangleExhibit`, `MatrixExhibit`, `FolderExhibit`, `KnowledgeExhibit`.
- stack and tangle match the legacy tools exactly on all 3 snapshots (golden tests).

**Phase 4: done.**
- The intents (`features/ask/intents/`): 12 tools plus `ask_user`.
- Name resolution refuses to guess between equal tails.
- `intentsPrompt` teaches fact citations and embed lines.
- Intents are the default; `ASK_TOOLS=legacy` switches back.
- Every intent runs on the 3 snapshots and fits the 6,000-character context budget (`intents.snapshot.test.ts`).

**Phase 5: done.**
- A turn carries `exhibits`, and fact ids (`E3.4`) are citable everywhere.
- `render/blocks.ts` lays out the answer: embed lines, auto-placement, a cap of three, streaming-safe.
- The highlight comes from the facts cited in the paragraph beside a figure.
- Clicking a fact citation scrolls to the figure, flashes it and lights the element.
- Exhibits the answer did not cite appear under "Also looked at".

**Phase 6: done.**
- A new `exhibit` CellSpec. `runCell` runs it through `RunContext.exhibit` (app-side): it resolves on the report's snapshot and renders the figure off-screen to a kept PNG, or keeps the table when there is no figure.
- "Add to report" follows the answer's layout (`answerBlocks`), and each exhibit has a Report button.
- The writer uses shown exhibits.

**Phase 7: revised.** The stage **stays for template figure slots**, because templates take figures from views that are not exhibits (Activity breadth, the commit calendar, Units lanes, Metrics). The intents never use the stage. It is deleted when those slotted figures get definitions.

