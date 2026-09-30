# AI in Archstats: research

2026-09-29, second pass. Exploratory. Nothing here is built or approved.

The questions:

1. An MCP server that exposes Archstats data and lets other tools work with Archstats.
2. A chat tool that answers architecture questions, shows views and figures, steers the app, and turns what it finds into reports. What should the harness look like?
3. What AI could add for each persona, beyond those two.

The short version: the app already has most of what an assistant needs. What is missing is a way to carry an insight from a question to a report without losing its evidence on the way. Section 3 designs that path. The chat, the figures, the actions and the MCP server are all built around it.

---

## 1. Constraints to design around

**Local-first is a principle (Principle 1).** "The user's machine is the product boundary." So:
- an MCP server keeps it, because the user's own agent does the thinking;
- an in-app chat keeps it only if it is off by default, uses a provider the user chose, and can run on a local model;
- source code is never sent anywhere by default.

**Open data is a positioning claim (claim 2).** "Query it with any tool, including an LLM." MCP is the natural next step for this claim.

**Evidence over verdicts (Principle 4).** Templates never write verdicts, and pins are worded "as the evidence has it, never as a verdict" (`evidence.ts`). A language model writes verdicts by default. The harness has to make every claim trace to something the user can re-run, and has to mark every sentence the AI wrote.

**Raw SQL misleads models.** The data audit found traps a model will fall into every time:
- `modularity__coupling__afferent` counts files, not components (1,405 against 443 on Sylius);
- `cycles__short__count` double-counts the component a cycle starts at;
- `component_connections_indirect` holds duplicate rows;
- file health is stored as 0 instead of NULL before revision 2;
- the query service refuses results over 300k rows.

The dogfood showed the same from the other side: agents with the SQL console left 26 mutual pairs, against 5 for the hand refactor. So **semantic tools come first, raw SQL second, and a trap list sits next to both.**

**The logic we trust lives in TypeScript:** cut plans (`utils/cycles.ts`), neighbours, raw-import resolution, the focus language, readings and templates. Tools must call that code rather than port it, or the chat will disagree with the views.

**MCP protocol `2026-07-28` deprecated sampling, roots and logging** and made the transport stateless. Do not design around sampling ("borrow the client's model"). The Go SDK (v1.7+) supports the new version over stdio and stateless HTTP.

**The open snapshot is global backend state** (the 2026-09-21 gotcha). Two frontends that open different scans read each other's data. Anything that renders views out of sight (section 5) needs a snapshot handle per client first.

---

## 2. What already exists that an assistant can use

This is the most useful finding of the second pass: most of the pieces are built. The table maps each piece to what an assistant does with it.

| Piece | Where | What an assistant does with it |
|---|---|---|
| **Exportables registry**: every mounted view registers its tables (`rows()`, `columns()`, `notes()`), figures (`render()` → SVG/PNG, a required `legend()`) and documents | `features/export/useExportables.ts` | Lists what a view can show and takes it, with a legend, as a chat figure or a report cell |
| **Slot taking**: open a view, set the facet, wait for the figure to settle, `pickFor(take)`, hand it over | `features/reports/useSlotTaking.ts` | Already an automated "take this figure from that view" loop. Taking figures for the chat is the same loop |
| **Report document**: text blocks with writer prompts; cells `pin · table · sql · capture · reading · slot`; `RanOn` provenance; `previous` output; kernel `newest` or a fixed scan | `features/reports/reportDoc.ts` | The target format for everything the chat finds |
| **Templates**: 19 general and many per ecosystem; the `Writer` skips sections the snapshot cannot fill and names them | `reportTemplates.ts`, `ecosystemTemplates.ts`, `templateKit.ts` | A skeleton to draft into, instead of the model inventing structure |
| **Readings**: computed paragraphs (size, history, structure, hotspots, health, churn, knowledge, coupling, rules, modules, age, tests, libraries, focus, ecosystems) | `features/reports/readings.ts` | Facts in words, computed and never generated. The AI quotes readings; it does not rewrite them |
| **Pins**: component · file · cycle · rule · pair · view · heading, with values, re-checked against the newest snapshot (holds / was 14, now 3 / gone / not comparable) | `evidence.ts`, `evidence.store.ts` | A finding the user kept, which checks itself on every rescan |
| **Focus language**: `around`, `dependencies of`, `dependents of`, `between`, `path from … to`, `tangle of`; plus `?hl=` for a selection | `features/navigation/focusSpec.ts` | The exact, readable way to say "look at this part", both for steering and for the model's own reasoning |
| **Show in**: per-entity targets across views | `features/navigation/showIn.ts` | The "Show in view →" links under an answer |
| **Command registry**: every menu item and shortcut is an id | `platform/commands.ts` | Lets the assistant run app commands without new wiring |
| **Metric docs**: one lookup for definitions, with deep links | `snapshot/useMetricDocs.ts` | Definition hover cards on terms in the chat, as in the console |
| **SQL console → report**: live SQL cells, `ResultChart` (bars and scatter) with Add to report | `features/sql` | Charts built from a query, in the chat |
| **Rules as code**: a lens exported as `archstats assert` YAML | `features/rules/rulesAsCode.ts` | Top of the insight ladder: a claim becomes a check that runs in CI |
| **Harnesses**: ui-dogfood (7 scenarios, answer keys, scorecard), report-qa, PDF check | `tasks/ui-dogfood`, `tasks/report-qa` | The eval suite for the assistant, ready to use |

---

## 3. The core idea: an insight ladder

Today an insight moves from a view to a pin to a report by hand, and a chat answer has no way onto that path at all. The design principle:

> **Every step up the ladder makes an insight more durable and more checkable. The assistant proposes a step up; the user takes it.**

```
 1 OBSERVATION   a tool result          "elepy.http is in 53 cycles"             chat only, this scan
      ↓ "that's interesting"
 2 CLAIM         a statement + test     "2 imports hold 46 of 53 cycles"         chat card, can be challenged
      ↓ "keep this"
 3 PIN           claim + values kept     holds / was 46, now 12 / gone            evidence pool, re-checked each scan
      ↓ "write it up"
 4 REPORT CELL   pin/SQL/reading/figure  numbered figure, prose around it        report, re-runs on the newest scan
      ↓ "this must stay true"
 5 RULE          declared dependency    "http must not import core.model"        lens + assert YAML, runs in CI
```

What each rung adds:

| Rung | Adds | Stored as | Rechecked |
|---|---|---|---|
| Observation | nothing: raw evidence | a thread message with a **CellSpec** | when the thread is re-run |
| Claim | a sentence, the test that supports it, how strong the evidence is (measured / inferred / can't tell) | a claim card in the thread | whenever it is challenged |
| Pin | values, a note, provenance | `pins` (exists) | against the newest scan (exists) |
| Report cell | a place in an argument, a caption, a figure number | `ReportDoc` block (exists) | when the report re-runs (exists) |
| Rule | an expectation the team agreed on | lens + declared dependency + YAML (exists) | on every scan and in CI (exists) |

Three things make the ladder work.

**(a) The CellSpec contract.** *Every tool result that can serve as evidence returns a `CellSpec` alongside its data.* A query returns `{type:"sql"}`, a reading returns `{type:"reading"}`, a figure returns a figure cell (below), and a component reading returns a pin draft. Chat-to-report is then mechanical and honest: the report re-runs exactly what the chat ran. A tool that cannot produce a spec (a one-off find in code, say) returns a `capture`, which is visibly frozen.

**(b) A new pin kind, `claim`.** A pin today measures one entity. Many claims are statements over the whole codebase: "no production code imports test code", "billing has no path to orders", "5% of components carry half the churn". Proposal: `kind: "claim"` holds the statement, its SQL or focus, and what it expects (zero rows, a value within a range). `pinStatus` already words the result as "holds / was X, now Y". This is `archstats assert` at pin size, and exporting it is how a claim becomes a rule on rung 5.

**(c) Challenge.** Any claim or pin can be challenged. The assistant then tries to *refute* it using the mistakes each persona is warned about:
- is it generated, vendored or test code?
- is it outside the scan's scope (ignore globs, `.archstatsignore`)?
- is it a trap column?
- is the snapshot comparable?
- is the effect the same with and without type-only imports?

It reports what it tried and whether the claim survived. It is cheap, it cannot hurt anything, and it fits the "claims you could be wrong about" step of the persona arc.

---

## 4. The chat harness

### Where it lives and how it is entered

An **Ask pane** docked on the right. `panes.store` already manages panes. Ways in:

| Where | Opens with |
|---|---|
| Shortcut or menu | an empty question, with the current view as context |
| Selection tray | "Ask about these 4 components" |
| Any ExhibitButton | "Explain this figure", "What's unusual here?" |
| A pin | "Challenge", "Why did this move?" |
| The report editor | "Draft this prompt", "Add a section on…", "Review this report" |
| The SQL console | "Write…", "Explain this query", "Why 0 rows?" |
| Go to anything (⌘P) | plain words become a focus line, without opening the pane |

### Modes

One pane with four modes, because they need different permissions and prompts.

| Mode | What it does | Moves the view? | Writes? |
|---|---|---|---|
| **Ask** | answers questions and shows evidence | proposes | pins and cells only when you click |
| **Investigate** | runs a persona playbook: orient → claims → tests → decision, with a visible task list; stoppable | proposes | proposes claims |
| **Write** | works on the open report: drafts, sections, review | no | edits the report, each edit undoable |
| **Tour** | walks the main view through stops and explains each one | yes (Follow) | no |

### A turn

```
          ┌── context ──────────────────────────────────────────────────────┐
          │ stance + voice rules + trap list + schema summary   (cached)    │
          │ workspace notes (intent the user stated)                        │
          │ where you are: scan + revision, route, focus, lens, facet,      │
          │   selection, the exhibits registered on screen (titles only)    │
          │ in Write mode: the report outline + cell ids + drafts           │
          └─────────────────────────────────────────────────────────────────┘
user ─► agent loop (Go) ─► tool call ─┬─ Go tool (tier A) ──────────────┐
            ▲                          └─ event → TS tool (tier B/C) ───┤
            │                                                          ▼
            └──── result: { data summary for the model,  CellSpec,  exhibit hint }
                                                          │
                          pane renders: prose · evidence chips · figure cards · claim cards · proposals
```

- **The loop runs in Go.** API keys go in the keychain, output streams over Wails events, and TypeScript tools are dispatched to the frontend. The MCP live bridge (section 8) uses the same dispatch, so one tool registry serves both.
- **Providers:** Anthropic natively, plus any OpenAI-compatible endpoint, which covers Ollama, LM Studio and corporate gateways.
- **Default models:**
  - Sonnet 5 for Ask and Write;
  - Haiku 4.5 for small, frequent jobs (plain words to focus, naming groups, captions, bulk enrichment);
  - the largest model only for Investigate playbooks.
- **Results are shaped for the model.** It gets a summary, the row count and the top rows. The pane gets the full table as a result handle. The 300k-row cap never reaches the model.

### What a reply is made of

The message is typed, not just markdown. Each part maps to something the app already has.

| Part | Looks like | Maps to |
|---|---|---|
| Prose | answer text; terms get the definition hover card; component names are links that **select**, not navigate | `useMetricDocs`, `?hl=` |
| Evidence chip | "SQL · 12 rows", "Reading · coupling", "Cycles of `elepy.http`" | a `CellSpec` |
| Figure card | a figure with its legend and provenance (section 5) | figure cell / exportable |
| Table card | a compact, sortable table; "Open in console" | `TableOutput`, console tab |
| Claim card | statement · test · strength · Challenge · Pin | claim pin draft |
| Proposal | "Create group *billing* (14 components)" · Apply | an action (section 6) |
| Show-in row | "Show in Cycles →", "Show in Connections →" | `showInTargets` |

### Honesty mechanisms

- **Number audit.** Every number in the prose must appear in that turn's tool results. Before the answer shows, a number without a source is marked in the text. This is your caption test ("if a number has no caption, it has failed") applied mechanically.
- **"Why do you say that?"** on any sentence opens the tool results it drew on.
- **Evidence strength** on claims: *measured* (a tool counted it), *inferred* (the model reasoned from measured facts) or *can't tell* (the scan cannot show it, and it says why).
- **Voice checker.** The report voice rules become a post-check on anything bound for a report:
  - no tool as the subject ("Archstats says…");
  - one idea per sentence;
  - more than two parallel parts become a list;
  - long paths are shortened.
- **Readings are quoted, never paraphrased.** A computed paragraph stays computed.

### Threads

- **Threads are kept per workspace in `app.db`.** Each thread records the scan it ran on. After a rescan the thread shows "ran on 12 Sep. Re-run on 28 Sep?", and re-running replays its evidence specs (not the conversation) and marks what moved. That is pin re-checking applied to a whole investigation.
- **Workspace notes:** what the user told the assistant about intent ("billing and orders must never depend on each other", "`legacy/` is out of scope"). They are listed and editable. Stated intent is a candidate for rung 5.
- **Undo stack per thread:** every applied action ("created group *billing*") can be undone from the thread.

### Permissions

| Kind | Examples | Rule |
|---|---|---|
| Read | query, reading, cycles, take a figure out of sight | automatic |
| Steer | show, focus, select | proposed; automatic in Tour only |
| Workspace state | group, lens, declared dependency, pin, saved query | proposal card → Apply; undoable |
| Report | add or edit cells and text, create a report | automatic in Write mode for the open report, every edit undoable; elsewhere a proposal |
| Long-running | scan, rescan at commit, backfill tags | always asks, with the expected time |
| Out-of-app | export PDF or Markdown, write a rules file into the repo | always asks, with the path |
| Destructive or network | delete, clone, fetch | not offered |

**Prompt injection.** A consultant scans code they do not trust. `file_contents`, commit messages and READMEs all reach the model, and any of them can carry instructions. That is why there are no destructive or network tools, why every write needs a click, and why tool output is marked as data.

### What leaves the machine

One setting per workspace, shown in the pane header:

1. **Nothing:** local model only.
2. **Structure:** names, metrics, counts and figure data.
3. **Structure + source:** adds file contents and commit messages.

Authors are always pseudonymised before they reach the model, and the mapping stays local.

### Cost

- Cache the stable prefix (stance, voice, traps, schema summary) with prompt caching.
- Show tokens and cost per turn and per thread.
- Give Investigate a budget cap that pauses and asks before going over it.
- Route small jobs to Haiku or the local model.

---

## 5. Figures in the chat

Figures are the crown jewels (Principle 5), so the chat should show real figures and not describe them in words.

### Two kinds of figure

**1. Chat charts: fast, built from tool data.** A small set of chart types drawn at chat width from a result the model already has:
- bar or ranked list;
- scatter (quadrants such as churn × health);
- timeline and sparkline;
- a heat strip for the calendar;
- two small domain figures: a **neighbour flow** (a small version of CouplingFlow) and a **cycle ring** (a small version of CycleMap).

`ResultChart.vue` already covers bars and scatter over a SQL result. These go through `useSvgFigure`, so they carry a legend and can be added to a report like any figure.

**2. Exhibit takes: the real view's figure.** "Show me the dependency matrix of the checkout tangle" should be the matrix view's own figure, not an imitation. Slot taking already does this, but it moves the main view, and that is exactly the jumpy flow the QA flow review warned about. The better approach is a **stage**: the same SPA loaded in a hidden iframe at the target route, with its own Pinia (its own scope, focus, facet and selection), pinned to the thread's scan. The stage mounts the view, waits for `ready()`, calls `render()`, and hands back SVG or PNG plus the legend. The user's view never moves.
- **Prerequisite:** query handles per client in the Go query service. Today `Open()` is global, and a stage would switch the user's snapshot.
- **Cost:** memory for a second frontend. It is created on demand and torn down when idle, and taking one figure takes about 1.5 s (`SETTLE`).

### The figure card

```
┌───────────────────────────────────────────────────────────┐
│ Figure · Where the cycles through elepy.http can be cut   │  ⌃ ExhibitButton
│ ┌───────────────────────────────────────────────────────┐ │
│ │                 (cycle ring, cut edges bold)           │ │
│ └───────────────────────────────────────────────────────┘ │
│ ━ import worth removing (pill = cycles it breaks)  ─ rest │  legend (required)
│ scan 28 Sep · a1b2c3d · rev 9 · focus: tangle of elepy.http│  provenance (RanOn)
│ [Open in Cycles]  [Pin]  [Add to report ▾]  [Ask about ▾] │
└───────────────────────────────────────────────────────────┘
```

- **Drawn at report column width** (A4 minus 2 × 27 mm = 156 mm). What you see in the chat is what the report prints. Most report figures were judged at that width (`report-figure-slots`), so the chat shows the same verdicts.
- **Clicking a mark selects it.** It does not navigate, following the app's rule. The selection becomes context for the next question ("Why is this one here?"), so a figure in the chat is a way to ask as well as a way to answer.
- **Open in view** opens the real view with the same route, focus and `?hl=` selection.
- **Pin** keeps a view pin with the figure's PNG, which exists today.
- **Add to report ▾** gives a choice: a live figure cell (re-taken when the report re-runs), a frozen capture, or filling an open slot of the current report when the figure is the kind that slot takes.

### A live figure cell

Today a figure in a report is a `capture` (frozen) or a `slot` (waiting for a person). Proposal: `{ type: "figure"; route; take; focus?; hl?; facet?; annotations? }`, re-taken on the stage whenever the report re-runs.
- **Payoff:** a steward's report re-runs completely on next month's scan, figures included. That is useful without any AI at all, but the stage makes it possible.
- **Risk:** force layouts move between runs. Keep `Arrange` positions, the same way the graph keeps them by hand.

### An exhibit catalogue for the model

The model has to choose the right figure for a question. The judgements made in the slot pass become data. For each exhibit, record:
- the question it answers;
- when it is legible: Units "How the layers lean" at any size; chord fails beyond a few dozen components; the co-change graph becomes a cloud; main sequence only when some component is abstract;
- what it needs: `units`, git history, a lens;
- its `take` name.

This is a resource for the model, and templates can check against it. Without it, the model will ask for the chord of 1,200 components.

### Annotations

A figure in an argument needs callouts: "A: the tangle, B: the two imports holding it". Proposal: `annotations: [{ target: id, label: "A", note }]`, drawn by the frame over the marks (the same ids `?hl=` uses) and printed in the report. The prose then says "the two imports at **B**". The model proposes annotations and the user keeps or edits them. This does more for a client reading the report than any caption.

### Can the model see figures?

Give it the figure's **data and legend** for anything numeric, and optionally the **PNG** to describe the overall shape ("block-triangular with three back-edges"). Numbers only come from the data, so the number audit still applies.

### Comparing figures

"Before / after" pairs the same exhibit on two scans side by side, drawn at the same scale. This serves the steward's drift question and the verified-refactor loop.

---

## 6. Actions in the harness

A catalogue, grouped by what they change. Every action is also a command id, so the menu, a shortcut and the assistant all run the same code.

**See and steer**

| Action | Notes |
|---|---|
| `show(route, focus?, hl?, lens?, facet?)` | proposed as a Show-in row; runs in Tour |
| `focus(text)` | the focus language; plain words are converted first |
| `select(ids)` | fills the tray |
| `take_figure(route, take, focus?)` | on the stage; returns a figure card |
| `take_table(route, title)` | the full rows, not the page on screen |
| `compare(scanA, scanB, exhibit?)` | figure pair or Changes table |

**Know**: `query`, `reading(id, params)`, `component_reading`, `neighbours`, `cycles_and_cuts`, `who_knows`, `lens_readings`, `find_in_code`, `read_file`, `explain_metric`, `snapshot_about` (scope, ignore globs, comparability).

**Keep**

| Action | Notes |
|---|---|
| `pin(kind, key, values, note)` | from any card |
| `claim(statement, test, expect)` | proposes a claim pin |
| `challenge(pinOrClaim)` | refutation attempts, reported |
| `recheck_pins()` + `triage_pins()` | "3 moved since the last scan: …" |

**Shape the model of the code**: `create_group(query or members)` (groups from a focus stay live), `propose_lens(reading)`, `name_groups(lens)`, `declare_dependency(a, b, allowed)`, `rules_from_words(text)` → lens + declarations + YAML preview.

**Reports**

| Action | Notes |
|---|---|
| `outline_report(from: thread / pins / claims, audience, template?)` | returns an outline card; nothing is created yet |
| `build_report(outline)` | creates the report: headings, cells from specs, figures, drafts |
| `use_template(id, params)` + `take_slots()` + `draft_prompts()` | the template route |
| `add_section(after, topic)` | Write mode, at the caret |
| `add_cell(spec, after)` | from any chip |
| `draft(blockId)` / `rewrite(blockId, audience)` | always lands as a marked draft |
| `review_report()` | the critic (section 7) |
| `rerun_report(scan)` + `what_changed()` | a delta memo from `previous` outputs and pin status |
| `export_report(pdf / md)` | asks; blocked while unreviewed drafts remain (see below) |
| `save_as_template()` | exists |

**Scan**: `scan()`, `scan_at(commit)`, `backfill(tags)`. All of them ask.

---

## 7. From chat to report

### Four ways a report comes out of a conversation

**1. "Write this up."** For the most common case, the end of an investigation.
1. The assistant collects the rungs the thread reached: pins and claims first, then observations the user reacted to. It ignores the chatter.
2. It shows an **outline card**: sections, each listing its evidence chips; reader (client, management, team); length. The user reorders, drops, or adds "also cover…".
3. **Build** creates the report:
   - headings;
   - readings for the facts;
   - live SQL and figure cells for the evidence, numbered;
   - figures annotated where the claim points at part of one;
   - prose as **drafts**;
   - a section per claim with the result of its challenge;
   - a "What this report cannot show" section built from the *can't tell* claims and the scope.
4. The report opens in Evidence with a bar: "Drafted: 7 paragraphs to review · 2 figures to check".

**2. "Make the due-diligence report."** For when the reader and the structure are known.
1. `use_template` builds the skeleton with the existing `Writer`. Sections the snapshot cannot fill are skipped and named.
2. `take_slots` fills the figures on the stage.
3. The assistant **interviews** the writer for what only they know: why the review, who asked, which decision it serves. Those answers fill the template's first prompt.
4. It drafts the remaining prompts from the cells in the same section.

**3. Report first, chat second.** For when the writer is driving. In the report editor, Write mode works at the caret:
- "add a section on the cycles in checkout";
- "turn this paragraph into a list";
- "rewrite this for a CFO";
- "find a figure that shows this".

**4. Living reports.** For the steward, monthly.
1. `rerun_report(newest)` re-runs the cells.
2. `what_changed` writes a delta memo from each cell's `previous` output and pin status: what moved, what held, and what is not comparable, and why.
3. The memo goes at the top as a draft. The rest of the report updates itself.

### The draft lifecycle

The line that keeps Principle 4.

```
 drafted ──► accepted (edited or as is) ──► the writer's prose
    │
    └──► rejected (removed)
```

- **Drafts render differently** in the editor (a tinted margin rule and a "Drafted" tag). Each draft lists the cells its numbers come from.
- **Export decision:** unreviewed drafts are left out of the PDF with a warning, or they block export. Either way, *nothing the model wrote reaches a reader without a person accepting it.*
- **Accepted text stays marked.** It keeps `origin: "assistant"` in the doc (not printed), so a later review knows which sentences to re-check after a re-run.
- **Model changes:** `TextBlock` gains `origin?`, `accepted?` and `sources?: cellId[]`.

### The report critic

`review_report()` is the safest and possibly most valuable feature: it only reads. It returns a list of notes, each attached to a block:
- **unsupported numbers:** a number in the prose that matches no cell;
- **stale evidence:** cells that ran on an older scan than the report's kernel, and pins that moved or are gone;
- **verdicts without evidence:** "poorly designed", "a mess", or a recommendation that cites no figure;
- **figures without a lead-in, or without a legend in the export**;
- **voice:** the tool as subject, chains of more than two parts, unshortened paths, jargon for this reader;
- **figures that fail at this size** (from the exhibit catalogue): "the chord here has 180 components";
- **scope:** conclusions about tests when `.archstatsignore` drops tests (the Broadleaf trap).

### Stories: a report as a presentation

A consultant presents to the client from the app. A **story** is an ordered list of stops, each one a view state (route, focus, selection, annotations) with a few talking points. It is built from a report's sections and played in Tour mode, with the main view moving stop to stop. It can export as a PDF deck, one page per stop. It is a small step beyond the report model, and it turns the views into the presentation instead of screenshots of them.

---

## 8. MCP server

### Who it serves

| Client | Example | Needs |
|---|---|---|
| A chat assistant used for analysis | Claude Desktop, ChatGPT | read scans, show figures, run persona workflows, **build reports in Archstats** |
| A coding agent in the repo | Claude Code, Cursor, Codex | architectural guardrails while it edits; verification after it edits |

Neighbouring tools' MCP servers (Sonar: issues, gates and hotspots; CodeScene: code health) do not cover structure: coupling, cycles, lenses, declared dependencies and co-change.

### Shape

One binary with two modes, following the precedent of JetBrains IDEs and the Figma desktop app:

```
claude mcp add archstats -- archstats-desktop --mcp
```

- **App closed:** headless. Go tier-A tools over the app-data folder. Also usable in CI.
- **App running:** the stdio process forwards to the app over a local socket (loopback, random port, token file). Tier B and C tools become available, because they call the TypeScript code.
- **Engine option:** `archstats mcp -f repo-or.db` in the engine, for CLI-only users. That is an engine change, so it needs your approval.

### What it exposes

- **Tools:** the same registry as the chat (section 6), with the same permission levels. MCP clients have their own approval prompts, and writes are still undoable in the app.
- **Report tools.** An external agent can build a report *in Archstats*, as the durable result, instead of leaving it in its chat:
  - `outline_report`, `build_report`, `add_cell`, `draft`, `review_report`.
  - The report shows up in the app with its drafts marked, like the in-app flow.
- **Prompts** (slash commands in the client), one per persona job:
  - `/orient`, `/due-diligence`, `/drift-since-baseline`, `/onboard-to`, `/plan-extraction`, `/knowledge-risk`, `/fit-gap`, `/review-report`.
  - Each carries the persona stance from `PERSONAS.md`.
- **Resources:** the schema guide, metric definitions, the trap list, the exhibit catalogue and templates.
- **Figures:** tools return the figure as SVG image content. Later, **MCP Apps** (SEP-1865, stable since January 2026) can render a figure as an interactive `ui://` view inside the client, and a click there can call back into Archstats: select, Open in app, Pin.

### The verified refactoring loop

This is the strongest thing MCP enables. P4 and P6 fail at "plans that cannot be verified". A coding agent that has Archstats as a tool can verify its own plan:

1. Get the plan: `cycles_and_cuts`, a target lens, `rules_from_words`.
2. Make the moves in a git worktree.
3. `scan_at` the worktree, then `compare` and `check_rules`.
4. Keep what reduced the tangle, revert the rest, and repeat.
5. `build_report` for the "before / after" figures and the cut list.

The dogfood run lost partly because `.vue` files were invisible. Revision 8 fixed that, so the loop is worth trying now.
- **Open question:** how long a local scan takes per iteration. Incremental scanning would be an engine topic.

---

## 9. Persona journeys

How each persona would move through the ladder. Every journey ends with something a person reviewed.

### P1 · Consultant: the first two hours on an unfamiliar codebase

| # | They do | The assistant does | Rung |
|---|---|---|---|
| 1 | Open the workspace, choose Investigate · "due diligence" | `snapshot_about`: scope, ignore globs, roles, generated or vendored suspects, and asks about each suspect | observation |
| 2 | Confirm two vendored folders | proposes ignore globs; the rescan asks first | rule-like (scope) |
| 3 | — | orient: mass, seams, entry points; three figure cards (layers, hotspots, knowledge) | observation |
| 4 | Read five proposed claims | each with a test and a prediction, e.g. "checkout and payments are one tangle" | claim |
| 5 | Challenge two | one survives; one was test code | claim |
| 6 | Pin the three that hold | values kept | pin |
| 7 | "Write this up for the client's CTO" | outline card → build → report with drafts, annotated figures, and a "What this cannot show" section | report |
| 8 | Accept or rewrite the drafts; run Review | critic: 1 unsupported number, 1 stale cell | report |
| 9 | Export the PDF; build a story for the read-out | — | story |

### P2 · Steward: the monthly check-in

1. A new scan finishes.
2. The pins are re-checked automatically. The pane says "4 moved, 1 gone, 12 hold" and offers a thread.
3. `what_changed` on the check-in report writes the delta memo draft, after checking comparability first.
4. For the one real regression (a new tangle), the assistant shows a before/after figure pair and proposes a rule: "declare `ui` → `domain` only".
5. The steward applies the rule, and the YAML goes to CI (the export asks first).

### P3 · New joiner: the first ticket

1. "Where does invoice numbering live?" The assistant uses find in code, component summaries and the focus language, and answers with a focus: `around billing.numbering depth 1`.
2. Tour mode walks the stops: the component → what it depends on → what depends on it → its tests → who knows it (pseudonymised unless it is your own team and you have turned that off) → what is fragile (cycles, low health).
3. They pin two things to ask the team about. The thread stays as their notes.

### P4 · Modernisation architect: carve out the first module

1. Investigate · "plan extraction of billing": `lens_readings` measured side by side. The assistant argues for and against the seams using evidence chips. The architect picks.
2. "Billing must not reach into orders' internals" → `rules_from_words` → a lens and declarations, previewed before saving.
3. The cut list is `cycles_and_cuts` over the seam, with the files and lines.
4. Hand over to a coding agent over MCP for the verified loop. The before/after report comes back into Archstats.

### P5 · Engineering manager: knowledge risk

1. "Where are we one person away from trouble?" Knowledge readings and a knowledge-map figure, pseudonymised.
2. "Does CODEOWNERS match reality?" A comparison table and a drafted CODEOWNERS patch as a diff, never written without asking.
3. The ownership template, drafted, then reviewed with the "patterns, not individuals" check in the critic.

### P6 · Developer restructuring their own app

- **In the editor over MCP:** "where should this new file go?" (by the neighbours of what it imports), "what breaks if I move this?", and `check_rules` before a commit.
- **Afterwards:** a small version of P4's verified loop.

### P7 · Evaluator: fit-gap against a standard

1. Paste the standard as prose. The assistant turns each criterion into a claim with a test, or into **can't tell** with the reason: "no runtime data", "tests are ignored in this scan".
2. Every claim is challenged. The result is a fit / partial / gap / can't-tell table with an evidence cell per row.
3. The fit-gap report, then a remediation backlog as a list with rough cost from the cut counts.
4. Scenario 07 (Fineract, 13 criteria, `keys.py --fitgap`) is the eval.

---

## 10. More ideas, roughly in order of value

- **Plain words in Go to anything.** "Everything between checkout and payments" becomes `between checkout and payments`. It is small (Haiku or local) and safe, because the query is visible before it runs. The best first demo.
- **Suggested questions under a view.** Two or three questions the data raises, computed without the model and phrased by it: "3 components take 40% of the fix commits: why?" A click sends one to Ask. It gets people from looking at a view to asking a question.
- **Explain this figure** on every ExhibitButton, in report voice, from the figure's data and legend.
- **One-line summaries per component** (opt-in enrichment, cached per scan). They give Units something to say, give new joiners a map by meaning, and give a tenth lens reading, **"What the code says it does"**, to be measured against Floating Words like the other readings.
- **Commit classification** (fix / feature / refactor / chore) from the message and the diff stats, improving Activity's fix pattern for P2, P5 and P7.
- **Scope suggestions:** recognising generated, vendored and non-code files, offered as ignore globs for the user to confirm.
- **Naming groups** for reference and co-change clusters, from their members.
- **Interview for intent:** a short conversation ("what should never depend on what?") that ends in a lens and declarations. It is also how a first-time user learns the Rules workflow.
- **Structural impact of a branch:** scan the branch and its base, and write a short narrative plus figure pair. Run in the team's own CI with their own key, it can be posted as a PR comment.
- **Report reader Q&A:** a report exported as a bundle (Markdown plus the snapshot) that a reader opens in Archstats and can ask about. It stretches the local-first model least of any "share" feature.

## 11. What not to build

- **A score or grade written by AI.** It breaks Principle 4 and "no scores it cannot explain".
- **Guessed edges.** Filling blind spots in the graph (auto-imports, dependency injection) with model guesses would put made-up evidence into a measuring tool. Fix blind spots in the engine.
- **Unmarked AI prose in reports**, or any path that lets a draft reach a PDF without a person accepting it.
- **Chat that replaces views.** Answers point at views; figures in the chat are the views' own.
- **Moving the user's view without asking**, outside Tour mode.
- **Source sent to a hosted model by default.**

## 12. Recommended order

| Phase | What | Why here | Size |
|---|---|---|---|
| 0 | Trap list, exhibit catalogue, schema guide as one resource; plain words in ⌘P | Every later step depends on them; the ⌘P feature is a visible first win | days |
| 1 | Tool registry with the **CellSpec contract**; MCP tier A headless over stdio | Sets the contract everything else uses; local-first | ~1 week |
| 2 | Live bridge (tiers B and C) with per-client query handles; MCP prompts | Coding agents can use Archstats; the stage becomes possible | 1–2 weeks |
| 3 | Ask pane: typed replies, chips, chat charts, number audit, proposals, threads; evals on ui-dogfood plus a trap suite | The daily-use surface, measured from the start | 2–3 weeks |
| 4 | Ladder: claim pins, Challenge, "Write this up", draft lifecycle, report critic | Turns answers into deliverables | 2 weeks |
| 5 | Stage takes, live figure cells, annotations, before/after pairs | Real figures in the chat and fully re-runnable reports | 2 weeks |
| 6 | Tour and stories; enrichments (summaries, commit classes, scope suggestions); MCP Apps | Each one measured before it ships | per item |

The **report critic** (phase 4) needs almost nothing from phases 1–3: it reads a report and its cells. It could be pulled forward as a standalone test of the whole idea.

## 13. Decisions for Ryan

1. **Local-first:** is opt-in, bring-your-own-provider AI (off by default, local models supported) acceptable, or does Archstats only ever serve data to other tools over MCP?
2. **Drafts at export:** unreviewed drafts left out of the PDF with a warning, or export blocked until they are reviewed?
3. **Claim pins:** a new pin kind holding SQL or focus plus an expectation. It changes the pins table.
4. **Live figure cells and the stage:** need per-client query handles in the Go query service, and a hidden second frontend.
5. **Tour mode:** is an assistant that moves the main view acceptable behind an explicit toggle?
6. **Engine:** `archstats mcp` in the engine CLI, or MCP only in the desktop app?
7. **Dependencies:** the Anthropic Go SDK and the MCP Go SDK. No npm modules.

## Sources

- MCP Apps: [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), [announcement](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), [spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- Go SDK and protocol 2026-07-28: [go-sdk releases](https://github.com/modelcontextprotocol/go-sdk/releases), [v1.7.0 notes](https://newreleases.io/project/github/modelcontextprotocol/go-sdk/release/v1.7.0)
- Neighbours: [SonarQube MCP server](https://docs.sonarsource.com/sonarqube-mcp-server/about-the-mcp-server), [CodeScene MCP server](https://glama.ai/mcp/servers/codescene-oss/codescene-mcp-server)
