# M9 findings — npo-data-pipeline (http://localhost:4309/)

Sandbox check: Evidence showed Reports 0 before the first report. OK, proceeding.

---

### [P1] Take-run and tally call a captured table a "figure"
- Test case / step: TC-PY-1 / G3, G6, C2
- Where: Python codebase review › gallery band and footer checkbox (workspace npo-data-pipeline, snapshot 20 Sep 01:45 / analysis r0)
- What happened: The gallery band's tally line reads "Writes 7 sections: 6 paragraphs explaining the terms, 6 paragraphs counted from the snapshot, 3 tables, 2 figures to add from the views and 2 prompts for your reading," and the footer checkbox reads "Then take the 2 figures from their views." But the take run only ever asked for **one** figure (Figure 1, "Dependency structure," from Connections) and **one table** (Table 3, "Libraries," a captured table from the Libraries view, shown in the take UI as "captured table" not "figure"). The report ends up with 4 numbered tables (Table 1-4: Packages, Data classes, Libraries, Hotspot files), not the 3 the tally claims.
- Expected: The count of "figures to add" and the count of tables in the tally line should match what the take run actually asks for and what the finished report contains.
- Evidence: shots/g1-gallery-dialog.png, shots/c2-figure1-import-preview.png, 01-Python review_ npo-data-pipeline.pdf pages 1-4 (Table 1 through Table 4)
- Repro: Evidence -> Start a report -> Python codebase review -> read the band and footer checkbox -> Create report -> watch the take run (1 of 2 is a figure, 2 of 2 is a table).

### [P2] "The middle component has 0 dependents and depends on 1 other" is an unexplained, unnamed statistic
- Test case / step: TC-PY-1 / R1, R4
- Where: Python codebase review › "Imports between packages" section, the coupling paragraph (npo-data-pipeline, snapshot 20 Sep 01:45)
- What happened: After naming the three most depended-on components by name, the paragraph adds: "The middle component has 0 dependents and depends on 1 other." No component is named, there's no lead-in explaining what "the middle component" means (median by dependents, presumably) or why a reader should care, and it reads as a stray, half-finished sentence.
- Expected: Either name the component and explain what "middle" means (e.g. "the median component, X, has..."), or drop the sentence. A junior developer cannot explain this sentence to a colleague.
- Evidence: 01-Python review_ npo-data-pipeline.pdf, page 2
- Repro: Create the Python codebase review report -> read the "Imports between packages" paragraph.

### [P3] "Python codebase review" hotspots mix in a shell script and a JSON test-data file without saying so
- Test case / step: TC-PY-1 / R1, R2
- Where: Python codebase review › Hotspots section (paragraph and Table 4), npo-data-pipeline
- What happened: The report explains itself as "A review of a Python codebase" and the Hotspots paragraph/table name the top 5 files by hotspot score as: govolte_redrive/cli.py, govolte_redrive/orchestrator.py, govolte_redrive/gcp.py, tests/redrive/test_cli.py, and project-provisioning/setup_scripts/pre-terraform.sh - the last one is a shell script, not Python. Table 4 also lists testdata/messages.jsonl (a data file) with a "Code Health" score of 7. Nothing in the section flags that these aren't Python source files.
- Expected: Either restrict hotspots to the language the template is about, or note when a hotspot file is outside that language so a reader doesn't assume "Python codebase review" only ever shows Python code.
- Evidence: 01-Python review_ npo-data-pipeline.pdf, page 3 (Table 4)
- Repro: Create the Python codebase review report on npo-data-pipeline -> read Hotspots.

### [P2] Report's "runs on" snapshot date looks like a different (older) snapshot than the one open in the sidebar
- Test case / step: TC-PY-1 / G3, P3
- Where: Python codebase review header and PDF provenance line vs. the workspace sidebar (npo-data-pipeline)
- What happened: The gallery band, the report page, and the saved PDF all say "Runs on 20 Sep, 01:45 · analysis r0" / "npo-data-pipeline · snapshot 20 Sep, 01:45 · analysis r0". But the sidebar's two snapshot buttons read "Snapshot from 21 Sep, 23:41, open" and "Open snapshot from 21 Sep, 21:32" - neither matches "20 Sep, 01:45" at all; the report's date is a different calendar day from both. This is very likely the known-candidate behaviour from the test plan (report/PDF name the snapshot by commit time, sidebar names it by scan time), but nothing on screen says so, so it reads as if the report ran on a snapshot that isn't even in the sidebar's list.
- Expected: If report and sidebar are using two different timestamps for the same snapshot (commit time vs. scan time), the report should say so, or use the same time the sidebar uses, so a reader doesn't think the report ran on stale or missing data.
- Evidence: shots/r1-report-top.png (sidebar snapshot buttons), 01-Python review_ npo-data-pipeline.pdf page 1 (provenance line)
- Repro: Open npo-data-pipeline -> note the sidebar's open snapshot time -> Start a report -> compare its "Runs on" date.

TC-PY-1: done — 4 findings, PDF `01-Python review_ npo-data-pipeline.pdf`

### [HARNESS (void)] Table 1/Table 2 showed "SQL console is switched off" — sandbox limitation, now fixed
- Original note: Table 1 ("Packages, the largest first") and Table 2 ("Pydantic models and dataclasses by package") rendered only "The SQL console is switched off for this run." Per the test plan (§3) this was a deliberate sandbox limitation, not a product bug.
- Status: VOID. Facilitator turned the SQL console on and restarted the server. Re-created the report (`04-Python review_ npo-data-pipeline.pdf`) and both tables now run and show real data. See the new findings below from the re-check.

---

### [P1] "Where tests are missing" is entirely empty on an old-scan workspace — a near-blank PDF
- Test case / step: TC-QW-TEST-1 / G3, R1, P3
- Where: "Where tests are missing" (Test planning) template on npo-data-pipeline (old scan, analysis r0)
- What happened: The gallery band says this template "Leaves out Tests in the codebase (the scan did not sort files into production and test code), Components no test reaches (the scan did not sort files into production and test code)." Both of those are the template's entire reason for existing. The created report has "0 cells" (confirmed in the report header: "Runs on 20 Sep, 01:45 · analysis r0 · 0 cells") — no tables, no figures, no computed paragraphs, only two grey prompts ("What prompted this...", "The three to five components to test first..."). Since prompts never print, the saved PDF (`02-Test gaps_ npo-data-pipeline.pdf`) is a single page containing only the title, the provenance line, and an empty "Where to start" heading — no body text at all.
- Expected: If the two things this template lists no longer leave anything to write, the app should say more plainly, before creation, that the report will have no evidence at all (not just note it in the small "Leaves out" line), or the template should not be offered as usable on a workspace with no file roles. A user who creates it in good faith gets a functionally blank deliverable.
- Evidence: shots/g3-testgaps-band.png, shots/r1-testgaps-empty.png, shots/p1-testgaps-pdf-preview.png, `02-Test gaps_ npo-data-pipeline.pdf` (1 page, no body text)
- Repro: On npo-data-pipeline (old scan) → New report → "Where tests are missing" → Create report → note 0 cells → PDF → Save.

TC-QW-TEST-1: done — 1 finding, PDF `02-Test gaps_ npo-data-pipeline.pdf`

TC-QW-CLEAN-1: done — 0 new findings, PDF `03-Cleanup candidates_ npo-data-pipeline.pdf`
(This report also shows the "Runs on 20 Sep, 01:45" vs. sidebar "21 Sep, 23:41" snapshot-naming mismatch already logged above, and its Table 1 was blocked by the disabled SQL console noted above (see re-check below) — the "Large files nobody has changed in two years" table is correctly and clearly left out, worded as "the snapshot predates code age (rescan to add it)." The "Check before deleting anything" warning and both prompts read clearly and filled without any jump.)

---

## Re-check with SQL console ON (server restarted by facilitator)

Sandbox check redone: Evidence showed Reports 0 right after `m9 start`. OK, proceeding. All three reports re-created from scratch and re-saved to PDF (`04`, `05`, `06`).

### [P1] "Packages" table lists test packages despite the paragraph above it saying tests are counted apart
- Test case / step: TC-PY-1 / R2 (re-check)
- Where: Python codebase review › Table 1 "Packages, the largest first" vs. the "The code" intro paragraph, npo-data-pipeline
- What happened: The intro paragraph states "Production code is the code that ships to users; tests, generated files, ... are counted apart from it," and the next computed paragraph explicitly says "the code outside tests declares 343 classes and functions." But Table 1, immediately above that paragraph, lists 19 rows, 10 of which are test packages (`tests`, `tests/common`, `tests/enrichment`, `tests/field_parsers`, `tests/filters`, `tests/integration`, `tests/pipelines/common`, `tests/redrive`, `tests/sessions`, `tests/streams`) — e.g. `tests/redrive` alone shows 26 classes and 104 functions, more than most production packages. Nothing distinguishes production rows from test rows in the table.
- Expected: A table under a "production code" framing that explicitly excludes tests elsewhere in the same report should either exclude test packages too, or visibly mark which rows are tests.
- Evidence: shots/r2-table1-lowercase-headers.png, `04-Python review_ npo-data-pipeline.pdf` page 1 (Table 1, 19 rows)
- Repro: Create Python codebase review on npo-data-pipeline with SQL console on → read Table 1 rows against the paragraph above and below it.

### [P3] Table column headers are lowercase (or inconsistently cased) once real query data loads
- Test case / step: TC-PY-1 / R2, TC-QW-CLEAN-1 / R2 (re-check)
- Where: Table 1 and Table 2 in Python codebase review; Table 1 in Cleanup candidates, npo-data-pipeline
- What happened: With the SQL console on, the query-backed tables now show real headers: Table 1 "Packages" = `package | classes | functions | imported by packages` (all lowercase); Table 2 "Data classes" = `package | data classes | built on` (all lowercase); Cleanup candidates Table 1 = `Name | lines | components it imports` (first column capitalized, the other two lowercase, inconsistent within the same header row). This is unlike Table 3 "Libraries" and Table 4 "Hotspot files" in the same Python review, which use Title Case headers ("Library", "Platform", "Imports", "Files" / "Name", "Line Count", "Code Health").
- Expected: Consistent Title Case column headers across all tables in a report, matching the style already used in Table 3/Table 4.
- Evidence: shots/r2-table1-lowercase-headers.png, shots/r2-cleanup-table1.png, `04-Python review_ npo-data-pipeline.pdf` page 1, `06-Cleanup candidates_ npo-data-pipeline.pdf` page 1
- Repro: Create Python codebase review or Cleanup candidates on npo-data-pipeline → read the query-table headers.

### [P2] "Cleanup candidates" table is mostly test packages, which are never imported by design
- Test case / step: TC-QW-CLEAN-1 / R2 (re-check)
- Where: Cleanup candidates › Table 1 "Components no other component imports", npo-data-pipeline
- What happened: 11 of the 13 rows are test packages (`tests`, `tests/common`, `tests/enrichment`, `tests/field_parsers`, `tests/filters`, `tests/integration`, `tests/pipelines/common`, `tests/redrive`, `tests/sessions`, `tests/streams`, plus `services/enrichment-data-refresh/tests`). Test packages are run by a test runner, not imported by other components, so they will almost always show up here — they are not genuine cleanup candidates. The "Check before deleting anything" warning above the table only mentions entry points and framework-loaded code, not test packages.
- Expected: Either exclude test packages from this "no imports" query, or extend the "Check before deleting anything" warning to mention that test packages will always appear here and are not usually a match.
- Evidence: shots/r2-cleanup-table1.png, `06-Cleanup candidates_ npo-data-pipeline.pdf` page 1
- Repro: Create Cleanup candidates on npo-data-pipeline with SQL console on → read Table 1.

### Re-check of TC-QW-TEST-1 "0 cells / blank PDF" finding: still holds
Re-created "Where tests are missing" from scratch after the SQL console fix and the server restart. Result is unchanged: "Runs on 20 Sep, 01:45 · analysis r0 · 0 cells", and the saved PDF `05-Test gaps_ npo-data-pipeline.pdf` (1 page) still has no body text below "Where to start." This template's emptiness comes from the old scan having no file roles (unrelated to the SQL console), so the P1 finding above stands as originally written, not a harness artifact.

TC-PY-1 (re-check): done — 2 new findings, PDF `04-Python review_ npo-data-pipeline.pdf`
TC-QW-TEST-1 (re-check): done — 0 new findings (original P1 finding confirmed still valid), PDF `05-Test gaps_ npo-data-pipeline.pdf`
TC-QW-CLEAN-1 (re-check): done — 1 new finding, PDF `06-Cleanup candidates_ npo-data-pipeline.pdf`

---

## Summary

Three reports created on npo-data-pipeline (Python codebase review, Where tests are missing, Cleanup candidates), all saved to PDF and inspected page by page. The sandbox was clean (Reports 0 before starting) and stayed reliable throughout — figures rendered, prompts filled cleanly with no layout jumps, and the Cell inspector panel was clear and readable.

Worst three problems:
1. **"Where tests are missing" produces a functionally empty PDF on this workspace** (TC-QW-TEST-1): both of its two data sections are left out because the scan is old, so the created report has 0 cells and the saved PDF is one page with a title and an empty heading — no evidence at all, with no strong warning before creation.
2. **The Python codebase review's take-run/tally text is internally inconsistent**: it promises "2 figures" and "3 tables" but the take run actually fills 1 figure + 1 table (Table 3, shown in the UI as a "captured table," not a figure), and the finished report has 4 tables, not 3.
3. **An unnamed, unexplained sentence** — "The middle component has 0 dependents and depends on 1 other." — appears with no lead-in in the Python review's coupling paragraph and made it into the printed PDF.

Also noteworthy: the report/PDF's "Runs on 20 Sep, 01:45" date does not match either snapshot time shown in the sidebar (21 Sep 23:41 / 21 Sep 21:32), consistent with the test plan's "known candidate" (commit time vs. scan time) but unexplained on screen. The Python review's Hotspots table quietly includes a shell script and a JSON test-data file without flagging them as non-Python.

Update after SQL console fix: the facilitator turned the sandbox's SQL console on and restarted the server; all three query-backed tables (Packages, Data classes, Cleanup candidates' "Components nothing imports") were re-checked and now run with real data. This surfaced two more findings: Table 1 "Packages" lists test packages even though the report's own text says tests are counted apart from production code, and every query table's column headers are lowercase or inconsistently cased, unlike Table 3/Table 4's Title Case headers. The "Where tests are missing" 0-cells/blank-PDF finding was re-checked and confirmed unrelated to the SQL console — it still reproduces after the fix.
