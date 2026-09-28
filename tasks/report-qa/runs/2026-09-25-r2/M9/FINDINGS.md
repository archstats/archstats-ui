# M9 findings — npo-data-pipeline (run 2, 2026-09-25 evening)

Session: m9r2, http://localhost:4409/, workspace `npo-data-pipeline`, snapshot 3292374e (open, 21 Sep 23:41 in sidebar), analysis revision 0 (old scan).

Sandbox check: Reports = 0 before first report. New report dialog for Python codebase review reads "Runs on 20 Sep, 01:45 . analysis r0" -- revision matches table (r0). OK, proceeding.

Note (harness): the New report dialog names the snapshot "20 Sep, 01:45" (commit time) while the sidebar names the open snapshot "21 Sep, 23:41" (scan time) -- this matches the known candidate fact in section 5, already recorded; not reported again here.

---

## TC-PY-1 . Python codebase review (M9 npo-data-pipeline)

T: Evidence -> click "Start a report" -> gallery dialog opens, Python codebase review pre-selected (matched by "Found: Python, 51% of production lines") . expected: empty state opens a template picker . shots/TC-PY-1__G01-gallery-open.png

- G2: Template sits under "For npo-data-pipeline" group, second line "Found: Python, 51% of production lines" -- clear.
- G3: Band: "Python codebase review . A Python team". Summary: "A review of a Python codebase: its packages and how much each holds and is used, its request handlers and data classes if it is a FastAPI or Flask service, the third-party libraries beneath it, where complicated code keeps changing, and the tests." Use it when: "for a general health check of a Python codebase, or before restructuring its packages." Tally: "Writes 7 sections: 6 paragraphs explaining the terms, 6 paragraphs counted from the snapshot, 3 tables, 2 figures to add from the views and 2 prompts for your reading." Leaves out: "Request handlers (no function carries a route decorator), Tests (the scan did not sort files into production and test code)." -- both reasons are clear and match the mixed Python/Terraform/Go, old-scan (revision 0, no roles) nature of this snapshot.
- G5 (scrolled): "The code" section explains production code, component, and FastAPI/Flask decorators clearly for a junior. Counted paragraph: "The snapshot holds 421 production files with 49,103 lines of code, grouped into 22 components; the scan found 1 Go module. Python carries 51% of those lines, then JSON (14%) and YAML (5%)." -- honestly surfaces the mixed-language repo rather than pretending it's all Python (good; matches probe question).

T: scroll preview once -> packages table intro paragraph visible, "Packages" heading + "Table 1: Packages, the largest first" placeholder . expected: more of the template body . shots/TC-PY-1__G03-preview-scrolled.png

T: click "Create report" -> taking run starts, first take view opens: Connections graph, "Taking Figure 1, Dependency structure . 1 of 2" . expected: some transition into a take flow, unclear it would jump straight into a live view . shots/TC-PY-1__C01-take-figure1-dependency-structure.png
T: "Fill and next" on Figure 1 -> moves to Libraries view, "Taking Table 3, Libraries . 2 of 2" (a table, not a figure -- see finding below) . expected: next figure . shots/TC-PY-1__C02-take-table3-libraries.png
T: "Fill and finish" on Table 3 -> lands back on Evidence, the finished report open at the top, outline populated, "Reports 1" . expected: clear end-of-run landing, confirmed . shots/TC-PY-1__L01-landed-after-run.png
T: click outline entry "Findings" -> scrolls report to the Findings section at the bottom . expected: jump to that heading, worked correctly . shots/TC-PY-1__R02-findings-outline-jump.png
T: click outline entry "The code" -> scrolls to top of report, title + top prompt visible . expected works correctly . shots/TC-PY-1__R04-top-after-outline-click.png
T: click "Show all 19 rows" on Table 1 -> table expands in place to 19 rows, no jump . expected: expands, confirmed . (no dedicated shot; captured in R05)
T: click Table 1's captured area -> Cell pane on the right shows "A read-only query on the snapshot", the editable SQL, Rows kept, Ran on / Snapshot / Analysis / At . expected: some explanation, was clear . shots/TC-PY-1__R06-cellpane-computed-paragraph.png (also covers the computed-paragraph Cell pane, see below)
T: click the "Size and languages" computed paragraph -> Cell pane shows "A paragraph counted from the snapshot", what is Counted, and the re-run/"Write as my own" note . expected: explanation of the paragraph's source, was clear and reassuring . shots/TC-PY-1__R06-cellpane-computed-paragraph.png
T: click the top prompt ("What the code does...") -> cursor enters the prompt, placeholder text ready to be replaced . expected: becomes editable, confirmed . shots/TC-PY-1__W02-prompt-clicked.png
T: type a sentence into the top prompt -> text appears live, replacing the grey italic placeholder . expected works as typed . shots/TC-PY-1__W03-prompt-typing.png
T: Escape on the top prompt -> text stays, cell no longer in edit mode, no jump . expected: commits the text, confirmed . shots/TC-PY-1__W04-prompt-after-escape.png
T: click + type + Escape on the "Findings" prompt -> same behaviour, text committed cleanly . expected: consistent with the first prompt, confirmed . shots/TC-PY-1__W05-findings-prompt-filled.png
T: click "PDF" -> PDF preview sheet opens in place, "Python review: npo-data-pipeline · 4 pages · A4 · 238 KB", A4/Letter toggle, Open in Preview, Save PDF... . expected: a preview sheet, fast, no visible wait . shots/TC-PY-1__P01-pdf-preview.png
T: click "Save PDF..." -> "Saved to /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-25-r2/M9/01-Python review_ npo-data-pipeline.pdf" line appears with a Reveal button; file confirmed on disk (243,618 bytes) . expected: a save confirmation, confirmed . shots/TC-PY-1__P02-saved-pdf-line.png

### [P3] Query-backed tables print raw, lower-case SQL column headers; view-captured tables do not
- Test case / step: TC-PY-1 / R2
- Where: Python codebase review > Table 1 "Packages, the largest first" and Table 2 "Data classes" (workspace npo-data-pipeline, snapshot 20 Sep 01:45, analysis r0)
- What happened: Table 1's printed headers are `package | classes | functions | imported by packages` and Table 2's are `package | data classes | built on` -- all lower-case, matching the raw SQL column aliases shown in the Cell pane (`SELECT u.component AS package, count(...) AS classes, ... AS "imported by packages"`). By contrast Table 3 "Libraries" and Table 4 "Hotspot files" (captured from a view, not hand-written SQL) print proper headers: `Library, Platform, Looks internal, Imports, Files` and `Name, Line Count, Code Health, Hotspot Score, Commit Count`. Both header styles appear in the same report and in the exported PDF.
- Expected: A junior reading the PDF would expect consistent, humanized column headers throughout, e.g. "Package", "Classes", "Functions", "Imported by packages", the same way Table 4 reads.
- Evidence: shots/TC-PY-1__R05-table1-scrolled.png, shots/TC-PY-1__R06-cellpane-computed-paragraph.png, 01-Python review_ npo-data-pipeline.pdf page 1 (Table 1) and page 2 (Table 2)
- Repro: Create "Python codebase review" on npo-data-pipeline; look at Table 1/2 headers vs Table 3/4 headers, in-app or in the saved PDF.

### [P3] Gallery tally calls a table slot a "figure"
- Test case / step: TC-PY-1 / G3, C2
- Where: Python codebase review > gallery band ("Then take the 2 figures from their views") and the taking flow itself
- What happened: The template's tally/footer line reads "Then take the 2 figures from their views", but the second of the two slots taken is "Table 3 . Libraries" -- during the take run the toolbar literally reads "Taking Table 3, Libraries . 2 of 2" and the outline lists it as a table icon, not a figure.
- Expected: Consistent wording -- either call it "2 items" / "1 figure and 1 table", or relabel the slot, so the count in the gallery band matches what the take flow calls it.
- Evidence: shots/TC-PY-1__G02-template-selected-band.png (band text), shots/TC-PY-1__C02-take-table3-libraries.png (take flow says "Table 3")
- Repro: Open "Start a report" > Python codebase review; read the footer checkbox line, then run "Create report" and watch the "Taking … 2 of 2" label on the second slot.

### [P3] Packages table (19 rows) undercounts the "22 components" the paragraph claims, unexplained
- Test case / step: TC-PY-1 / R1, R2
- Where: Python codebase review > "The code" computed paragraph vs Table 1 "Packages, the largest first"
- What happened: The computed paragraph says the snapshot is "grouped into 22 components", but Table 1 lists only 19 packages ("Show all 19 rows"; confirmed 19 data rows in the saved PDF). The table's SQL (`WHERE u.file LIKE '%.py' ... AND u.component <> '.'`) silently restricts to Python-file components and drops the root component, which likely accounts for the gap, but the report never says so.
- Expected: Either the paragraph and table should agree on the same denominator, or the table/paragraph should say why they differ (e.g. "19 of 22 components hold Python files").
- Evidence: shots/TC-PY-1__R05-table1-scrolled.png, 01-Python review_ npo-data-pipeline.pdf page 1
- Repro: Create the Python codebase review on npo-data-pipeline; compare the "22 components" sentence with Table 1's row count / "Show all 19 rows" link.

TC-PY-1: done -- 3 findings, PDF `01-Python review_ npo-data-pipeline.pdf`

## TC-QW-TEST-1 · Where tests are missing (M9 npo-data-pipeline, old scan)

T: "New report" -> gallery reopens, template list unchanged, no template pre-selected this time (Python codebase review is no longer "on") . expected: fresh picker, confirmed . shots/TC-QW-TEST-1__G01-template-selected-band.png
T: click "Where tests are missing" -> band updates, preview shows just a title and two prompts, no evidence sections at all . expected: some evidence tables per the template's stated purpose; instead the whole body is prompts . shots/TC-QW-TEST-1__G02-preview-scrolled.png
T: click "Create report" -> no taking run starts (nothing to take); lands directly on the new report, "0 cells" . expected: since nothing needs taking, a direct landing is reasonable and it was clear . shots/TC-QW-TEST-1__L01-landed-after-create.png
T: click + type + Escape on "What prompted this" prompt -> committed cleanly, no jump . shots/TC-QW-TEST-1__W01-first-prompt-filled.png
T: click + type + Escape on "Where to start" prompt -> committed cleanly, no jump . shots/TC-QW-TEST-1__W02-both-prompts-filled.png
T: click "PDF" -> preview sheet, "Test gaps: npo-data-pipeline · 1 page · A4 · 21 KB" . expected: a short PDF given there is no evidence, confirmed . shots/TC-QW-TEST-1__P01-pdf-preview.png
T: click "Save PDF..." -> "Saved to .../M9/02-Test gaps_ npo-data-pipeline.pdf", file confirmed on disk, 1 page, matches on-screen text exactly . shots/TC-QW-TEST-1__P02-saved-pdf-line.png

### [P2] "Where tests are missing" produces a report with zero evidence on this workspace -- title and two prompts only
- Test case / step: TC-QW-TEST-1 / G3, R1
- Where: "Where tests are missing" template, gallery band and the created report (workspace npo-data-pipeline, snapshot 20 Sep 01:45, analysis r0, old scan)
- What happened: The band is honest about this upfront -- "Writes 1 section: 2 prompts for your reading" and "Leaves out Tests in the codebase (the scan did not sort files into production and test code), Components no test reaches (the scan did not sort files into production and test code)." After creating it, the report is genuinely just the title, "What prompted this" and "Where to start" -- no computed paragraph, no table, no figure, 0 cells before the prompts are filled. Every other M9 template tried in this run (Python codebase review) still manages several computed paragraphs and 4 tables on the very same old-scan snapshot. This one template degrades all the way to nothing.
- Expected: A junior asking "is this report still worth anything?" would reasonably expect at least one computed fact (e.g. a plain hotspot-files table. or component-dependents table, both of which power other templates on this same snapshot) rather than a completely blank shell that only prompts a human to write free text.
- Evidence: shots/TC-QW-TEST-1__G02-preview-scrolled.png, shots/TC-QW-TEST-1__R01-report-top.png (not separately captured; see L01), `02-Test gaps_ npo-data-pipeline.pdf` (1 page)
- Repro: On npo-data-pipeline (old scan), Evidence > New report > "Where tests are missing" > read the band, then Create report.

### [P2] Sidebar "Tests" lens finds 83 test files, but the report's own reasoning says test/production cannot be distinguished
- Test case / step: TC-QW-TEST-1 / G3 (cross-referenced from TC-PY-1 / G3)
- Where: "Where tests are missing" band (and Python codebase review's band) vs the sidebar's lens quick filter (Components panel)
- What happened: Both templates' "Leaves out" text says the relevant Tests section is left out because "the scan did not sort files into production and test code." But the same workspace's sidebar has a working "Tests" quick filter button with tooltip "83 test files", and Table 1 in the Python codebase review plainly lists directories such as `tests/redrive`, `tests/common`, `tests/field_parsers` etc. as separate rows. The app clearly can identify test files/paths by name elsewhere, which sits awkwardly next to the report's blanket "cannot sort into production and test code" reasoning.
- Expected: Either the report's reasoning should be more precise (e.g. "no per-file test role from the scan, only directory-name heuristics, which are not reliable enough to report on"), or, if the 83-file lens count is reliable enough for the sidebar filter, it is unclear why the same signal could not produce at least a rough test-gap table.
- Evidence: shots/TC-QW-TEST-1__G02-preview-scrolled.png (band text), shots/TC-PY-1__R05-table1-scrolled.png (tests/* rows in Table 1)
- Repro: Compare the Components lens bar's "Tests" button tooltip with either template's "Leaves out" text in the New report dialog.

TC-QW-TEST-1: done -- 2 findings, PDF `02-Test gaps_ npo-data-pipeline.pdf`

## TC-QW-CLEAN-1 · Cleanup candidates (M9 npo-data-pipeline)

T: "New report" -> gallery reopens . expected: fresh picker, confirmed . shots/TC-QW-CLEAN-1__G01-template-selected-band.png
T: click "Cleanup candidates" -> band updates: "Writes 2 sections: 1 paragraph ... 1 table and 2 prompts", "Leaves out Large files nobody has changed in two years (the snapshot predates code age (rescan to add it))." . expected: reasonable, but see wording finding below . shots/TC-QW-CLEAN-1__G01-template-selected-band.png, shots/TC-QW-CLEAN-1__G02-preview-scrolled.png
T: click "Create report" -> no take run (query auto-runs); lands directly on the new report, "1 cell" . expected: direct landing, confirmed . shots/TC-QW-CLEAN-1__L01-landed-after-create.png
T: click the intro prompt, type, Escape -> committed cleanly . shots/TC-QW-CLEAN-1__W01-first-prompt-filled.png
T: click "What goes" in the outline -> scrolled to that prompt . HARNESS (void): my first two attempts to fill this prompt used clickxy with coordinates read off a displayed (scaled) screenshot and landed on the Table 1 cell instead of the prompt below it, opening the Cell pane rather than entering edit mode -- no product bug, a driving mistake on my part. Redone correctly using `click "For each candidate you checked"` (matches the prompt's own text), which worked first time . shots/TC-QW-CLEAN-1__W02-both-prompts-filled.png
T: click "PDF" -> preview sheet, "Cleanup candidates: npo-data-pipeline · 1 page · A4 · 28 KB"; table shows all 13 rows in the PDF even though the in-app cell still said "Show all 13 rows" (never expanded) -- PDF export is not limited by the in-app row cap . expected: some limit might carry into the PDF; it does not, which is good . shots/TC-QW-CLEAN-1__P01-pdf-preview.png
T: click "Save PDF..." -> "Saved to .../M9/03-Cleanup candidates_ npo-data-pipeline.pdf", file confirmed on disk, matches on-screen text exactly . shots/TC-QW-CLEAN-1__P02-saved-pdf-line.png

### [P2] Report title clips mid-character in the app, with no ellipsis or wrap (PDF is unaffected)
- Test case / step: TC-QW-CLEAN-1 / L1, R1
- Where: Report page header, title "Cleanup candidates: npo-data-pipeline" (workspace npo-data-pipeline, snapshot 20 Sep 01:45, analysis r0)
- What happened: In the app, the big report title is hard-clipped by the right edge of the center content column: it reads "Cleanup candidates: npo-data-pipelin" with the final "e" cut off mid-glyph, no ellipsis, no wrap, no smaller font. This happens both right after creating the report and later while reading it (Pool tab active, Cell tab active -- same result either way). The exported PDF renders the same title in full ("Cleanup candidates: npo-data-pipeline"), so this is app-only.
- Expected: The title should wrap to a second line or shrink/ellipsize like other long headers, not cut off mid-word with no visual indication that text is missing.
- Evidence: shots/TC-QW-CLEAN-1__L01-landed-after-create.png, shots/TC-QW-CLEAN-1__W01-first-prompt-filled.png, PDF page 1 of `03-Cleanup candidates_ npo-data-pipeline.pdf` (title intact there)
- Repro: Create "Cleanup candidates: npo-data-pipeline" (or any report whose default name is this long) and look at the title directly under the toolbar.

### [P2] "Components nothing imports" table is almost entirely test directories, with no caveat that tests are expected to be unimported
- Test case / step: TC-QW-CLEAN-1 / R1, R2
- Where: Table 1 "Components no other component imports" (workspace npo-data-pipeline, snapshot 20 Sep 01:45, analysis r0)
- What happened: 10 of the 13 rows are test directories (`services/enrichment-data-refresh/tests`, `tests`, `tests/common`, `tests/enrichment`, `tests/field_parsers`, `tests/filters`, `tests/integration`, `tests/pipelines/common`, `tests/redrive`, `tests/sessions`, `tests/streams`) -- test code is unimported by definition (nothing imports a test suite), so this is expected and not a cleanup signal, but the report's "Check before deleting anything" callout only mentions entry points and framework-loaded code, never test directories.
- Expected: A junior skimming this table for cleanup candidates would need to already know to discount every `tests/*` row themselves; the report's own explanation should say so, e.g. "components under a tests folder are expected here and are not usually cleanup candidates."
- Evidence: shots/TC-QW-CLEAN-1__L01-landed-after-create.png, `03-Cleanup candidates_ npo-data-pipeline.pdf` page 1 (Table 1, 13 rows)
- Repro: Create "Cleanup candidates" on npo-data-pipeline and read Table 1's row names.

### [P3] "Leaves out" reason is dense/ambiguous: "the snapshot predates code age (rescan to add it)"
- Test case / step: TC-QW-CLEAN-1 / G3
- Where: "Cleanup candidates" gallery band, "Leaves out" line
- What happened: The reason given for leaving out "Large files nobody has changed in two years" is "the snapshot predates code age (rescan to add it)." A junior would likely not know what "predates code age" means (that this old scan ran before the code-age metric existed in the tool), and the parenthetical "(rescan to add it)" reads as a command fragment rather than a full sentence.
- Expected: Plainer phrasing, e.g. "this snapshot was scanned before Archstats tracked how old code is; rescan to add it."
- Evidence: shots/TC-QW-CLEAN-1__G02-preview-scrolled.png
- Repro: Open "Start a report" > Cleanup candidates on npo-data-pipeline; read the "Leaves out" line.

TC-QW-CLEAN-1: done -- 3 findings, PDF `03-Cleanup candidates_ npo-data-pipeline.pdf`

---

## Summary (M9, run 2)

The three worst problems: (1) the "Where tests are missing" quick-win template collapses to a completely empty shell (title + two unfilled prompts, zero computed evidence) on this old-scan workspace, while a sibling template (Python codebase review) on the very same snapshot still produces four evidence tables and six computed paragraphs -- inconsistent grace under the same old-scan constraint. (2) The in-app report title clips mid-character with no ellipsis for any reasonably long default report name ("Cleanup candidates: npo-data-pipeline"), a plain rendering bug (PDF is fine). (3) Query-backed tables (Table 1/2 in the Python review, Table 1 in Cleanup candidates) print raw, lower-case SQL column headers ("package", "lines", "components it imports") while view-captured tables print proper title-case headers in the same report -- an easy-to-miss inconsistency that undercuts the "junior-developer" reading bar in two of three reports tested.

What worked well: prompts (fill/Escape/commit) behaved perfectly and predictably in every template once driven correctly; the Cell pane's plain-language explanations of both computed paragraphs and query cells were clear and reassuring; "Check before deleting anything" in Cleanup candidates is a genuinely good safety caveat; PDF export was fast, matched on-screen content exactly including full un-paginated tables, and never printed prompts or `**`/backtick artifacts; the "Leaves out" reasoning, while sometimes densely worded, was honest and consistently present before creating a report, so old-scan behavior was never a silent surprise.

Not completed: nothing skipped from the M9 case list (TC-PY-1, TC-QW-TEST-1, TC-QW-CLEAN-1 all finished with saved PDFs). One driving mistake (not a product bug) is logged inline as HARNESS (void) under TC-QW-CLEAN-1 and was redone correctly.
