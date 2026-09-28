# Report templates QA: findings (2026-09-25)

Every report template was created through the real UI on a real snapshot and
taken to a saved PDF by a fleet of Sonnet testers, one per workspace, following
[TEST-PLAN.md](TEST-PLAN.md). The facilitator merged and de-duplicated the
missions' findings, removed harness artefacts, and checked the root cause in
the code where one is named below. **Nothing has been fixed.**

- **Coverage:** 31 templates (10 general, 7 quick wins, 14 framework) plus
  blank report, save-as-template and reuse, a template for another ecosystem,
  pausing a taking run, and A4 against Letter. Nine workspaces, analysis
  revisions 0, 3 and 4.
- **Output:** 67 PDFs and about 200 screenshots in `runs/2026-09-25/<mission>/`
  (binaries git-ignored). Each mission's raw findings are in its own `FINDINGS.md`.
- **Tally after de-duplication:** 14 P1 entries covering 27 distinct bugs
  (P1-4, P1-5 and P1-7 group several related cases), 19 P2 UX problems,
  12 P3 wording problems.

- **Flow:** the end-to-end journey (pick → create → take figures → land →
  write → export) is reviewed separately in [The flow, end to end](#the-flow-end-to-end):
  16 flow findings (F-1 … F-16) and a heuristic score of 22/40.

Priority: **P1** bug or unexpected behaviour · **P2** UX, readability, flow ·
**P3** wording a junior developer cannot follow. Mission ids (M1…M9) point to
`runs/2026-09-25/<M#>/`; "M1r"/"M4r" are the re-runs in `M1-rerun/` and `M4-rerun/`.

---

## The five to fix first

1. **A new report computes on a different snapshot than the one open** (P1-1).
   Paragraphs and tables can come from an old snapshot while figures come from
   the open one. Fix this before anything else; it makes other numbers untrustworthy.
2. **Numbers disagree inside one report** (P1-4). Eight separate cases of a
   paragraph and the table under it counting the same thing differently.
3. **Wide tables are unreadable, in the app and in the PDF** (P1-2, P1-13,
   P2-1). Columns silently dropped, names cut to "…der", headers cut to "G…".
4. **The due-diligence PDF printed real names and emails** directly under
   "No names are written here" (P1-3).
5. **Old or partial snapshots produce false claims or empty reports** (P1-5):
   "No reference runs between two roles", "1,109 React components" on C#, blank PDFs.

---

## The flow, end to end

The testers judged each step on its own and called most steps "fine"; problems
that only show across steps (orientation, pacing, where you land, what you
expect next) were not written down. This section is the facilitator's flow
review, built from about 30 of the run's screenshots across all missions and
from the code that moves the user between screens (`useSlotTaking.ts`,
`TemplateSheet.vue`). Items marked **F-n**; severity uses the same P1–P3 scale.

### The journey today

| Stage | What the user sees | How it feels |
| --- | --- | --- |
| 1. Pick a template | A large sheet: 31 templates in one list, a five-block description band, the report written out live on the right | The strongest moment of the whole feature: the report visibly writes itself |
| 2. Create | The sheet closes and the app **jumps straight into the first view**, with a modal on top of it | Disorienting: "where did my report go?" |
| 3. Take figures | Per slot: a view, four stacked bars, an import modal with a report picker, a place tree, appearance, provenance; Stop / Skip / Fill and next | The low point: busy, sometimes failing, sometimes silently wrong |
| 4. Land on the report | Evidence, scrolled mid-document, with an empty Cell pane | Relief, then confusion about what was filled and what was not |
| 5. Write and export | Prompts fill smoothly; PDF preview is clear | Good, unless the report is empty or the tables are unreadable |

The peak (stage 1) comes before the valley (stages 2–3), and the valley is
where the user has least control. The end (stage 5) is solid for rich reports
and a blank page for reports whose sections were all left out.

### Stage 1 · Picking a template

- **F-1 [P2] The default choice can be wrong, and the list is long.** The sheet
  pre-selects the first detected ecosystem template: the JavaScript/TypeScript
  review on nopCommerce (48% C#, 14% JS) and on archstats-ui (a Go + Vue app).
  After that, 31 templates sit in one scrolling list (Start, For <workspace>,
  7 quick wins, 10 general, 12 other ecosystems) with overlapping promises
  ("Change impact" against "Refactoring case", "Circular dependencies to break
  first" against "Technical debt register"). There is no search and no framing
  by question ("What do you want to find out?"). Evidence: M7 `01-gallery-first-view.png`, M8 `g1-gallery-initial.png`.
- **F-2 [P2] The band buries what matters for the decision.** Summary, "Use it
  when", tally, prompt legend and "Leaves out" are five small-text blocks; the
  one line that says *this template will not work well here* ("Leaves out
  Tests…") comes last, in grey. Nothing stops or warns before creating a report
  whose every evidence section is left out (P1-5: "Test gaps", "Module drift" on Gradle). Evidence: M9 `g3-testgaps-band.png`, `r1-testgaps-empty.png`.
- **F-3 [P2] The first mention of the snapshot already disagrees with the sidebar.**
  "Written for archstats-ui from the snapshot of 25 Sep, 09:09" (commit time)
  while the sidebar's open snapshot is "25 Sep, 17:30" (scan time). This is
  the first place P1-1 and P2-19 can mislead.
- **F-4 [P3] "Then take the 2 figures from their views" does not say what it
  means in practice:** that Create will take the user away from this screen,
  through N views, one after another.

### Stage 2 · Create

- **F-5 [P2] Create never shows the report it just made.** `TemplateSheet`
  starts the taking run right after creating, and `useSlotTaking.start` pushes
  the first slot's view straight away. The user's first sight after "Create
  report" is someone else's screen (Connections, Hotspots, Trends) under a
  modal, with no moment to see what was created or decide whether to take
  figures now. Evidence: M3 `c1-after-create.png`; `useSlotTaking.ts:25–46`.

### Stage 3 · Taking figures

- **F-6 [P2] Too many controls, several doing the same thing.** At once: the
  app banner ("The code has moved on… Scan again"), the take bar ("Taking
  Figure 1… · Add this view · Skip · Back to report · ×"), the view's own
  toolbar, then the modal ("Taking 1 of 2… ×", footer "Stop · Skip · Fill and
  next"). Two Skips, and Stop, "Back to report" and two × all end the step in
  slightly different ways (stop the run, pause it, close the sheet). Evidence: M8 `c2-take1-trends.png`, M3 `c1-after-create.png`.
- **F-7 [P2] A guided run shows the full manual import sheet.** A report
  picker (every report plus "New report"), a place tree of the whole report,
  Light/As shown, and provenance. In a run the template already decided the
  report and the place. The one decision the user has, "is this the right
  picture?", competes with all of that, and the modal hides the view it is
  taking from.
- **F-8 [P1/P2] Getting the view right is left to the user, and sometimes to chance.**
  The run opens the slot's route and waits until *any* exportable of the
  right kind is usable (`pickFor(kind)?.kind === kind`, 0.3 s settle for
  tables). If the view does not apply a setting (Hotspots opened on "Hotspots"
  instead of "Churn against health"), the modal flags "taken with other
  settings" and the user must press "Take it as asked". If the wrong table
  simply registers first, it is taken silently: that is how the Authors
  leaderboard, with names and emails, ended up in a due-diligence PDF (P1-3).
  Evidence: M7 `28-xother-taking-mismatch.png`, M2 `06-Technical due diligence_ fineract.pdf`.
- **F-9 [P2] Failures are dead ends.** "Changes drew nothing to take; set it,
  then add it" (two scans of the same commit), "drew nothing to take" on the
  Classes view, the matrix on large codebases: the user is left inside a view
  with a one-line instruction that does not say what to set. The useful
  explanation is elsewhere (the view body: "No structural changes between these
  snapshots"; the Cell pane). Evidence: M8 `c2-take2-changes-wait5.png`.
- **F-10 [P2] Paused looks like busy.** After leaving a run, a slot card still
  reads "Taking…" while the toolbar says "Resume taking · 1 left"; Escape did
  not pause the run in the test. Evidence: M4r `tc-php-2-matrix-slot-state.png`, M3 `x-esc-back-to-report.png`.

### Stage 4 · Landing on the report

- **F-11 [P2] The run ends without a summary, mid-document.** `finish()` only
  routes back to Evidence. The user lands wherever the document happens to be
  scrolled (M8 landed on "Shape", title out of view), with no "2 figures
  filled, 1 skipped: Changes had nothing to compare" and no pointer to what is
  still to add besides a small "Take 1 table" in the toolbar. Evidence: M8 `report-page-overview.png`.
- **F-12 [P2] The document gets the least room.** Four columns (app sidebar,
  reports and outline, document, Cell pane) leave the report about 650 px
  wide, and the Cell pane opens empty ("Select a cell to see what it is made
  of"). Wide tables are then truncated (P2-1); with the left-truncation of
  P1-11 a Spring entry-point table reads "…roller" on every row while the
  package column takes the width. Evidence: M1r `tc-spring-1-prompt1-editing.png`.

### Stage 5 · Writing and exporting

- **F-13 [P3] No sense of what is left to write.** Slots have a counter
  ("Take 1 table"); prompts, the part the user must write, have none. In a
  21-cell Spring review the user scrolls to find them.
- **F-14 [P2] Inserting evidence is button-only in practice.** The placeholder
  says "Write, or press / to add evidence"; "/" did not open the menu in the
  test, the "Insert below" button did. Once open, the menu is good. Evidence: M8 `blank-slash-menu.png`, `blank-insert2-open.png`.
- **F-15 [P3] Three ways to export on one toolbar** (Export ▾, Markdown, PDF),
  and "Save as template…" is in an overflow menu with no confirmation after saving (P2-15).
- **F-16 [P2] What is missing is said only on screen.** The PDF preview's header
  says "1 to add, left out", but the PDF itself does not, and a report whose
  sections were all left out prints as a title and empty headings (P1-5).

### Heuristic scores (the flow, not a single screen)

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2 | "Taking 1 of 2" is good; mixed snapshots, silent column drops, paused-looks-busy and no end-of-run summary are not |
| 2 | Match with the real world | 2 | "slot", "take", "Runs on newest", "computed" are the product's words, not the user's |
| 3 | User control and freedom | 2 | Many exits with unclear differences; Create takes control away before the user has seen the report |
| 4 | Consistency and standards | 2 | Two Skips; one snapshot named three ways; header casing differs by table type |
| 5 | Error prevention | 1 | Empty reports can be created; wrong snapshot by default; wrong table taken on a race; five-column cap without notice |
| 6 | Recognition rather than recall | 3 | Outline, "Asked for" chips and in-place prompts keep the user oriented |
| 7 | Flexibility and efficiency | 3 | ⌘↵, take-all, save-as-template and reuse work well |
| 8 | Aesthetic and minimalist design | 2 | The band and the take modal carry far more than the decision at hand |
| 9 | Help users recover from errors | 2 | "Take it as asked" is a good recovery; "drew nothing to take; set it" is not |
| 10 | Help and documentation | 3 | Term explanations, "Use it when", the prompt legend and "Leaves out" reasons are strong |
| | **Total** | **22/40** | Solid parts, joined by a weak middle |

### What the flow does well

- **The live preview in the gallery** is the feature's best moment: the user
  sees their own codebase's report before committing to it.
- **Prompts** fill in place with no jumps, disappear as you type, and never print.
- **"Asked for" in the take modal** (view, shown as, level, with checks or an
  orange alert) is the right idea: the template's intent made visible.
- **Save as template** says exactly what comes with it and delivers it.

### Direction (for the fix round, not done)

1. After Create, open the report first. Offer "Take the 3 figures" there, with
   the slots listed, rather than leaving automatically.
2. Make a guided take a thin strip over the view (slot name, "is this right?",
   Take / Skip / Stop), not the manual import sheet. Apply the slot's settings
   before waiting, and wait for the *specific* exportable the slot names, not
   any of its kind.
3. End every run on the report's top, with a summary of what was filled,
   skipped and why.
4. In the gallery, pre-select the best-fitting template (largest language
   share), put "won't work here" first, and refuse or warn before creating a
   report whose evidence is all left out.
5. Give the document the width: Cell pane closed until a cell is selected.

---

## P1: bugs and unexpected behaviour

### P1-1 · A new report runs on the newest-by-commit snapshot, not the open one
- **What:** a report created from a template runs its paragraphs and tables on
  `kernel: "newest"`, the snapshot with the latest *commit*. Figures taken from
  the views come from the snapshot the user has *open*. When they differ, one
  report mixes two snapshots: the header says "Runs on 2 Jun, 15:16 · analysis
  r0" while its figures say "snapshot 4 May, 23:57 · 8645873 · analysis r3"
  (Broadleaf); on Sylius, paragraphs counted 11,725 files against the open
  snapshot's 11,703.
- **When it bites:** whenever an older commit was rescanned more recently (for
  example a revision-3 rescan of an older commit next to a revision-0 scan of a
  newer one, as in Broadleaf and Sylius today), or the user opens an older snapshot.
- **Root cause:** `frontend/src/features/reports/reports.store.ts:96` (kernel "newest" → `newestFirst(complete)[0]`), set at creation at lines 134 and 156.
- **Evidence:** M1 (`01-Spring review_ BroadleafCommerce.pdf` from the first run), M4 first run, M4r `shots/tc-php-1-sandbox-broken-header.png`, M1r `shots/sandbox-check-r0-header.png`.

### P1-2 · Taking a wide table keeps only its first five columns, silently
- **What:** the Modularization plan's dependency matrix (8 components) arrives
  with 8 rows but only columns `1 2 3`; rows 4–8 show "—" everywhere, which
  reads as "no dependency". No "N of M columns" note.
- **Root cause:** the Add-to-report sheet pre-selects `s.table.columns.slice(0, 5)`
  (`frontend/src/features/reports/components/AddToReportSheet.vue:400`), and a taking
  run accepts that default. Any wide captured table is affected.
- **Evidence:** M6 `09-Modularizing gin _Go_.pdf` p. 2, `shots/TC-GEN-MOD-1-report-candidatemodules.png`.

### P1-3 · The due-diligence PDF printed real names and emails under "No names are written here"
- **What:** in Technical due diligence (fineract), the paragraph ends "No names
  are written here; the Authors view shows them." The next element, "Table 1.
  Knowledge by component", is an author leaderboard with real names and email
  addresses (not per component). The same slot in Ownership (LibreChat) took
  the right, name-free table.
- **Likely cause (not reproduced):** the Authors view registers more than one
  table, and a taking run grabs the first usable table after 0.3 s. On a large
  repo the per-component knowledge table is not ready yet, so the author
  table wins. PRODUCT.md promises pseudonymised authors in every export.
- **Evidence:** M2 `06-Technical due diligence_ fineract.pdf` pp. 1–2.

### P1-4 · Numbers disagree inside one report
Each case is a paragraph and a table (or two tables) in the same report
counting the same thing differently, with nothing saying why.

| Where | Paragraph says | Table / other says | Cause (where known) |
| --- | --- | --- | --- |
| PHP review › Hotspots (Sylius, M4r) | five production files | ten Behat test contexts, "10 of 11,703" | the hotspots paragraph filters `role = 'production'`; the `f-hotspots` table preset does not |
| React review › folders (LibreChat, M5) | 72 / 52 / 28 components | 74 / 71 / 30 | the table counts capitalised names in .tsx/.jsx; the paragraph uses the React profile rule |
| Hidden coupling (Sylius, M4r) | Table 1: top pair 32 shared commits | Table 2 (from the view): 377 | Table 1 is production-only; the view is not |
| Go review › packages (gin, M6) | "7 packages" | 8-row package table; Overview "Components 8" | the count leaves out the root package `.` |
| Change impact (gin, M6) | "3 components depend on it" | dependents table lists 2 | the table leaves out the root package `.` |
| Change impact (gin, M6) | "1 step means they import it directly" | a one-arrow chain labelled "2 steps away" | on revision-0 snapshots `shortest_path_length` counts nodes, on revision 3+ it counts hops |
| History paragraph vs Overview/Activity (M3, M5) | 6,762 commits / 357 authors; 1,808 / 147 | 6,555 / 354; 1,771 / 145 "37 bot commits hidden" | the paragraph uses whole-history totals with bots; the views count commits to files in the snapshot, bots hidden |
| Spring review (fineract, M2) | "834 services, 23 repositories, 2 controllers" (Spring counts) | "1 Controllers… 1,760 Services… 205 Repositories" (roles); Classes view "Controllers 3, Services 1839" | three counting methods on one page, none explained |

### P1-5 · Old or partial snapshots produce false claims, wrong tables or empty reports
- **.NET (nopCommerce, old scan):** "No reference runs between two ASP.NET Core
  roles" beside 138 controllers and 513 services. The snapshot does not record
  class-to-class references; the sentence should say that. (M7)
- **JavaScript/TypeScript review on nopCommerce:** "1,109 React components" on
  a codebase with 0% TypeScript (the engine's count includes plain functions).
  Also, the gallery's "For nopCommerce" group lists and pre-selects the
  JS/TS template ahead of the .NET one on a 48% C#, 14% JS codebase. (M7)
- **Python review (old scan, no file roles):** the "Packages" table lists test
  packages although the text above says tests are counted apart; "Cleanup
  candidates" is mostly test packages, which are never imported by design. (M9)
- **Where tests are missing (old scan):** both evidence sections are left out,
  so the created report has zero cells and its PDF is a title and an empty
  heading. The gallery lets you create it with no warning. (M9 `02-`, `05-`)
- **Module drift check (Gradle):** same pattern: a one-page PDF with a title and
  "Changes to make", and nothing saying why. (M2 `03-Module drift_ fineract.pdf`)

### P1-6 · Third-party code ranked "least healthy"
Architecture review › Code health (nopCommerce): a vendored library
(`lib_npm/elfinder`) is the #1 least healthy component, although the
explanation says third-party code is counted apart. The `c-health` table preset
reads the components table with no role filter. (M7)

### P1-7 · Framework detection gaps
- **Symfony "Entities" (Sylius):** "1 Entities… all in
  `Sylius\Bundle\CoreBundle\Validator\Constraints`… `HasEnabledEntity`". A
  validation constraint matched by name; Sylius's Doctrine models (`Order`,
  `Product`) are not counted. (M4r)
- **Spring web layer on JAX-RS (fineract):** the explanation promises
  "Some Spring applications use JAX-RS instead… both are counted here". The
  computed sentence says "1 Controllers… They reference no other role", while
  the tables below list about 170 JAX-RS resources. The Spring profile ignores
  `@Path`. (M2)
- **Go review on a mixed repo (archstats-ui):** "45 packages" (about 9 are Go);
  roles cite the Vue composable `useDimensionStudio`; the coupling table and
  libraries (`vitest`, `vue`, `pinia`) are the whole repo. Not scoped to Go. (M8)

### P1-8 · Go library names lose their dots
"`github/com/stretchr/testify` (in 35 files)" in the Libraries paragraph; the
Modules table in the same report prints `github.com/gin-gonic/gin`. (M6 `05-Go review_ gin _Go_.pdf` p. 3)

### P1-9 · "Looks internal" misses the project's own namespace
Dependency audit › Libraries (Sylius): "yes" for `Sylius\Bundle`,
`Sylius\Component`, blank for `Sylius\Resource` (852 imports). In LibreChat the
internal `api` folder tops the libraries table. (M4r `04-`, M5)

### P1-10 · A query that times out prints "stopped after 10s" as the table
Spring review › "Entities, the most used first" (fineract): no headers, no
rows, just the text, in the app and in the PDF. (M2 `02-Spring review_ fineract.pdf` p. 4)

### P1-11 · Names shown wrongly in report tables: dots moved, fragments like "…der"
`.github` reads `github.`; `./setup.py` reads `setup.py/.`; `render`,
`binding`, `codec/json` read `…der`, `…ing`, `…son`. Root cause:
`direction: rtl` on `.nb-data td.nb-name`
(`frontend/src/features/reports/components/NotebookCell.vue:179`). The PDF is
unaffected for dots but has its own truncation (P2-1). (M3, M6)

### P1-12 · An empty-component paragraph prints its editor instruction into the PDF
Change impact with no component: "Choose a component for this paragraph."
appears as body text in the PDF. A paragraph's "absent" text prints like any
other. (M6 `07-Changing a component_ what it affects.pdf`)

### P1-13 · The tally and the taking run call a table slot a "figure"
Python review: "Then take the 2 figures…" and "Writes … 2 figures to add from
the views", but one of the two is a table (the Libraries slot). `tally()`
counts every slot as a figure. (M9)

### P1-14 · Whole report duplicated after a paused taking run (not reproduced)
After Skip, then "Fill and finish" clicked twice across overlapping states, the
outline and the PDF held the entire Spring review twice (15 pages, repeating
from p. 8). Unusual sequence: needs a clean repro. (M2 `shots/TC-SPRING-2_v2_duplicate-outline.png`, `02-Spring review_ fineract.pdf`)

---

## P2: UX, readability and flow

### Tables
- **P2-1 · Wide tables are truncated in the app and the PDF:** identifying
  columns cut to 3–7 characters ("project", "app", names), headers cut ("G…",
  "packa…", "reposi…", "base …", "lin…"), a "kind" column that prints "MVC …" on
  every row, list cells cut mid-word ("time_…"), near-identical long names made
  indistinguishable ("…jection Sylius\Bundle\ProductBundle\DependencyInjection").
  Worst in 8+ column tables (.NET roles, PHP packages by role, Spring entry
  points, entity links). (M1r, M3, M4r, M6, M7)
- **P2-2 · Capped tables lose "N of M" in the PDF:** "20 of 36" shows on screen,
  nothing in print, so a PDF reader cannot tell a table is a top-N slice. The
  on-screen "8 of 46." is itself unexplained. (M1r, M8)
- **P2-3 · Test code dominates "largest" and "cleanup" lists:** "The largest
  components" (django-oscar) is topped by three test directories with no
  dependents; cleanup candidates are mostly test packages on old scans. (M3, M9)
- **P2-4 · Uninformative columns:** code health 10 for 14 of 15 load-bearing
  components (Sylius), code health printed as a bare "7" in one table and with
  decimals in the next (LibreChat), an unexplained "—" in a component column (archstats-ui). (M4r, M5, M8)

### PDF layout
- **P2-5 · Page breaks orphan a table's lead-in sentence:** Spring review
  pp. 6→7, Spring layering pp. 1→2, fineract pp. 3→4. (M1r, M2)
- **P2-6 · Figures pushed whole to the next page leave pages two-thirds blank.** (M3, M7)
- **P2-7 · Figure labels clipped at the page edge:** "Churning, hea",
  "fineract-progressive-loan-embeddable-schedule-ge…". (M2, M7)
- **P2-8 · The executive summary is 3 pages** though the gallery promises
  "Leadership, on one page". (M2 `05-fineract_ summary.pdf`)

### Figures
- **P2-9 · "By group" dependency graphs of 700–1,400 components are an
  unlabelled dot cloud** in the report and the PDF (Sylius, nopCommerce), with no
  warning that the view does not read at that scale. (M4r, M7)
- **P2-10 · An explanation sits under the wrong figure:** Onboarding's chord
  explanation ("In the chord diagram…") appears directly under the node-link
  graph, before the chord figure. (M3)

### Taking figures
- **P2-11 · "drew nothing to take; set it, then add it" gives no next step**
  (Classes view), while the view itself shows a better explanation ("1156
  components are too many for a matrix… Propose a lens / Show the graph"). (M2)
- **P2-12 · "Taken with other settings than the template asked" does not say
  which setting differs;** asked and actual read the same preset name. A
  related case opened the view on the wrong preset, and the tester had to catch
  the orange warning and choose "Take it as asked". (M2, M3)
- **P2-13 · Escape does not pause a taking run;** the pause/resume flow the
  design describes could not be reached with the keyboard. (M3)
- **P2-14 · An unfillable slot card shows a bare "Taking…"** while the reason is
  only in the take bar and the Cell pane. (M4r)

### Editing and gallery
- **P2-15 · "Save template" gives no confirmation;** the dialog just closes. (M8)
- **P2-16 · Typing "/" in a paragraph did not open the Insert menu;** only the
  "Insert below" button did. (M8)
- **P2-17 · A full-screen loading overlay blocked the app for several seconds**
  after typing into a prompt (seen once, text kept). (M1r)
- **P2-18 · The gallery preview does not update while you type a component,**
  only after the field loses focus. (M5)

### Snapshot naming
- **P2-19 · One snapshot is named three ways:** the report header and PDF use
  the commit time ("Runs on 20 Sep, 01:45"), the sidebar the scan time
  ("21 Sep 23:41"), and the PDF adds its generation date. A reader cannot tell
  which snapshot the report is about. (M3, M5, M7, M9)

---

## P3: wording a junior developer cannot follow

- **P3-1 · Garbled sentence, in every report with the structure paragraph:**
  "Propagation cost is 16%: of all ordered pairs of components, that share are
  linked by a chain of imports." (M1r, M4r, M6, M8)
- **P3-2 · Singular and plural:** "All 1 rule that apply hold", "1 import break 1
  rule of the 1 that apply", "1 component depend on it", "1 Controllers",
  "1 Entities". (M2, M4r, M6, M8)
- **P3-3 · "Go services's own annotations"** (possessive on a label ending in s). (M6)
- **P3-4 · "The middle component has 0 dependents and depends on 1 other."**
  "Middle" (the median) is never explained, and the sentence arrives with no lead-in. (M3, M9)
- **P3-5 · Query tables use raw lower-case headers** ("project", "referenced by
  projects", "which is", "base of a hierarchy") beside Title Case preset tables
  ("Name", "Code Health", "Line Count"). (M1r, M7, M9)
- **P3-6 · Raw package names in leadership prose:** "…the most into
  org.apache.fineract.integrationtests (40%)" in the executive summary. (M2)
- **P3-7 · Code health: "rates each file", then per-component numbers,** with no
  word that a component's rating rolls up its files. (M2)
- **P3-8 · Raw rule identifier in a table, readable name in the paragraph above.** (M4r)
- **P3-9 · "Tangles" table names a 65-component cycle after one folder** (the
  alphabetically first member). (M5)
- **P3-10 · Hotspot tables mix in non-code files** (a shell script, a JSON data
  file) without saying so. (M9)
- **P3-11 · A closing prompt asks about roles the report does not have:**
  "controllers, services or entities" in a Spring template run on .NET. (M7)
- **P3-12 · The query-error notice runs into the table caption** with no
  punctuation (seen while the harness had the console off; the wording problem
  stands for real timeouts, see P1-10). (M5)

---

## Outside the report feature (seen on the way)

- Overview shows 122 and 121 components for the same snapshot on the same page. (M3)

## What worked well

- The gallery, creation and taking flows ran without crashes in every mission;
  typed prompts replaced cleanly and were printed, and unfilled prompts and
  slots stayed out of the PDF.
- "Leaves out …" reasons were accurate and understandable, including a Spring
  template run on .NET, which was honest end to end (M7).
- The matrix refusal ("has nothing to take: The matrix has 47 columns; group it
  to 40 or fewer") and its omission from the PDF (M1r, M7).
- Save as template, then reuse from "Yours", delivered exactly what the dialog
  promised (M8).
- Outline navigation, the Cell pane (provenance and the SQL behind a table), and
  long tables breaking across pages with repeated headers.
- Facts matched the facilitator's own queries where checked (for example
  `broadleaf-admin-module` → `broadleaf-common`, 244 references, not declared).

## Not tested or not settled

- The toolbar's "Snapshot the cells run on" select could not be driven headless
  (a native `<select>`), so switching a report to an older snapshot and back was not tested (M8).
- P1-3 and P1-14 need a clean repro before a fix.
- Markdown export was not exercised.

## Harness notes (not product findings)

- The first pass ran with the sandbox's SQL console off, which broke every
  query table. It was switched on mid-run, and every affected case was redone;
  voided findings are marked `HARNESS (void)` in the mission files.
- M1 and M4 first ran with the app's open snapshot differing from the pinned
  one, which mixed data. They were re-run (`M1-rerun`, `M4-rerun`) after the
  harness pinned the open snapshot and hid newer-commit snapshots. That
  investigation surfaced P1-1.
- The test plan said headless Chrome shows the PDF preview blank; it does
  render (M8 `p1-pdf-preview.png`). Future runs can judge the preview itself.
- The QA server is `harness/serve-qa.mjs` (a copy of the dogfood server that
  renders PDFs and writes saves into a folder). It refuses to start if its
  injected stub does not parse: an early smoke test ran unsandboxed for about a
  minute before that guard existed (it opened archstats-ui's Evidence page and
  wrote nothing to `app.db`).

## Where everything is

| Mission | Workspace | Findings | PDFs |
| --- | --- | --- | --- |
| M1 / M1-rerun | BroadleafCommerce | `runs/2026-09-25/M1-rerun/FINDINGS.md` | 5 (+5 first run) |
| M2 | fineract | `runs/2026-09-25/M2/FINDINGS.md` | 6 |
| M3 | django-oscar | `runs/2026-09-25/M3/FINDINGS.md` | 4 (+1 superseded) |
| M4 / M4-rerun | Sylius | `runs/2026-09-25/M4-rerun/FINDINGS.md` | 6 (+9 first run) |
| M5 | LibreChat (TypeScript) | `runs/2026-09-25/M5/FINDINGS.md` | 6 |
| M6 | gin (Go) | `runs/2026-09-25/M6/FINDINGS.md` | 5 (+4 before the SQL fix) |
| M7 | nopCommerce | `runs/2026-09-25/M7/FINDINGS.md` | 4 |
| M8 | archstats-ui | `runs/2026-09-25/M8/FINDINGS.md` | 6 |
| M9 | npo-data-pipeline | `runs/2026-09-25/M9/FINDINGS.md` | 6 |
