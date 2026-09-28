# Report templates: QA test plan

> **Run 2 (2026-09-25, evening).** Same test cases, re-run from scratch with
> desktop-size screenshots (1440×900 at 2×, so every shot is a crisp
> 2880×1800 image a design review can judge), every harness fix from run 1 in
> place from the start, and a new required transition and screenshot protocol
> (§4-T) so the *flow* is recorded, not only the steps. Output goes to
> `runs/2026-09-25-r2/<M#>/`. Ports are 4401–4409.

Every report template, created through the real UI on a real snapshot, taken
to a saved PDF. Written 2026-09-25 for a fleet of Sonnet testers, one per
workspace, each running a **mission** (§7) of test cases (§6).

**Nothing is fixed during this run.** Testers look, try and write down. The
facilitator (the main session) merges the findings into `FINDINGS.md`.

---

## 1. What we are looking for, in priority order

| Priority | What | Examples |
| --- | --- | --- |
| **P1: bug** | Wrong, broken or surprising behaviour | a number that contradicts another on the same page; `undefined`, `NaN`, `[object Object]`, literal `**` or backticks; a table with an error instead of rows; a slot that never fills; a button that does nothing; the PDF missing content that the page shows, or showing what it must not (prompts, empty slots); a crash, a blank screen, a spinner that never ends; data from the wrong snapshot or workspace |
| **P2: UX** | Hard to use, hard to read, jumpy or confusing | layout that jumps while it loads; focus that lands somewhere odd; a flow where you do not know what happens next; a long wait with no feedback; tables too wide to read, columns cut off, 500-row tables in a PDF; figures unreadably small in the PDF; a section that says nothing useful; controls whose purpose is unclear without hovering |
| **P3: wording** | Text a junior developer cannot understand | unexplained jargon (afferent, instability, SCC, propagation cost, DMS…); raw column names such as `codesmells__code_health`, `git__commits__total`, `modularity__coupling__dependents`; snake_case or lower-case headers in a printed table; sentences that need rereading; ambiguous "it"/"they"; numbers without a unit or a "compared to what"; British/American mix is **not** a finding |

**The junior-developer lens.** Read every visible sentence as someone with a
year or two of experience who knows what a class, a package, an import and a
commit are, and nothing about architecture metrics. For each paragraph ask:
could they explain it to a colleague? If not, what word or sentence stopped
them? Quote it exactly.

---

## 2. Environment (already running; do not start or stop servers)

The facilitator runs one sandboxed copy of the app per workspace. Each copy is
pinned to one snapshot, keeps reports in memory, and turns every save dialog
into a file written to your mission folder. The owner's own Archstats window
and data are never touched.

| Mission | Workspace (exact name) | URL | Snapshot (open in the sidebar) | Analysis revision |
| --- | --- | --- | --- | --- |
| M1 | `BroadleafCommerce` | http://localhost:4401/ | 1beac0c4 · 24 Sep, 16:12 | 3 |
| M2 | `fineract` | http://localhost:4402/ | d5e5c7f7 · 25 Sep, 17:21 | 4 |
| M3 | `django-oscar` | http://localhost:4403/ | 091654b7 · 24 Sep, 16:11 | 3 |
| M4 | `Sylius` | http://localhost:4404/ | 70e22b0c · 25 Sep, 20:23 | 4 |
| M5 | `LibreChat (TypeScript)` | http://localhost:4405/ | 22222222…0007 | 0 (old) |
| M6 | `gin (Go)` | http://localhost:4406/ | ecdf9b5d | 0 (old) |
| M7 | `nopCommerce` | http://localhost:4407/ | 8c7303fd | 0 (old) |
| M8 | `archstats-ui` | http://localhost:4408/ | 1d98cc48 · 25 Sep, 17:30 | 4 |
| M9 | `npo-data-pipeline` | http://localhost:4409/ | 3292374e | 0 (old) |

Mission folder: `tasks/report-qa/runs/2026-09-25-r2/<M#>/` (absolute:
`/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-25-r2/<M#>/`).
Saved PDFs land there as `NN-<report name>.pdf`. Put your screenshots in
`<mission folder>/shots/` and your findings in `<mission folder>/FINDINGS.md`.

### Driving the app

Work from the repo root `/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui`.
Set these once per shell command (the shell does not keep them):

```bash
export DRIVE_URL=http://localhost:44NN/ DRIVE_WORKSPACE='<exact workspace name>' DRIVE_SESSIONS=/private/tmp/claude-501/report-qa-drive
D=tasks/report-qa/harness/drive-qa.mjs     # run 2: desktop window 1440x900 at 2x
node $D <session> start          # once; opens the app in the workspace
node $D <session> look           # visible text + numbered controls (with tooltips)
node $D <session> click 12       # or click "Create report"
node $D <session> type "text"    # into the focused field
node $D <session> key Enter      # Escape, Tab, ArrowDown, … (+ Meta/Shift/Control)
node $D <session> scroll 600     # positive = down; add x y to scroll inside a panel
node $D <session> text 12000     # all text of the main area, below the fold too
node $D <session> shot <file>.png
node $D <session> goto '#/views/evidence'
node $D <session> stop           # at the very end
```

Use your mission id plus `r2` as the session name (`m1r2`, `m2r2`, …).
Screenshots are **2880×1800** (a 1440×900 window at 2×). `clickxy` and
`hover x y` take screenshot pixels (the driver halves them), but a shot shown
to you is usually scaled down, so coordinates you read off it are wrong.
**Click by text instead:** `click "<text>"` matches controls and also report
prompts by the start of their grey text, e.g. `click "What the module does"`.
Use `clickxy` only as a last resort. Take screenshots generously (§4-T); read a PNG only when the text output
is not enough (layout, jumps, overlap, figure quality). Prefer `look`/`text` for words.

### Checking a saved PDF

```bash
cd <mission folder>
pdftotext -layout "NN-name.pdf" - | less        # the words, in reading order
pdfinfo "NN-name.pdf" | grep Pages
pdftoppm -r 60 -png "NN-name.pdf" pages/NN      # page images; Read a few PNGs
```

Read at least page 1, one page with a table, one with a figure, and the last page.

---

## 3. Harness facts (these are **not** product findings)

- **Sandbox check, first thing:** on Evidence, the Reports count must read
  `0` before your first report. If you see reports you did not make, **stop,
  write "SANDBOX BROKEN" in FINDINGS.md and end the mission.**
- Reports live in memory: a page reload (`goto` to a new URL with `?`) loses them.
  Moving between views with clicks or `goto '#/…'` keeps them.
- "Open in Preview" is switched off (it would open another app). Scanning
  and workspace changes are switched off. The SQL console is **on** (report
  query cells run through it). Do not test the SQL console page itself; it is out of scope.
- The in-app **PDF preview does render** headless: judge it like any screen.
- The sidebar's open snapshot is pinned (see the table in §2) and snapshots of
  *newer commits* are hidden from the app, so a new report's header must read
  "Runs on … analysis r<N>" with the revision in the table. If it does not,
  stop and write "SANDBOX BROKEN". (Hiding newer commits works around a
  known product bug: reports default to the newest-by-commit snapshot, not the
  open one. It is already recorded; do not report it again.)
- Native `title` tooltips do not render in screenshots; `look` prints them.
- A `<datalist>` (the component suggestions) does not render headless; `look`
  lists the suggestions while the field is focused.
- Workspaces marked "analysis revision 0 (old)" are old scans on purpose: we
  want to see how templates behave on them. Old-scan warnings are expected;
  judge whether they are *clear*, not whether they appear.
- The owner's other in-progress work (lenses, connections) is in this build.
  Report problems you meet there only if they block a report.

---

## 4. The shared procedure (run for every test case)

Each test case in §6 says which steps change. Number your notes by step
(e.g. `TC-SPRING-1 / G3`) so findings can be traced.

### G. The gallery (before creating anything)

- **G1** Evidence → "Start a report" (empty state) or "New report" (toolbar).
  Note what opens and how fast. Screenshot the first view of the dialog once per mission.
- **G2** Find the template in the left list. Note which group it sits in
  ("For <workspace>", "Quick wins", "General", "Other ecosystems"). Is the
  second line under its name clear?
- **G3** Read the band at the top right *word for word*: name · audience,
  summary, "Use it when…", the tally line ("Writes N sections: …"), the
  prompts line, and "Leaves out …". Apply the junior lens (§1). Does the
  "Leaves out" reason make sense?
- **G4** If the template takes a component: note the prefilled value; is it
  obvious what to type and why? Try the suggestion list (`look` with the field focused).
- **G5** Scroll the whole preview (`text`). Note: paragraphs still "counting"
  after 20 s; any error text; any paragraph that reads oddly; slot cards and
  their wording ("Add it from …"); table placeholders.
- **G6** Footer: name field (default name sensible?), "Explain the terms"
  checkbox, "Then take the N figures…" checkbox. Leave both **on** unless the
  test case says otherwise.

### C. Creating and taking figures

- **C1** Click "Create report" (or ⌘↵). Note what happens on screen, in order,
  and anything that jumps or flashes.
- **C2** If a taking run starts: for **each** slot, note the view that opened,
  how long "Waiting for … to draw" lasted, what "Asked for" shows (checks or
  orange alerts), and whether the preview holds a figure or table. Press
  "Fill and next" / "Fill and finish". If a view draws nothing to take, note
  the exact message and press Skip. Screenshot at least one import preview per mission.
- **C3** After the run: where do you land? Is it clear the run finished and
  which slots were filled or skipped?

### R. Reviewing the report page

- **R1** `text` the whole report. For every **computed paragraph**: are the
  numbers plausible and consistent with each other and with other sections?
  Any "The snapshot has no …" / "absent" text: is it fair, and is it
  understandable?
- **R2** Every **table/query cell**: did it run? Row count sensible? Column
  headers readable by a junior (flag raw metric ids and snake_case)? Any
  column whose meaning you cannot guess? Values like `null`, `—`, `0` where
  a number is expected?
- **R3** Every **slot**: filled (figure/table visible) or still a hatched
  card? If filled, is the figure readable at report width?
- **R4** Every **explanation paragraph** (the plain-words text under a
  heading): does it actually help a junior read the evidence below it?
  Anything wrong or contradicting the numbers?
- **R5** The **outline** panel on the left: does it match the sections?
  Click one outline entry: does it scroll to the right place?
- **R6** Click one computed paragraph and one table cell: read the Cell pane
  on the right (what it counts, its settings). Understandable?
- **R7** Fill **every prompt** (grey italic lines): click it and type one
  realistic sentence, then Escape. Does the prompt disappear as you type? Can
  you get back out easily? Does anything jump?

### P. The PDF (every test case ends here)

- **P1** Open the PDF preview (toolbar "PDF", or ⌘⇧E). Note the header text
  (how many slots still to add, etc.), the A4/Letter toggle.
- **P2** Click "Save PDF…". Note the "Saved to …" line. Check the file exists
  in your mission folder.
- **P3** Check the PDF (§2): title and provenance line (compare the snapshot
  time with the sidebar's open snapshot); every section present; prompts and
  unfilled slots **not** printed; your typed sentences **are** printed;
  computed paragraphs as plain prose (no `**`, no backticks); tables readable
  (not cut at the page edge, headers readable, not hundreds of rows); figures
  present and legible; captions and numbering ("Figure 2", "Table 3") match
  the page; page breaks that split a heading from its content.
- **P4** Keep the PDF in the mission folder. Name nothing yourself; the app names it.

### T. Transitions and screenshots (run 2: required)

The flow is judged from these, by a design reviewer who was not there. Do it
for every test case, as you go.

**Screenshot names:** `shots/<TC>__<stage><nn>-<slug>.png`, e.g.
`shots/TC-SPRING-1__C03-take-hotspots-modal.png`. Stages: **G** gallery,
**C** create and taking figures, **L** landing after create or after the run,
**R** reading the report, **W** writing (prompts, insert, save as template),
**P** PDF preview and export. Number within the test case (`G01`, `G02`, …).

**Required shots per test case (at least):**
- G: the gallery as it first opens (once per mission), the template selected
  with its band and the top of the preview, the preview scrolled once.
- C: the screen right after clicking Create; **every** take modal; **every**
  take failure or mismatch message; the bar while waiting if it waits > 2 s.
- L: where you land after the run (before you scroll).
- R: the report top; then scroll through the whole report taking one shot per
  screenful (so the full report is covered at desktop size); the Cell pane
  for one computed paragraph and one table.
- W: a prompt before, while and after typing.
- P: the PDF preview sheet; the "Saved to" line.

**Transition notes:** after every click that changes the screen (open the
gallery, pick a template, Create, each take step, Skip/Stop/Back, landing,
outline click, opening the PDF preview, Save), write one line in
FINDINGS.md under the test case:

`T: <what you did> → <what happened, where you ended up> · expected: <what you thought would happen> · <shot name>`

Mark a line with **⚠** when the transition surprised you, jumped, flashed,
took more than 2 s without feedback, lost your place, or left you unsure
what to do next. Those are the flow findings; also write each ⚠ as a P2
finding block if it is more than a moment's hesitation.

**Shot index:** keep `shots/INDEX.md` with one line per screenshot: the file
name and a one-line caption of what it shows. A reviewer will read the index
first and open shots from it.

### F. Findings (write as you go, not at the end)

Append to `<mission folder>/FINDINGS.md`, one block per finding (if the
tool refuses to write the file, keep going and put the complete FINDINGS
content, transition lines included, in your final reply):

```markdown
### [P1|P2|P3] <one-line title>
- Test case / step: TC-XXX-N / R2
- Where: <template> › <section> › <cell or control>  (workspace, snapshot)
- What happened: <exact text quoted, or what you saw>
- Expected: <what a junior dev / a careful product would expect>
- Evidence: shots/<file>.png, <pdf name> page N
- Repro: <shortest steps>
```

Then, at the end of each test case, one line: `TC-XXX-N: done — N findings, PDF <file>`.
At the end of the mission, a short **Summary** (≤ 150 words): the three worst
problems, and anything that worked notably well.

**Rules of thumb**
- Quote exact text. "Confusing wording" without the words is not a finding.
- One finding per problem; if the same problem repeats across templates,
  add the new place to the first finding instead of a new block.
- Say "could not tell" rather than guess. Do not read the source code.
- Timebox: about 70 driver actions per test case. If you are stuck for more
  than 6 actions, write it down as a finding (that *is* the UX problem) and move on.
- Never click Delete on anything. Never change workspaces except as your mission says.

---

## 5. Expected facts (so you can tell a bug from a surprise)

These come from the facilitator's own queries against the same snapshots.
They are for comparison only; a difference is worth a finding.

- **BroadleafCommerce (M1):** Spring; 23 controllers, 660 services, 67
  repositories, 165 entities outside tests; 67 references run from
  Repositories back up into Services (most in `OrderDaoImpl`); the busiest
  controller is `AdminBasicEntityController` (13 GET, 18 POST mappings);
  `broadleaf-admin-module` uses `broadleaf-common` 244 times without declaring
  it; no lens, 459 components (so a "Dependency matrix" slot **cannot** be
  taken; the take bar should say why: "has nothing to take: The matrix has …
  columns"); no dependency rules (rule sections are left out).
- **fineract (M2):** Spring with JAX-RS resources (`@Path`) rather than
  Spring MVC controllers: the anatomy counts 1 "Controller", while the web
  layer table lists ~170 entry points, most "JAX-RS resource" with blank
  GET/POST columns (blank, not 0, is intended); Gradle build, so "Module drift
  check" leaves both sections out; `Loan` is used by ~357 classes; ~1,178
  references skip a layer (Services → Entities).
- **django-oscar (M3):** Django; 29 apps; `oscar.apps.catalogue` has the most
  migrations (32); oscar keeps models in `abstract_models.py`; views reach
  models dynamically, so app-to-app references are few (8 rows).
- **Sylius (M4):** run 2 uses a newer revision-4 scan of the same commit, so counts may differ slightly from these. Symfony; bundles such as `CoreBundle` (597 classes, 74 form
  types); many tests (3,623 test files).
- **LibreChat (M5):** React; 643 components, 129 hooks; `useLocalize` used
  from 15 folders; old scan (revision 0): files have no roles, so "Tests"
  sections are left out.
- **gin (M6):** Go; one big root package `.`; internal package
  `internal/bytesconv` imported by `render`, `.` and `binding`; old scan.
- **nopCommerce (M7):** .NET; no annotations recorded (old scan), so roles come
  from file names; `ProductController.cs` 4,361 lines, code health 2.4; 40 projects.
- **archstats-ui (M8):** 6 snapshots (so Changes and Trends have something to
  compare); Go + Vue/TypeScript; no framework profile matches (sorted "by structure").
- **npo-data-pipeline (M9):** Python (174 .py files) with some Terraform and Go; old scan.
- **Known candidate (verify, do not assume):** the report header and PDF name
  a snapshot by its *commit* time (e.g. "snapshot 25 Sep, 09:09") while the
  sidebar names the same snapshot by *scan* time ("25 Sep, 17:30").

---

## 6. Test cases

Each case: **workspace**, **template** (left-list name), **settings**, and
**probe**: what to look at hardest in that template, on top of §4.

### General templates

**TC-GEN-ARCH-1 · Architecture review** (M2 fineract; defaults)
- Probe: Structure paragraph (tangles, propagation cost, levels): can a junior
  follow it? The four slots: "Dependency matrix, in levels" (459+ components,
  expect a clear can't-take message), "Dependency structure", "The main
  sequence" (a scatter plot: is the explanation above it enough to read it?),
  "Churn against code health". Coupling table headers (instability, distance
  from main sequence). Code health table. Hotspots. The Findings and
  Recommendations prompts.

**TC-GEN-ARCH-2 · Architecture review, explanations off** (M7 nopCommerce; untick "Explain the terms")
- Probe: the tally line updates; the report reads cleanly without the
  explanation paragraphs (does anything now dangle, e.g. "In the table…"?);
  old-scan (revision 0) behaviour: what is left out and how it is worded.

**TC-GEN-EXEC-1 · Executive summary** (M2 fineract)
- Probe: is it really one page of plain language for leadership? Count PDF
  pages. Is any term left that a non-engineer could not read? The
  "Where changed lines went" and "Where change meets hard code" figures.

**TC-GEN-DD-1 · Technical due diligence** (M2 fineract)
- Probe: "Scope" prompt comes before any evidence: natural? "Work over time"
  figure (Activity), knowledge section ("bus factor" wording), maintainability
  (health, code age, least-healthy files table, "Code age" treemap),
  third-party libraries, tests. PDF length and table widths.

**TC-GEN-ONB-1 · Onboarding guide** (M3 django-oscar)
- Probe: would a new developer actually learn the codebase from it? "The
  codebase by directory" (a table slot from Metrics → Directories), "Who
  imports whom" (chord), the largest components query, "Who knows what".

**TC-GEN-REF-1 · Refactoring case** (M5 LibreChat; component = the prefilled one; then change it once to another suggestion before creating)
- Probe: the component field (prefill, suggestions, what happens to the
  report name and preview when you change it); the "focus" paragraph; "Files
  of <component>" table; dependents/dependencies tables; the tangle figure.

**TC-GEN-DEBT-1 · Technical debt register** (M3 django-oscar)
- Probe: hotspot files table (15 rows), "Churn against code health" plot,
  "Nesting depth" treemap, least-healthy files, circular dependencies section
  and "Cycles in the largest tangle" figure. Is it clear how to turn rows into
  backlog items?

**TC-GEN-OWN-1 · Ownership and knowledge** (M5 LibreChat)
- Probe: knowledge paragraph (numbers per component, "four fifths"), the
  "Knowledge by component" table slot (Authors view), "Work over time",
  "Authors against churn" plot, the 180-day change table. Are author names
  printed anywhere they should not be (the paragraph promises "No names are written")?

**TC-GEN-DEP-1 · Dependency audit** (M4 Sylius)
- Probe: libraries paragraph ("rolled up to two parts", "platform modules"),
  Libraries table slot, build modules table (many composer and node modules),
  between-components coupling, rules section if present.

**TC-GEN-MOD-1 · Modularization plan** (M6 gin)
- Probe: on a small Go codebase with one huge root package: does the plan
  still make sense? "Dependency matrix, in levels" (≤ 40 components: expect it
  to fill), "What changes together" (co-change graph), candidate modules figure.

**TC-GEN-CHECK-1 · Health check-in** (M8 archstats-ui)
- Probe: "Since last time": Trends figure and "What changed since the last
  snapshot" (Changes view, 6 snapshots). After creating it, use the
  "Snapshot the cells run on" selector (toolbar) to switch the cells to an
  older snapshot and back: do paragraphs say what moved ("Since the last
  run…")? Is that flow understandable?

### Quick wins

**TC-QW-IMPACT-1 · Change impact** (M6 gin; component `internal/bytesconv`, typed into the field)
- Probe: the component field with a typed value; "How far a change can
  reach" (steps), dependents list with "shortest import chain" or "next step
  toward it"; "What changes with it"; the combined imports-and-co-change figure.
  Then **TC-QW-IMPACT-2**: same template, leave the field **empty** before
  creating: what does the report say?

**TC-QW-HIDDEN-1 · Hidden coupling** (M4 Sylius)
- Probe: the explanation of hidden coupling; the table's last column ("% of the
  quieter one's commits": understandable?); the "Hidden coupling" table slot
  and "What changes together" figure.

**TC-QW-LOAD-1 · Load-bearing components** (M4 Sylius)
- Probe: table columns (dependents, health, commits, "reached by tests"); the
  main-sequence figure and its explanation.

**TC-QW-TEST-1 · Where tests are missing** (M9 npo-data-pipeline; old scan)
- Probe: what happens on an old scan with no file roles: what is left out and
  why; is the report still worth anything?

**TC-QW-CLEAN-1 · Cleanup candidates** (M9 npo-data-pipeline)
- Probe: the "check before deleting" warning; both tables; "Code age" treemap.

**TC-QW-TWOWAY-1 · Circular dependencies to break first** (M6 gin)
- Probe: on Go (the explanation says Go forbids import cycles at package
  level): does the report contradict itself if it finds pairs? Matrix slot.

**TC-QW-30D-1 · The last 30 days** (M8 archstats-ui)
- Probe: churn paragraph, files changed most, hotspot files touched, new
  files, activity figure. Numbers consistent across the four?

### Framework templates

**TC-SPRING-1 · Spring application review** (M1 BroadleafCommerce)
- Probe (heaviest template, take your time): Roles paragraph; web layer: the
  two tables (by package, every entry point with GET/POST/PUT-PATCH/DELETE
  and "classes it uses"): readable? "Services" and "@Transactional";
  Repositories and entity model (two tables); "Do the layers hold?" (the
  layers paragraph, "How Controllers and Services relate" figure from the
  Classes view, "Entry points that skip the services", "Repositories and
  entities that reach up…" with the "which is" column); "Beans that switch on
  and off" (85 rows: too long for a PDF?); Hotspots and treemap. PDF length.

**TC-SPRING-2 · Spring application review on JAX-RS** (M2 fineract)
- Probe: the roles paragraph says ~1 Controller while the web table lists
  ~170 entry points: is that contradiction explained well enough? Blank
  GET/POST columns for JAX-RS rows: clear or confusing?

**TC-SPRING-3 · Spring layering check** (M1 BroadleafCommerce)
- Probe: "Services and Repositories" flow figure, the matrix slot (expected
  can't-take message: clear?), the two violation tables, the missing
  @Transactional section ("Leaves out" reason), the closing prompt.

**TC-SPRING-4 · JPA entity model** (M1 BroadleafCommerce)
- Probe: entity tables (most used, links: the "entities it refers to" column
  can be very long: how does it print?), "Entities no repository uses",
  inheritance table, entities used by controllers, the "Repositories and
  entities" flow figure.

**TC-JVM-1 · Multi-module build review** (M1 BroadleafCommerce)
- Probe: "Modules, the most depended on first"; "Module to module, by
  references" with "in its build file: declared / not declared": does a junior
  understand what "not declared" means and why it matters?

**TC-JVM-2 · Module drift check** (M1 BroadleafCommerce) and **TC-JVM-3** (M2 fineract, Gradle)
- Probe (M1): the two tables and the closing prompt. (M2): both sections left
  out: is the reason understandable, and is a report with only prompts left
  still sensible to create? What does its PDF contain?

**TC-DJANGO-1 · Django project review** (M3 django-oscar)
- Probe: "Apps and what they hold" (views 0 for some apps: surprising?);
  roles paragraph (Django roles by file name); "App to app" with "of its
  models"; "Apps and their imports" chord figure; the largest view/model files;
  migrations. The explanation mentioning `abstract_models.py`.

**TC-DJANGO-2 · Django app boundaries** (M3 django-oscar)
- Probe: "Apps nothing else uses" (12 rows: plausible?), circular dependencies
  section, matrix slot (≤ 40? note result).

**TC-PY-1 · Python codebase review** (M9 npo-data-pipeline)
- Probe: packages table; request handlers and data classes sections (likely
  left out: reason clear?); the mixed Python/Terraform/Go repo: does the
  report pretend it is all Python?

**TC-NODE-1 · JavaScript/TypeScript workspace review** (M5 LibreChat)
- Probe: packages and "package to package"; roles + layers paragraphs
  (React profile); tangles; libraries.

**TC-REACT-1 · React front end review** (M5 LibreChat)
- Probe: the explanation of the two meanings of "component"; "Folders by React
  components and hooks" (103 rows: PDF?); shared hooks; data fetching; layers
  paragraph ("Components → Hooks → Data & Clients"); "How Components and Data &
  Clients relate" figure; hotspots by directory treemap.

**TC-GO-1 · Go module review** (M6 gin) and **TC-GO-2** (M8 archstats-ui, where Go is only part of the code)
- Probe: packages table ("exported" column), tagged structs (M6: test structs
  such as `testJSONAbortMsg` appearing?), directives, "packages everything
  imports", the Go paragraph about internal packages. M8: does a Go template on
  a mostly-Vue codebase read sensibly?

**TC-NET-1 · .NET solution review** (M7 nopCommerce)
- Probe: projects table (references column long?), "Projects by the roles
  their file names give away", largest controllers ("controller file" paths),
  roles/layers paragraphs on an old scan without markers.

**TC-PHP-1 · PHP application review** (M4 Sylius) and **TC-PHP-2 · Symfony bundle review** (M4)
- Probe: packages by role (many columns: PDF width?), package to package,
  bundles by what they register, the bundle explanation.

### Flows beyond one template

**TC-X-BLANK · Blank report** (M8)
- Create "Blank report". Type a heading and a paragraph, then use "/" (Insert)
  to add one computed paragraph ("Facts, written out") and one table preset.
  Is inserting understandable? PDF.

**TC-X-SAVE · Save as template, then reuse it** (M8; after TC-GEN-CHECK-1)
- On the check-in report: report overflow menu → "Save as template…". Read the
  dialog (name, what it is for, "Turn my paragraphs into prompts", the
  checklist). Save. New report → the "Yours" group → pick it → create →
  PDF. Does the saved template bring what the dialog promised?

**TC-X-OTHER · A template for another ecosystem** (M7 nopCommerce)
- Open "Other ecosystems" in the list, pick "Spring application review" on
  this .NET codebase. Read the band ("not found here"?), "Leaves out".
  Create it. Is the result honest and useful, or confusing? PDF.

**TC-X-ESC · Leaving a taking run halfway** (M3, during TC-DJANGO-1's run)
- On the second slot press Escape (pause). Read the bar. Use "Back to report".
  Then resume the run ("Resume taking · N left" in the toolbar). Understandable?

**TC-X-LETTER · Page size** (M4, on TC-PHP-1)
- In the PDF preview switch A4 → Letter, save again. Two PDFs; any layout difference that breaks?

---

## 7. Missions

Each tester runs the cases in this order. Budget: the whole mission in one go.

| Mission | Workspace | Test cases, in order |
| --- | --- | --- |
| **M1** | BroadleafCommerce | TC-SPRING-1, TC-SPRING-3, TC-SPRING-4, TC-JVM-1, TC-JVM-2 |
| **M2** | fineract | TC-SPRING-2, TC-JVM-3, TC-GEN-ARCH-1, TC-GEN-EXEC-1, TC-GEN-DD-1 |
| **M3** | django-oscar | TC-DJANGO-1 (with TC-X-ESC), TC-DJANGO-2, TC-GEN-ONB-1, TC-GEN-DEBT-1 |
| **M4** | Sylius | TC-PHP-1 (with TC-X-LETTER), TC-PHP-2, TC-GEN-DEP-1, TC-QW-HIDDEN-1, TC-QW-LOAD-1 |
| **M5** | LibreChat (TypeScript) | TC-REACT-1, TC-NODE-1, TC-GEN-OWN-1, TC-GEN-REF-1 |
| **M6** | gin (Go) | TC-GO-1, TC-QW-IMPACT-1, TC-QW-IMPACT-2, TC-QW-TWOWAY-1, TC-GEN-MOD-1 |
| **M7** | nopCommerce | TC-NET-1, TC-GEN-ARCH-2, TC-X-OTHER |
| **M8** | archstats-ui | TC-GEN-CHECK-1, TC-X-SAVE, TC-QW-30D-1, TC-GO-2, TC-X-BLANK |
| **M9** | npo-data-pipeline | TC-PY-1, TC-QW-TEST-1, TC-QW-CLEAN-1 |

Coverage: all 10 general templates, all 7 quick wins, all 14 framework
templates, plus blank, saved-template, other-ecosystem, pause/resume and page-size flows.
