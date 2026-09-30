# Ask, rethought from scratch

2026-09-30. A design proposal, not built. It covers:

- tool use;
- the Claude Messages API;
- Google's A2UI;
- how snippets, widgets (views) and features should face a chat;
- owning the message format.

It builds on `ask.md`, `ask-harness-research.md` and `ai-integration-research.md`.

## 1. What the current build taught us

The demo works: 25/26 on the eval with qwen3.6. Its weak spots, though, all come from one design mistake: **four different things share one shape.**

| Concern | Today | Consequence |
|---|---|---|
| Provider wire format | Ollama `{role, content, tool_calls}` messages are the transcript | Adding Claude means a second loop or lossy mapping; thinking blocks, tool ids and citations have no place to live |
| Transcript | a JSON blob under the state key `ask.threads`, rewritten on every step | no branching; repairs, the apology strip and the marker strip **edit history** (a 400 on Claude models with preserved thinking, see §4.4) |
| UI | 13 evidence kinds (`bars`, `tangle`, `layers`, …), each with an `Ev*` component, each redrawing what a view already draws | drift from the real figures; for anything else we boot the whole app in a hidden iframe (`stage.ts`), which is slow (~3 s), fragile, and broken in the native WebKit window |
| Output | reports have their own cell model (`CellSpec`); `toReport.ts` translates evidence into it, and slots are filled by screenshotting the stage | two evidence models, and a screenshot pipeline to bridge them |

The stage iframe tells you what is wrong. The chat has no way to draw a real figure except to become the app. The fix is not a better iframe. The chat and the report need to be able to **ask a feature for its figure by name and parameters** without mounting its page.

The good news: most figure components are already props-only.

- `StackDiagram` takes `floors`, `flows`, `selected`, `ariaLabel` and `figure`.
- `TangleGraph`, `ConnectionsMatrix` and `HotspotsTreemap` are the same.
- The data logic that makes those props lives in pages and stores, not in the figures.

So the gap is small and well-defined.

## 2. The thesis

> **The model names; the app computes; one catalog renders everywhere.**

1. **One owned message format.** It is provider-neutral, append-only, and versioned. Claude and Ollama are adapters that project it into their wire formats. (§3 answers "how do we own the messaging".)
2. **One exhibit catalog.** Every figure and table that archstats can draw is registered once. Each entry has:
   - a typed parameter schema;
   - a pure resolver (params + snapshot → props);
   - the existing props-only component;
   - a text summary made from the same props.

   The chat, reports, views, the export menu and MCP all render from it. This is A2UI's catalog idea at the right granularity (§5).
3. **Tools return exhibits, not prose and pictures.** The model sees the summary text; the user sees the real figure. Because both come from one props object, they cannot disagree, and the model never types a number into a chart.
4. **The model lays out its answer in Markdown.** It places a figure with an embed line, `![caption](exhibit:E3)`, and refers to one with a citation `[E3]`. Evidence it looked at but did not place or cite stays in the trace. No `show` tool is needed to feature a figure (§8.1).
5. **Actions are typed, with effect levels.**
   - Reading is free.
   - Navigating happens when the user clicks.
   - Changing things (a group, a report, a pin, a rule) is a proposal the user approves in the message.

## 3. Owning the messaging: the format

### 3.1 Principles

- **Our format is the source of truth. Provider formats are projections.** We never store Ollama or Claude messages as the transcript. We store ours and project it per request (§3.4).
- **Lossless round-trip for provider-opaque data.** Claude thinking blocks must be passed back unchanged, with their signature. We keep them opaque inside our part (`providerMeta`) rather than dropping them.
- **Append-only.** History is never rewritten. A repaired answer is a new message on a branch, and a display fix is a render-time transform. This is what makes replay, evals, branching and Claude's preserved thinking work.
- **Three projections of one log:**
  - **store**: full fidelity;
  - **UI**: parts, with exhibits resolved;
  - **model**: per provider, with display data stripped.

  The model never sees display data. The UI never sees prompt scaffolding.
- **The shape converges with the industry.** Claude content blocks and the Vercel AI SDK `UIMessage.parts` both arrived at "a message is a list of typed parts, and a tool call is a part with a lifecycle". We copy that shape and add the domain parts neither has: exhibit, proposal, action, attachment.
- **Versioned.** Every thread carries `v`, and a migration function upgrades old threads on read.

### 3.2 Types

```ts
interface Thread {
  v: 1
  id: string                    // ULID
  workspaceId: string
  scanId: string                // pinned: every answer is about this snapshot
  title: string
  head: string                  // id of the latest message on the active branch
  createdAt: string
}

interface Message {
  id: string
  parentId: string | null       // edits and retries branch instead of overwriting
  role: "user" | "assistant"
  parts: Part[]
  status: "streaming" | "done" | "stopped" | "error"
  model?: { provider: "claude" | "ollama"; id: string; profile: HarnessProfile }
  usage?: { input: number; output: number; cacheRead?: number; ms: number }
  createdAt: string
}

type Part =
  // prose. Markdown; [E3] cites an exhibit; entity names are linked at render time.
  | { type: "text"; text: string }
  // the model's reasoning. `providerMeta` keeps Claude's signed block for round-trip.
  | { type: "reasoning"; text: string; providerMeta?: unknown }
  // a tool call with its lifecycle. `result.text` is what the model saw.
  | { type: "tool"; callId: string; name: string; input: unknown
      state: "input-streaming" | "running" | "done" | "error"
      result?: { text: string; exhibits: string[]; isError?: boolean } }
  // a figure or table, by spec. Data resolves locally; `frozen` pins it for reports.
  | { type: "exhibit"; id: string; spec: ExhibitSpec; title: string; ranOn: RanOn
      frozen?: { propsHash: string; props?: unknown } }
  // user-side context: the view on screen, a selection, an exhibit, a file
  | { type: "attachment"; kind: "view" | "selection" | "exhibit" | "file"; spec?: ExhibitSpec; label: string; summary: string }
  // the model asks; the user picks. The answer is filled in on the same part.
  | { type: "choice"; callId: string; question: string; options: Array<{ id: string; label: string }>; answer?: string }
  // a change the model proposes; the user approves in place
  | { type: "proposal"; callId: string; action: ActionCall; summary: string
      status: "pending" | "approved" | "rejected" | "applied" | "failed"; result?: string }
  // the user acted on a widget (A2UI's action): "Ask about checkout" clicked in E3
  | { type: "action"; name: string; source?: { exhibit: string; element?: string }; context: Record<string, unknown> }
  // harness notes: checks, budget, compaction. Shown quietly; never written by the model.
  | { type: "notice"; kind: "check" | "budget" | "compacted" | "stale-snapshot"; text: string }

interface ExhibitSpec { kind: string; params: Record<string, unknown>; v?: number }
interface ActionCall { id: string; args: Record<string, unknown> }   // a typed app action (§6.3)
```

### 3.3 Storage: an event log, folded into messages

Replace the `ask.threads` state blob with two tables in `app.db`, owned by Go and exposed through `AskService`:

```sql
CREATE TABLE ask_threads (id TEXT PRIMARY KEY, workspace_id TEXT, scan_id TEXT, title TEXT, head TEXT, v INT, created_at TEXT, updated_at TEXT);
CREATE TABLE ask_events  (thread_id TEXT, seq INT, message_id TEXT, at TEXT, type TEXT, payload TEXT, PRIMARY KEY (thread_id, seq));
-- type: message.created | part.appended | part.updated | message.finished
```

- Token deltas are **not** persisted. They stream over Wails events, and a finished part is written once. A crash mid-stream leaves a `streaming` message, which is shown as "stopped" on reload (the behaviour today, but now by design).
- `messages = fold(events)`. Retry, edit and branch are new events, so nothing is lost and "compare with the previous answer" becomes possible.
- **The event log is the eval corpus.** Any real conversation can be replayed against a new prompt, model or harness profile. The current `ASK_EVAL` cases become a seed; saved threads grow it.
- Export: a thread exports as JSON (the events), or as Markdown with `archstats` fences, the report's own round-trip format (§7).

### 3.4 Projections

| Our part | Claude (Messages API) | Ollama `/api/chat` | UI |
|---|---|---|---|
| `text` | `text` block | `content` | Markdown; cites become exhibit anchors; entity chips |
| `reasoning` | `thinking` block, `providerMeta` replayed unchanged (same model only) | `thinking` (dropped on replay) | collapsed "Thought for 4 s" |
| `tool` | assistant `tool_use` + a user `tool_result` (**all results of one step in one user message**) | `tool_calls` + `role: "tool"` | a trace row: label, clock, exhibits |
| `exhibit` | nothing; its summary is already in the `tool_result` | same | the real figure from the catalog |
| `attachment` | user text `<context kind="view">summary</context>` plus an image only when it helps (vision) | same, as text | a chip above the message |
| `choice` answer | `tool_result` of the `ask_user` call | `role: "tool"` | buttons, then the chosen one |
| `proposal` | `tool_result` of the call ("approved and applied: …" / "rejected") | same | an approve card with a diff/preview |
| `action` | user text: "[Clicked 'Ask about checkout' on E3]" | same | a small "you asked about…" line |
| `notice` (check) | a **mid-conversation system message** (Opus 5 / Fable 5.x; not Sonnet 5), `clear_at: "next_user_message"` where available | a user message marked automatic | a quiet line, or nothing |

A projection is a pure function `(thread, profile) → provider request`. It is tested with snapshots: a fixture thread in, the exact JSON out.

## 4. Tool use and the Claude Messages API

### 4.1 Provider adapters

```ts
interface Provider {
  id: "claude" | "ollama"
  models(): Promise<ModelInfo[]>                        // capabilities: tools, vision, thinking, context
  stream(req: ProviderRequest, on: (e: StreamEvent) => void, signal: AbortSignal): Promise<StepResult>
}
type StreamEvent = { type: "text" | "reasoning"; delta: string } | { type: "tool-input"; callId: string; name: string; partialJson: string }
type StepResult = { parts: Part[]; stop: "end" | "tool_use" | "max_tokens" | "refusal" | "stopped"; usage: Usage }
```

- **The API key and HTTP live in Go.** Add `app/ask/claude.go` next to `ollama.go`, using the official Go SDK (`github.com/anthropics/anthropic-sdk-go`, **a new dependency: needs your OK**). It streams deltas as `ask:delta` exactly as Ollama does today. The key goes in the OS keychain, never in the webview or state.
- **The loop stays in TypeScript.** The tools need the frontend's feature code (resolvers, the focus query language), and the same loop must run in Node for MCP and evals (`sqliteWorld`).

### 4.2 Claude features that retire our hacks

| Hack today | Claude feature that replaces it |
|---|---|
| `aliasArgs` (the model guesses argument names) | `strict: true` tool schemas: inputs always validate |
| routing namespaces + `load_tools` | the **tool search tool** (`tool_search_tool_bm25_20251119`) with `defer_loading: true` on rarely used tools; always load the ~6 core tools |
| `run_code` in a Worker | **programmatic tool calling**: `code_execution_20260120` with `allowed_callers` on our tools. The code runs on Anthropic's side, and every tool call comes back to us, so the snapshot never leaves the machine except as the results we return. Keep the Worker for Ollama. |
| `[E#]` convention + citation checks + the marker strip | return tool results as **`search_result` content blocks** with citations enabled; Claude emits native citations pointing at them. Map each to its exhibit id. (Keep `[E#]` for Ollama.) |
| the plan JSON parse + retries | structured outputs (`output_config.format`) for the plan and the writer's outline |
| a fake user "[Check] …" turn, then an apology strip | a mid-conversation **system** message: the operator channel, which the model does not answer as if the person spoke |
| `compact.ts` | server-side compaction (`compact-2026-01-12`) or context editing (`clear_tool_uses`); keep ours for Ollama |
| a prompt rebuilt each turn | **prompt caching**: tools → system → snapshot card are stable and cached; the screen context goes last, after the breakpoint. Target `cache_read_input_tokens` > 80 % after turn 1. |

Other Claude API rules for the loop:

- Parallel tool calls are on. Run them concurrently and return every result in one user message.
- Check `stop_reason` before acting: `max_tokens`, `refusal` (`stop_details`), and `pause_turn` for server tools.
- Stream with `eager_input_streaming` on our tools, so an exhibit's skeleton appears while its arguments are still arriving. Validate each input against its schema before running it.
- Model: Opus 5 by default, with adaptive thinking and effort `medium` for chat (a deliberate, measured step-down; tune per route). Enable refusal fallbacks (`fallbacks: "default"`) and tell the user which model answered.

### 4.3 Harness profiles: a thin harness for strong models, a thick one for small ones

Most of our harness exists to prop up a 35B local model: routing, planned claims, repair turns, the garble guard, the menu check. A strong model does these things without help, and the scaffolding then costs latency and sometimes quality. So the harness is **a profile, chosen by the model's capabilities**, not one pipeline:

| Stage | `local` (qwen3.6, gemma) | `frontier` (Claude) |
|---|---|---|
| tool set | routed namespaces, ≤12 tools | all core tools + tool search |
| plan + claim sub-loops | on for broad questions | off. Claude plans in its thinking; claim-testing becomes a "verify" subagent only for write-ups |
| checks | all, plus one repair | unsourced numbers + invented names only, as a system notice; no repair turn by default |
| citations | `[E#]` + a fallback | native citations |
| code | Worker `run_code` | programmatic tool calling |
| context | our compaction at 32k | caching + server compaction |

The eval runs both profiles, so neither is tuned blind.

### 4.4 Append-only is not optional

Claude Fable 5.1 and Opus 5.5 use **preserved thinking**: their thinking blocks are tied to the exact history. Accounts created on or after 2026-08-31 get a **400 when an earlier turn is edited**.

Today's harness edits history in several places:

- the draft reset;
- the repair that replaces the answer;
- the apology strip;
- the marker and dead-id strip.

Under the new format:

- Those fixes are **render-time transforms** in the UI projection, recorded as a `notice`. The model projection sends the answer exactly as the model wrote it.
- A repair is a *new* assistant message after a system notice, never a replacement.

## 5. Google A2UI: what to take, what to leave

**A2UI v0.9:**

- The agent sends `createSurface`, `updateComponents` (a flat list of components with ids, one `root`), `updateDataModel` (JSON Pointer paths) and `deleteSurface`.
- Components come from a **catalog the client owns**, identified by `catalogId`.
- User interaction returns an `action` message: name, surface, source component, and context bound to the data model.
- It renders progressively, and it is declarative data, never code.

**Take:**

1. **A client-owned catalog is the security and quality boundary.** The model can only ask for what we have designed. This is exactly the exhibit registry.
2. **Keep data separate from structure.** In A2UI the data model is separate from components. We go further: **the model sends no data at all**, only the spec (kind + params). The client resolves the data from the snapshot. A chart can then never show a hallucinated number, which is the single most important property for an architecture tool.
3. **Actions flow back as structured events.** A click on a node in an exhibit becomes an `action` part with context (`{exhibit: "E3", element: "checkout"}`), not typed text. The model gets a precise, compact message.
4. **Progressive rendering.** An exhibit part is created as soon as its tool call starts streaming (a skeleton), resolved when the arguments complete, and drawn when data arrives, all locally and fast.

**Leave:**

1. **The generic primitive catalog** (`Row`, `Column`, `Text`, `Button`, `Card`, …). Asking the model to lay out UI from primitives spends tokens and judgment on layout. Its layout is worse than a designed `StackDiagram`, and a 35B model would do it badly. Our catalog is **domain-level**: "the stack of `production` with `checkout` selected", not "a column of rows of boxes".
2. **Surfaces the agent updates over time.** Chat exhibits are immutable answers, snapshot-pinned. A "live" exhibit is the view itself; "Open in Connections" goes there.
3. **Adopting the wire protocol inside the app.** It is v0.9 and moving, has no official Vue renderer, and gives us nothing over our own typed parts in-process.

**Later, at the edge:**

- The MCP server could expose each exhibit as an **MCP App** (`ui://` resource, a small bundle per figure), so Claude Desktop or Claude Code show the real figure.
- It could also speak A2UI to an external agent host, mapping `ExhibitSpec` to one custom-catalog component.
- That is one adapter, written once, because the catalog is already declarative.

## 6. Structuring features for chat: extend views, dedicated widgets, or adapters?

### 6.1 The verdict

- **Do not extend views.** A view is a page: layout, filters, a route, stores and focus state. Embedding one means mounting the app (the stage iframe), which is slow, fragile and native-broken. It also makes the chat depend on page internals.
- **Do not write dedicated chat widgets per figure.** We have 13 `Ev*` kinds that each redraw a view's figure a bit differently. Every view change then needs a second change, which does not happen, so they drift.
- **Do split every figure-bearing feature into a resolver and a component, and register the pair as an exhibit.** The component is the one the view already uses. The resolver is the data logic lifted out of the page or store into a pure function. The view itself becomes "controls + resolver + component". It is the first client of its own exhibit, so the exhibit cannot rot.
- **Dedicated widgets only for things with no view:**
  - a component card (entity summary);
  - a code snippet with line anchors;
  - a comparison of two things;
  - a choice;
  - a proposal card;
  - a plan/progress strip.

  They live in the same catalog.
- **Density is a prop, not a component.** Each exhibit component takes `density: "inline" | "full"` (inline: fewer labels, a height cap, no in-figure controls). The chat uses `inline`; clicking expands to `full` in a sheet; "Open in view" goes to the page.

### 6.2 The exhibit contract and the engine

**Two levels, deliberately separate.**

- **`ExhibitDef`**: static. It knows how to make a figure from a snapshot and parameters, with nothing mounted. Tools, reports, MCP and export call this.
- **`FigureExportable`**: what exists today (39 registrations in 24 files). It is an *instance*: "the figure drawn on screen now", which `render()` reads from the live `<svg>`.

Making the instance tool-callable would force the view to be mounted, which is the stage again. So the definition is the callable thing. A mounted figure points at its definition through `spec()`.

```ts
// features/exhibits/types.ts
export interface ExhibitDef<P = any, D = any, Props = any> {
  kind: string                            // catalog id, stable: "stack", "tangle", "cochange"
  version: number                         // bump when params or facts change meaning
  summary: string                         // one line: the catalog, the tool description
  params: JsonSchema<P>                   // strict; with 1–3 examples
  needs?: SnapshotNeed[]                  // "git" | "files" | "deployables": absent → a reason, not an error
  title(p: P, d?: D): string

  /** Headless and pure: the same code runs in the app, a Worker and Node (MCP, evals). */
  resolve(p: P, snap: Snapshot): Promise<D>
  /** What the model reads and cites (§8.2): rows, totals, a rank, absences. */
  facts(d: D, p: P): Fact[]
  /** What can be selected or lit: components, files, pairs, floors. */
  elements?(d: D): Element[]
  /** Every exhibit is also a table: CSV, accessibility, the text fallback. */
  table?(d: D, p: P): { columns: ExportColumn[]; rows: ExportRow[] }

  figure?: {
    component: Component                  // props-only; the one the view already uses
    props(d: D, p: P, o: { density: "inline" | "full"; select?: string[] }): Props
    legend(d: D, p: P): FigureLegend      // required, as for every figure
  }
  /** "Open in view": the route and the query the view reads its state from. */
  open?(p: P): { route: string; query?: Record<string, string> }
  /** Generate a tool from this definition, or not (§4). */
  tool?: { name: string; when: string } | false
}
```

**The engine** is one module that owns the catalog and everything done with it:

```ts
export interface ExhibitEngine {
  catalog(snap?: Snapshot): Array<{ def: ExhibitDef; available: true | string }>
  validate(spec: ExhibitSpec): { spec: ExhibitSpec; dropped: string[] } | { error: string }
  resolve(spec: ExhibitSpec, scanId: string): Promise<Resolved>        // cached by scan + kind + params hash
  present(spec: ExhibitSpec, ctx: TurnContext): Promise<Presented>     // id, facts, the model's text / search_result, the exhibit part
  tools(profile: HarnessProfile): Tool[]                               // generated from defs with `tool`
  render(spec: ExhibitSpec, scanId: string, o: ExportOptions & { format: "svg" | "png" }): Promise<Blob>
  open(spec: ExhibitSpec): void                                        // navigates; the view takes its state from the query
}
```

- **Tools** are generated from definitions: parameters = `params`, result = `facts` (a `search_result` on Claude, text on Ollama), and an exhibit part for the UI. Tools that are about more than one figure (`knowledge`: a table and bars), or about none (`file_read`, `sql`), stay hand-written and call `engine.present` for the figures they return.
- **Rendering without a view:** `render` mounts **only the figure component** with its props into an off-screen element of the same window (`createApp(h(component, props))`, no router, no page, no iframe). It waits for `ready` and runs the existing SVG/PNG export pipeline with the legend footer. The same window means the Wails bridge problem cannot occur. The rule that makes this possible: **exhibit components take props and read no stores.** Any that do are fixed as they migrate.
- **Views** use `useExhibit(kind, () => params)`. It resolves through the engine (sharing the cache with the chat), renders the component at `full`, and registers the `FigureExportable` with `spec()`. The export menu, the report slots and "Ask about this" then work from the spec. Figures not yet migrated keep their `useSvgFigure`; they export as before but are not callable.
- **Controlling a figure** is declarative:
  - the engine produces specs;
  - surfaces render them;
  - the views read theirs from the route query.

  "Show this in Connections, focused on checkout" is navigation with a spec (the existing focus + Show in + trail), never reaching into a mounted component.
- **The long tail:** one generic `chart` exhibit (bars, line, scatter, heat) whose data is a `sql` param run by the engine. Ad-hoc questions still get a real figure, and the data still never comes from the model.

### 6.3 Features as typed actions

`registerCommand(id, handler)` is untyped: good for menus, too loose for a model. Add a typed action layer on top:

```ts
defineAction({
  id: "groups.create",
  effect: "mutate",                        // "read" | "navigate" | "mutate"
  params: { name: {...}, members: {...} },
  describe: a => `Create group "${a.name}" with ${a.members.length} components`,
  preview: a => ({ kind: "component-list", params: { names: a.members } }),   // an exhibit shown in the proposal card
  run: async a => { ... },
  undo: async (a, result) => { ... },      // mutations must be undoable from the chat
})
```

- **read**: tools; the model calls them freely.
- **navigate** (open a view, focus, switch tab): never automatic mid-answer. It is an "Open in …" button on the exhibit. A "follow along" toggle lets a docked chat drive the view beside it. This is the steering the user asked for, without the app jumping around.
- **mutate** (create a group, add to a report, pin, create a rule, rename a report): the model calls `propose`; the user sees a **proposal card** with a preview exhibit and Approve/Reject; approval runs it; the card shows Undo. Groups get special care (groups-first-class): every exhibit with `elements` supports "select → Make a group", and the model can propose a group from any result.

### 6.4 Context from the app to the chat

`captureView` / `captureImages` screenshot the screen today. Instead:

- `FigureExportable` and `TableExportable` gain an optional `spec(): ExhibitSpec`. The view on screen then describes itself as an exhibit.
- "Ask about this" (a figure frame button, a context menu on any element, ⌘J with a selection) creates an `attachment` part: the spec + the selection + the summary.
- Images are sent only to vision models, and only when the user asks about the look of something.

### 6.5 Scope: share the drawing, not the pages (recommended)

The chat **already** reuses six real view figures with chat-computed data:

- `StackDiagram`, `FolderMap` and `KnowledgeMap` (EvFigures);
- `TangleGraph` and `TangleMatrix` (EvTangle);
- `ConnectionsMatrix` (EvGraph).

That hybrid is the right design; it only needs to be formalised.

- **Shared:** the drawing components, with only additive optional props (`density`, `select`) that default to today's behaviour. Views see no change.
- **Chat-owned:** the definitions and resolvers, in `features/exhibits/`. Each resolver calls the existing pure helpers (`areasOf`, `layoutTangle`, `foldEdges`, `knowledgeTree`, …) rather than moving code out of views.
- **Not done:** migrating views to `useExhibit`. A view adopts it only when it is being changed for its own reasons anyway, or never. The stage goes; the views stay as they are.
- **Drift guard:**
  - a parity test per definition: the resolver's props against the view's own data path, on two or three real snapshots (Node, `sqliteWorld`);
  - `figure-check.mjs` and the `shot.mjs` screenshots before and after any change to a shared component;
  - EvTangle and EvGraph read `useDataStore`, which is the open snapshot, not the thread's. Their resolvers take the thread's scan explicitly.

### 6.6 Implementation refinements (after review)

The first sketch (the definition object with its registry) is right in shape but had seven unclean spots. What changes:

1. **An explicit, typed catalog.** Definitions are not registered by importing them for their side effects. `exhibit({...})` returns the definition; `CATALOG = [stack, tangle, …] as const` lists them. `Spec` is a discriminated union derived from the catalog, so `{ kind: "stack", params: { within } }` type-checks in reports, tests and tools. There is no import-order fragility (the export registry already had the "second copy" problem).
2. **One schema source.** A small in-house schema builder, `s.object({ within: s.string().optional().describe(…) })`, yields the TypeScript type, the JSON Schema for tools and MCP, and the validator. Hand-written `P` + JSON Schema would drift. (Zod would do the same, but it is a new dependency.)
3. **Feature-owned definitions.** They live at `features/checks/exhibits/stack.ts`, `features/cycles/exhibits/tangle.ts`, `features/git/exhibits/knowledge.ts`, next to the component whose owner then sees them. `features/exhibits/` is only the kernel: types, catalog, engine, view, render host.
4. **A narrow `Snapshot` interface** in `features/snapshot`: `scanId`, `info`, `columns`, `query`, `components`, `connections`, `cycles`. The chat's `World` extends it. Definitions depend only on `Snapshot`, so they run in the app, a Worker and Node.
5. **Pure legends, no export scope.** Each component's legend moves out of its `useSvgFigure` call into an exported pure function (`stackLegend(flows, upLabel)`); the component and the definition both call it. That is a behaviour-preserving move inside the file, guarded by `figure-check`. Headless render mounts the component in the host, takes its `<svg>` (or the definition's `capture(root)` for canvas or HTML figures), and calls the existing `pngBase64` with `draw.legend(d)`. There is no injection scope and no registration, and `useExportables` is untouched.
6. **The chat does not leak into definitions.** Tool names and "use when" live in `features/ask/tools/exhibitTools.ts` as `toolFor(stack, { name: "layers", when: "…" })`. Dependencies point one way: ask → exhibits → features.
7. **Typed element ids**, URL-safe: `floor:core`, `flow:core>web`, `component:checkout`, `file:src/a.ts`, not free strings with arrows.

**Contract tests over the whole catalog**, one file:

- for every definition, on every `ASK_SNAPS` snapshot:
  - resolve, or return a stated absence;
  - facts are finite, and their elements and entities exist;
  - the table has rows;
  - params round-trip through the schema;
- plus each definition's own golden test for its move.

A new definition gets the invariants for free.

**Considered and not taken:**

| Pattern | Idea | Why not (now) |
|---|---|---|
| Data-first frames (grammar of graphics) | `resolve` returns typed frames with column roles (entity, measure, order); facts, table and elements are derived generically; a figure is an encoding of frames | The most principled for citations, but a second abstraction before there are ten definitions. Revisit if facts code repeats: a `rowsAsFacts(frame, …)` helper is the first step. |
| SQL-first (Evidence.dev style) | every exhibit is SQL + a component, fully transparent and re-runnable | stack, tangle and knowledge need graph and time algorithms (`orderOf`, `tanglesOf`, `buildKnowledge`), not just SQL. Kept for the generic `chart` exhibit. |
| Co-located in the SFC | `resolve` exported from the `.vue` file | Node (MCP, evals, tests) would need the Vue compiler to run a resolver; resolvers must be plain TS |
| In the Go engine | exhibits computed by the scanner, the UI only draws | one source for the CLI and `assert`, but the figure logic is TS today and engine changes need sign-off; a later option for facts only |
| Controlling mounted views | the stage | slow, fragile, broken in the native window: deleted |

### 6.7 Does it work for every figure? Audit (2026-09-30)

Every component that registers a figure (plus ShipBoard's table), sorted by what it would take:

| Group | Components | What it takes |
|---|---|---|
| **A. Ready: props only** | StackDiagram, FolderMap, TangleGraph, TangleMatrix, ConnectionsMatrix, ConnectionsChord, SystemMap, ShipBoard, BoundaryFlow, LaneFlow, MonthlyChangesChart, GitActivityChart, ResultChart | a definition and a pure legend function; nothing else. ResultChart (the SQL console chart) *is* the generic `chart` exhibit. |
| **B. Force layout** | ConnectionsGraph, ClassNeighbourhoodGraph, ComponentWiringGraph | props only, but the layout is a simulation. Seed it (the same picture every time), and give the kernel a `settled()` wait before capture. Above ~40 nodes the definition draws the matrix or chord instead: a hairball at chat size says nothing. |
| **C. One store read** | KnowledgeMap (authors store), HotspotsTreemap (data + groups stores; its context menu writes groups) | an optional prop that overrides the store (default: the store, so views are unchanged), and an `interactive: "events"` mode in which menus emit instead of writing |
| **D. Self-fetching: the component is the view** | MetricMatrix, MetricProfiles, MetricStrips (canvas), ComponentPlotterDiagram, ChangeBreadth, EffortShare, the Trends page figure | no props; each reads stores, queries and scope itself. It needs a container/presenter split (the fetch moves to a composable, the drawing takes props), which is the risky refactor. Do each only when the chat needs it, behind figure-check + screenshots. Until then, the generic exhibits (`chart`, `table`, `bars`, `timeline`) answer the same questions, drawn plainer. |

**What the audit adds to the kernel:**

1. **Context wider than one snapshot:** `resolve(p, ctx)`, where `ctx = { snap, workspace: { groups, aliases, author() }, scans? }`.
   - Groups are workspace data, not snapshot data.
   - Author pseudonymisation must apply inside `resolve`.
   - Trends span several scans.
2. **Scope is an explicit param, never read from the scope store:** `scope: "production" | "all"`, `group?: id`. Otherwise a figure in a chat or report changes when someone flips the scope in a view.
3. **Capture hooks:** `settled()` for simulations; `capture(root)` for canvas figures (PNG only) and HTML figures (`svgFromHtml`).
4. **Figures in chat never write:** a figure's own menus (Add to group, Pin) emit actions, which the chat turns into proposals (§6.3).
5. **Size caps per density:** matrix and strip figures on large snapshots take `top N` at `inline`, with "N more" in the caption.

### 6.8 Four payloads, four sizes

| Payload | Who writes it | Size | Stored? |
|---|---|---|---|
| **params** | the model (tool call), a report cell, a URL | tens of bytes: `{}` or `{"of": "checkout"}` | yes: the spec *is* the params |
| **placement** | the model, in the answer: `![caption](exhibit:E3?select=flow:core>web)` | a caption and one element id | yes, in the text |
| **facts** | the engine → the model | capped: at most ~25 facts / ~2 KB per exhibit, with the tail folded into one rank fact ("and 41 more, all under 3 imports") | yes, frozen for citations |
| **data → props** | `resolve` → `draw.props`, locally | anything: MB of rows, functions (FolderMap's `paint`), layouts | **never**: recomputed from the spec on render, cached per scan |

**Rules for params:**

1. **Every param is optional**, and `{}` always draws something sensible.
2. **At most three**, and one shared vocabulary across the catalog:
   - `of`: the subject, a component, area, file or author, by name; resolved fuzzily and stored canonically;
   - `scope`: `production | all`;
   - `by`: the one choice of measure or grouping, as an enum.

   The model learns them once.
3. **No numbers the model has to guess.** Today's `depth: number` becomes `by: "areas" | "parts"`. No limits, thresholds or ids it would have to look up.
4. **No presentation in params.**
   - Highlight goes in the placement.
   - Density is decided by the surface.
   - The drawing (graph or matrix, top N) is chosen by the definition from the data's size.

   The tool call asks only *what*, never *how to draw it*.
5. **Names are normalised before resolving.** "Checkout" resolves to `com.acme.checkout`, and the stored spec holds the canonical name, so a re-run in a report is stable. An ambiguous name returns an error listing the candidates; it never guesses.

### 6.9 The model asks questions; the engine picks the pictures

"Lightweight" means **the model decides little and knows nothing of the machinery.** Today it micro-manages the harness:

- 29 tools, some of which leak internals:
  - `rank` takes a filter in metric column names ("dependents > 20");
  - `graph` takes the focus query language;
  - `show` takes routes;
  - `schema`, `sql` and `run_code` take tables and an API;
  - `load_tools`, `recall`, `cookbook`, `capabilities` and `playbook` are harness plumbing.
- It chooses the figure (`layers` vs `graph` vs `tangles`), the depth, and the element to light.

**The boundary:**

| The model knows / decides | The engine decides |
|---|---|
| which **question** to ask (an intent) | which figures answer it, and how to draw them (graph or matrix, depth, top N) |
| the **names** of things, as the app shows them | resolving them to canonical ids; asking back when ambiguous |
| plain **measure words**: "most depended on", "least healthy" | the metric behind each word |
| the answer text, and **which exhibit to show where** (`![caption](exhibit:E3)`) | what to highlight: the elements of the facts cited in the paragraph beside it |
| whether to ask the person something | scope and time window: the person's choice, a chip in the composer (default: production code, the last year), never a model param |
| — | which view "Open in view" goes to, legends, sizes, density |

**About nine intent tools** replace the 29, each with 0–3 optional params in plain words:

| Tool | Params | The engine answers with |
|---|---|---|
| `overview` | — | the card; the stack figure |
| `about` | `name` | what it is: a component card, a file outline, a person's areas, a group's members |
| `dependencies` | `of`, `direction?: uses \| used by \| both`, `on?` (a second name: the path between them) | facts + a graph when small, a matrix when large, a path figure with `on` |
| `structure` | `of?` | the stack; a tangle figure when tangles exist; cycles as facts |
| `change` | `of?`, `kind?: activity \| together \| hotspots` | a timeline, co-change pairs (hidden ones marked), a hotspot treemap |
| `people` | `of?` | who knows it, the bus factor, the knowledge map |
| `rank` | `measure` (plain-word enum), `among?: components \| files`, `of?` | a ranked table or bars, with the metric named in the facts |
| `code` | `of` (file or component), `find?` | an outline, an excerpt, matches |
| `search` | `text` | matching names, by kind |

Plus the harness pair `ask_user` and `propose`. **`sql` and `run_code` survive only as an escape hatch**: deferred, on the frontier profile, with results as generic `table`/`chart` exhibits.

**What this changes:**

- **Definitions are not tools.** `toolFor(stack)` goes. An intent calls the engine, and a small rule table in code picks the exhibits: `structure` → `stack` (+ `tangle` if any). This is a planner written as code, not left to the model.
- **The placement loses `?select=`.** The model never sees element ids. The highlight comes from the facts it cites next to the figure. That is also more honest: what lights up is exactly what the sentence claims.
- **Facts are in the app's words.** No column names, no internal ids, apart from the citation ids on Ollama (on Claude, native citations remove even those).
- **The person, not the model, switches the drawing.** Each exhibit offers its alternatives ("as matrix", "top 50", "production only") as controls on the figure. The switch is a new spec on the same exhibit, recorded as an action part so the model sees it next turn.
- **Local models get easier.** Nine small tools fit in every prompt, so the routing namespaces, `load_tools` and argument aliasing go away.

### 6.10 The intent list, checked against real questions

The nine in §6.9 were too few, and in the wrong shape. Checked against the 34 capabilities, the 27 cookbook recipes (11 of them harvested from real questions), the eval questions, the 6 playbooks and the app's views, they miss:

- **libraries**: "which outside packages are imported most", unresolved imports;
- **deployables**: Code · Ship · Run;
- **rules and checks**: declared rules, the engine's rules report;
- **change over scans**: the Changes and Trends views;
- **meaning**: "what is instability", "why is health 3.1", "where do I see X in the app";
- **explicit time**: "in the last 30 days".

**The organising principle: the subject sets the detail, the tool sets the aspect.** Every aspect tool takes `of`, which can be anything from the whole codebase down to one file (areas, components, groups, deployables, files, people). So the jump from general to detailed is the *subject*, not a different tool. The engine's rule table is two-dimensional: (aspect × level of the subject) → facts + figures. For example:

- `structure()` on the codebase gives the stack of areas;
- `structure(of: checkout)` gives checkout's parts and their tangles;
- `dependencies(of: a file)` gives its imports.

**Shared modifiers**, the same everywhere they make sense, all optional and in plain words:

- `of`: the subject;
- `since`: "30 days", "March", "the last scan", "v2.0". Before today's scan, it compares scans;
- `vs`: a second subject, which turns any aspect into a comparison.

Scope (production or all) stays a composer chip the person sets.

| Tool | Aspect | Also takes | Answers, e.g. |
|---|---|---|---|
| `about` | what it is: size, languages, roles, tests, entry points, key measures | `of`, `vs` | "What is this codebase?" "How much is tests?" "What is checkout?" |
| `structure` | layers or lanes, areas or modules, tangles, cycles, and the cuts that would untangle them | `of`, `by?: areas \| modules \| lanes`, `since` | "Is it layered?" "Where are the tangles, and what would untangle them?" |
| `dependencies` | what it uses and what uses it, direct and transitive (impact), dependency kinds, the path and the files behind an import | `of`, `direction?`, `on?` | "What breaks if I change X?" "Why does A import B?" |
| `change` | activity, recent change, co-change (hidden coupling), hotspots, age | `of`, `since`, `kind?` | "What changed last month?" "What changes together without importing?" |
| `people` | who knows it, the bus factor, who to ask, active authors | `of`, `since` | "Who knows billing?" "What only one person knows?" |
| `rank` | "which X is most Y" | `measure` (plain words), `among?: components \| files \| types`, `of`, `since` | "Riskiest files?" "Least-tested components?" |
| `libraries` | outside packages, what uses them, unresolved imports | `of` | "Which libraries do we depend on most?" |
| `deployables` | what ships, from which code, through which pipelines | `of` | "What deploys checkout?" |
| `rules` | declared rules and checks, violations, the engine's rules report | `of` | "Do we break our layering rules?" |
| `code` | outline, excerpt, matches | `of` (file or component), `find?` | "Show me OrderService." |
| `search` | names of things, by kind | `text` | disambiguation |
| `explain` | what a measure means and how it is computed, why a number is what it is, what the app can do and where | `term`, `of?` | "What is instability?" "Why is health 3.1?" |

Plus `ask_user` and `propose`. The escape hatch (`sql`, `run_code`) is deferred and frontier-only. `explain` replaces `capabilities`, `cookbook` and `playbook` as far as the model can see them.

**"Enough" is measured, not argued:**

1. **A routing eval, cheap:** about 100 real questions (the recipes, the eval, harvested threads, and one question per view), each with the tool it should reach. Run the model's *first tool call only* on both profiles; the target is 95 % or better.
2. **Questions that fit no tool** go to one of three places:
   - a new aspect, when several share one;
   - a new measure word for `rank`;
   - the escape hatch, when they are rare.
3. **In use:** count escape-hatch calls and "cannot answer" endings per week. A cluster of them is the next intent.

## 7. Reports: the answer *is* a draft

A report is prose blocks + evidence cells. A chat answer is text parts + exhibit parts. With `CellSpec { type: "exhibit" }` these are the same thing, so:

- "Add to report" copies parts: text → `TextBlock`, exhibit → an exhibit cell. No translation table.
- "Write up" is **arrangement, not re-creation**:
  1. pick a template (the model-ranked picker stays);
  2. map cited exhibits to its slots by `kind` (a slot declares the kinds it takes, replacing hint text + screenshots);
  3. write each section from the exhibits' summaries.
- The stage (`stage.ts`, `stageHost.ts`, `EvView.vue`, `takeView`) is **deleted**. The native-window bug goes with it.
- Report cells re-run on a newer snapshot, so a chat finding turned into a report can be refreshed later. Pins can be exhibits too.
- Markdown round-trip is unchanged: an exhibit cell is a fenced `archstats` block holding `{kind, params}`, and a thread exports the same way.

## 8. The UX

- **Where:** the Ask view (sidebar) for long work, plus a **docked panel** (⌘J) beside any view, sharing the thread. Docked is where "Ask about this", "follow along" and "Open in view" feel native.
- **An answer, top to bottom:**
  1. answer-first prose;
  2. featured exhibits inline where cited;
  3. entity chips (components, files, authors) with a hover card and Ask / Open / Focus / Group;
  4. a one-line trace ("Looked at 5 things · 6 s"), expandable to tool rows with their exhibits;
  5. an action row (Add to report · Pin · Copy · Retry · branch arrows);
  6. two or three follow-up chips.
- **Streaming:**
  - text streams;
  - an exhibit skeleton appears as its tool call starts;
  - the figure draws when data resolves (locally, fast);
  - the trace ticks.

  Nothing jumps: an exhibit reserves its inline height.
- **Stale snapshot:** a thread is pinned to its scan. After a new scan, a `stale-snapshot` notice offers "Re-run on the latest scan" (a branch, so both answers are kept, which also shows engine nondeterminism honestly).
- **Trust:**
  - every exhibit shows `ranOn` on hover;
  - numbers in prose that are not in any exhibit summary get the dotted underline (the unsourced check, now with a precise source set);
  - native citations jump to the exhibit.
- **Keyboard:** ⌘J open, ⌘↵ send, ↑ edit last, ⌘. stop, E to add the focused exhibit to the report.

### 8.1 Interleaving widgets and text

The question is **who decides where a figure goes, and how that survives streaming, storage, reports and weak models.**

**Stream order is the wrong order.** Claude's content blocks, and our `Part[]`, interleave in the order things happened:

1. "Let me check the tangles…"
2. a tool call
3. "Now the layers…"
4. a tool call
5. the answer

Rendering that sequence as the answer puts the figures before the text that explains them, in the order of discovery, with narration between them. So there are two streams:

- **Progress**: text before a tool call in the same step. It goes to the trace as a progress note ("Checking the tangles"). It is never part of the answer. Claude Opus 5.5 and Fable 5.x already return this text separately, as `thinking` progress updates with `display: "updates"`.
- **The answer**: the final text. Only it is laid out, and its author decides the layout.

**Four kinds of thing in the flow, by size:**

| Level | What | Syntax the model writes | Rendered as |
|---|---|---|---|
| inline reference | an entity: component, file, author, group | plain name, linked by the harness (no markup) | a chip; hover card; Ask / Open / Focus / Group |
| inline value | a number from the evidence | a plain number, matched by the harness | a sourced number: hover shows where it came from; unmatched ones get the dotted underline |
| citation | "this claim rests on E3" | `[E3]` | a small badge; hover previews the figure; click scrolls or expands |
| block exhibit | the figure itself, between paragraphs | `![Where checkout sits](exhibit:E3)` on its own line | the real figure at `inline` density, with the caption under it |

- **Why the embed line is Markdown image syntax.** Every model has seen it millions of times and uses it well, local 35B models included. It is block-level, it carries a caption, and it streams cleanly: the line either is complete or is not. It also degrades well: exported to plain Markdown, it is still a readable image reference, and the export can swap in the PNG.
- **Why not the alternatives:**
  - HTML/MDX tags (`<Exhibit id="E3"/>`) fight our rule that model text is never markup.
  - A fenced JSON block is heavy for the model to write.
  - A2UI-style layout trees spend the model on layout.
- **A placement may re-aim the figure without new data:** `![Checkout's floor](exhibit:E3?select=checkout)`. The model names an element; the app checks it against the exhibit's `elements` and highlights it. One tool result can then back several placements, each lit for the sentence beside it. Unknown parameters are dropped and the figure is shown plain. "The model names; the app computes" holds for placement too.

**Rules the prompt gives, and the harness enforces:**

1. A figure goes **right after the sentence that makes its claim**, before the details: claim → picture → explanation.
2. At most **three** block exhibits per answer; the rest are cited, or left in the trace. A placement beyond three renders as a citation.
3. An exhibit is placed at most once; later mentions cite it.
4. Tables longer than eight rows are shown truncated, with "Show all 42".

**Fallbacks, for weak models and for answers with no placement:**

- **Cited but never placed:** the figure is auto-placed after the paragraph of its first citation. This is today's citation = placement behaviour, kept as a fallback.
- **Neither placed nor cited, but the answer depends on it** (its numbers appear in the text): a compact "Based on" strip under the answer.
- **An embed line naming an id that does not exist:** dropped at render. The `invented`/marker check records a notice, and the text is not rewritten (append-only, §4.4).

**Streaming:**

- The block renderer splits the answer at complete embed lines only. A half-written `![Wher` stays hidden until its line ends, so nothing flickers.
- Each exhibit's data was resolved when its tool ran, so it draws immediately at a reserved height. Text keeps streaming below it and nothing jumps.
- Entity chips and sourced numbers are applied per finished paragraph, not per token.

**Storage and projections:**

- The text is stored exactly as written, embed lines included. The layout is a render-time projection: a parse into `[paragraph, exhibit, paragraph, …]`.
- Sent back to the model unchanged, the model sees what it placed last turn and can say "the figure above".
- For Ollama, the same syntax is used, plus the fallbacks.

**Reports get the layout for free.** "Add answer to report" maps the parsed sequence 1:1: paragraphs become `TextBlock`s, and embed lines become exhibit cells (with their `select`) in the same order. The report's Markdown round-trip turns an exhibit cell back into an embed-like fenced `archstats` block. The chat syntax and the report syntax then describe one document model, and "the answer is a draft" (§7) holds literally.

**Interaction inside the flow:**

- A click on an element of an inline figure opens a small menu: Ask about it · Focus in view · Make a group · Add to report. Choosing one creates an `action` part on the next user message.
- Follow-up chips stay at the end of the answer, never between paragraphs.

### 8.2 Bulletproof citations

#### What goes wrong

The 2026 literature and production write-ups agree on three failure layers. **Check each separately; never average them into one score.**

1. **Structural:** the citation is malformed, or missing where a claim needs one.
2. **Resolvability:** the cited id does not exist, or points at a source that was never retrieved. The model invents a plausible `[E7]`.
3. **Semantic:** right source, wrong claim. The cited evidence is real but does not say what the sentence says. It is the most common failure, and the hardest to catch.

A "0.94 grounded" answer can still have a 0.61 claim-level alignment rate. Users do not read averages: they click one citation and check it. So we score **per claim** and show per claim.

#### Our advantage: the sources are data, not prose

RAG systems cite paragraphs and need an LLM judge to know whether a paragraph entails a claim. Ours cite measurements:

- dependents, cycles, commits, floors, pairs;
- each with a value, an entity and a unit.

Most of our claims are therefore checkable **deterministically, exactly, on every answer**, with no judge. That is the backbone of the design.

#### 1. Cite facts, not exhibits

Today a citation points at a whole exhibit: `[E3]` = "What changes with checkout", 15 rows. A sentence can cite E3 and misstate row 9, and nothing notices. So the citable unit becomes a **fact**:

```ts
interface Fact {
  id: string                 // "E3.4": exhibit E3, fact 4. Issued by the harness, never by the model.
  exhibit: string            // "E3"
  text: string               // "cart ↔ checkout: 212 shared commits (38 %), no import (hidden coupling)"
  entities: string[]         // ["cart", "checkout"]
  values: Record<string, number>   // { shared_commits: 212, pct: 38 }
  kind?: "row" | "total" | "rank" | "trend" | "absence"   // what claims it can back ("the most…" needs a rank or total)
  element?: string           // what to light up in the figure when this fact is cited
  ranOn: RanOn
}
```

- Every exhibit's `facts` (§6.2) emits them: one per row, plus totals, a rank fact ("ordered by shared commits, highest first"), and absence facts ("no cycle includes checkout"). An absence is a claim too, and it needs a source.
- A fact is written in the answer's own vocabulary, so a sentence can match it.
- Clicking a citation opens the figure **with that element lit**: the bar, the row, the arc. The reader checks the claim in one glance, which is the point of a citation.

#### 2. Structural and resolvability: make failure impossible, not just detectable

**On Claude, use native citations.**

- Each tool returns its facts as a `search_result` block. `source` is the exhibit id, `title` the exhibit title, and `content` has **one text block per fact**. A block is the smallest unit Claude can cite, so one fact per block gives fact-level citations.
- With `citations: {enabled: true}`, the API parses the citations itself. It **guarantees they are valid pointers** to provided content: `search_result_location` with `search_result_index`, `start_block_index`, `end_block_index` and `cited_text`.
- In Anthropic's own evaluations, native citations pick more relevant passages than prompted citations. `cited_text` is not billed as output.
- When streaming, citations arrive as `citations_delta` events on the current text block, so badges appear as the sentence streams.
- The harness keeps a **manifest**: the order of every `search_result` sent in the request. `search_result_index` counts across all messages. Resolving (index, block) gives the fact id.
- Constraints to design around:
  - A `tool_result` containing a `search_result` must contain **only** `search_result` blocks. Put notes ("15 of 40 shown") inside the result as a block, where they become citable too.
  - Citations and structured outputs **cannot be combined** (a 400). The plan and write-up outline, which use structured outputs, never enable citations. The prose steps always do.
  - Search results are text only; figures stay on our side, which is fine.

**On Ollama, use prompted `[E3.4]` markers.** Resolvability is checked by a **join against the retrieval log**, never against the model's own list. A citation is valid only if the harness issued that id in this thread (the event log is the log). An invalid one:

- is not rendered as a citation;
- becomes a `notice`;
- counts against the answer.

Dead ids are already stripped today; now it is a join, not a regex.

#### 3. Semantic: check every claim, deterministically first

**Split the answer into claims**, one per sentence. List items and table rows count as sentences. Each claim gets:

- its citations (native, or `[E#]`); a sentence with none inherits those of its paragraph for the checks, but is still marked "uncited";
- its numbers (the existing `numbersOf`, with its rules for list numbering, code and ids);
- its entities (the entity linker from §8.1 already finds them);
- its claim words: superlatives (`most`, `largest`, `only`, `every`, `none`), direction (`grew`, `fell`, `more than`), and counts.

**Then the checks, all deterministic, every answer, milliseconds:**

| Check | Passes when | Catches |
|---|---|---|
| **number ⊂ cited facts** | every number in the sentence equals a value in *the facts it cites*, allowing rounding, units, and derived shares/differences/sums of two cited values (the existing `derived()`) | right source, wrong number. Today we only check the number appears *anywhere* in the thread, which is too loose. |
| **entity ⊂ cited facts** | every component, file or author the sentence attributes a measurement to appears in a cited fact's `entities` | "checkout has 42 dependents [E3.2]" where E3.2 is about cart |
| **superlative needs a rank** | "most / largest / top / only / every / none" cites a `rank`, `total` or `absence` fact that supports it (the entity *is* first; the count *is* the total) | "the most coupled component" backed by one row of a partial list |
| **direction matches** | "grew / fell / more than" agrees with the cited values' order | "activity dropped" on a rising timeline |
| **snapshot matches** | the cited facts' `ranOn.scanId` equals the thread's scan | citing a fact from before a rescan |
| **factual sentence cited** | a sentence stating a measurement has at least one citation. Advice and interpretation ("I'd start with…", "this suggests…") are exempt, but a paragraph of only interpretation with no cited facts is flagged. | unsourced claims |

**Then a judge, only where the deterministic checks cannot decide:**

- claims with no number, entity or claim word ("checkout sits at the bottom of the stack and nothing below depends on it", which is a structural statement);
- **every sentence of a write-up** (reports are durable, so pay once);
- a sample of chat answers (10–20 %) for eval monitoring.

The judge gets `(claim, cited facts' text)` only, not the conversation, and answers **supported / partial / unsupported / cannot tell**.

- With Claude, run it on a smaller model (Haiku 4.5) in parallel per claim, at low effort.
- Locally, run it on the same model with a short fixed prompt.
- Calibrate against a **hand-labelled set of ~50 claims** from real threads. Re-check agreement when the prompt or model changes, because judges drift.

#### 4. Write-ups: attribute first, then generate

For reports, citations are made **by construction, not by checking afterwards**. This follows "Attribute First, then Generate" and FRONT: select the supporting evidence first, then write each sentence from it.

1. The outline step (structured output) assigns **fact ids** to each section, not just exhibits.
2. Each section is written **from those facts only**, with citations on. A claim outside them has nothing to cite, and the check flags it.
3. The judge verifies every sentence. An unsupported one is rewritten once, from its facts. If it is still unsupported, it is **removed and listed** under "Dropped: not supported by the evidence". It is never silently kept.

The writer already does sections by evidence. This makes the selection explicit, at fact level.

#### 5. What the reader sees

Each citation badge shows its state:

| State | Look | Meaning |
|---|---|---|
| verified | solid badge ✓ | the deterministic checks or the judge passed |
| cited | plain badge | valid pointer; nothing to check automatically (interpretive claim) |
| partial | amber badge | e.g. an entity matches but a number is not in the cited fact; hover says which |
| unsupported | red dashed badge | the judge or a check says the fact does not back the sentence |
| dead | struck-through text, not a badge | the id was never issued (Ollama only; impossible on Claude) |

- **Hover** shows the fact's text (`cited_text`) and a thumbnail with the element lit. **Click** opens the figure there.
- **Per answer**, a quiet footer: "11 claims · 9 verified · 1 partial · 1 uncited", shown in claims, never as a percentage. A click on a flag scrolls to the sentence.
- **Nothing is silently rewritten** (append-only, §4.4). A flagged answer offers "Fix the flagged claims", which is a new branch. On the `local` profile the one automatic repair stays, as a branch the reader can compare.
- **After a rescan**, citations to the old snapshot show a clock. "Re-check on the latest scan" re-runs the cited facts' exhibits and marks each claim still true, changed or gone. Reports already re-run their cells, so a report's claims can do this too.

#### 6. Reuse outside the chat

The checker is one function:

```ts
checkGrounding(text, facts) → Array<{ sentence; citations; verdict; reasons }>
```

It is exposed as:

- the chat's post-answer pass;
- the report editor: it checks human-written prose against the cells in the report, marking a number in a paragraph that no cell supports (useful even without AI);
- an **MCP tool**, `check_claims`: an external agent (Claude Code, Claude Desktop) writing about the codebase can verify its claims against the snapshot. It is Vertex's "check grounding" API, for architecture.

#### 7. Measuring it

The eval gains per-case citation metrics, reported separately:

- **structural**: factual sentences with a citation / factual sentences (citation recall);
- **resolvability**: valid ids / ids. Must be 100 %: by construction on Claude, and by join and strip on Ollama. Anything else is a harness bug.
- **support**: supported claims / cited claims (citation precision), deterministic + judge;
- **over-citation**: citations that support nothing in their sentence.

Every run with a structural or resolvability failure is kept for review. The hand-labelled set gates changes to the judge prompt.

## 9. Migration path

Each step ships on its own and keeps the chat working:

1. **The format and store.** Types (§3.2), event tables in Go, projections to Ollama (and a Claude projection with snapshot tests). Migrate `ask.threads` on read. The loop writes parts instead of messages. *No visible change; unlocks everything else.*
2. **The exhibit registry, chat-side only** (§6.5): definitions wrapping the six figure components the chat already uses, plus table, bars, timeline and chart. The resolvers are chat-owned and call the existing pure helpers. **Views are untouched.** Parity tests against the views' data paths on real snapshots. *First visible win: facts, and the same figures in chat, reports and export without the stage.*
3. **Interleaving** (§8.1): embed lines, auto-placement, narration to the trace, sourced numbers, entity chips, density `inline/full`. **Facts + deterministic claim checks** (§8.2 parts 1, 3 and 5) land here too: they need only the exhibit summaries and the event log.
4. **Report exhibit cells.** "Add to report" copies parts; write-up maps slots by kind. **Delete the stage.**
5. **The Claude provider** (Go SDK, keychain key; needs your OK for the dependency), harness profiles, caching, strict tools, tool search, native citations, system-message checks.
6. **Typed actions + proposals**, groups from selection in exhibits, "Ask about this" via `spec()` on exportables, docked follow-along.
7. **The remaining exhibits** (hotspots, activity, knowledge, deployables, tables, component card, code snippet).
8. **Edges:** MCP tools generated from the catalog, then MCP Apps / A2UI adapters.

## 10. Risks and open questions

- **Resolver extraction effort.** Some view logic is tangled with page state. The plan is incremental, and a view without a resolver simply is not an exhibit yet: the chat links to it instead.
- **Privacy with Claude.** Component names, file paths and code excerpts leave the machine. It needs a per-workspace setting ("Local only (Ollama)" / "Claude"), author pseudonymisation applied before projection, and a visible "sent to Claude" marker on messages.
- **Cost.** Measure per completed answer with caching on. Effort `medium` is the start, and the eval decides.
- **Engine nondeterminism.** Frozen exhibits keep a `propsHash`, so a re-run can say "this changed" rather than silently differ.
- **A2UI churn.** Nothing inside the app depends on it; only a future edge adapter would.
- **Keeping local models first-class.** The `local` profile keeps the thick harness. Features must degrade (no native citations, no programmatic calls), never break.
