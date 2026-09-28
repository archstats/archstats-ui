# Report templates: improvement plan (2026-09-26)

From the two QA runs in [FINDINGS.md](FINDINGS.md). Finding ids (P1-n, P2-n,
P3-n, F-n) point there. Sizes: **S** under half a day, **M** about a day,
**L** several days.

## Order and why

1. **Phase 1: trust.** A report that mixes snapshots, contradicts itself or
   prints someone's email is worse than no report. Nothing else matters until
   the numbers can be relied on.
2. **Phase 2: the flow.** Rebuild the middle of the journey (create → take
   figures → land) around the report instead of around the views.
3. **Phase 3: words.** Per-ecosystem examples, grammar, labels. Cheap, and
   best done once the structure has stopped moving.
4. **Phase 4: verify.** Unit tests per fix, then re-run the QA missions that
   found the problems, plus an impeccable critique of the key screens.

Each phase ships on its own. Within a phase, items are ordered by how much
of the damage they undo.

---

## Phase 1 · Trust (P1)

### 1.1 Reports run on the snapshot that is open · S · P1-1, F-3
- `createFrom` and the blank-report path set `kernel` to the open snapshot's id
  (`workspaces.openScanId`), not `"newest"` (`reports.store.ts:134, 156`).
- The toolbar select keeps "Newest snapshot" as a choice, labelled as such,
  but a new report never defaults to it.
- One name for a snapshot everywhere (sidebar, report header, PDF, cell
  provenance): commit date and short hash, plus "scanned <date>" where two
  scans share a commit. Today the header uses commit time and the sidebar scan time.
- **Done when:** on Broadleaf and Sylius (revision-0 scans of newer commits
  beside revision-3/4 scans of older ones), a new report's header, paragraphs,
  tables and figures all name the open snapshot.

### 1.2 Figure-taking takes the right thing · M · P1-3, P1-14, P1-15, P1-17, F-8
- **A slot names what it wants,** not just a kind: add an optional
  `exportable` (title or id) to the slot spec. `useSlotTaking` waits for *that*
  exportable, not for `pickFor(kind)` (`useSlotTaking.ts`). The Knowledge slot
  asks for the per-component knowledge table, never the author leaderboard.
- **"Ready" means the data is there:** add `ready()` to `TableExportable` and
  make it false while async columns load. `DirectoryTree` loads commits after
  first paint (`DirectoryTree.vue:129-137`), which is why a captured table
  showed "—" in every commits cell.
- **Views keep their settings in the URL:** Hotspots removes `?preset=` after
  applying it, and a second watcher can pick the default preset afterwards
  (`hotspots.vue:530-554`). Keep the preset in the route and let the route win.
  Then the "taken as Hotspots" mismatch only appears when it is real.
- **Ask for figures the data can give:** the Classes-view slots ask for a
  fixed pair of roles (`flow=controllers,services`), which has no references on
  JAX-RS code, so the view falls back to its overview (`units.vue:290-297`).
  Make the overview ("How the layers lean") exportable as a figure, and fall
  back to it with a sentence saying so. Rename the take-bar label "Classes" to
  the view's name, "Units".
- **Changes compares different code:** `pickSides` picks the newest older
  snapshot, even a rescan of the same commit (`features/trends/changes.ts:40`).
  Prefer the newest snapshot of a *different* commit; fall back to a same-commit
  rescan only when there is nothing else.
- **Done when:** on fineract, due diligence's Table 1 is per component with no
  names; Onboarding's directory table keeps its commits; every Hotspots slot is
  taken as asked with no warning; Spring review's flow figure is taken; the
  check-in's Changes slot fills.

### 1.3 Tables keep all their data · M · P1-2, P2-1, P2-2, P2-3, P1-11
- **Slots take every column:** the Add-to-report sheet pre-selects the first
  five columns (`AddToReportSheet.vue:400`). For slot fills, take all of them;
  for manual adds, keep the choice but say "5 of 12 columns".
- **The PDF says what it cut:** print "22 of 170 rows" under a capped table,
  number only what is printed (Table 1, 2, 3, not 1, 2, 4), and add a line at
  the end: "Not included: Table 3, Dependency matrix (1,156 components are too
  many for a matrix)".
- **PDF table layout:** wrap long text instead of cutting it, size columns by
  content, and switch tables of 7+ columns to a smaller type or a landscape
  page instead of dropping columns.
- **On screen:** replace `direction: rtl` truncation (`NotebookCell.vue:179`)
  with a middle ellipsis that keeps both ends (`org.broadleaf…controller.entity`)
  plus a tooltip. That also fixes `.github` reading `github.`.
- **Done when:** the gin matrix has all 8 columns; Spring review Table 2
  shows "22 of 170" in the PDF; no header or identifier prints as "G…" or
  "…roller"; the PDF numbering has no gaps.

### 1.4 One definition per number · L · P1-4, P1-5, P1-6, P2-8
One rule: **every number states its scope, and the paragraph and the table
under it share that scope.**
- **Production-only by default:** add a production scope to the table presets
  (`f-hotspots`, `c-hotspots`, `c-health`, `c-size`) and to the template SQL that
  claims it (largest components, cleanup, Go tagged structs, Python packages).
  When the snapshot has no file roles, say "tests are included: this scan did
  not sort files" instead of claiming otherwise.
- **The root package:** decide once whether `.` counts. Suggested: include it
  and name it "(root)" everywhere. Today the Go paragraph says 7 packages
  against an 8-row table, and Change impact says 3 dependents against a table of 2.
- **Change impact steps:** on snapshots before revision 3,
  `shortest_path_length` counts nodes, not hops; subtract one there (check the
  revision in `_snapshot`).
- **React counts:** use one definition of a React component (the profile
  rule) in both the paragraph and the table.
- **Spring roles:** count JAX-RS `@Path` resources as web entry points in the
  Spring profile (it also improves the Classes view); if Spring counts and roles
  still differ, say which method each uses.
- **Symfony entities:** extend the Symfony profile's entity lane beyond
  `@Entity` / `ORM` (for example `ResourceInterface` and `*\Model\*` namespaces)
  so the roles count agrees with the "entities and models" column.
- **Libraries:** treat imports under the project's own namespaces as internal
  (`Sylius\Resource`, `src/Sylius`), not as libraries; do not count them in
  "99 libraries".
- **Mixed repositories:** give the anatomy readings and the libraries reading
  a language filter, and have the Go template use it, so a Go review of a
  Go + Vue repo describes the Go.
- **History totals:** show the same commit and author counts as Overview
  (bots hidden, files in the snapshot), or label them "whole history,
  including bots".
- **Third-party code:** the health table leaves out `third_party` files, as the
  explanation says.
- **Done when:** the eleven rows of the P1-4 table agree, or each says why.

### 1.5 Honest output on thin or old snapshots · M · P1-5, P1-10, P1-9, P1-16, F-2
- **Explanations follow their evidence:** a "how to read the figure"
  paragraph belongs to its slot and prints only when the slot is filled.
  Store it as the slot's caption, not as a separate paragraph.
- **Editor text never prints:** an "absent" reading that is an instruction
  ("Choose a component for this paragraph.") is left out of the PDF; the
  Change impact template requires a component before Create.
- **Missing data is said as missing:** when the snapshot has no
  `unit_connections`, the layers reading says "this snapshot does not record
  which classes use which" instead of "No reference runs between two roles".
  The JS/TS reading uses the `reactImporters` guard before claiming React components.
- **Slow queries:** report cells get a longer timeout than the console (for
  example 30 s), and the entity queries are rewritten to one pass. A timeout
  prints as a sentence ("This table took too long on this snapshot"), not as a
  bare "stopped after 10s".
- **Empty reports:** the gallery greys out a template whose evidence is all
  left out, with the reason, and asks before creating it anyway.

### 1.6 Smaller P1s · S each
- Go module paths keep their dots in the libraries paragraph (P1-8).
- `tally()` counts table slots as tables, not figures, in the band and the
  "Then take…" checkbox (P1-12).
- Reproduce "report duplicated after a paused run" (P1-13), then fix.
- JPA entity model: find why its taking run did not start (F-5), then fix.

---

## Phase 2 · The flow (F-n)

### 2.1 Create lands on the report · M · F-4, F-5
- Create opens the report and stays there. No automatic run.
- At the top of a new report, a **"Figures to add"** block lists the slots
  ("Figure 1 · How Controllers and Services relate, from Units") with **Take
  all**, and a take action per slot. It disappears once every slot is filled
  or dismissed.
- The header never flashes "5 cells ran elsewhere" on a new report: cells run
  before it opens, or show "Counting…".

### 2.2 A guided take is a thin strip, not a modal · L · F-6, F-7, F-8, F-10
- During a run, the view shows one strip above it: slot name and number, the
  "Asked for" chips, a small preview of what will be taken, and **Take · Skip ·
  Stop**. No report picker, no place tree, no appearance switch (those stay
  in the manual Add to report sheet).
- Settings are applied before waiting (Phase 1.2). A mismatch that remains is
  shown in the strip with "Take it as asked".
- One meaning per control: **Stop** ends the run and returns to the report;
  **Skip** moves on; Escape pauses. The app banner is hidden during a run.
- The status follows the view: no "Waiting for … to draw" once the view has
  shown its own reason.

### 2.3 Failures explain themselves · M · F-9, P1-17
- When a view cannot provide the slot, the strip quotes the view's own
  reason (the exportable's `disabledReason` or the view's empty-state text):
  "Changes: no structural changes between these two scans of eea60c6."
  It then offers Skip, or "Set it yourself" with the view left open.

### 2.4 The run ends with a summary · S · F-11
- Back on the report top: "2 of 3 figures added. Skipped: Table 2, Changes
  had nothing to compare." A link to each skipped slot.

### 2.5 The gallery · M · F-1, F-2
- **Pre-select** the best-fitting template (highest detection confidence,
  largest language share), or Architecture review when unsure. Never the
  JS/TS review on a mostly-PHP or mostly-C# codebase.
- **Search** the list; group quick wins by the question they answer.
- **"Leaves out" first,** styled as a warning, not the last grey line.
- "Python codebase review" on a Django project says "Django project review
  covers this codebase", not "not found here".

### 2.6 Room for the document · S · F-12, P2-7
- The Pool/Cell panel is closed on the report until a cell is selected or
  Pool is opened.
- The report title wraps instead of clipping.

### 2.7 Writing · M · F-14, F-15, F-17, F-13
- "/" at the start of an empty line opens the Insert menu, as the placeholder promises.
- Template explanations are marked as such (`explain: true` on the block):
  Save as template keeps them as explanations and keeps the "Explain the
  terms" option; only the user's paragraphs become prompts. Show a
  confirmation after saving.
- Editing an explanation paragraph shows italics, not `*asterisks*`; "1)"
  does not turn into a numbered list.
- A small "3 prompts to write" count next to "Take 1 figure".

### 2.8 The PDF · M · F-16, P2-4, P2-5, P2-6
- Keep a heading with what follows it and a table's lead-in with the table.
- The "Not included" line from 1.3.
- The executive summary fits one page: one figure, not two, and shorter
  explanations when printed for leadership.
- "By group" graphs of hundreds of components: ask the view for a grouped
  picture (a lens), or skip the slot with a sentence, rather than printing a dot cloud.

---

## Phase 3 · Words (P3)

### 3.1 Examples in the codebase's own language · S · P3-1
`ABOUT.libraries` and `EXPLAIN.roles` take the ecosystem: `@Service` and
`org.springframework` for Spring; `models.py` and `django.contrib` for Django;
`github.com/...` for Go; `@tanstack/react-query` for React; `Symfony\Component`
for PHP; `Microsoft.EntityFrameworkCore` for .NET.

### 3.2 Grammar · S · P3-2, P3-3
- Propagation cost: "Propagation cost is 16%: 16% of all ordered pairs of
  components are linked by a chain of imports."
- Singular forms for role labels (the profiles gain a singular: "1 Controller"),
  "1 import breaks 1 rule", "All 1 rule holds" → "The 1 rule that applies holds",
  no possessive on a label ending in s ("carry the Go services profile's…").

### 3.3 Labels and headers · S · P3-4 to P3-10
- Query tables use Title Case headers like the presets ("Package", "Classes").
- "Runs on newest" → "Snapshot: 4 May, 23:57 · 8645873"; "5 cells ran
  elsewhere" → "5 cells not run on this snapshot yet".
- Rewrite the "Leaves out" reasons as sentences ("this scan is older than the
  code-age measure; scan again to include it").
- "The middle component" → "A typical component (the median)"; label the
  whole-codebase and outside-tests counts in the roles sentence.
- The "which is" column says what it checked ("reaches into: service or
  component / controller").
- Plain component names in the executive summary.

---

## Phase 4 · Verify

- **Unit tests:** kernel default on create; `pickSides` skipping same-commit
  rescans; slot-to-exportable matching; PDF numbering and the "Not included"
  line; the production scope in `tableSql`; revision-aware steps; singular
  labels; per-ecosystem examples; tally of tables against figures.
- **QA re-run** with the run-2 harness (`serve-qa.mjs`, `drive-qa.mjs`,
  TEST-PLAN §4-T), without hiding newer-commit snapshots (Phase 1.1 makes
  that unnecessary):
  - after Phase 1: M1, M2, M3, M4, M6, M7, M8 (the missions whose P1s it fixes);
  - after Phase 2: all nine missions.
- **Design review:** an impeccable critique of the gallery, the take strip,
  the landed report and the PDF preview, using the desktop screenshots of the re-run.
- **Target:** no P1 recurs; ⚠ transitions drop from 34 to under 10; the flow
  heuristic score rises from 22/40 to 30+.

---

## Not in this plan (engine side)

These need the archstats engine, not the UI:
- Instability computed from file-level counts, so it disagrees with component
  dependent and dependency counts (P1-4, last row; the known Ca/Ce issue).
- File age that treats a rename as a new file ("319 of 401 files new in 30 days", P2-9).
- Unit markers for Symfony models, if the profile change in 1.4 is not enough.

## Suggested first slice

Before anything else, 1.1, the Knowledge-slot part of 1.2, and the column
part of 1.3. They are small, and they remove the three ways a report can
currently mislead a reader outright: the wrong snapshot, someone's email, and
silently missing columns.

---

## Status (2026-09-26)

All four phases were implemented in the working tree (not committed). Run 3
(`VERIFY-R3.md`, `runs/2026-09-26-r3/`) checks them in the app.

| Item | State | Where |
| --- | --- | --- |
| 1.1 Kernel = open snapshot; one snapshot name | done | `reports.store.ts` `openKernel`, `workspace/snapshotName.ts` |
| 1.2 Slot takes the exportable it names; Hotspots keeps its preset; Units flow; Changes compares another commit | done | `useExportables.pickFor(kind, take)`, `useSlotTaking.ts`, `hotspots.vue`, `LaneFlow.vue`, `trends/changes.ts` |
| 1.3 Slot fills keep every column; PDF wraps, sizes columns by content, smaller type for 7+ columns, "N of M rows", no numbering gaps, "Not included"; middle ellipsis on screen | done | `app/report/pdf.go`, `reportCells.ts` `printedBlocks`, `NotebookCell.vue` |
| 1.4 One scope per number | done, two gaps | production scope on presets and template SQL (tests and vendored code guessed by path on scans without roles); root "." counted and shown "(root)"; steps − 1 before revision 1; one React definition; Spring counts `@Path`; Symfony "Entities & Models"; own namespaces not libraries; Go review filtered to Go; history totals labelled. **Gaps:** instability still from the engine's file-level Ca/Ce; the hidden-coupling view slot shows all pairs beside a production table |
| 1.5 Honest output | done | "does not record which classes use which"; React claim needs react imports; report queries get 30 s (`QueryService.ReportConsole`) and a timeout prints as a sentence; entity SQL in one pass; gallery greys empty templates |
| 1.6 Smaller P1s | done, one open | Go names with dots; tally tables vs figures; JPA run (cause: only figure slots started a run). **Open:** P1-13 (duplicate report) has no code path found |
| 2.1–2.4 Flow | done | Create lands on the report; "Figures to add" box; the run is a strip (`SlotFillBar.vue`) with Adjust / Take / Skip / Stop; failures quote the view; summary at the end |
| 2.5 Gallery | done | `bestTemplate`, search, "Leaves out" as a warning, Python listed under Django, "Create it anyway" |
| 2.6 Room for the document | done | pane closed until a cell is selected; title wraps |
| 2.7 Writing | done | "/" fallback, "1)" prose, Insert search by group, explanations edit on double-click and survive Save as template, confirmation, prompts count |
| 2.8 PDF | done | keep-with-next in Go; executive summary one figure and one short note; graphs over 300 components left out with a sentence |
| 3.1–3.3 Words | done, one deferred | ecosystem examples, grammar, sentence reasons, headers, median, "reaches up into". **Deferred:** P3-8 plain names in the executive summary |
| 4 Verify | see run 3 | vitest 778 pass, `go test ./app/...` pass, every template's SQL and readings run on nine real snapshots with no error (slowest 1 s) |

### Run 3 result (`runs/2026-09-26-r3/M*/FINDINGS.md`)

42 checks across nine missions: 35 ✓, 2 partly (M6-1 root in prose, M6-3 not testable on gin), 5 ✗ (M1-4, M4-5, M7-3, M8-1, M9-1). Every ✗ and every new P1/P2 was then fixed in the code (not re-run in the app):

| Found in run 3 | Cause | Fix |
| --- | --- | --- |
| PDF headers break mid-word ("Componen/ts"), long ones cut with "…" (M3, M4, M5, M6, M7) | fpdf's `SplitText` takes the cell margin off twice; headers capped at 4 lines | width given back; headers may take 7 lines |
| On-screen names still cut, from the left or to nothing (M1-4) | the new head/tail split made a name with no separator all "tail" | no separator → ordinary end cut; name column at least 16ch; other text columns wrap |
| Heading alone at the foot of a page above its table (M5) | keep-with-next estimated the table's start too small | `tableStart` measures the title, header and first rows as they wrap |
| `lib_npm/elfinder` still least healthy (M7-3) | vendor paths did not know `lib_npm` | `lib_npm`, `wwwroot/lib`, `bower_components` added |
| "Compare anyway" blanks Changes (M8-1) | Go sends a tangle's empty sides as `null`; the page read `.length` | `normalizeChangeSet` where the comparison arrives |
| Go import table lists `frontend/…` (M8) | fan-in query not limited to Go | Go packages on both ends |
| Root "." in prose and import chains (M6) | anatomy's own name helper; chains are text | "(root)" there too |
| Run summary blames a 15 s timeout for a matrix too big to draw (M2) | the view registered nothing and said why only on the page | empty states carry `data-view-reason`, read by the run |
| Cleanup counts `conftest.py` in "(root)" (M9-1) | component lines include test files | lines summed over production files |
| Tally "3 tables, 1 table and 3 figures" (M2) | wording | "3 tables run from the snapshot, 1 table and 3 figures to add" |
| Long PDF name saved without `.pdf` (M8) | the QA harness's 120-character cap | harness keeps the extension (not an app bug) |

Round 2 (same day) closed what was still open; see the table below.


### Round 2 and runs 4–5 (2026-09-26)

| Was open | Cause | Fix | Verified |
| --- | --- | --- | --- |
| P1-13 whole report duplicated | the `add-to-report` command had no route guard: fired after the run returned to the report, it took the report's own Markdown export into a slot | command refuses on the report page and without a slot; `beginImport` refuses a report into itself; `fillSlot` never appends when the slot is gone; the run re-checks its route before taking; the gallery never reopens once the report exists | r4 A7: double "Fill and next" duplicates nothing (a reported side effect was a text-extraction artefact; the PDF is intact) |
| P3-8 package paths in the executive summary | readings print names as code | reading param `plain` → "fineract integrationtests" | r4 A5 |
| React 623 vs 604 | the roles classifier tried imports before the component rule | `ruleFirst` on the React components lane | r4 C1 (623 = 623) |
| Old scans: tests, vendored and non-code files | three different path rules | reports use the Overview's `guessRole`; `TEST_GLOBS` / `NON_PRODUCTION_GLOBS` give SQL the same rule, held to it by a test | r4 B4, B5, B6 |
| Composer fixtures counted per folder | test-fixture `composer.json` copies | modules under test folders left out, names counted once (Sylius 60 → 42) | r4 B2 |
| Instability disagreeing with its table | engine counts files | preset tables compute it from the dependents and dependencies they show | r4 A6 |
| Hidden coupling: production table beside an all-code view | the Files facet is a setting | a slot may ask `facet=production`; the run sets it and restores the viewer's | r4 B3 |
| Template name field appended | no selection after a click | suggested name stays selected until edited | r4 C7 |
| PDF: half-empty page before a big figure | figures moved whole to the next page | a lead-in moves only for a short gap; a figure shrinks (to half at least) into a mostly free page | r5 |
| Go review coupling paragraph named Vue folders (r4) | reading counted every component | reading param `ext` (Go, Python reviews) | smoke |
| Empty query tables printed headers only (r4) | — | "Nothing in this snapshot matches this table." on screen, in PDF and Markdown | r5 |
| Package paths wrapping mid-word on screen, comma lists in the PDF (r4) | `overflow-wrap: anywhere`; `group_concat` without spaces | identifiers in any column cut in the middle; lists get a space after each comma | tests |
| Report "…" menu invisible (r4) | opacity 0 until hover | shown at 60% on the open report | — |

Left as it is, on purpose: the engine's own `modularity__instability` (file-level Ca/Ce) is unchanged; changing it needs an analysis-revision bump and rescans. The reports no longer print it.
