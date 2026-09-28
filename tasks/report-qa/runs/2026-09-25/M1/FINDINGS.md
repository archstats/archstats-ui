# M1 findings — BroadleafCommerce (http://localhost:4301/)

Sandbox check: Evidence -> Reports = 0 before first report. OK, proceeding.

Test cases (in order): TC-SPRING-1, TC-SPRING-3, TC-SPRING-4, TC-JVM-1, TC-JVM-2

---

## TC-SPRING-1 · Spring application review (BroadleafCommerce, snapshot 22 Sep 19:13 / 8645873, analysis r3)

### [P1] Figures show "analysis r3" while every paragraph and table in the same report shows "analysis r0"
- Test case / step: TC-SPRING-1 / R1, R6, P3
- Where: Spring review: BroadleafCommerce report - every provenance line, and the "Ran on" panel in the Cell inspector
- What happened: every computed paragraph and every table's provenance line reads "BroadleafCommerce · snapshot 2 Jun, 15:16 · analysis r0 · lens Domain" (confirmed via the Cell pane too: "Analysis r0"). Both figures (Figure 1 "How Controllers and Services relate", Figure 2 "Churn against code health") instead read "BroadleafCommerce · snapshot 2 Jun, 15:16 · 8645873 · analysis r3 · lens Domain". Same report, same snapshot label, two different analysis revisions. This prints into the saved PDF exactly as shown on screen (page 4/5 and page 8 of `01-Spring review_ BroadleafCommerce.pdf`).
- Expected: one report run on one snapshot should report one analysis revision everywhere.
- Evidence: shots/tc-spring-1-g1-dialog.png (dialog said "analysis r0" before creation), shots/tc-spring-1-findings.png (Figure 2 caption "analysis r3"), shots/tc-spring-1-r6-cellpane-computed.png (Cell pane "Analysis r0"), PDF `01-Spring review_ BroadleafCommerce.pdf` pages 5 and 8.
- Repro: Evidence -> Start a report -> Spring application review -> Create report (take both figures) -> scroll any table's caption vs. either figure's caption.

### [P1] The same commit (8645873) is shown with two different snapshot times in the same report
- Test case / step: TC-SPRING-1 / G3, R1
- Where: report toolbar "Snapshot the cells run on" selector vs. every paragraph/table/figure provenance line
- What happened: every cell in the report is captioned "snapshot 2 Jun, 15:16" (figures add "· 8645873" so commit 8645873 = 2 Jun, 15:16). The "Snapshot the cells run on" dropdown lists two options: "2 Jun, 15:16" (the selected/newest one, no commit shown) and "4 May, 23:57 · 8645873" (commit shown). The sidebar's Overview page for the currently open snapshot (22 Sep, 19:13) states "develop-7.0.x @ 8645873 · committed 141 days before the scan" - 141 days before 22 Sep lands on ~4 May, matching the dropdown's "4 May, 23:57 · 8645873" option, not "2 Jun, 15:16". So the one commit that is actually open (8645873) is labelled with two different commit/snapshot times depending on which part of the UI you read.
- Expected: a single commit should have a single displayed time; if the report intentionally names the snapshot by commit time (as opposed to the sidebar's scan time - the "known candidate" behaviour called out in the test plan), that time should be consistent everywhere it appears with that commit hash.
- Evidence: shots/tc-spring-1-g1-dialog.png, PDF header page 1 ("snapshot 2 Jun, 15:16 · analysis r0").
- Repro: open Evidence with BroadleafCommerce's 22 Sep snapshot open -> Start a report -> read "Written for BroadleafCommerce from the snapshot of 2 Jun, 15:16" -> after creating, open the "Runs on" dropdown and compare its second option's date/commit pairing to the figures' captions.

### [P2] PDF tables truncate cell values and even column headers with no way to read the full text
- Test case / step: TC-SPRING-1 / P3
- Where: `01-Spring review_ BroadleafCommerce.pdf`, Table 2 "Every web entry point, the busiest first" (page 2) and Table 4 "Entities, the most used first" (pages 3-4)
- What happened: columns are so narrow that both header and cell text are cut with an ellipsis. Table 2's "kind" column prints "MVC …" for every single row (the distinguishing text is gone); entry-point names print as "AdminBasicEntit…", "AdminProductCo…", etc; the GET column header itself prints as "G…". Table 4's "base of a hierarchy" header prints as "base …", entity names print as "ArchiveS…", "Category…", "AddressI…", and the "repositories" column's comma-joined lists are cut off mid-word ("CategoryDaoImpl,ProductDaoImpl…").
- Expected: a printed report should either wrap/shrink text to stay legible, drop or combine columns, or otherwise avoid unreadable truncation, especially on identifying columns like entry point/entity name and on a column ("kind") whose entire value becomes identical uninformative text for every row.
- Evidence: `01-Spring review_ BroadleafCommerce.pdf` pages 2-4 (pdftotext -layout output).
- Repro: create the Spring application review report on BroadleafCommerce with default settings, save PDF, open pages 2 and 3-4.

### [P2] Tables capped on screen ("N of Total") lose that notice when printed to PDF
- Test case / step: TC-SPRING-1 / R2, P3
- Where: Table 3 (20 of 36 shown on screen), Table 4 (20 of 165), Table 6 (20 of 76), Table 7 (30 of 85), Table 8 (10 of 463)
- What happened: on screen, every capped table ends with a line like "20 of 165." telling the reader how much was cut. None of that text appears anywhere in the saved PDF (`grep` for "of 36", "of 165", "of 85", "of 463", "of 76" finds nothing) - the PDF table simply stops after the same subset of rows with no indication that 85 or 165 or 463 rows exist in total.
- Expected: a reader of the PDF alone (the audience most templates are written for - "an architecture board", "leadership") should be able to tell a table was truncated instead of assuming it is complete.
- Evidence: `01-Spring review_ BroadleafCommerce.pdf`, end of Table 3/4/6/7/8 on pages 3, 4, 5, 6, 8.
- Repro: same as above; compare the on-screen "N of Total" caption under any capped table to the same table's end in the PDF.

### [P3] Table column headers print in lower case, inconsistent with the rest of the report
- Test case / step: TC-SPRING-1 / R2
- Where: Table 1 ("package", "entry points", "Spring request mappings", "lines"), Table 3 ("package", "entities", "classes elsewhere that use them"), Table 6 ("class", "its role", "uses", "which is"), Table 7 ("bean", "package", "switched on by")
- What happened: every table header in this template is plain lower-case English (not Title Case, not the raw metric ids the plan warns about, but still visually inconsistent with the Title Case section headings and the rest of the app's chrome).
- Expected: consistent capitalization makes a printed table read like a finished document rather than a raw export; a junior reader scanning quickly notices the mismatch.
- Evidence: `01-Spring review_ BroadleafCommerce.pdf` pages 1-8, any table.
- Repro: open any table in the Spring application review report.

TC-SPRING-1: done - 5 findings, PDF `01-Spring review_ BroadleafCommerce.pdf` (9 pages, A4)

## TC-SPRING-3 · Spring layering check (BroadleafCommerce)

### [P1] "Dependency rules" section claims 1 rule applies and holds, but the workspace's Rules view shows none applied
- Test case / step: TC-SPRING-3 / R1, R4
- Where: Spring layering: BroadleafCommerce report - "Dependency rules" section
- What happened: the report's computed paragraph reads "All 1 rule that apply hold: no import breaks them." (also grammatically off: "1 rule that apply hold" should be "1 rule that applies holds" or similar). But the workspace's own Rules view (left nav -> Rules) says "None applied - None of the built-in rules is about an ecosystem this codebase uses, so nothing was checked here. That is no verdict either way." - i.e. 0 rules were checked, not 1. This also contradicts the template gallery's own tally for the sibling "Spring layering check" template, which lists a "Leaves out" line only for "Transaction boundaries", implying Dependency rules is expected to have real content - but the content it reports (1 rule) doesn't match reality (0 rules).
- Expected: the paragraph's rule count should match what the Rules view actually reports for the same snapshot; if no rule applies, the section should say so (or be left out), not claim one applies and holds.
- Evidence: shots/tc-spring-3-end.png (report paragraph), shots/tc-spring-3-rulesview.png (Rules view showing "None applied"), PDF `02-Spring layering_ BroadleafCommerce.pdf` page 3 ("All 1 rule that apply hold: no import breaks them.").
- Repro: create "Spring layering check" on BroadleafCommerce, scroll to "Dependency rules"; separately open Rules in the left nav and compare.

### [P1] Same analysis-revision mismatch as TC-SPRING-1 (r0 vs r3), reproduced in a second template
- Test case / step: TC-SPRING-3 / R1, P3
- Where: Spring layering: BroadleafCommerce report - every table/paragraph provenance line reads "analysis r0"; Figure 1 "How Services and Repositories relate" reads "analysis r3". Same contradiction, same commit/snapshot, different template - confirms it is not specific to one template.
- Expected: see the TC-SPRING-1 finding above.
- Evidence: PDF `02-Spring layering_ BroadleafCommerce.pdf` page 1-2.
- Repro: same as TC-SPRING-1's finding, using this template instead.

### Confirmed working well: the matrix "cannot be taken" message
- The "Dependency matrix" slot correctly refused to auto-fill with a clear reason: "Connections has nothing to take: The matrix has 47 columns; group it to 40 or fewer to add it as a table." and offered "Add this view" / "Skip". After Skip, the report kept a clean "to add" placeholder card ("From Connections, set as Matrix / By group / By levels", "Take it from Connections" / "Set it yourself") instead of an error, and the PDF preview correctly reported "1 to add, left out" and the PDF itself omitted the slot entirely. This matches the test plan's expected behaviour and is a good design (comparable to the always-459-components case in TC-SPRING-1 §5, here grouped to 47).

TC-SPRING-3: done - 2 findings, PDF `02-Spring layering_ BroadleafCommerce.pdf` (3 pages, A4)

## TC-SPRING-4 · JPA entity model (BroadleafCommerce)

- The analysis-revision mismatch (paragraphs/tables "analysis r0" vs. Figure 1 "analysis r3") reproduces a third time here too - see the TC-SPRING-1 finding above (same report, same snapshot, same contradiction; PDF `03-Entity model_ BroadleafCommerce.pdf` page 3).
- The PDF table-truncation problem (see TC-SPRING-1 finding) reproduces on the exact column the test plan asked about: Table 3 "Entities with the most links to other entities" - its "entities it refers to" column (a comma-joined list of entity names) is cut with "…" on every single multi-entry row in the PDF, e.g. "Auditable,BroadleafCurrencyImpl,LocaleImpl,…" for OrderImpl, which actually refers to 11 entities - only 3 are visible. The "links" column header itself also truncates to "lin…". Evidence: `03-Entity model_ BroadleafCommerce.pdf` page 2.

### Confirmed working well
- "Entities saved through another" (Table 4, entities with no repository of their own) and "Entities that extend another entity" (Table 5, inheritance) both read clearly and printed in full (Table 5 shows all 14 rows, no truncation needed). "Entities the web layer touches directly" (Table 6) is short (4 rows) and readable both on screen and in the PDF.

TC-SPRING-4: done - 0 new findings (2 recurrences of already-logged P1/P2 issues folded into their original entries), PDF `03-Entity model_ BroadleafCommerce.pdf` (5 pages, A4)

## TC-JVM-1 · Multi-module build review (BroadleafCommerce)

### [P3] Garbled sentence in the "How the code connects" paragraph
- Test case / step: TC-JVM-1 / R1, R4
- Where: Build review: BroadleafCommerce report, "How the code connects" section (also appears verbatim in the Architecture-style paragraph reused by other templates)
- What happened: "Propagation cost is 22%: of all ordered pairs of components, that share are linked by a chain of imports." The clause "of all ordered pairs of components, that share are linked by a chain of imports" does not parse as English - it reads like a dropped or duplicated word (perhaps meant "the share of all ordered pairs of components that are linked by a chain of imports").
- Expected: a grammatical sentence a junior developer can read once and understand.
- Evidence: `04-Build review_ BroadleafCommerce.pdf` page 2.
- Repro: create any template with the "Dependency structure" / propagation-cost paragraph (e.g. Multi-module build review) on BroadleafCommerce.

- The "Dependency rules" paragraph again claims "All 1 rule that apply hold: no import breaks them." while the workspace's Rules view says none are applied - same bug as logged under TC-SPRING-3, now confirmed in a fourth template. Evidence: `04-Build review_ BroadleafCommerce.pdf` page 3.
- The analysis-revision mismatch (r0 vs r3) reproduces again on Figure 1 vs. the rest of the report - same as TC-SPRING-1. Evidence: `04-Build review_ BroadleafCommerce.pdf` page 2.

### Confirmed working well
- Table 2 "Module to module, by references" breaks cleanly across a page boundary with its header row repeated on the continuation page - good, readable behaviour, no complaint.
- The `broadleaf-admin-module` -> `broadleaf-common` row shows 244 references / 82 files / "not declared", exactly matching the expected fact in the test plan.

TC-JVM-1: done - 1 new finding (plus 2 recurrences folded into existing entries), PDF `04-Build review_ BroadleafCommerce.pdf` (4 pages, A4)

## TC-JVM-2 · Module drift check (BroadleafCommerce)

No new findings. Clean, single-page PDF; both tables (3 and 7 rows) are short enough to print without truncation or capping, and read clearly. Notably this template has no figures, and its provenance line is "analysis r0" everywhere with no mismatch - consistent with the theory that the r0/r3 split (logged under TC-SPRING-1) is specific to figure-type cells versus every other cell type.

TC-JVM-2: done - 0 findings, PDF `05-Module drift_ BroadleafCommerce.pdf` (1 page, A4)

---

## Summary

Five reports were built end to end on BroadleafCommerce (Spring application review, Spring layering check, JPA entity model, Multi-module build review, Module drift check) and each saved to PDF. The three worst problems:

1. **Every figure in every report is stamped "analysis r3" while every paragraph and table in the same report is stamped "analysis r0"** (TC-SPRING-1, reproduced in all four other templates that have figures). This prints straight into the delivered PDF and is the kind of self-contradicting number the plan calls out as a P1 example.
2. **The "Dependency rules" section claims "All 1 rule that apply hold: no import breaks them" in every template that has one, but the workspace's own Rules view says "None applied"** - a real fabricated/incorrect fact in the printed report (TC-SPRING-3, recurring in TC-JVM-1).
3. **PDF tables truncate cell values and even column headers with an ellipsis** whenever a column is even moderately wide (entry-point names, the "kind" column collapsing to identical "MVC …" text, comma-joined entity-reference lists cut mid-word) - the exact `Table 4`/`Table 3` "entities it refers to" case the plan asked to probe. Capped tables also silently drop the on-screen "N of Total" notice when printed, so a PDF reader cannot tell a table was truncated.

What worked well: the "Dependency matrix has nothing to take" refusal (clear reason, clean fallback card, correctly left out of the PDF), typed prompts print correctly and unfilled prompts are correctly omitted, the harness's SQL-console fix restored real table data mid-mission, and the short templates (Module drift check) print cleanly with no issues at all.

All five planned test cases (TC-SPRING-1, TC-SPRING-3, TC-SPRING-4, TC-JVM-1, TC-JVM-2) were completed in full, including a full restart/re-creation of TC-SPRING-1 and TC-SPRING-3 after the facilitator's mid-mission SQL-console fix (no findings from before that fix were logged, so nothing needed to be marked HARNESS (void)).
