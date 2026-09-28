# M1 findings — BroadleafCommerce (session m1r2)

Sandbox check: Reports = 0 on Evidence before first report. New report band read
"Runs on 4 May, 23:57 · 8645873 · analysis r3" — matches table (revision 3). Sandbox OK.

Note (not a new finding, confirms §5 "known candidate"): the New report dialog and
band name the snapshot by commit time ("4 May, 23:57") while the sidebar names the
same snapshot by scan time ("24 Sep, 16:12", the table's listed time). Confirmed present.

## TC-SPRING-1 · Spring application review (M1 BroadleafCommerce, defaults)

T: Evidence → click "Start a report" → New report dialog opens instantly, Spring application review preselected (first "For BroadleafCommerce" template) · expected: a template picker · shots/TC-SPRING-1__G01-gallery-open.png
T: Scroll preview through all sections (Roles, Web layer, Services, Repositories/Entities, Do the layers hold, Beans on/off, Build modules, Hotspots, Findings prompt) · expected: full preview scrollable, ends after one visible prompt · shots/TC-SPRING-1__G02..G07

G2/G3: sits in "For BroadleafCommerce"; second line "Found: 750 Spring beans, 157 JPA entities" is clear. Band: audience "A Spring team or its architects"; tally "Writes 10 sections: 14 paragraphs explaining the terms, 11 paragraphs counted from the snapshot, 8 tables, 2 figures to add from the views and 4 prompts for your reading." No "Leaves out" line shown for this template on this workspace.
G5: all computed paragraphs read plausibly and consistently (beans 750 = 274 services + 67 repositories + 21 controllers + 22 configurations + 366 @Component only sums to 750 exactly). Code-styled component/class names (monospace spans) render correctly on screen; they just don't flatten into the `look`/`text` output, which briefly looked like blank slots in transcript form — verified visually as filled, not a finding.
Preview scroll appears to end after the "Findings" prompt (one prompt visible), even though the tally line promises 4 prompts total; could not find the other 3 while scrolling the gallery preview (they may appear once the report is created — checked in R-phase below).
G6: Name field defaults to "Spring review: BroadleafCommerce" (sensible). Both checkboxes ("Explain the terms", "Then take the 2 figures from their views") on by default, left on.

T: Create report (checkboxes left on) → report created (21 cells, 5 "ran elsewhere"/pending) and taking run auto-starts on Figure 1 · expected: land on report page first, then manually start taking · shots/TC-SPRING-1__C01-after-create.png
T: Taking Figure 1 "How Controllers and Services relate" (Units view, Between controllers,services) → preview fills correctly, "Taken as the template asks." · expected: figure captured matching ask · shots/TC-SPRING-1__C02-take-figure1.png
T: Click "Fill and next" → moves to Taking Figure 2 "Churn against code health" (Hotspots view, Rows of Components, Preset "Churn against health") · shots/TC-SPRING-1__C03-take-figure2.png

### [P2] Figure 2 take step shows an alarming "taken as Hotspots" mismatch warning, even though the figure that actually lands in the report is correct
- Test case / step: TC-SPRING-1 / C2, R3
- Where: Spring application review › Hotspots section › Figure 2 "Churn against code health" (BroadleafCommerce, snapshot 4 May/24 Sep 16:12, analysis r3)
- What happened: while taking Figure 2, the Cell pane shows "⚠ Preset Churn against health — taken as Hotspots" and "Taken with other settings than the template asks. The words around it may not fit what shows." with a "Take it as asked" button, and the Hotspots view itself is showing the "Hotspots" perspective (size: Line Count, heat: Hotspot Score), not "Churn against health". I proceeded with the default flow ("Fill and finish") without clicking "Take it as asked". Checking the finished report, Figure 2 is in fact the correct chart — legend reads "Area: Commit Count, Code Health: low/high", matching "Churn against health" as the template asked, not the Hotspots perspective shown during the take step.
- Expected: if the final capture is correct regardless, the take-step warning is a false alarm and should not fire — a QA tester (or real user) seeing "taken as Hotspots" mid-flow has good reason to think the wrong figure is about to be captured and may waste time investigating or manually correcting a non-problem.
- Evidence: shots/TC-SPRING-1__C03-take-figure2.png (warning during take), shots/TC-SPRING-1__R11-scroll8-end.png (correct figure in finished report)
- Repro: TC-SPRING-1, take Figure 2 in the Spring application review template; note the mismatch warning; finish the run without clicking "Take it as asked"; compare the captured figure's legend to the warning.

T: Fill and finish → lands on report top, "21 cells" (no more "ran elsewhere"), scrolled through "The application at a glance" and "Roles in the code" (reads correctly, numbers consistent with gallery preview) · shots/TC-SPRING-1__L01-landing.png, R01-scroll1.png
T: Scroll to "The web layer" and Table 1 · shots/TC-SPRING-1__R02-scroll2.png

### [P3] Package column too narrow on screen: two different packages briefly look identical (fixed in the PDF)
- Test case / step: TC-SPRING-1 / R2, P3
- Where: Spring application review › "The web layer: how the controllers are split up" › Table 1 "Web entry points by package" (BroadleafCommerce)
- What happened: on screen, rows 1 and 4 of the package column both display as "…in.web.controller.entity" (row 1 is `org.broadleafcommerce.admin.web.controller.entity`, row 4 is `org.broadleafcommerce.openadmin.web.controller.entity`) — no way to tell them apart in the app. Checked the saved PDF (page 2): there the package column is not truncated and both full names print correctly, so this is a screen-only readability nit, not a data bug and not a print bug.
- Expected: widen the on-screen column, or truncate from a shared prefix, so two different rows are never visually identical even before exporting.
- Evidence: shots/TC-SPRING-1__R02-scroll2.png, shots/pg-2.png (PDF page 2, correct)
- Repro: TC-SPRING-1, scroll report to Table 1 "Web entry points by package" on screen.

### [P2] Table 2 "entry point" and "package" columns are truncated illegibly, in both the app and the printed PDF
- Test case / step: TC-SPRING-1 / R2, P3
- Where: Spring application review › "The web layer" › Table 2 "Every web entry point, the busiest first" (BroadleafCommerce)
- What happened: on screen, the "entry point" column is so narrow every visible row truncates to the identical text "…roller" (the tail of "XxxController"); "package" and "kind" are cut too. This is not just a screen issue: pdftoppm page 2 of the saved PDF shows the same truncation printed — "entry point" reads "AdminBasicEntit…", "AdminProductCo…", etc., "package" reads "…n.web.controller.entity", and "kind" reads "MVC …" for every row. A reader of the PDF cannot recover the full class name for any row without cross-referencing Table 1.
- Expected: the entry point column (the most distinguishing field) should not be the one truncated to uselessness; widen it at the expense of package/kind, or wrap text, so printed rows stay identifiable.
- Evidence: shots/TC-SPRING-1__R03-scroll3.png, shots/pg-2.png (PDF page 2)
- Repro: TC-SPRING-1, scroll to Table 2 "Every web entry point, the busiest first" on screen and in the saved PDF page 2.

Update: found the other prompts while reading the created report — there is one after each major table/section (e.g. "Which entities are the heart of the model, and do their packages match the business areas?..." right before "Do the layers hold?"), not just at the very end. This resolves the earlier "could not find the other 3 prompts" note in the gallery preview — not a finding, the gallery preview scroll just moved past them without me noticing since they look like plain italic paragraphs. Table 3/Table 4 cell panes are clear: "A read-only query on the snapshot," with the actual SQL query visible and editable. Figure 1 "How Controllers and Services relate" is filled and legible.

### [P1] "which is" column says "a service or component", never "a controller", even though the table and its own explanation promise "services or controllers"
- Test case / step: TC-SPRING-1 / R2, R4
- Where: Spring application review › "Do the layers hold?" › Table 6 "Repositories and entities that reach up into services or controllers" (BroadleafCommerce)
- What happened: the paragraph right above the table reads "...a lower layer reaching up. An entity that calls a service can no longer be loaded, tested or reused without it" (mentioning services and controllers as the two things being reached into), and the table's own title is literally "...reach up into services or controllers". But every one of the 20 rows' "which is" column reads "a service or component" — "component" is never one of the two categories the table claims to check, and no row ever shows "a controller" even though the title promises it as a possibility.
- Expected: the "which is" value should be drawn from the same two categories the title and paragraph name ("a service" / "a controller"), not a third, unrelated category ("component") that contradicts the heading.
- Evidence: shots/TC-SPRING-1__R09-scroll6.png
- Repro: TC-SPRING-1, scroll to Table 6 "Repositories and entities that reach up into services or controllers", read the "which is" column.

T: Click prompt "What you found..." (Findings) → enters edit mode, prompt placeholder text disappears immediately · shots/TC-SPRING-1__W02-prompt-clicked.png
T: Type a finding sentence → replaces prompt cleanly, no jump · shots/TC-SPRING-1__W03-prompt-typing.png
T: Escape → commits text, stays in report · shots/TC-SPRING-1__W04-prompt-after.png
T: Click outline entry "Services: where the business logic lives" → scrolls report to that heading and highlights it · expected: jump to section · shots/TC-SPRING-1__R12-outline-click.png (works correctly, no findings)

T: Open PDF preview (toolbar "PDF") → sheet opens instantly, 9 pages, A4, header/provenance line matches app ("BroadleafCommerce · snapshot 4 May, 23:57 · 8645873 · analysis r3", "Written with Archstats Desktop dev · 25 Sept 2026") · shots/TC-SPRING-1__P01-pdf-preview.png
T: Click "Save PDF…" → "Saved to /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-25-r2/M1/01-Spring review_ BroadleafCommerce.pdf" line shown, file confirmed on disk (895 KB, 9 pages).

P3 checks on the saved PDF: title/provenance correct; all 10 outline sections present in order; my typed Findings sentence prints as plain prose (no markdown artifacts, no `**`/backticks); Table 1 prints full package names (screen-only truncation, see finding above); Table 2 and Table 6 print the same truncation/"which is" problems documented above from the live app; Figure 1 and Figure 2 print, legible, correctly captioned/numbered ("Figure 1", "Figure 2", "Table 1"–"Table 8" in order); no prompts or unfilled-slot placeholders printed; page breaks did not split any heading from its body text on the pages sampled (1, 2, 7, 8, 9).

TC-SPRING-1: done — 4 findings (1 P1, 2 P2, 1 P3), PDF 01-Spring review_ BroadleafCommerce.pdf (9 pages)

## TC-SPRING-3 · Spring layering check (M1 BroadleafCommerce, defaults)

T: New report → Spring layering check → band reads clearly: "Checks one question in depth..." tally "Writes 5 sections: 4 paragraphs explaining the terms, 2 paragraphs counted from the snapshot, 2 tables, 2 figures to add from the views and 2 prompts for your reading." "Leaves out Transaction boundaries (no class is marked @Transactional), Dependency rules (no dependency rules are set up for this codebase)." — clear, understandable reason. First prompt: "The layering the team intends, in a sentence or two, and anything that is allowed to break it on purpose." · shots/TC-SPRING-3__G01-template-selected.png

T: Taking run: Figure 1 "How Services and Repositories relate" taken as asked; Table 1 "Dependency matrix" (Connections view, grouped) → "Connections has nothing to take: The matrix has 47 columns; group it to 40 or fewer to add it as a table." — clear, matches expected can't-take wording · shots/TC-SPRING-3__C01-take-figure1.png, TC-SPRING-3__C03-matrix-cant-take-msg.png
T: Skip → run finishes, lands on report top; "Take 1 table" button remains in toolbar for the skipped slot · shots/TC-SPRING-3__L01-landing.png
R3: Table 1's unfilled slot card reads clearly: "Table 1 Dependency matrix — to add — From Connections, set as Shown as Matrix, Level By group, Order By levels — [Take it from Connections] [Set it yourself]" — no error, understandable, matches TC-SPRING-1's probe expectation. shots/TC-SPRING-3__R02-matrix-slot-empty.png

T: Fill both prompts ("The layering the team intends..." and "What to fix, and how to keep it fixed") → both replace cleanly, no jump · shots/TC-SPRING-3__W01-prompt-filled.png
T: PDF preview → Save PDF → "Saved to .../02-Spring layering_ BroadleafCommerce.pdf", app shows "1 to add, left out" next to the page count · shots/TC-SPRING-3__P01-pdf-preview.png
P3: PDF is 3 pages/402 KB; both typed prompts print as plain prose; the unfilled "Dependency matrix" table is correctly left out of the PDF entirely (confirmed via pdftotext — no "Dependency matrix"/"Table 1" text present); provenance line matches; Table 3's "which is" column repeats the same "a service or component" issue as TC-SPRING-1 (not re-filed, same root cause).

TC-SPRING-3: done — 0 new findings (relies on TC-SPRING-1's P1 "which is" finding, confirms it also affects Table 3 here), PDF 02-Spring layering_ BroadleafCommerce.pdf (3 pages)

## TC-SPRING-4 · JPA entity model (M1 BroadleafCommerce, defaults)

T: New report → JPA entity model → band clear: "Writes 6 sections: 2 paragraphs explaining the terms, 1 paragraph counted from the snapshot, 6 tables, 1 figure to add from the views and 3 prompts for your reading." · shots/TC-SPRING-4__G01-template-selected.png
⚠ T: Create report (checkbox "Then take the figure from its view" left on) → unlike TC-SPRING-1 and TC-SPRING-3, the taking run did NOT auto-start; landed directly on the report page with a "Take 1 figure" button in the toolbar instead · expected: consistent with the other two Spring templates, which auto-started the taking run right after Create · shots/TC-SPRING-4__C01-after-create.png

### [P2] "Then take the N figure(s) from their views" checkbox does not consistently auto-start the taking run
- Test case / step: TC-SPRING-4 / C1 (compare to TC-SPRING-1 / C1, TC-SPRING-3 / C1)
- Where: Evidence › New report footer checkbox (BroadleafCommerce, all three Spring templates)
- What happened: with the checkbox left checked in all three cases, "Spring application review" and "Spring layering check" both auto-start the taking run immediately after "Create report" (screen jumps straight to "Taking Figure 1..."). "JPA entity model", created the same way with the same checkbox checked, instead lands on the plain report page with a "Take 1 figure" button that must be clicked manually to start taking.
- Expected: the same checkbox, checked the same way, should behave the same way across templates — either always auto-start the run or always require the manual button.
- Evidence: shots/TC-SPRING-4__C01-after-create.png (no auto-start), shots/TC-SPRING-1__C02-take-figure1.png and shots/TC-SPRING-3__C01-take-figure1.png (auto-started)
- Repro: create "JPA entity model" vs "Spring application review" on the same workspace, both with "Then take the figure(s) from their views" checked; compare what happens right after clicking "Create report".

T: Manually click "Fill Figure 1" → opens taking flow, "Taken as the template asks." → Fill and finish → returns to report · shots/TC-SPRING-4__C03-manual-take-figure1.png

R2/R3: Figure 1 "Repositories and entities" and Table 6 "Entities used by controllers or resources" read correctly; entity/package columns in Tables 1-3/5 show the same on-screen truncation pattern already logged. Filled 2 of the 3 prompts tallied ("Why the data model is being looked at..." and "What it means" — both filled and print correctly as plain prose); the third (before "Entities saved through another"/Table 4) was left unfilled for time — confirmed via pdftotext that it correctly does not print anything (no stray placeholder text), consistent with expected prompt behaviour.

T: PDF preview → Save PDF → "Saved to .../03-Entity model_ BroadleafCommerce.pdf" (5 pages, 387 KB) · shots/TC-SPRING-4__P01-pdf-preview.png

TC-SPRING-4: done — 1 finding (P2, take-run auto-start inconsistency), PDF 03-Entity model_ BroadleafCommerce.pdf (5 pages)

Harness note (facilitator): switching to `click "<prompt text>"` for filling prompts from here on, per facilitator guidance (clickxy coordinates from scaled screenshots can miss). Reviewed all prompt fills so far (TC-SPRING-1, TC-SPRING-3, TC-SPRING-4): each was verified successful by screenshot immediately after typing (prompt placeholder replaced by typed text in place, no stray edits elsewhere), so none need to be marked HARNESS (void) or redone.

## TC-JVM-1 · Multi-module build review (M1 BroadleafCommerce, defaults)

T: New report → Multi-module build review → band clear, "Leaves out Dependency rules (no dependency rules are set up for this codebase)." · shots/TC-JVM-1__G01-template-selected.png
T: Create report → taking run auto-starts on Figure 1 "Dependency structure" (Connections view) → "Taken as the template asks." → Fill and finish → lands on report top · shots/TC-JVM-1__C01-take-figure1.png, TC-JVM-1__L01-landing.png

R2 (key probe): Table 2 "Module to module, by references" — "in its build file: declared / not declared" column reads clearly with the explanation paragraph directly above it ("Not declared means A uses B without listing it in its build file, relying on B arriving through another dependency; if that other dependency changes, A stops compiling."). Confirms expected fact: broadleaf-admin-module uses broadleaf-common 244 times, "not declared". A junior could follow this. No finding — this table/paragraph pairing works well.
Table 1 "module" column is truncated on screen to a few trailing characters (e.g. "…dule" for two different *-module rows), but the adjacent "directory" column disambiguates them, so this is a minor/non-blocking instance of the truncation pattern already logged for TC-SPRING-1; not re-filed separately.

T: Used the harness's `click "<prompt text>"` for both prompts ("Why the module layout is being looked at..." and "Modules to merge, split or point elsewhere...") — click scrolls to and enters the prompt directly, more reliable than clickxy · shots/TC-JVM-1__W01-proposal-before.png, TC-JVM-1__W02-proposal-after.png
T: PDF preview → Save PDF → "Saved to .../04-Build review_ BroadleafCommerce.pdf" (3 pages, 1.0 MB) · shots/TC-JVM-1__P01-pdf-preview.png. Verified via pdftotext: both prompts print as plain prose, provenance line correct, tables/figure present.

TC-JVM-1: done — 0 new findings, PDF 04-Build review_ BroadleafCommerce.pdf (3 pages)

## TC-JVM-2 · Module drift check (M1 BroadleafCommerce, defaults)

T: New report → Module drift check → band clear, tally "Writes 3 sections: 1 paragraph explaining the terms, 2 tables and 2 prompts for your reading." (no figures, no "Then take..." checkbox shown — consistent with the template having no figures) · shots/TC-JVM-2__G01-template-selected.png
T: Create report → no taking run (nothing to take), lands directly on report with both tables already run · shots/TC-JVM-2__L01-landing.png
R2: both tables fully readable, no truncation (fewer/narrower columns than the Spring templates); Table 1 confirms the same broadleaf-admin-module/broadleaf-common 244-reference finding as TC-JVM-1's Table 2, consistently. Table 2 "Declared but not used" lists 7 rows all for module "integration" (plausible: an integration/test module that declares many deps it doesn't directly import) — reads sensibly, not a bug.
T: Filled both prompts via `click "<prompt text>"` → both replace cleanly · shots/TC-JVM-2__W01-prompts-filled.png
T: PDF preview → Save PDF → "Saved to .../05-Module drift_ BroadleafCommerce.pdf" (1 page, 30 KB) · shots/TC-JVM-2__P01-pdf-preview.png. pdftotext confirms clean single-page output, both prompts print as prose, tables fully legible with no truncation.

TC-JVM-2: done — 0 new findings, PDF 05-Module drift_ BroadleafCommerce.pdf (1 page)

## Mission Summary

The three worst problems found in M1 (BroadleafCommerce):
1. **P1 — Table 6's "which is" column in Spring application review / Spring layering check never shows "a controller"**, even though the table's own title and the paragraph above it promise "services or controllers" — every row across both templates reads "a service or component" instead, a self-contradiction a junior reader would trip over immediately (see Spring application review and Spring layering check findings).
2. **P2 — On-screen table columns (entry point/package/module names) truncate to illegible or ambiguous fragments** in several tables (Table 2 "Every web entry point" reads "…roller" for every row; Table 1 "Web entry points by package" makes two different packages look identical). The worst instance (Table 2) reproduces in the printed PDF too, not just on screen.
3. **P2 — Inconsistent auto-start of the taking run.** With "Then take the figure(s) from their views" checked, Spring application review, Spring layering check, and Multi-module build review all jump straight into the taking flow after "Create report", but JPA entity model does not — it lands on the plain report page and needs a manual "Take 1 figure" click, for no apparent reason tied to the checkbox state.

What worked well: the "can't-take" messaging for the Dependency matrix slot (clear, exact column-count reasoning); the "Leaves out ..." band explanations; the Cell inspector panes for both paragraphs and table queries (clear, shows the actual SQL); prompt fill/type/Escape flow (always clean, no jumps); PDF export and provenance line (consistent, correct, no markdown artifacts, unfilled slots correctly omitted); the Module drift check template overall (single page, fully legible, no truncation issues at all).
