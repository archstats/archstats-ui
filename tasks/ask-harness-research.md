# Ask: a harness that works like an architect

2026-09-29. Research and design for the second version of the Ask pane. The first version (`features/ask/`, uncommitted) proved the pieces work end to end, but it is thin. Ryan's words: *the tooling needs to know what is possible, what the common queries are, what the content of a file may be. It needs to function like the architect.*

The companion document is `tasks/ai-integration-research.md`: the insight ladder, MCP and the report flows. This document covers the harness and the views.

---

## 1. What the first version got wrong

From a real session on archstats-ui (screenshot, 2026-09-29):

| Symptom | Cause | Class |
|---|---|---|
| "What is the smallest cycle?" gets "the scan cannot show this", with 0 tool calls | No tool lists cycles across the codebase. Nothing makes the model try `sql` before giving up | **Tooling depth** + **loop policy** |
| It suggests `org.broadleafcommerce…` while archstats-ui is open | The conversation carried Broadleaf history into another workspace | **Context hygiene** (fixed: a notice fences each snapshot) |
| `you&#39;d` rendered broken | The number audit split an HTML entity | Rendering (fixed) |
| `E1` shown as missing; `6` flagged as unsourced | The audit and citations looked at the current turn only | Rendering (fixed) |
| The model knows 9 tool names and nothing else | No map of what Archstats can answer, no example queries, no access to code | **Knowledge** |

The last row is Ryan's point. An architect sitting in front of Archstats knows three things the model does not:
1. **What the tool can tell them**, and which view answers which question.
2. **How to ask it**: the queries and readings they would reach for.
3. **What the code says**, when the numbers raise a question.

---

## 2. What the research says

The sources are listed at the end. Each finding below is followed by what it means for Ask.

**Tools are an interface for a model, not an API wrapper** (Anthropic, *Writing effective tools for agents*):
- Choose few, consolidated tools that match tasks, not endpoints.
- Namespace them (`graph.path`, `cycles.list`).
- Return meaningful, token-efficient context with a `response_format: concise | detailed` switch, sensible pagination and truncation.
- Write errors that say what to do next.
- Evaluate tools with agents, on real tasks.

→ Today's `rank`, `component` and `cycles` are the right shape, but far too few. `sql` is a trapdoor with no guide.

**Context is a budget** (Anthropic, *Effective context engineering*). Load a small stable core up front. Fetch the rest just in time through lightweight references: ids, paths, stored queries. Compact old turns, keep structured notes, and give long investigations to sub-agents with clean context.

→ A 32k local context cannot hold the schema and 516 queries. Ask needs a **retrievable** knowledge layer and **evidence handles** (`E7`), not pasted tables.

**Accuracy on data questions comes from curated context, not a bigger model** (Databricks Genie):
- *Instructions:* the business rules.
- *Trusted assets:* verified SQL and functions that answer anticipated questions, marked as verified in the answer.
- *Benchmarks:* questions with gold SQL, run on every change.

→ Archstats already has all three unlabelled:
- instructions: the data-audit traps and the metric definitions;
- trusted assets: readings, template SQL, and the views' own queries;
- benchmarks: ui-dogfood keys, report-qa.

**Models write code better than they chain tool calls** (Cloudflare *Code Mode*; Anthropic *programmatic tool calling* and *code execution with MCP*). Expose tools as a typed API, let the model write a short program against it in a sandbox, and return only the result. The reported gains are large on multi-step work: Cloudflare cites 32% fewer tokens on simple tasks and 81% fewer on batch work.

→ "The smallest cycle, its members and the imports that close it" is three lookups and a sort. As code it is one step; as tool calls it is four round trips through a 30B model.

**Tool examples beat long descriptions** (Anthropic, *Tool use examples*). Concrete example calls attached to a tool raised parameter accuracy from 72% to 90% in Anthropic's tests. **Tool search** loads tool definitions on demand instead of all of them up front.

→ Local models degrade as the tool list grows. The common advice is "keep the tool list short; put the effort in descriptions". So show a **small, intent-routed toolset**, each tool carrying examples.

**Generative UI is a registry, not free-form HTML** (Vercel AI SDK tool parts; CopilotKit `useCopilotAction` render and `useCopilotReadable`; AG-UI):
- The developer pre-registers components, and the agent picks one and fills it.
- The app exposes its state as *readables* and its operations as *actions*.
- Tool parts carry states (input available, running, output, error), and writes carry `needsApproval`.

→ This is how existing views plug in (section 5).

**Local models, 2026.** The Qwen3 family has the most dependable tool calling locally. Gemma 4 26B has native tool calling and vision, and so does qwen3-vl, which is already installed. Qwen3.6-35B-A3B is reported as the best all-round model for 32 GB+ machines. Thinking mode can swallow tool calls into the reasoning channel, so keep it off inside the tool loop and use it only for planning.

---

## 3. Knowledge: what the architect knows

Five stores, all generated from what the app already holds. The model sees a one-screen **core** every turn and fetches the rest by tool.

### 3.1 Capability map: "what can Archstats tell me?"

A catalogue of questions Archstats can answer. Each entry has:
- the question in plain words, with variants ("what depends on X", "blast radius", "who uses X");
- **how to answer it**: which tool or reading, which view shows it, and which exhibit to show;
- **when it cannot**: needs git, needs units, needs a lens, Java only, a revision floor;
- **traps** for that question.

Built from sources that already exist:
- the views catalogue (`VIEWS` in `routes.ts`, one-line purpose each);
- the exhibit judgements in memory (which figure reads at which size);
- the readings (`READINGS`: 16 computed paragraphs with `describe`);
- the metric definitions;
- the data-audit traps.

About 60–100 entries. The **core** carries the headings (the 12 families of question) and the "cannot" rules. Entries are fetched with `capabilities.search("blast radius")`.

This makes giving up a checked act. When the model says "the scan cannot show this", the harness looks the question up in the map. If an entry answers it, the model is sent back with that entry.

### 3.2 Query cookbook: "the common queries"

Trusted, parameterised queries harvested from the app. There are **516 SELECT statements in 84 source files**: views, readings, templates, checks, git and trends. Each entry holds:
- `id`, a question, params, the SQL, the columns it returns and what they mean;
- `source` (the file and view it came from);
- `verified: true` for entries whose results the views or tests already assert.

Retrieved by similarity. `nomic-embed-text` is installed locally, so there are no new dependencies and no network. The top 3 matches go to the model as few-shot examples when it writes SQL, and the matching entry runs directly when it fits. Answers from a cookbook entry are tagged **verified query**, which is Genie's trusted-asset mark.

The cookbook is also the benchmark seed: each entry's question plus its SQL is a gold pair.

### 3.3 Snapshot card: "what is this codebase?"

A one-screen brief generated per snapshot, cached like the readings. It holds:
- scope and ignore globs;
- languages and extensions;
- size;
- the top-level shape: roots, the largest components, entry points, test and production split;
- tangles;
- git span and authors (pseudonymised);
- what is **absent** (no git, no units, revision below N).

It comes from `snapshotInfo`, the `summary` table and the size/history/structure readings. It sits in the core, so the model never starts from zero, and it is what stops cross-workspace mistakes like the Broadleaf one.

### 3.4 Code access: "what a file says"

The snapshot keeps the code, and the tools ignore it. What the snapshot has:
- `file_contents`: the full source of every file (441 in elepy);
- `snippets`: 6,437 positioned facts in elepy, including class, method and field declarations, imports (raw and resolved), `implements` and `extends`, annotations, and JS/TS declaration spans;
- `units` and `unit_connections`: a class- or module-level graph with the file on each side;
- files with role (production / test / generated / third-party), metrics, git and health.

Tools an architect would use:
- `file.outline(path)`: role, size, health, churn, then its declarations in order (from snippets, with line numbers), imports in and out, and the component it belongs to. This is how an architect skims a file without reading it.
- `file.read(path, from?, to?)`: numbered lines, in 200-line windows. Reading is explicit and paged, never dumped.
- `code.find(text | regex)`: `FindInCode` and `FindLines`, which exist in Go.
- `unit.of(name)` / `unit.edges(name)`: who uses this class, and through which file.

With these, "why does `web` depend on `util`?" is answered from the import lines, not guessed. The cycles cut plan already resolves to `file:line`.

Privacy: code reaching the model follows the "what leaves the machine" setting from the integration doc. With Ollama nothing leaves, so source is on by default locally.

### 3.5 Workspace memory: "what the team told me"

Notes the architect has given: intent, scope and names ("billing" = these packages). They are kept per workspace in `app.db`, listed and editable. Groups, lenses and declared dependencies are the structured form of the same memory, and the model reads them through `workspace.*` tools.

---

## 4. Tools: deeper, namespaced, few at a time

### 4.1 The set

About 30 tools in 9 namespaces. The model never sees all of them at once (section 4.2).

| Namespace | Tools | Answers |
|---|---|---|
| `snapshot` | `card`, `schema.search(term)`, `capabilities.search(question)` | orientation; what exists; what is possible |
| `components` | `get`, `find`, `rank(metric, filter?, response_format)`, `compare(a, b)` | the component reading, rankings |
| `graph` | `focus(line)`: the app's own query language through `parseQuery`/`runQuery` (`around X depth 2`, `dependents of X depth all`, `path from A to B`, `between A and B`, `tangle of X`); `levels()` | blast radius, paths, layering |
| `cycles` | `list(sort: size ↑↓, involving?, limit)`, `tangles()`, `cuts(component \| tangle)` | the question the screenshot failed |
| `files` | `rank`, `of(component)`, `outline(path)`, `read(path, range)`, `find(text)` | code-level evidence |
| `history` | `activity(period)`, `cochange(entity)`, `knowledge(entity)`, `fixes(entity)` | churn, hidden coupling, bus factor |
| `workspace` | `groups()`, `lens(name)`, `rules.check()`, `changes(baseline)` | declared intent against actual |
| `query` | `cookbook.search(q)`, `cookbook.run(id, params)`, `sql(q)`: raw, read-only, last resort | anything else, verified first |
| `view` | `here()`, `read(route \| exhibit)`, `show(...)`, `act(action, args)` | the views (section 5) |

Every tool follows the same rules:
- `response_format` is concise by default and detailed when asked.
- Every row set is capped, and says how many rows there were in total.
- Errors say what to try next ("No component `web`; did you mean `common.web`, `admin.web`?").
- One or two example calls sit in the description.
- The result carries evidence (E-ids) and an optional report cell, as today.

### 4.2 Routing: a short list per question

A local model with 30 tools picks badly. Each turn:

1. **Route.** A cheap classification labels the question with one to three namespaces, using the same model with a JSON schema through Ollama's `format`, and no tools. Example: "smallest cycle" → `cycles`, `files`.
2. **Load.** The loop offers `snapshot.*`, `query.*` and the routed namespaces, which comes to 8–12 tools. `snapshot.capabilities.search` is always present, so a wrong route can recover.
3. **View-scoped tools.** The view on screen adds its own actions (section 5.2).

This is Anthropic's tool search applied to a local model.

### 4.3 Code mode: the escape hatch that scales

One more tool, **`run(code)`**. The model writes a short JavaScript function against a typed read-only API:

```ts
// the model writes:
const cs = await cycles.list({ sort: "size", limit: 1 })
const c = cs[0]
return { members: c.nodes, closing: await graph.edges(c.nodes), files: await files.of(c.nodes[0]) }
```

- **Where it runs:** in a Web Worker with no DOM, no network (CSP) and no writes. The API is proxied to the main thread over `postMessage`. Time and row limits apply.
- **What the model sees:** the type declarations for the API, generated from the tool registry (about 2k tokens, loaded only when the router picks `run`).
- **Output:** only the returned value goes back to the model.
- **Why:** multi-step questions take one model turn instead of four. That matters most on a local model, where every round trip costs 5–15 seconds.
- **Open question:** whether qwen3-vl:30b writes this reliably, or a coder model such as qwen3-coder:30b is needed. Measure it (section 7) before shipping it as the default.

### 4.4 The loop: an architect's method, not a chatbot's

```
question
  → route (namespaces)                           cheap, no tools
  → plan: 1–4 steps or claims to test            only when the question is broad; shown as a checklist
  → act: tool calls / run(code)                  up to N steps, parallel where independent
  → answer draft
  → checks (no model):
       every number traced to evidence?                  number audit
       gave up with 0 tools, or said "cannot"?           capability map lookup
       cited ids exist?                                  citation check
       verdict words without evidence?                   lexicon
  → one repair turn if a check fails, telling the model exactly what failed
  → answer + evidence + "what I could not check"
```

- **Evaluator step.** The checks are cheap and deterministic, and at most one repair turn follows. This is the evaluator–optimizer pattern from *Building effective agents*, done without a second model.
- **Plan step for broad questions.** "Is this codebase well layered?" becomes three to five claims with predictions, following the persona arc from `PERSONAS.md`. The checklist renders in the pane and ticks as each claim is tested.
- **Budget.** The pane shows steps, tokens and time. A cap stops the loop and asks.
- **Compaction.** When history goes over about 60% of `num_ctx`, older tool results collapse to one line each ("E4: component `common.web`: 94 dependents, 185 commits"). The E-id stays, so the model can fetch the full result again with `evidence.get(E4)`.
- **Snapshot fence.** One conversation is bound to one scan (built into v1).
- **Traces.** Each turn is written as JSONL in the app-data folder: messages, routes, tool calls with timings, check results. A "Trace" link opens it. This is what makes tuning possible.

### 4.5 Structure in code

The loop must run outside the pane, so it can be evaluated headless:

```
features/ask/
  engine/      loop.ts, route.ts, plan.ts, checks.ts, compact.ts, trace.ts   ← pure; model + tools injected
  knowledge/   capabilities.ts, cookbook.ts (+ build script), card.ts, embed.ts
  tools/       snapshot.ts, components.ts, graph.ts, cycles.ts, files.ts, history.ts, workspace.ts, query.ts, view.ts, run.ts
  ui/          AskPane.vue, parts/ (one renderer per evidence kind), registry.ts
  model/       ollama.ts (now), anthropic.ts (later)
```

The engine takes `{ model, tools, knowledge }`. The pane gives it the app's stores. The eval runner gives it a snapshot opened with `node:sqlite`, which Vitest already does for the sandbox parity tests, and Ollama over HTTP.

---

## 5. Integrating the existing views

Five ways, from cheapest to deepest. They are complementary.

### 5.1 The view says what it shows: readables

Each view registers what it shows, in words and data, while it is mounted. This is CopilotKit's `useCopilotReadable`:

```ts
useAskReadable(() => ({
  view: "Cycles of common.web",
  state: { selectedCut: "common → common.web", facet: "production" },
  summary: "82 cycles; the plan's first 3 cuts break 59",
}))
```

Most of it can be **derived without touching each view**. The exportables registry already knows every mounted table (`rows()`, `columns()`, `notes()`) and figure (`legend()`, `render()`). Add to that the route, the focus, the selection (`?hl=`), the lens and the facet. That gives `view.here()`:

> "On screen: *Where to cut* (12 rows: …), figure *Cycle map* (legend: …), focus `tangle of common.web`, 2 selected."

"What am I looking at?" and "Explain this figure" then work in every view from day one. Hand-written readables are added only where a view has state the registry cannot see.

### 5.2 The view offers its actions

Each view registers the operations the assistant may perform: select, sort, switch tab, set the facet, set the focus, choose a lens. This is `useCopilotAction`. They show up as `view.act` options **only while that view is on screen**, which is the view-scoped part of the routing in 4.2.

Many already exist as command ids (`platform/commands.ts`) and scope-store actions (`setFocus`, `setFacet`, `setGroup`). Those that move or change something are proposals (a button), following the "click selects, never navigates" rule. Tour mode lets them run.

### 5.3 The views as data sources: `view.read`

`view.read(route, exhibit?)` opens a view, waits for its exportables to be ready, and returns the table rows (capped) plus the figure's legend and SVG. `useSlotTaking` already does exactly this for report templates: open the route, set the facet, wait until settled, `pickFor(take)`.

This turns **every view with a registered table into a tool** with no new code per view. That is dozens of views, from Knowledge to Units to Deployables.

There are two ways to run it:
- **In the main view, when the user has asked for it** (Tour or "show me"). Cheap, and the person watches.
- **On a hidden stage:** a second copy of the frontend in an iframe, with its own Pinia. This needs per-client snapshot handles in the Go query service, because `Open()` is global today. It is the right end state.

### 5.4 The real figure in the chat: generative UI

A registry maps each evidence kind to a Vue renderer, as `AskEvidence.vue` does today, but backed by the **real figure components** wherever they take props. Whether a figure can move into the chat depends on its inputs:

| Class | What it means | How it gets into the chat |
|---|---|---|
| A: props only | The figure takes its data as props | Mount it in the chat with the tool's data, at pane width |
| B: reads one or two stores for data | Data could be passed in instead | A thin adapter component passes the tool's data as props |
| C: bound to a page, route or global scope | Cannot be mounted alone | Rendered on the stage to SVG through `render()`, shown as a static figure with "Open in view" |

The inventory of which figures fall in which class is in section 5.6. Clicks inside an embedded figure **select**. The selection becomes the next turn's context ("why is this one here?").

### 5.5 The model sees the figure: vision

qwen3-vl and gemma4 are multimodal and already installed. For "explain this figure", the harness attaches:
1. the figure's **data and legend** (exact, and the only source of numbers);
2. its **PNG** from `render()`, for the overall shape ("block-triangular with three back-edges").

Both stay local.

### 5.6 Inventory (survey, 2026-09-29)

**Most figures can go into the chat as they are.** Of 33 figure and table components that register exportables:

| Class | Count | Components |
|---|---|---|
| **A: props only** | 26 | ConnectionsChord, ConnectionsGraph, ConnectionsMatrix, TangleGraph, TangleMatrix, StackDiagram, FolderMap, FocusMap, EvidenceMap, BoundaryFlow, LaneFlow, RelationshipView, ShapeLanding, SystemMap, ShipBoard, ComponentWiringGraph, ClassNeighbourhoodGraph, GitActivityChart, MonthlyChangesChart, ResultChart, … |
| **B: one or two stores**, mostly for labels | 8 | ConnectionsList, KnowledgeMap, KnowledgeView, ComponentPlotterDiagram (the main sequence), HotspotsTreemap, MetricMatrix, MetricProfiles, MetricStrips, ElementTable |
| **C: view-bound** | 5 | ChangeBreadth, EffortShare, WorkNow (Activity), DirectoryTree, ComponentWiring |

So the cycle map, tangle matrix, coupling chord/graph/matrix, layer stack, folder map and boundary flow can be **the chat's figures**, fed by the same tools. The mini cycle ring in v1 should be replaced by `TangleGraph` with the cut plan: the real Cycles picture, in the chat.

**The query language runs without a view.** `features/groups/query.ts` has `parseQuery` and `runQuery(query, world)`. They are pure and evaluate graph lines (`around`, `path`, `between`, `tangle of`, `dependents of … depth all`), globs and `where` conditions over `{components, files, edges, contains}`, using `features/navigation/focus.ts`. `graph.focus` should be a thin wrapper over them: the model then speaks the same language as the Query bar, and every answer can hand its focus to the views.

**View state lives in the URL.** Every page keeps its state in `route.query`: `grain`, `preset`, `q`, `layout`, `tab`, `dir`, `pair`, `roots`, `component`, `with`. So `view.show` can land on an exact state with no view-specific code. A per-view list of those keys is the whole "action" surface for most views.

**The registry can be called from outside.** Table `rows()`/`columns()` and figure `render()`/`legend()` are plain functions, callable from outside while the view is mounted. The Export menu, `useSlotTaking` and `scripts/figure-check.mjs` already do it. In dev, `window.__archstatsExportables()` exposes the registry. `useSlotTaking` is the working "open a view, wait for ready, settle, take" loop. It navigates for real, which is why the stage (a second frontend) is the step that makes `view.read` invisible.

---

## 6. What an answer looks like afterwards

"What is the smallest cycle?" on archstats-ui:

1. Route: `cycles`, `files`.
2. `cycles.list({ sort: "size", limit: 3 })` → E1: three 2-cycles, including `features/sql ↔ features/reports`.
3. `graph.edges(["features/sql", "features/reports"])` → E2: the two imports, with `file:line`.
4. `files.outline("features/sql/…")` → E3: the declaration that imports reports.
5. Answer: "The smallest cycles are mutual pairs (2 components). The one that matters is `sql ↔ reports`: `ResultChart.vue:14` imports `figureHandoff` from reports, and reports imports the console store back [E1][E2][E3]. Moving `figureHandoff` to `export` breaks it."

The answer comes with a cycle-map card, a **Show in Cycles** button and a **Pin as claim** button.

The checks then run: all numbers are sourced, all citations exist, and it did not give up. The trace records two routes, three tools, 14 seconds and 6k tokens.

---

## 7. Measuring it

A benchmark per snapshot, each question with a gold answer or gold SQL. Sources:
- **The cookbook.** Each entry's question plus its SQL is a gold pair.
- **The trap suite.** Questions whose naive answer is wrong: afferent vs dependents (1,405 vs 443 on Sylius), `cycles__short__count`, health before revision 2.
- **"Cannot" questions.** Questions the scan truly cannot answer, where the right answer is "can't tell" and why.
- **ui-dogfood scenarios 01–07,** with answer keys.

**Metrics per run:**
- answer correct (a numeric match, or a judge against the key);
- right tool or reading chosen;
- rate of unsourced numbers;
- rate of giving up;
- steps, tokens and seconds.

**The runner** calls the engine with `node:sqlite` and Ollama from Vitest, opt-in the way `SNAPS=` is. Each run writes a scorecard. Every harness change is measured against it: routing, code mode, models, prompt edits.

**Models to compare** on it:
- qwen3-vl:30b (current default);
- gemma4:26b;
- qwen3.6:35b-a3b (pull it);
- qwen3-coder:30b for code mode.

---

## 8. Build order

| Step | What | Why first | Size |
|---|---|---|---|
| 1 | Split `engine/` from the pane; traces; benchmark runner with 30 questions on elepy and archstats-ui | Nothing else can be judged without it | 2–3 days |
| 2 | Knowledge core: snapshot card, capability map, traps; checks and one repair turn | Fixes the screenshot's class of failure | 2–3 days |
| 3 | Tools: `cycles.list/tangles`, `graph.focus`, `files.outline/read/find`, `history.cochange/knowledge`, namespaced, examples, `response_format` | Depth | 3–4 days |
| 4 | Routing to 8–12 tools per turn | Local model accuracy | 1–2 days |
| 5 | Cookbook: harvest script over the 516 queries, embeddings with nomic-embed-text, `cookbook.search/run`, a "verified query" tag | Common queries, trusted | 3 days |
| 6 | `view.here` from the exportables registry; view-scoped actions | The views join the conversation | 2–3 days |
| 7 | Real figure components in the chat (class A/B); vision for "explain this figure" | Crown jewels in the chat | 3–5 days |
| 8 | `run(code)` in a Worker, measured against tool calls | Multi-step speed | 3 days, if the eval says so |
| 9 | Stage iframe + per-client query handles; `view.read` for every view | Every view becomes a tool | 1 week |

## Sources

- Anthropic: [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)
- Code mode: [Cloudflare codemode](https://github.com/cloudflare/agents/tree/main/packages/codemode), [token numbers (WorkOS)](https://workos.com/blog/cloudflare-code-mode-cuts-token-usage-by-81)
- Genie: [Tune Genie quality](https://docs.databricks.com/aws/en/genie-agents/tune-quality), [Genie concepts](https://docs.databricks.com/aws/en/genie-agents/concepts)
- Generative UI: [AI SDK generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces), [AI SDK 6 (tool approval)](https://vercel.com/blog/ai-sdk-6), [CopilotKit useCopilotReadable](https://docs.copilotkit.ai/reference/hooks/useCopilotReadable)
- Local models: [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling), [Local models for function calling](https://insiderllm.com/guides/function-calling-local-llms/), [Best local models for tool calling 2026](https://www.promptquorum.com/power-local-llm/best-local-models-tool-calling-2026)
