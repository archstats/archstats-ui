# FINDINGS — M2 (fineract), run 2 (2026-09-25)

Session: `m2r2`, app http://localhost:4402/, workspace `fineract`, snapshot d5e5c7f7 · 25 Sep, 17:21 (analysis r4).

Sandbox check: Reports = 0 before first report (pass). New report header reads
"Runs on 21 Sep, 14:39 · c516013 · analysis r4" (pass -- analysis r4 as expected;
the 21 Sep, 14:39 vs sidebar's 25 Sep, 17:21 date mismatch is the known
commit-time-vs-scan-time candidate from Section 5, not reported again here).

Test cases in order: TC-SPRING-2, TC-JVM-3, TC-GEN-ARCH-1, TC-GEN-EXEC-1, TC-GEN-DD-1.

---

## TC-SPRING-2 · Spring application review (fineract)

### [P1] Take-figure flow says a fully-drawn view "drew nothing to take"
- Test case / step: TC-SPRING-2 / C2
- Where: Spring application review > Figure 1 "How Controllers and Services relate" > Units view (flow=controllers,services)
- What happened: Taking Figure 1 opened the Units view at `#/views/units?flow=controllers,services`. The view rendered a complete, data-filled lane diagram (Controllers 3, Services 1839, Repositories 205, Entities 279, Unclassified 4525, with arrows and "What it says" callouts). Despite this, the take bar read "Classes drew nothing to take; set it, then add it" and "Add this view" was disabled, forcing a Skip.
- Expected: If the view has real content on screen, the take control should recognize it (or explain concretely what setting is missing, e.g. "select a lens/pattern first") rather than claiming nothing was drawn.
- Evidence: shots/TC-SPRING-2__C01-take-figure1-nothing-to-take.png
- Repro: Create "Spring application review" for fineract with "Then take the figures" on; on slot 1 ("How Controllers and Services relate") observe the message while the Units view is fully rendered.

### [P1] Table query times out with no rows, in-app and in the PDF
- Test case / step: TC-SPRING-2 / R2, P3
- Where: Spring application review > Repositories and the entity model > Table 5 "Entities, the most used first"
- What happened: The cell's query returns a red error "stopped after 10s" with zero rows. The same "stopped after 10s" text is exported into the PDF directly under the table caption, in place of any data, with no note to the reader about why.
- Expected: Either the query should complete (index/optimize), or the report/PDF should show a clear, reader-facing explanation ("this table could not be computed") rather than a raw timeout message standing in for data — and a table with no rows should probably not be silently exported as if it were normal content.
- Evidence: shots/TC-SPRING-2__R02-table5-error-stopped-10s.png; PDF `01-Spring review_ fineract.pdf` page 4 ("Table 5. Entities, the most used first stopped after 10s")
- Repro: Create the Spring application review for fineract (large snapshot); Table 5 always errors on this snapshot.

### [P1] PDF silently truncates tables with no row-count note
- Test case / step: TC-SPRING-2 / P3
- Where: Every multi-row table in the report (Table 1, 2, 4, 6, 8, etc.)
- What happened: In the report view, each table caption says how many rows are shown out of the total (e.g. "20 of 85.", "25 of 170.", "20 of 22.", "30 of 175."). None of that "N of Total" text appears anywhere in the saved PDF — `pdftotext` on the saved PDF finds zero occurrences of "of 85/170/80/22/175". Table 2 ("Every web entry point, the busiest first") prints only 22 of the 170 entry points with no indication rows are missing.
- Expected: A PDF reader has no way to know these are partial tables; either the PDF should keep the "N of Total" caption, or increase/complete the row count, since the plan explicitly cares whether tables in the PDF are honest about being partial.
- Evidence: `01-Spring review_ fineract.pdf` pages 1-7 (Tables 1,2,4,6,7,8); compare to the in-app captions visible in shots/TC-SPRING-2__R01-roles-paragraph.png and TC-SPRING-2__R02-table5-error-stopped-10s.png
- Repro: Create the report, view any large table's caption in-app ("N of Total"), then Save PDF and search the PDF text for that total — it is absent.

### [P1] Two different "controller" counts on the same report page, unexplained
- Test case / step: TC-SPRING-2 / R1 (probe)
- Where: Spring application review > "The application at a glance" (last paragraph) vs "Roles in the code"
- What happened: "The application at a glance" says "The code declares 1,864 Spring beans: 834 services, 23 repositories, **2 controllers**, 161 configurations and 844 @Component classes." A few paragraphs later, "Roles in the code" says "the code outside tests declares 5,438 classes: **1 Controllers** (web entry points) ... ". Two different controller counts (2 vs 1) appear on the same page with no explanation that one counts Spring beans and the other counts classes-by-role.
- Expected: A junior reader would read these as contradictory. The report should either use one count consistently or briefly explain why "controllers" differs between the bean tally and the role tally.
- Evidence: shots/TC-SPRING-2__R01-roles-paragraph.png; `01-Spring review_ fineract.pdf` page 1
- Repro: Read the first two "computed" paragraphs of the Spring application review for fineract.

### [P2] "Classes drew nothing to take" names a view that isn't the one shown
- Test case / step: TC-SPRING-2 / C2
- Where: Taking Figure 1, message bar
- What happened: The take-failure message says "**Classes** drew nothing to take", but the page title, left-nav highlight and URL all say **Units** (`#/views/units`). fineract has no separate "Classes" nav entry.
- Expected: The failure message should name the view the tester is actually looking at.
- Evidence: shots/TC-SPRING-2__C01-take-figure1-nothing-to-take.png

### [P2] Table columns truncate a repeated phrase/header on every row in the PDF
- Test case / step: TC-SPRING-2 / P3
- Where: Table 7 "Repositories and entities that reach up..." column "which is"; Table 8 "Conditional beans" column header "switched on by"
- What happened: In the PDF, Table 7's "which is" column shows "a service or comp…" truncated identically on every single row (13/13 rows cut). Table 8's header truncates to "switched …" and every row's value "Conditional" survives but the header meaning is lost without the web view for reference.
- Expected: Either widen the column, wrap the text, or shorten the source phrase so a PDF reader (no hover, no source view) can tell what the column means.
- Evidence: `01-Spring review_ fineract.pdf` pages 5-6

### [P3] "1 Controllers" — singular count, plural noun
- Test case / step: TC-SPRING-2 / R1
- Where: "Roles in the code" paragraph: "1 Controllers (web entry points)"; also echoed in "The web layer" section: "The code has 1 Controllers (web entry points) across 1 component..."
- What happened: Grammatically reads as "1 Controllers" instead of "1 Controller". This is a template pattern for count=1 and would repeat anywhere else a role/table hits exactly 1.
- Expected: Singular/plural agreement ("1 Controller").
- Evidence: shots/TC-SPRING-2__R01-roles-paragraph.png

TC-SPRING-2: done — 6 findings (4 P1, 2 P2, 1 P3 — 7 total), PDF `01-Spring review_ fineract.pdf` (8 pages, A4, saved twice — final version has the Findings prompt filled in).

Transitions:
T: Open gallery, select "Spring application review" (auto-selected while scrolling the template list) → band and preview show correctly, header "Runs on 21 Sep, 14:39 · c516013 · analysis r4" · expected: gallery lists it under "For fineract" · shots/TC-SPRING-2__G02-template-selected-band.png
T: Click "Create report" (with "Then take figures" on) → report created instantly (22 cells) and the take-figures flow auto-starts on Figure 1 · expected: same · shots/TC-SPRING-2__L01-landed-after-create.png
T: Figure 1 (Units view) reports nothing to take → pressed Skip → advanced to Figure 2 (Hotspots, "Waiting for Hotspots to draw...") · expected: same · ⚠ (see P1 finding above) · shots/TC-SPRING-2__C01-take-figure1-nothing-to-take.png
T: Figure 2 finished drawing → import-preview modal auto-opened showing an orange "Preset: Churn against health, taken as Hotspots" mismatch warning · expected: would have expected to need an explicit "review" click, but it surfaced automatically, which is fine · shots/TC-SPRING-2__C03-take-figure2-state-check.png
T: Click "Take it as asked" → preset corrected to "churn", view re-drew, warning cleared to "Taken as the template asks" · expected: same · shots/TC-SPRING-2__C04-take-figure2-fixed-preset.png
T: Click "Fill and finish" → landed back on the report, Figure 2 filled, Figure 1 still "(to add)" · expected: same, clear · (L stage, no extra shot needed beyond C04)
T: Click a table's outline entry (Table 5, Table 6) → scrolls to it AND opens the Cell pane automatically · expected: only scroll · pleasant surprise, not ⚠
T: Click a paragraph's outline heading (e.g. "Repositories and the entity model") → scrolls only, does not open Cell pane · expected: consistent with table click · minor inconsistency, not filed separately
T: Click directly on a computed paragraph's "computed" tag → opens Cell pane with plain-language description ("One role — A paragraph counted from the snapshot...") · expected: same · shots/TC-SPRING-2__R04-cell-pane-computed-paragraph.png
T: Click the top grey-italic prompt, type a sentence, Escape → prompt replaced by typed prose immediately as typing starts, Escape leaves cursor without jumping · expected: same · shots/TC-SPRING-2__W01/W02/W03
T: Click "PDF" → preview sheet: "8 pages · A4 · 768 KB · 1 to add, left out" · expected: same, clear that the unfilled Figure 1 slot is excluded · shots/TC-SPRING-2__P01-pdf-preview-sheet.png
T: Click "Save PDF…" → "Saved to <mission folder>/01-Spring review_ fineract.pdf", file confirmed on disk · expected: same · shots/TC-SPRING-2__P02-pdf-saved-to-line.png

## TC-JVM-3 · Module drift check (fineract, Gradle)

The gallery band's "Leaves out" reason was clear and specific: "Used but not declared (the
build is not Maven; the scan cannot read every Gradle declaration), Declared but not used
(the build is not Maven; the scan cannot read every Gradle declaration)." A junior reader
understands immediately why this template has nothing to compute here.

Creating the report produces a genuinely empty shell: 0 cells, just the top prompt and one
"Changes to make" prompt, both grey italic placeholders with no computed content at all
(no paragraphs, no tables). This is still sensible to create (it stays a small, honest starting
point for a manual write-up) but the gallery band could be clearer up front that this template,
on this codebase, is pure scaffolding — "Writes 1 section: 2 prompts for your reading" does
say so today if read carefully, so this is a minor P3 clarity note rather than a bug.

### [P3] Gallery undersells that the template is 100% scaffolding on this codebase
- Test case / step: TC-JVM-3 / G3
- Where: "Module drift check" band, tally line
- What happened: The tally line reads "Writes 1 section: 2 prompts for your reading," which is accurate but easy to skim past; a tester only realizes the report has zero computed content once they've already created it (Reports count goes up, 0 cells).
- Expected: Not a functional bug — the information is present — but could be more prominent given both of the template's optional sections are left out.
- Evidence: shots/TC-JVM-3__G01-template-selected-leaves-out.png, shots/TC-JVM-3__L01-landed-empty-report.png

PDF is a clean 1 page, both prompts print as normal prose once filled, provenance line and
footer match the snapshot ("21 Sep, 14:39 · c516013 · analysis r4"), no leftover prompts or
placeholders. No P1/P2 issues found in this test case.

TC-JVM-3: done — 1 finding (P3), PDF `03-Module drift_ fineract.pdf` (1 page, A4).

Transitions:
T: New report → gallery reopens, scroll list to see "For fineract" group, select "Module drift check" → band shows "Leaves out" reasoning clearly · expected: same · shots/TC-JVM-3__G01-template-selected-leaves-out.png
T: Click "Create report" → lands on a near-empty report (0 cells, 2 prompts only) · expected: some content; surprised how empty it is, but not ⚠ since the band already said so · shots/TC-JVM-3__L01-landed-empty-report.png
T: Fill both prompts, Escape each time → prompts convert to plain prose cleanly, no jump · expected: same · shots/TC-JVM-3__W01, W02
T: Open PDF preview → "1 page · A4 · 22 KB", no "left out" warning since nothing left unfilled · expected: same · shots/TC-JVM-3__P01-pdf-preview.png
T: Save PDF → saved as "03-Module drift_ fineract.pdf" (app's internal save counter is 3, not 2, because a previously-saved-then-deleted PDF from TC-SPRING-2 still counted) · expected: sequential per-report numbering; minor cosmetic surprise, not filed as a finding since it doesn't affect correctness

## TC-GEN-ARCH-1 · Architecture review (fineract, defaults)

Overall this template read very well: the Structure paragraph defines "tangle", "propagation
cost" and "dependency levels" before using them, and a junior could follow it. The main-sequence
explanation (zone of pain / zone of uselessness) was clear enough to read the figure without help.
The coupling table headers (instability, distance from main sequence) are both defined in the
paragraph right above the table. Code health table and Hotspots section were both clear. All 4
figures took cleanly on the first try ("Taken as the template asks" every time, no preset
mismatches this run). Table 1 (Dependency matrix, in levels) correctly could not be taken given
1,156 components, with the expected message.

### [P1] A paragraph explains a table that is left out of the PDF entirely, with no note
- Test case / step: TC-GEN-ARCH-1 / P3
- Where: "Structure: how the parts depend on each other" section, the paragraph right before Table 1 ("Dependency matrix, in levels")
- What happened: fineract has 1,156 components, so Table 1 correctly cannot be taken as a matrix ("1156 components are too many for a matrix") and is correctly left out of the PDF (the preview header even says "1 to add, left out"). But the explanatory paragraph that leads into it — "In the dependency matrix each row and each column is a group of components, numbered in dependency order, and a number in a cell counts the imports from the row's group into the column's..." — still prints in full, immediately followed by the next section heading ("Coupling: the most depended-on parts"). A PDF reader sees a detailed description of a matrix that never appears anywhere in the document, with no note that it was omitted.
- Expected: If a slot is left unfilled and dropped from the PDF, its lead-in explanation paragraph should either be dropped too, or the PDF should carry a short "not available" note in the matrix's place (the way Table 5 in the Spring review at least showed an error string).
- Evidence: `04-Architecture review_ fineract.pdf` page 1 (paragraph ends "...a dependency running the other way." then jumps straight to "Coupling: the most depended-on parts"); shots/TC-GEN-ARCH-1__C02-table1-cant-take-matrix.png for the in-app can't-take message
- Repro: Create "Architecture review" for fineract (or any codebase with >200 components), skip the Dependency matrix slot, save the PDF, and read the page where Table 1 should be.

TC-GEN-ARCH-1: done — 1 finding (P1), PDF `04-Architecture review_ fineract.pdf` (7 pages, A4).

Transitions:
T: Select "Architecture review" in gallery → band shows "Leaves out Dependency rules (no dependency rules are set up for this codebase)" · expected: same, matches fineract having no rules · shots/TC-GEN-ARCH-1__G01-template-band.png
T: Create report (5 figures to take, on) → auto-starts take-figures flow on Figure 1 (Connections graph) · expected: same · shots/TC-GEN-ARCH-1__L01-landed-after-create.png
T: Figure 1 draws correctly, "Taken as the template asks" → Fill and next · expected: same, no issue · shots/TC-GEN-ARCH-1__C01-figure1-dep-structure.png
T: Table 1 (matrix) → "1156 components are too many for a matrix", clear can't-take card with "Propose a lens"/"Show the graph" options → Skip · expected: same, matches §5's documented expected behaviour exactly · shots/TC-GEN-ARCH-1__C02-table1-cant-take-matrix.png
T: Figures 2-4 (main sequence, hotspots, churn-vs-health) all draw and take cleanly, "Taken as the template asks" each time → Fill and next / Fill and finish · expected: same, no surprises · shots/TC-GEN-ARCH-1__C03-figure2-main-sequence.png
T: Land back on report after run → all figures filled except Table 1 (still "to add"), clearly marked · expected: same · shots/TC-GEN-ARCH-1__L02-landed-after-take-run.png
T: Fill Findings and Recommendations prompts, Escape each → convert to prose cleanly · expected: same · shots/TC-GEN-ARCH-1__W01, W02
T: Open PDF → header briefly "Laying out 14 cells…" (Save/Open buttons disabled) then settles to normal preview, "1 to add, left out" · expected: same, brief but not >2s so not flagged ⚠ · shots/TC-GEN-ARCH-1__P01-pdf-preview.png
T: Save PDF → saved as "04-Architecture review_ fineract.pdf" · expected: same

## TC-GEN-EXEC-1 · Executive summary (fineract)

### [P2] "Leadership, on one page" produces a 3-page PDF
- Test case / step: TC-GEN-EXEC-1 / P1, P3
- Where: gallery band says "Executive summary · Leadership, on one page"; the saved PDF's preview header reads "fineract: summary — 3 pages · A4 · 763 KB"
- What happened: With defaults (both figures taken, both prompts filled with one short sentence each) the report is 3 pages, not 1. The two full-width figures (a bubble/circle-pack churn chart and a treemap) each take most of a page on their own, and the "system in numbers" section alone (2 paragraphs of stats plus 2 more computed paragraphs on tangles/churn) runs long before either figure appears.
- Expected: A template billed as "on one page" for leadership should either fit on one page by default, or the gallery/band text should not promise a page count it structurally cannot hit once its own default figures are taken.
- Evidence: shots/TC-GEN-EXEC-1__P01-pdf-preview-3pages.png; `05-fineract_ summary.pdf` (3 pages, confirmed via `pdfinfo`)
- Repro: Create "Executive summary" for fineract with defaults, take both figures, Save PDF, check page count.

### [P3] Computed "system in numbers" section still carries unexplained-for-leadership jargon
- Test case / step: TC-GEN-EXEC-1 / R1 (probe)
- Where: "The system in numbers" section, the tangle/propagation-cost paragraph and the churn paragraph
- What happened: Before the human-written "What it means" prompt (which explicitly instructs "Leave out any term the reader would need explained"), the computed facts section already prints "601 of 1,156 components (83% of the lines) sit in 18 tangles... Propagation cost is 45%... the longest import chain is 12 levels deep" and "Churn is the number of lines added and deleted..." Each term is defined inline, so it is not unreadable, but this is dense, engineering-flavoured prose for a document whose explicit audience is leadership who "knows nothing about architecture metrics" per this test plan's own lens. A CFO reading straight through would hit "propagation cost", "tangle" and "dependency levels" before reaching any plain-language interpretation.
- Expected: For a leadership-audience template, either soften the computed section's phrasing or move the plain-language framing earlier so raw architecture jargon isn't the first thing a non-engineer reads.
- Evidence: `05-fineract_ summary.pdf` page 1

Otherwise the template behaved well: both figures ("Where changed lines went", "Where change meets hard code") took cleanly (one needed the same "Take it as asked" preset correction seen elsewhere — see the recurring-pattern note below), the "bus factor" term prints correctly and is defined ("This is often called the bus factor. No names are written here..."), and the prompts' own instructions ("leave out any term the reader would need explained") are a nice, self-aware design touch.

### Recurring pattern (not a new finding): "taken as X" preset mismatch on Hotspots-view figures
Same as TC-SPRING-2's Figure 2: any figure whose template preset is "Churn against health" on the Hotspots view lands first on the "Hotspots" preset ("taken as Hotspots", orange warning) and needs one "Take it as asked" click to match the template. Seen again here on Figure 2 ("Where change meets hard code"). Filing once is enough per the ground rules; flagging so the facilitator can decide whether it is worth a single consolidated finding across the whole run.

TC-GEN-EXEC-1: done — 2 findings (1 P2, 1 P3), PDF `05-fineract_ summary.pdf` (3 pages, A4).

Transitions:
T: Select "Executive summary" in gallery (after scrolling the list) → band and preview load · expected: same · shots/TC-GEN-EXEC-1__G01-template-band.png
T: Create report → auto-starts take-figures flow directly on the Activity view (Figure 1) · expected: same · (no separate landing shot needed, covered by C01)
T: Figure 1 draws, "Taken as the template asks" → Fill and next · expected: same, no issue
T: Figure 2 (Hotspots, Churn against health preset) → "taken as Hotspots" orange mismatch warning again → Take it as asked → Fill and finish · expected: would prefer it just take the right preset first time · not marked ⚠ (same known pattern, corrected in one click) · shots/TC-GEN-EXEC-1__C01-figure2-preset-mismatch.png
T: Land back on report → both figures filled, 7 cells · expected: same · shots/TC-GEN-EXEC-1__L01-landed-after-run.png
T: Fill "What it means" and "What we ask for" prompts, Escape each → clean conversion to prose · expected: same · shots/TC-GEN-EXEC-1__W01-prompts-filled.png
T: Open PDF preview → "3 pages · A4 · 763 KB" · expected (per template's own promise): 1 page · ⚠ surprising given the template's name and band both promise "one page" · shots/TC-GEN-EXEC-1__P01-pdf-preview-3pages.png
T: Save PDF → saved as "05-fineract_ summary.pdf" · expected: same

## TC-GEN-DD-1 · Technical due diligence (fineract)

### [P1] "No names are written here" is immediately false — Table 1 prints full names and personal emails
- Test case / step: TC-GEN-DD-1 / C2, R1, R2, P3
- Where: "History and team" section: the knowledge/bus-factor paragraph, immediately followed by Table 1 "Knowledge by component"
- What happened: The paragraph right above Table 1 states explicitly: "This is often called the bus factor. No names are written here; the Authors view shows them." The table's own title is "Knowledge by component" and its "Asked for" panel says "Rows of: Components" with a green check ("Taken as the template asks"). But the table actually captured and printed is a per-**author** table with columns Author, Email, Commits, Lines added, Lines deleted — full real names (e.g. "Keith Woodlock") and personal email addresses (e.g. "keithwoodlock@gmail.com") for the top 10 contributors, not grouped by component at all. This prints unchanged into the final PDF.
- Expected: A section whose own prose promises anonymity should not be immediately followed by a table of names and emails; separately, a table titled "Knowledge by component" with "Rows of: Components" checked should actually be rows of components, not rows of authors — the "Taken as the template asks" check is misleading here since the shown columns (Author/Email) don't match a per-component knowledge breakdown.
- Evidence: shots/TC-GEN-DD-1__C02-table1-names-emails-contradiction.png; `06-Technical due diligence_ fineract.pdf` page 2 ("Table 1. Knowledge by component" with Author/Email/Commits/Lines added/Lines deleted columns, real names and emails for 10 rows)
- Repro: Create "Technical due diligence" (or "Ownership and knowledge") for fineract, take Table 1 "Knowledge by component" as the template asks, read the paragraph right above it, then look at the table.

Otherwise this template read well. The "Scope" prompt sits first, before any evidence, and reads
naturally ("What was scanned... so the reader knows what the evidence covers") — a sensible
place for it. "Work over time" (Activity) took cleanly. The knowledge/bus-factor explanation text
itself is fine (aside from the table mismatch above). Maintainability (code health, "Least healthy
files" table, "Code age" treemap) and third-party libraries sections were clear and the table
widths in the PDF were readable (long file paths correctly ellipsised, not cut mid-column). Tests
section is a single clear pair of stats. PDF is 6 pages for a fairly dense evidence-heavy DD
template, which reads as reasonable for this document type (unlike the Executive summary's "one
page" promise, this template does not claim a page budget).

TC-GEN-DD-1: done — 1 finding (P1), PDF `06-Technical due diligence_ fineract.pdf` (6 pages, A4).

Transitions:
T: Select "Technical due diligence" in gallery → band, "Writes 7 sections... 6 figures... 2 prompts" · expected: same · shots/TC-GEN-DD-1__G01-template-band.png
T: Create report (6 figures/tables to take) → auto-starts take-figures flow on Activity (Figure 1) · expected: same · shots/TC-GEN-DD-1__C01-figure1-work-over-time.png
T: Table 1 "Knowledge by component" draws and is offered as "Taken as the template asks" despite showing per-author names/emails, not per-component data → Fill and next · expected: a components-grouped table; ⚠ this is the P1 above, and also a flow surprise since the green check gave false confidence · shots/TC-GEN-DD-1__C02-table1-names-emails-contradiction.png
T: Figures 2-3 (Connections graph, main-sequence plot) take cleanly, "Taken as the template asks" · expected: same, no issue
T: Figure 4 "Code age" → "taken as Hotspots" preset mismatch again (same recurring pattern as TC-SPRING-2/TC-GEN-EXEC-1) → Take it as asked → Fill and next · expected: would prefer correct preset by default; not marked ⚠ since it self-corrects in one click
T: Table 3 "Libraries" takes cleanly, "Taken as the template asks" → Fill and finish · expected: same
T: Land back on report, 16 cells · expected: same · shots/TC-GEN-DD-1__L01-landed-after-run.png
T: Fill "Scope" and "Risks" prompts using `click "<text>"` (facilitator's harness fix) → both convert cleanly to prose, no jump · expected: same · shots/TC-GEN-DD-1__W01-scope-prompt-filled.png, TC-GEN-DD-1__W02-risks-prompt-filled.png
T: Open PDF preview → "6 pages · A4 · 2.1 MB" (largest PDF this mission, due to the commit-history figure and 4 more figures/tables) · expected: some length for a DD document; not flagged as a finding on its own · shots/TC-GEN-DD-1__P01-pdf-preview.png
T: Save PDF → saved as "06-Technical due diligence_ fineract.pdf" · expected: same

---

## Summary (M2, fineract)

Worst problems: (1) Technical due diligence's Table 1 "Knowledge by component" prints real
contributor names and email addresses directly under a paragraph promising "No names are
written here" — a trust-breaking contradiction that lands in the exported PDF. (2) PDFs silently
truncate large tables (e.g. 22 of 170 web entry points) with no "N of Total" note carried over from
the in-app caption, so a reader cannot tell a table is incomplete; the same report also leaves an
explanatory paragraph dangling ("In the dependency matrix...") for a table that was correctly
omitted. (3) A fully-rendered view ("Units", the lane diagram) was reported by the take-figure flow
as having "drawn nothing to take," blocking that figure entirely.

What worked well: every can't-take message that should appear (dependency matrix over 200
nodes, Gradle module drift) appeared exactly as documented, with clear plain-language reasons.
Prompts fill and un-fill cleanly. Explanatory paragraphs for tangles, propagation cost, main
sequence and hotspots were all readable by a junior developer.

