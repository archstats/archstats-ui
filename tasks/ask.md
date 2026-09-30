# Ask: the architect's chat

Built 2026-09-29 (second version, from scratch). Design reasoning: `tasks/ask-harness-research.md`; product context: `tasks/ai-integration-research.md`. Uncommitted.

## Using it

- **Write up** opens a sheet with the report templates that fit the conversation (recommended first, plus this codebase's framework review and the full review), or a free outline. Ask builds the template's skeleton (readings, queries, figure slots), places the conversation's evidence in the matching sections, then writes every section in the report's voice from its evidence, and a summary on top. Numbers are checked against the evidence and loaded words ("severe", "not well layered", "intended layering") force a rewrite. A note at the top (not printed) says it was written by Ask.
- **Figures:** answers show real figures: tangles (the Cycles drawing, cuts applied by clicking), dependency matrices, the layer stack, the folder map, the knowledge map; any view Ask points at is previewed from the real view, drawn out of sight.
- **Broad questions** ("is it well layered?") get a plan of claims; each is tested in its own short loop and marked supported, refuted or can't tell before the answer is written.
- **Answers** can be copied, asked again, edited and asked again, rated (kept for tuning), and put in the report.

- **Sidebar → Ask**, or **⌘J** from any view.
  - ⌘J takes what the view shows (route, subject, focus, selection, its tables and figures) into the next question as a chip above the composer.
  - ⌘J again goes back.
- **Model:** a local Ollama server. The model is picked in the toolbar and remembered; Think is a toggle. A `:cloud` model is labelled, because the conversation leaves the machine.
- **Conversations** are kept per workspace (workspace state `ask.threads`). A conversation belongs to one snapshot: a question asked after switching snapshots starts a new one.
- **Evidence cards** can:
  - open in their view (with the focus they name);
  - be pinned (components and files, re-checked on every scan);
  - go into the conversation's own report;
  - open their SQL in the console.
- **Write up** turns the conversation into its own report:
  - a section per question;
  - the answer as a writer's prompt, which never prints until rewritten;
  - evidence as cells: SQL and the component reading re-run; cut plans and graph walks are frozen captures; code is quoted.
- **Inspector:**
  - **Evidence:** the chosen piece large, plus all evidence.
  - **Context:** the snapshot card, the view the question came from, what it can answer.
  - **Trace:** route, plan, each model call with tokens and time, tool calls, checks and repairs, the system prompt.

## How it is built

```
features/ask/
  engine/        pure: no stores, no Wails. Runs in the app, in tests, in the MCP server.
    types.ts     World (the snapshot), Evidence kinds, Tool, ModelClient, TurnEvent
    loop.ts      route → plan → test each claim in a clean sub-loop → act → draft → checks → one repair → answer
                 (budget: 150 s, then an answer from what was found; tool results over 6k chars enter as previews)
    route.ts     which tool namespaces a question gets (keywords; load_tools widens)
    checks.ts    number audit, citations and made-up markers, gave-up (checked against the capability map), verdict words
    prompt.ts    the system prompt: stance, method, rules, traps, capability families, snapshot card, where they are
    compact.ts   shortens old tool results past a token budget; ids stay recallable
  knowledge/
    capabilities.ts   what Archstats can answer, how, which view, when it cannot (34 entries)
    cookbook.ts       27 verified recipes (16 written, 11 harvested from the app by scripts/ask-harvest.mjs)
    semantic.ts       hybrid search: keywords + local nomic-embed-text vectors
    playbooks.ts      the architect's method for six big jobs (orient, untangle, extract, change impact, knowledge risk, health)
    areas.ts          the floors a layering is read over: each naming style apart, split until no floor holds most of the code
    card.ts           the snapshot card
  tools/              29 tools: core (capabilities, find, component, rank, cookbook, playbook, ask_user, show, load_tools, recall),
                      graph (graph, layers), cycles (tangles, cycles, untangle), files (files_of, file_outline, file_read,
                      code_search, mass), history (activity, cochange, knowledge, knowledge_map), query (schema, sql, run_code),
                      view (on_screen, look_at_view)
  app/
    ask.store.ts      conversations, persistence (saved on ask and after every step), turns, retry/edit/feedback, report actions
    writer.ts         the report writer: template suggestions, skeleton, section-by-section writing, summary, number and verdict checks
    stage.ts          the hidden second copy of the app that draws any view for previews and look_at_view
    stageHost.ts      inside the stage: open a route, wait for its exhibits, hand back figures (SVG/PNG) and tables
    codeRunner.ts     run_code in a Web Worker with no network
    world.ts          World from the data store (scan registry fallback for old snapshots)
    ollama.ts         ModelClient over AskService (Go), streamed; reply capped at 2,048 tokens
    viewContext.ts    what a view shows, captured at ⌘J (tables, legends, and figures as PNG for vision models)
    toReport.ts       evidence → report cells (views become figure slots the report fills itself)
  components/         AskThreads, AskTurn, AskProse, AskEvidence (+ EvTangle, EvGraph, EvFigures, EvView),
                      AskComposer, AskInspector, AskWriteUp, AskLauncher (⌘J; the stage's door)
  testing/            sqliteWorld, nodeOllama, ask.eval.test.ts (the benchmark)
platform/stage.ts     ?askStage=<scan>: the stage reads only that snapshot and writes nothing
pages/views/ask.vue   the view
scripts/ask-mcp.ts    the MCP server (stdio)
scripts/ask-harvest.mjs  cookbook candidates from the app's own SQL
app/ask/ollama.go     Go transport to Ollama (chat, models, embed); AskService in app/services.go
```

## MCP: the same tools in Claude Code

```bash
claude mcp add archstats -- npx --prefix /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend vite-node --config /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/vitest.config.ts /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/scripts/ask-mcp.ts -- --workspace BroadleafCommerce
```

24 read-only tools (the view and conversation tools need the app), the six playbooks as prompts, and the snapshot card as a resource. `--db <file>` serves any snapshot.

## Iterating

| To change | Edit | Check with |
|---|---|---|
| What it says, how it works | `engine/prompt.ts` | Trace → system prompt; the benchmark |
| What it can answer | `knowledge/capabilities.ts` (add an entry: asks, how, tools, view, needs, traps) | `engine.test.ts` capability search |
| A common question with a known answer | `knowledge/cookbook.ts` (a recipe) | `tools.snapshot.test.ts` runs every recipe on real snapshots |
| A new ability | a tool in `tools/*.ts` + its evidence kind in `engine/types.ts` + a renderer in `AskEvidence.vue` + its report mapping in `toReport.ts` | `tools.snapshot.test.ts` |
| Which tools a question gets | `engine/route.ts` | Trace → Route |
| When it may say "cannot", unsourced numbers, verdicts | `engine/checks.ts` | `engine.test.ts` |

Commands (from `frontend/`):

```bash
# unit tests: engine, checks, routing, capabilities, cookbook binding, the loop with a scripted model
npx vitest run src/features/ask

# every tool and recipe against real snapshots
ASK_SNAPS="/path/a.db:/path/b.db" npx vitest run src/features/ask/tools

# the benchmark: 10 questions × snapshots, a real local model, a JSON scorecard (ASK_CASES=4,5 for some)
ASK_EVAL=1 ASK_MODEL=qwen3-vl:30b ASK_SNAPS="/path/a.db" npx vitest run src/features/ask/testing/ask.eval.test.ts
```

Snapshots live in `~/Library/Application Support/archstats/scans/<workspace>/<scan>.db`.

## Where it stands (2026-09-30, after the overnight loop)

**Benchmark (qwen3.6:35b-a3b, Elepy + archstats-ui, 13 questions each):** 19 → 22 → 24 → 26 of 26 across harness rounds, with the same model throughout. Answers take 2–36 s. Model comparison, final harness, same 26 questions:

| Model | First run | Final | Median answer | Slowest |
|---|---|---|---|---|
| qwen3.6:35b-a3b (default) | 19/26 | 25/26 (26/26 the run before) | 4 s | 35 s |
| qwen3-vl:30b | 16/26 | 24/26 | 30 s | 59 s |
| gemma4:26b | 17/26 | 23/26 | 4 s | 19 s |

The gains are the harness, not the models: every model improved by 6 to 8 questions.

**What the loop fixed, round by round (Sonnet QA with screenshots, five rounds):**
- **Layering** read one floor ("com") holding the whole backend and called it clean. Areas are now cut per naming style and split until no floor holds most of the code; the tool states which tangles hide inside or across floors.
- **Write-up crashed** (section indices shifted when evidence was inserted), dumped unrelated evidence, spelled numbers as words, and left figure slots empty. Now: sections by reference, at most two relevant evidence cells per section, digits enforced and unsourced sentences dropped, and every figure slot filled from its view by the stage (or labelled with why it could not be).
- **Answers from the wrong snapshot:** the backend's globally open snapshot can belong to another workspace (the native window switched). Ask now queries its own scan by id.
- **Empty answers** after many tool calls, **scrambled** repairs, **"You're right"** replies to automatic checks, **menus** instead of answers, **invented file names**, **assumed "intended" designs**: each has a check, a repair or a deterministic fix, and a test.
- **Views:** figure requests draw figures (layers, mass, untangle, knowledge map); views Ask points at are previewed from the real view; empty views say why (the snapshot's analysis revision).
- **Layout:** container queries make the inspector and rail drawers with a backdrop below 1180 / 900 px.

**Traps for whoever tests it next:**
- **Native window vs browser pane:** in the native Wails webview, an iframe cannot get Go call results (they are delivered to the main frame only). The stage borrows the main frame's `window.go`. Anything tested only in the dev browser pane can hide this class of bug, so check previews in the native window.
- Never run the benchmark while a QA agent is using Ollama: requests queue and time out.
- After a `wails dev` Go rebuild, the browser pane's IPC socket dies (`reading 'send'` of null): reload the pane.
- The BroadleafCommerce snapshot in the app is analysis revision 0: Deployables and file roles are empty there by design.
- QA left reports in the Broadleaf workspace ("Ask: …", "Architecture review: BroadleafCommerce" written by Ask, "Modularizing…", "Load-bearing…"); delete freely.

## Lessons from the first version (all handled here)

- A conversation must be fenced to one snapshot: history leaked Broadleaf names into archstats-ui.
- "Add to report" must only ever write to the conversation's own report, never `reports.currentId`.
- The number audit must skip HTML entities (`&#39;`), code and evidence ids, and count every earlier turn's evidence.
- Answers that give up are checked against the capability map and sent back once.
- Ollama sometimes fails to parse a local model's tool call: the step is retried (twice at most).

## Next (what is left)

- **Cookbook:** 11 of the 80 runnable harvested queries became recipes; `scripts/ask-harvest.mjs` lists the rest as candidates.
- **Vision:** pictures from ⌘J reach vision models (qwen3.6, gemma4, qwen3-vl); `look_at_view` could also attach the figure it took.
- **The global open snapshot** is still shared app-wide (a separate, older trap); Ask no longer depends on it, the views still do.
- **MCP over the live app** (the view tools) would need the stdio server to reach the running window; today it serves the 24 headless tools.
