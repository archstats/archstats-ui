# Report templates QA: findings (2026-09-25, runs 1 and 2)

Every report template was created through the real UI on a real snapshot and
taken to a saved PDF, twice, by a fleet of Sonnet testers, one per workspace,
following [TEST-PLAN.md](TEST-PLAN.md). **Nothing has been fixed.**

- **Run 1** (1500×950 screenshots): 67 PDFs. Its report is kept as
  [FINDINGS-run1.md](FINDINGS-run1.md).
- **Run 2** (desktop size: a 1440×900 window at 2×, so 2880×1800 screenshots):
  the same 30 test cases from scratch, every harness fix in place, and a
  transition protocol (a screenshot and a note at every screen change, ⚠ when
  it surprised the tester). 49 PDFs, 558 screenshots, each mission with a
  captioned `shots/INDEX.md`, in `runs/2026-09-25-r2/<M#>/`.
- **This report** merges both runs. Each finding says whether run 2
  reproduced it (**✓ r2**), found it new (**new r2**), or did not see it
  (**not seen r2**). The facilitator checked root causes in the code where one
  is named. The flow review and the list of screens for a design review are
  built from the run-2 desktop screenshots.

Priority: **P1** bug or unexpected behaviour · **P2** UX, readability, flow ·
**P3** wording a junior developer cannot follow. Mission ids point to
`runs/2026-09-25-r2/<M#>/` unless marked "run 1".

---

## The five to fix first

1. **Reports compute on a different snapshot than the one open** (P1-1).
2. **Numbers disagree inside one report**, in eleven places (P1-4).
3. **Wide tables are unreadable**, in the app and in the PDF, and lose rows,
   columns and their "N of M" note without saying so (P1-11, P2-1, P2-2).
4. **The due-diligence PDF prints real names and emails** under "No names are
   written here", reproduced in both runs (P1-3).
5. **The figure-taking run is the weak middle of the flow**: it leaves before
   you see the report, piles up controls, takes the wrong thing or nothing, and
   ends without a summary (F-5 to F-11, P1-15, P1-16).

---

## The flow, end to end

Built from the run-2 desktop screenshots and the code that moves the user
between screens (`TemplateSheet.vue`, `useSlotTaking.ts`). The run-2 testers
logged 34 ⚠ transitions; they cluster in stage 3.

### The journey

| Stage | What the user sees (1440×900) | How it feels |
| --- | --- | --- |
| 1. Pick a template | A 1120-px sheet: 31 templates in one list, a five-block band, the report writing itself live on the right | The best moment of the feature |
| 2. Create | The report appears for a beat, its header reading "Running… · 5 cells ran elsewhere" in orange, then the app leaves for the first view | Unsettling: "what ran elsewhere?", then "where did my report go?" |
| 3. Take figures | Per slot: the view, a take bar, and a modal over ~85% of the view with report picker, place tree, "Asked for", appearance, provenance; Stop / Skip / Fill | The low point: busy, sometimes wrong, sometimes nothing to take |
| 4. Land | The report top (run 2 landed at the top every time), with nothing saying what was filled or skipped; the right quarter of the screen is an empty "Pool · Nothing pinned yet" panel | Relief, with loose ends |
| 5. Write and export | Prompts fill cleanly; the PDF preview is clear | Good for rich reports; a blank page for reports with nothing in them |

### Findings

- **F-1 [P2] The default template can be wrong, and the list is long** (✓ r2).
  The sheet pre-selects the first detected ecosystem template: the
  JavaScript/TypeScript review on Sylius (PHP), nopCommerce (C#) and
  archstats-ui (Go + Vue). 31 templates, no search, no framing by question.
  "Python codebase review" is marked "not found here" on django-oscar, a
  codebase the same sheet says is 72% Python. Evidence: M4 `SANDBOX__G01-gallery-open.png`, M7 `TC-X-OTHER__G00-gallery-open.png`, M3 `TC-DJANGO-1__G05-list-django-project-review.png`.
- **F-2 [P2] The band buries what matters, and nothing stops an empty report** (✓ r2).
  "Leaves out …" is the last grey line of five blocks. Module drift on Gradle
  and Where tests are missing on an old scan still create a report with zero
  evidence ("0 cells"). Evidence: M2 `TC-JVM-3__L01-landed-empty-report.png`, M9 `g3-testgaps-band` shots.
- **F-3 [P2] The first mention of the snapshot disagrees with the sidebar** (✓ r2).
  "Runs on 4 May, 23:57" (commit time) against "24 Sep, 16:12" (scan time) in the
  sidebar, for the same snapshot, with no word on which time is which. Seen in all nine missions.
- **F-4 [P3] "Then take the 2 figures from their views" does not say you will
  leave this screen** and visit each view in turn.
- **F-5 [P2] Create barely shows the report before leaving it** (✓ r2, refined).
  At desktop size the report shows for a moment with "Running…" and an orange
  "5 cells ran elsewhere" (cells not yet run on this snapshot), then the run
  jumps to the first view. The JPA entity model did *not* start its run
  (landed on the report with "Take 1 figure" instead), so the behaviour is
  also inconsistent (M1, needs repro). Evidence: M1 `TC-SPRING-1__C01-after-create.png`, `TC-SPRING-4__C01-after-create.png`.
- **F-6 [P2] Too many controls, several doing the same thing** (✓ r2). Take
  bar: "Add this view · Skip · Back to report · ×"; modal: "× … Stop · Skip ·
  Fill and next"; plus the app's "Scanned by an older analysis… Scan again ·
  ×" banner above both. Two Skips, and four ways to leave that differ subtly. Evidence: M1 `TC-SPRING-1__C03-take-figure2.png`.
- **F-7 [P2] A guided run shows the full manual import sheet** (✓ r2): a
  report picker with "New report", a place tree of the whole report,
  Light/As shown, provenance, over ~85% of the view being taken from.
- **F-8 [P1/P2] Getting the view right is left to the user, or to chance** (✓ r2).
  Every Hotspots slot with a preset ("Churn against health", "Code age") opened
  on the wrong preset and showed "taken as Hotspots … Take it as asked" (M1,
  M2 ×3, M7). The run waits for *any* exportable of the right kind, so on
  fineract the Authors leaderboard with names and emails was taken with a
  green "Taken as the template asks" (P1-3). Evidence: M1 `TC-SPRING-1__C03-take-figure2.png`, M2 `TC-SPRING-2__C03-take-figure2-state-check.png`.
- **F-9 [P2] Failures are dead ends** (✓ r2). "Changes drew nothing to take;
  set it, then add it" (two scans of one commit), "Classes drew nothing to take"
  over a fully drawn Units view (P1-15). The explanation the user needs is in
  the view or the Cell pane, not in the bar. Evidence: M8 `TC-GEN-CHECK-1__C04-take-changes-nothing-to-take.png`, M2 `TC-SPRING-2__C01-take-figure1-nothing-to-take.png`.
- **F-10 [P2] Status lags and paused looks busy** (✓ r2). The bar keeps saying
  "Waiting for Connections to draw…" for seconds after the view already shows
  "702 components are too many for a matrix" (M4, M7); a paused slot card says "Taking…".
- **F-11 [P2] The run ends without a summary** (✓ r2). The user lands on the
  report top with the unfilled slot only visible as "(to add)" in the outline
  and a "Take 1 table" button. Evidence: M8 `TC-GEN-CHECK-1__L01-landing.png`, M1 `TC-SPRING-3__L01-landing.png`.
- **F-12 [P2] The document gets the least room, and tables pay for it** (✓ r2).
  At 1440 px: app sidebar, reports and outline, a ~620-px document, and a
  Pool/Cell panel that opens on "Nothing pinned yet". With the panel open,
  Table 1 of the .NET review drops its "references" column entirely and cuts a
  header to "reference", no scrollbar, no hint (M7). Evidence: M7 `TC-NET-1__R08-table1-onscreen.png`, M1 `TC-SPRING-1__L01-landing.png`.
- **F-13 [P3] No count of prompts left to write**, while slots have one ("Take 1 table").
- **F-14 [P2] "/" does not open the Insert menu** though the empty line says
  "Write, or press / to add evidence" (✓ r2, M8); the "Insert below" button works.
- **F-15 [P2] Save as template turns the template's own explanations into
  prompts** (new r2). "Turn my paragraphs into prompts" also converts the
  built-in "This section counts what the scan found…" text, and the reused
  template loses the "Explain the terms" checkbox. No confirmation after saving. (M8)
- **F-16 [P2] The PDF says nothing about what is missing** (✓ r2). The preview
  header says "1 to add, left out"; the PDF itself does not, the explanation
  of a left-out slot still prints (P1-16), and empty reports print as a title
  and bare headings.
- **F-17 [P3] Editing text shows raw Markdown** (new r2). Clicking an
  explanation paragraph shows `*asterisks*` around its italic terms until
  Escape; typing "1)" at the start of a prompt turns it into a numbered list. (M8, M5)

### Heuristic scores (the flow)

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2 | "Taking 1 of 2" good; lagging "Waiting…", "5 cells ran elsewhere", silent drops, no end summary |
| 2 | Match with the real world | 2 | "slot", "take", "Runs on newest", "computed", "Classes" for a view called Units |
| 3 | User control and freedom | 2 | Many exits with unclear differences; the run takes control right after Create |
| 4 | Consistency and standards | 2 | Two Skips; one snapshot named two ways; header casing by table type; JPA run does not auto-start |
| 5 | Error prevention | 1 | Empty reports allowed; wrong snapshot; wrong table on a race; dropped columns and rows |
| 6 | Recognition rather than recall | 3 | Outline, "Asked for" chips, in-place prompts |
| 7 | Flexibility and efficiency | 3 | ⌘↵, take-all, save as template |
| 8 | Aesthetic and minimalist design | 2 | Band and take modal carry far more than the decision; empty Pool panel by default |
| 9 | Help users recover from errors | 2 | "Take it as asked" good; "drew nothing to take; set it" not |
| 10 | Help and documentation | 3 | Term explanations, "Use it when", "Leaves out" reasons |
| | **Total** | **22/40** | Unchanged by run 2: solid ends, weak middle |

### What the flow does well
The live preview in the gallery; prompts that fill in place and never print;
"Asked for" in the take modal; the matrix refusal message ("has nothing to
take: The matrix has 47 columns; group it to 40 or fewer"); clicking a table in
the outline scrolls to it and opens its Cell pane (M2 called this "a pleasant
surprise"); the "Other ecosystems" flow, honest end to end (M7).

### Direction (for the fix round, not done)
1. After Create, stay on the report; offer "Take the N figures" there with the
   slots listed.
2. Make a guided take a thin strip over the view: slot name, "is this right?",
   Take / Skip / Stop. Apply the slot's settings before waiting, and wait for
   the specific exportable the slot names.
3. End every run on the report top with a summary: filled, skipped, why.
4. Pre-select the best-fitting template; put "won't work here" first; refuse
   or warn before creating a report whose evidence is all left out.
5. Give the document the width: Pool/Cell panel closed until a cell is selected.

---

## P1: bugs and unexpected behaviour

### P1-1 · Reports run on the newest-by-commit snapshot, not the open one (run 1; masked in run 2)
Paragraphs and tables run on `kernel: "newest"` (latest *commit*); figures come
from the *open* snapshot. Broadleaf and Sylius produced reports mixing a
revision-0 and a revision-3 snapshot. Root cause
`frontend/src/features/reports/reports.store.ts:96`. Run 2's harness hid
newer-commit snapshots to test everything else, so it could not recur there.

### P1-2 · A taken table keeps only its first five columns, silently (run 1; not seen r2)
`AddToReportSheet.vue:400` pre-selects `columns.slice(0, 5)`; gin's 8-column
matrix arrived with columns `1 2 3` (run 1 M6). Run 2 did not report it; recheck.

### P1-3 · Real names and emails printed under "No names are written here" (✓ r2)
Technical due diligence on fineract: "Table 1. Knowledge by component" is the
Authors leaderboard (Author, Email, Commits…), taken with a green "Taken as the
template asks". The run waits for any usable table on the Authors page
(`useSlotTaking.ts`, `pickFor(kind)`), and the leaderboard registers first on a
large repo. Evidence: M2 `06-Technical due diligence_ fineract.pdf`, `TC-GEN-DD-1__C*` shots.

### P1-4 · Numbers disagree inside one report

| Where | Says | Also says | Status / cause |
| --- | --- | --- | --- |
| PHP review › Hotspots (Sylius) | 5 production files | table of 10 Behat test files | ✓ r2 · paragraph filters production, `f-hotspots` preset does not |
| PHP review › Roles (Sylius) | "1 Entities" | "entities and models" column with dozens | new r2 · profile rule vs marker SQL |
| Dependency audit › Libraries (Sylius) | "99 libraries … from outside its own components" | `src/Sylius`, `Sylius\Bundle` in the list, marked "Looks internal: yes" | ✓ r2 |
| React review (LibreChat) | 72 / 52 components | 74 / 71 | ✓ r2 · two definitions |
| Change impact (gin) | "3 components depend on it" | dependents table of 2, a direct import "2 steps away" | ✓ r2 · root `.` left out; revision-0 path length counts nodes |
| Go review (gin) | "7 packages" | 8-row package table | run 1 · root `.` left out |
| Python review (npo) | "22 components" | 19-row package table | new r2 · Python files only, root left out |
| Spring review (fineract) | Spring counts: "2 controllers" | roles: "1 Controllers"; Classes view "Controllers 3" | ✓ r2 · three counting methods |
| History paragraph vs Overview/Activity | 6,762 commits / 357 authors | 6,555 / 354; "37 bot commits hidden" | run 1 · whole history with bots vs files in snapshot |
| Hidden coupling (Sylius) | Table 1 production pairs | Table 2 (the view) all pairs, no overlap | run 1 |
| Modularization (gin) | instability 0.571 / 0.455 | the table's own counts give 0.667 / 0.8 | new r2 · engine computes instability from file-level counts (known Ca/Ce issue) |

### P1-5 · Old or partial snapshots: false claims, wrong tables, empty reports
- .NET "No reference runs between two ASP.NET Core roles" on a scan that records no class references (run 1, M7).
- JS/TS review claims "1,109 React components" on a C# codebase (run 1, M7).
- Tables include test code the text says is counted apart: Python packages,
  Go "Structs tagged for the most formats" (`testJSONAbortMsg`, `FooBarStruct`…) (✓ r2, M6, M9).
- Where tests are missing and Module drift (Gradle) create reports with no evidence (✓ r2, M2, M9).

### P1-6 · Third-party code ranked "least healthy" (✓ r2)
`lib_npm/elfinder` is the #1 least healthy component in the Architecture review
(nopCommerce); the `c-health` preset has no role filter. (M7)

### P1-7 · Framework detection and scoping gaps
- Symfony Entities finds one constraint class, not Sylius's models (run 1 + ✓ r2 as the "1 Entities" contradiction).
- Spring on JAX-RS: the explanation promises JAX-RS is counted, the paragraph says "1 Controllers" (✓ r2, M2).
- Go review on a mixed repo describes the whole Vue codebase and lists `vitest`, `vue`, `pinia` as a Go module's libraries (✓ r2, M8).

### P1-8 · Go library names lose their dots: `github/com/stretchr/testify` (✓ r2, M6)

### P1-9 · A query that times out prints "stopped after 10s" as the table (✓ r2, M2 fineract, Table 5)

### P1-10 · An empty-component paragraph prints "Choose a component for this paragraph." into the PDF (✓ r2, M6)

### P1-11 · Names truncated from the left in report tables (✓ r2)
`direction: rtl` on `.nb-data td.nb-name` (`NotebookCell.vue:179`): five files
read "…bstract_models.py" (M3), packages "…in.web.controller.entity" twice
(M1), `.github` → `github.` (run 1). The PDF has its own truncation (P2-1).

### P1-12 · The tally calls a table slot a "figure" (✓ r2)
"4 tables, 1 figure" for five table slots (M3); `tally()` counts every slot as a figure.

### P1-13 · Whole report duplicated after a paused run (run 1; not seen r2)

### P1-14 · A captured Metrics directories table loses its numbers (new r2)
"The codebase by directory": the live view shows commits per directory
(src/oscar 35, tests 18…); the captured table and the PDF show "—" on every
row. (M3 `TC-GEN-ONB-1__C01-take1.png`, `C02-table2-commits.png`; reproduced on a fresh report)

### P1-15 · The Classes flow figure is not taken on a large codebase (new r2)
The slot opens `#/views/units?flow=controllers,services`. On fineract the view
draws its lane overview and ignores `flow` (on Broadleaf it worked), and the bar
says "Classes drew nothing to take" on a view titled "Units". (M2 `TC-SPRING-2__C01-take-figure1-nothing-to-take.png`)

### P1-16 · A left-out slot's explanation still prints (new r2)
fineract's matrix slot is left out ("1156 components are too many"), but "In
the dependency matrix each row and each column…" prints with nothing after it. (M2 `04-Architecture review_ fineract.pdf`)

### P1-17 · The Changes slot compares two scans of the same commit (new r2)
"What changed since the last snapshot" opens Changes on 17:29 against 17:30 of
commit eea60c6 and finds nothing, while a different commit's snapshot exists. (M8)

---

## P2: UX, readability, flow (beyond the flow section)

- **P2-1 · Wide tables truncate in app and PDF** (✓ r2): headers "G…",
  "packa…", "form t…"; the PHP "Packages by role" PDF drops its "validators"
  column; lists cut mid-word ("…ya…"); in-app identifier columns reduced to a
  character or two. (M1, M3, M4, M6, M7)
- **P2-2 · The PDF drops "N of M"** (✓ r2): "22 of 170" entry points print with no note. (M1, M2)
- **P2-3 · PDF numbering skips a left-out slot**: Table 1, 2, 4, 5 (new r2, M3).
- **P2-4 · Page breaks orphan headings and lead-ins** (✓ r2): "Candidate modules"
  alone at the foot of a page (M6); lead-in sentences split from their tables (M1).
- **P2-5 · The executive summary is 3 pages** under "Leadership, on one page" (✓ r2, M2).
- **P2-6 · "By group" graphs of 700–1,400 components are a dot cloud** (✓ r2, M4).
- **P2-7 · The report title clips mid-glyph** in the app: "Cleanup candidates: npo-data-pipelin" (new r2, M9).
- **P2-8 · Test and non-code files fill "largest", "cleanup" and "hotspot" lists** (✓ r2, M9).
- **P2-9 · "New files in the last 30 days" is 319 of 401**, inflated by one
  rename commit (new r2, M8).

## P3: wording a junior developer cannot follow

- **P3-1 · Java examples in every ecosystem** (new r2, the most visible
  wording problem of run 2): the roles explanation says "(a class marked
  `@Service` is a service)" in Django, Go and React reports; the libraries
  explanation uses `org.springframework.web` and `java.util` in PHP, JS/TS and Go
  reports. (M3, M4, M5, M6, M8)
- **P3-2 · "…of all ordered pairs of components, that share are linked by a
  chain of imports."** (✓ r2, every mission)
- **P3-3 · Plurals:** "1 Controllers", "1 Entities", "1 import break 1 rule of the 1 that apply", "Go services's". (✓ r2)
- **P3-4 · "906 of its 1,101 types and functions" next to "246 … outside tests"**, unlabelled. (new r2, M6)
- **P3-5 · Raw lower-case query headers** beside Title Case preset headers. (✓ r2, M1, M7, M9)
- **P3-6 · "the snapshot predates code age (rescan to add it)"**. (new r2, M9)
- **P3-7 · "5 cells ran elsewhere"** in the report header during a run. (new r2, facilitator)
- **P3-8 · Raw package names in the executive summary** (`org.apache.fineract.integrationtests`). (run 1, M2)
- **P3-9 · "The middle component has 0 dependents…"** ("middle" is the median, unexplained). (run 1)
- **P3-10 · The "which is" column only ever reads "a service or component"**
  on Broadleaf, so a reader cannot tell whether controllers were checked. (new r2, M1)

---

## Screens for a design review

The best run-2 desktop screenshots per stage (2880×1800), under
`runs/2026-09-25-r2/`. Each mission's `shots/INDEX.md` captions every shot.

| Stage | Screenshot | What to look at |
| --- | --- | --- |
| Gallery | `M8/shots/TC-GEN-CHECK-1__G02-template-selected-band.png` | Band density, list length, preview |
| Gallery | `M7/shots/TC-X-OTHER__G03-spring-band.png` | "Leaves out" reasoning for a wrong-ecosystem template |
| Create | `M1/shots/TC-SPRING-1__C01-after-create.png` | "Running… · 5 cells ran elsewhere", three panels at 1440 px |
| Take | `M1/shots/TC-SPRING-1__C03-take-figure2.png` | Take bar + modal, duplicate controls, "taken as Hotspots" |
| Take failure | `M2/shots/TC-SPRING-2__C01-take-figure1-nothing-to-take.png` | "Classes drew nothing to take" over a drawn Units view |
| Take failure | `M8/shots/TC-GEN-CHECK-1__C04-take-changes-nothing-to-take.png` | Dead-end message |
| Land | `M1/shots/TC-SPRING-1__L01-landing.png` | Report top, empty Pool panel, no run summary |
| Read | `M7/shots/TC-NET-1__R08-table1-onscreen.png` | Table losing a column with the Cell pane open |
| Read | `M3/shots/TC-DJANGO-1__R07-scroll6.png` | Left-truncated identifier columns |
| Read | `M8/shots/TC-GEN-CHECK-1__R02-cell-pane-paragraph.png` | Cell pane for a computed paragraph |
| Write | `M8/shots/TC-X-SAVE__W02-overflow-attempt.png` and the save dialog after it | Save as template |
| Empty report | `M2/shots/TC-JVM-3__L01-landed-empty-report.png` | 0 cells, two prompts |
| PDF | `M8/shots/TC-GEN-CHECK-1__P01-pdf-preview.png` | Preview sheet, "1 to add, left out" |
| PDF | `M7/shots/TC-NET-1__P02-pdf-saved.png` | "Saved to" confirmation |

---

## Harness notes (not product findings)

- Run 1: the SQL console was off at first (every query table failed; redone),
  and M1/M4 first ran on a snapshot other than the open one (re-run). Both fixed
  for run 2, which also hid newer-commit snapshots to work around P1-1.
- Run 2: screenshots shown to testers are scaled down, so coordinate clicks
  missed; prompts looked unfillable until the driver learned `click "<text>"`
  (M3, M6 redone). Several testers' file writes were refused; the facilitator
  saved their findings from their replies.
- Run 2 process slips: M9 deleted stray screenshots in the repo root,
  including the committed `boundary-flow-2026-09-24.png` (restored from git);
  M2 deleted one of its own saved PDFs. No app data was touched.
- Harness: `harness/serve-qa.mjs` (sandboxed server: `--sql on`,
  `--workspace-id`, hides newer-commit snapshots, refuses to start if its stub
  does not parse) and `harness/drive-qa.mjs` (1440×900 at 2×, click by text
  including prompts). Headless Chrome hides scrollbars, so "no scroll hint"
  observations about the template list are not product findings.
