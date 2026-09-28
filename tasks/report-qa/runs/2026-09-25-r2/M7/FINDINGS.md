# Findings — M7 nopCommerce, run 2

Sandbox check: Reports = 0 before first report; new report header read
"Runs on 18 Sep, 16:23 · analysis r0" (matches table: M7 revision 0). OK to proceed.

---

## TC-NET-1 · .NET solution review (defaults)

### Transitions

T: Evidence to "Start a report" opens gallery, "For nopCommerce" group shows JavaScript/TypeScript workspace review and .NET solution review, both found. expected: template list. shots/scratch-top.png
T: Click ".NET solution review" in list, band + preview switch to ".NET solution review - A .NET team", name field updates to ".NET review: nopCommerce". expected: preview updates. shots/TC-NET-1__G01-template-selected-band.png
T: Scroll preview, paragraphs and table/figure slot cards render in order (Projects/Controllers/Roles/Between namespaces/Dependency rules/Hotspots/Findings). expected: full preview readable. shots/TC-NET-1__G02, G03, G04, G05
T: Click "Create report", jumps straight into the taking run on Connections (#/views/connections?level=groups), "Taking 1 of 1", no intermediate "report created" screen. expected: some confirmation the report was created first. shots/TC-NET-1__C01-after-create-taking-run.png (not a warning, the take bar makes it clear what's happening)
T: Take Figure 1 (Dependency structure), "Taken as the template asks", graph draws immediately, click "Fill and finish", lands on the finished report, top of page. expected: land on report. shots/TC-NET-1__L01-landing.png
T: Outline, click "Controllers", scrolls report to the Controllers section correctly. expected: scroll to section. shots/TC-NET-1__R01-outline-click-controllers.png
T: Click the "Are controllers thin..." prompt, cursor enters the prompt, placeholder text still shown until typing starts. expected: editable field. shots/TC-NET-1__W01, W02
T: Type a sentence into the prompt, text replaces the placeholder live, no jump. expected: smooth typing. shots/TC-NET-1__W03-prompt-typing.png
T: Escape, prompt keeps typed text, no italic/grey style left over. expected: committed. shots/TC-NET-1__W04-prompt-after-escape.png
T: Click a computed paragraph, "Cell" tab, shows "Roles in the framework / A paragraph counted from the snapshot" with a clear "Counted" explanation and "Write as my own". expected: understandable cell info. shots/TC-NET-1__R04-cell-pane-computed-paragraph.png
T: Click Table 3, Cell pane shows "A read-only query on the snapshot", rows kept, ran-on snapshot/analysis. expected: understandable. shots/TC-NET-1__R05-cell-pane-table.png
T: Outline, click "Findings", scrolls to end, Table 4 + prompt visible. expected: scroll to end. shots/TC-NET-1__R06-outline-click-findings.png
T: Fill the "Findings" prompt, Escape, committed cleanly. shots/TC-NET-1__W05-findings-prompt-filled.png
T: Click "PDF", preview sheet opens, "6 pages - A4 - 526 KB", header/provenance line shown. expected: preview. shots/TC-NET-1__P01-pdf-preview.png
T: Click "Save PDF...", "Saved to .../M7/01-.NET review_ nopCommerce.pdf", file confirmed on disk. shots/TC-NET-1__P02-pdf-saved.png
T: ⚠ Click outline entry "Table 1" while the right inspector (Cell/Pool) panel is open, the report pane narrows and Table 1 silently drops its "references" column and truncates the "referenced by projects" header to "reference", no scrollbar or overflow hint. expected: table stays fully readable, or scrolls horizontally. shots/TC-NET-1__R08-table1-onscreen.png, TC-NET-1__R09 (still panel-open), TC-NET-1__R10 (panel hidden, column reappears)

### Findings

### [P1] PDF table columns are hard-truncated with an ellipsis instead of wrapping, permanently losing data in the saved deliverable
- Test case / step: TC-NET-1 / P3
- Where: .NET solution review > "Projects and their references" > Table 1, column "references"; also "What each project holds" > Table 2, column "project"  (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: In the report page (inspector panel hidden), Table 1's "references" cell for Nop.Web wraps cleanly across three lines and reads in full: "Nop.Core, Nop.Data, Nop.Services, Nop.Web.Framework". In the saved PDF (pdftotext -layout), the same cell reads "Nop.Core, Nop.Data, No..." - two of the four referenced projects are silently cut off. The same row for Nop.Web.Framework also truncates ("Nop.Core, Nop.Data, No..."). Table 2's "project" column is truncated on almost every row regardless of panel state: "Nop....", "Nop.S...", "Nop.C...", "...ework", "...merce", "Nop.D...", "Nop.T...", "...ettle", "...orums", etc. Most rows are not distinguishable from each other, and Table 2 is sorted by C# file count (not the same order as Table 1), so a reader cannot even infer the project from row position.
- Expected: The PDF should wrap or widen table cells the way the on-screen (panel-hidden) report does, never drop list items or produce ambiguous/duplicate-looking truncated names.
- Evidence: shots/TC-NET-1__R10-table1-panel-hidden.png (full, wrapped), "01-.NET review_ nopCommerce.pdf" pages 1-2 (pdftotext output has "No...", "Nop....", "Nop.S..." etc.)
- Repro: Create ".NET solution review" on nopCommerce with defaults, open PDF preview or save PDF, read Table 1 "references" column and Table 2 "project" column.

### [P1] Wide table columns silently vanish while the Cell/Pool inspector panel is open
- Test case / step: TC-NET-1 / R6
- Where: .NET solution review > "Projects and their references" > Table 1 (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: Opening the right-hand inspector (clicking any cell so the "Cell" tab shows, as R6 asks) narrows the report reading pane. Table 1 then drops its entire "references" column and truncates the "referenced by projects" header down to "reference", with no scrollbar, no "+N more" indicator, nothing to show data is hidden. Clicking "Hide panel" restores both immediately.
- Expected: A report table should stay fully readable (wrap, scroll, or shrink other columns) regardless of whether the side panel is open, since opening the panel to inspect a cell is a normal, expected step (S4 R6).
- Evidence: shots/TC-NET-1__R08-table1-onscreen.png (panel open, column missing), shots/TC-NET-1__R10-table1-panel-hidden.png (panel closed, column present)
- Repro: Create ".NET solution review" on nopCommerce, click any cell to open the Cell pane, scroll to Table 1.

### [P3] Table 4 uses raw Title-Case column headers, inconsistent with the natural-language headers in Tables 1-3
- Test case / step: TC-NET-1 / R2
- Where: .NET solution review > "Hotspots" > Table 4 "Hotspot components" (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: Tables 1-3 use lower-case, natural-language headers ("project", "referenced by projects", "controller file", "commits, last 180 days"). Table 4 instead reads "Name", "Line Count", "Code Health", "Hotspot Score", "Commit Count", capitalized, terser, more like raw field names. It also has no "SQL" tag next to "Table 4" (shows "components" instead), suggesting it is a different, built-in query type than the others.
- Expected: Consistent header style across all tables in the same report so a junior reader isn't left wondering whether the difference means something.
- Evidence: shots/TC-NET-1__R06-outline-click-findings.png, PDF page 6
- Repro: Create ".NET solution review" on nopCommerce, scroll to Hotspots.
- Also seen: TC-GEN-ARCH-2, Table 2 "Most depended-on components" and Table 4 "Least healthy components" (same "components" built-in query type, same Title-Case headers).

TC-NET-1: done - 3 findings, PDF "01-.NET review_ nopCommerce.pdf"

---

## TC-GEN-ARCH-2 · Architecture review, explanations off

### Transitions

T: New report, click "Architecture review", band shows "Writes 8 sections: 10 paragraphs explaining the terms, 7 paragraphs counted from the snapshot, 3 tables, 5 figures to add from the views and 4 prompts for your reading." No "Leaves out" line for this template on this workspace. expected: band text. shots/TC-GEN-ARCH-2__G01-template-selected-band.png
T: Untick "Explain the terms", tally line updates live to "Writes 8 sections: 7 paragraphs counted from the snapshot, 3 tables, 5 figures..." (the "10 paragraphs explaining the terms" clause is removed), and the preview itself drops every explanation paragraph, reading cleanly straight into the computed facts with no dangling references. expected: tally + preview both update. shots/TC-GEN-ARCH-2__G02-explain-terms-off.png
T: Click "Create report", straight into taking run on Connections, "Taking 1 of 5". shots/TC-GEN-ARCH-2__C01-taking-run-figure1.png
T: Fill and next through Figure 1 (Dependency structure, drew fine) to Table 1 (Dependency matrix, in levels). ⚠ Take bar first shows "Waiting for Connections to draw..." stuck for a couple of seconds after the underlying view had already resolved and shown its "702 components are too many for a matrix" message and Skip control; a beat later the take bar catches up and reads "Connections drew nothing to take; set it, then add it" with a Skip button. expected: take bar and view status update together. shots/TC-GEN-ARCH-2__C02 (stuck), C03 (caught up)
T: Skip Table 1, Fill and next through Figure 2 (main sequence scatter), Figure 3 (Hotspots), Figure 4 (Churn against health), each drew immediately with "Taken as the template asks." shots/TC-GEN-ARCH-2__C04, C05
T: Fill and finish, lands on report; outline correctly marks "Table 1 · Dependency matrix, in levels (to add)" and toolbar shows a "Take 1 table" button to resume. expected: clear indication of what's left. shots/TC-GEN-ARCH-2__L01-landing.png
T: Click the skipped Table 1 slot, hatched "to add" card with a clear Cell pane explaining what it needs and offering "Take it from Connections" / "Set it yourself". expected: understandable empty-slot state. shots/TC-GEN-ARCH-2__R01-skipped-matrix-slot.png
T: Click Table 4 "Least healthy components", cell pane confirms it is a built-in "components" query, sorted by Code Health lowest first. shots/TC-GEN-ARCH-2__R02-codehealth-vendor-file.png
T: Outline click "Dependency rules" and "Recommendations", both scroll correctly; Findings/Recommendations prompts present and clearly worded. shots/TC-GEN-ARCH-2__R03-findings-recommendations.png
T: Click "PDF", header reads "Architecture review: nopCommerce · 6 pages · A4 · 1.1 MB · 1 to add, left out" (clear about the skipped slot). shots/TC-GEN-ARCH-2__P01-pdf-preview.png
T: Save PDF, "Saved to .../M7/02-Architecture review_ nopCommerce.pdf". shots/TC-GEN-ARCH-2__P02-pdf-saved.png

### Findings

### [P1] A vendored third-party JS library is reported as the codebase's single worst-health "component"
- Test case / step: TC-GEN-ARCH-2 / R1, R2
- Where: Architecture review › "Code health" paragraph and Table 4 "Least healthy components" (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: Both the computed paragraph and Table 4 list `src/Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js` as the lowest-health "component" in the whole codebase (code health 1.07, 36,049 lines, ahead of every real namespace). `lib_npm/elfinder` is the bundled, vendored elFinder JS file manager library, not code nopCommerce's own team owns or would refactor. The report's own opening definition says "third-party code copied into the repository ... [is] counted apart from" production code, but this vendored path is being scored and surfaced as if it were first-party code needing attention.
- Expected: Vendored/third-party code should be excluded from "production code" health tables and paragraphs, consistent with the report's own stated definition, or at minimum clearly labelled as vendored so a reader doesn't file it as a refactoring target.
- Evidence: shots/TC-GEN-ARCH-2__R02-codehealth-vendor-file.png, `02-Architecture review_ nopCommerce.pdf` page 4
- Repro: Create "Architecture review" (or ".NET solution review") on nopCommerce with defaults, read the Code health section / Table 4.

### [P1] Same PDF/table-truncation bug reproduces on Table 2 here (see TC-NET-1 finding)
- Test case / step: TC-GEN-ARCH-2 / P3
- Where: Architecture review › "Coupling: the most depended-on parts" › Table 2 "Most depended-on components", column "Name" (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: Same as the TC-NET-1 finding "PDF table columns are hard-truncated..." — in the saved PDF, Table 2's "Name" column truncates every long component name from the left: "…vices.Localization", "…e.Domain.Customers", "…b.Framework.Models", "…ore.Infrastructure", "…ore.Domain.Catalog", "…k.Mvc.ModelBinding". Recording here only as an additional location for the same bug, per the "one finding per problem" rule.
- Evidence: `02-Architecture review_ nopCommerce.pdf` page 2

TC-GEN-ARCH-2: done — 2 new findings (1 linked to an existing finding), PDF `02-Architecture review_ nopCommerce.pdf`

---

## TC-X-OTHER · A template for another ecosystem (Spring application review on nopCommerce/.NET)

### Transitions

T: New report dialog reopened, previous session's unchecked "Explain the terms" carried over from TC-GEN-ARCH-2 (dialog state persists across templates/dialogs, not per-template). Re-ticked it back on for this default-settings test case. expected/note: worth knowing the checkbox is sticky across the whole "New report" session. shots/TC-X-OTHER__G00, no screenshot needed for the re-tick itself
T: Click "Other ecosystems (12)" to expand, list of 12 framework templates appears, each subtitled "...; not found here". expected: expand list. shots/TC-X-OTHER__G01-other-ecosystems-expanded.png
T: Scroll to and click "Spring application review", band updates: "A Spring team or its architects", tally "Writes 6 sections...", and a full, specific "Leaves out" line naming 4 sections and why each is skipped. expected: band + Leaves out reasons. shots/TC-X-OTHER__G03-spring-band.png
T: Scroll preview, sections for missing Spring concepts each end in a plain italic "The snapshot has no Spring beans." / "None of the code's classes match a Spring role." / "The code has no Spring services." — honest and clear, no fabricated data. "Build modules" and "Hotspots" sections stay generically useful (real .NET project/hotspot data). shots/TC-X-OTHER__G04-preview-rest.png, G05-preview-end.png
T: Click "Create report", taking run opens Hotspots view for Figure 1 directly (no controller/service/entity slots to take, matching the "leaves out" list). shots/TC-X-OTHER__C01-taking-figure.png
T: An extra "Take it as asked" button appeared before Fill and finish became the primary action; clicked it, then "Fill and finish" lands on the finished report. expected: unclear why a. See P2 finding below. shots/TC-X-OTHER__L01-landing.png
T: Click "PDF", "Spring review: nopCommerce · 3 pages · A4 · 499 KB", no "to add" note (nothing left unfilled). shots/TC-X-OTHER__P01-pdf-preview.png
T: Save PDF, "Saved to .../M7/03-Spring review_ nopCommerce.pdf". shots/TC-X-OTHER__P02-pdf-saved.png

### Findings

### [P2] The "Findings" prompt still references controllers/services/entities/layers even when the template's own "Leaves out" line says those sections were skipped
- Test case / step: TC-X-OTHER / G5, R1
- Where: Spring application review (run on nopCommerce, a .NET codebase) › "Findings" prompt (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: The band's own "Leaves out" line says the report skips "The web layer... Repositories and the entity model... Do the layers hold?... Beans that switch on and off" because none of those exist here, and the body confirms this with plain statements like "The code has no Spring services." Despite that, the Findings prompt at the end still reads: "What you found, each tied to the evidence above: where the layers hold, where they leak, and which controllers, services or entities need attention first." A junior filling this in would be asked to write about layers, controllers, services and entities that the report itself says do not exist in this scan.
- Expected: The Findings prompt text should adapt to which sections actually ran, the same way the "Leaves out" line and body paragraphs did.
- Evidence: shots/TC-X-OTHER__G05-preview-end.png
- Repro: New report → Other ecosystems → Spring application review on nopCommerce → scroll to Findings prompt in the preview (or the created report).

### [P3] Extra unexplained "Take it as asked" step appears before finishing a single-figure taking run
- Test case / step: TC-X-OTHER / C1
- Where: Spring application review taking run, Figure 1 "Churn against code health" (nopCommerce, snapshot 18 Sep 16:23, analysis r0)
- What happened: After landing on the Hotspots view for the only remaining figure slot, the take bar showed a "Take it as asked" button in addition to the usual Stop/Skip/Fill controls, and had to be clicked before the run would finish normally. In TC-NET-1 and TC-GEN-ARCH-2's single/multi-figure takes this extra button did not appear — figures went straight to "Taken as the template asks." with Fill and next/finish alone.
- Expected: Consistent controls across takes, or if "Take it as asked" appears only in specific conditions, a clear reason shown in the bar.
- Evidence: shots/TC-X-OTHER__C01-taking-figure.png
- Repro: Create "Spring application review" on nopCommerce with defaults, reach the Figure 1 take step.

TC-X-OTHER: done — 2 findings, PDF `03-Spring review_ nopCommerce.pdf`

---

## Summary

Three PDFs produced for M7 (nopCommerce, .NET, old scan/revision 0): `.NET solution review`,
`Architecture review` (explanations off), and `Spring application review` (wrong-ecosystem case).
Sandbox check passed; all "Runs on ... analysis r0" headers matched.

**Three worst problems:**
1. **PDF tables truncate list/name columns with a bare ellipsis instead of wrapping**, silently
   dropping data the on-screen report shows in full (Table 1 "references": `Nop.Core, Nop.Data,
   No…` instead of all 4 names; Table 2 "project"/"Name": `Nop....`, `Nop.S...`, `…vices.Localization`
   — often unreadable and, worse, sorted differently from other tables so a reader can't even infer
   the name from row position). Reproduced in two different reports/templates.
2. **Wide table columns vanish entirely (not just clip) while the Cell/Pool inspector panel is open**
   in the report reading view — Table 1's whole "references" column disappears and its header cuts
   to "reference", with zero indication anything is hidden. Opening that panel is a normal, expected
   step (inspecting a cell), so this is easy to hit by accident.
3. **A vendored third-party JS library (`lib_npm/elfinder`) is reported as the single worst-health
   "component" in the codebase**, contradicting the report's own definition that third-party code is
   counted apart from production code.

**What worked well:** the "Other ecosystems" flow (TC-X-OTHER) was genuinely honest and useful —
picking "Spring application review" on a .NET codebase produced clear, specific "Leaves out"
reasoning up front, plain "The code has no Spring services" statements instead of fabricated or
empty sections, and still surfaced generically useful data (build-module references, hotspots).
Prompt fill/escape behavior, outline navigation, and Cell-pane explanations (for both computed
paragraphs and query tables) were all clear and worked smoothly throughout.
