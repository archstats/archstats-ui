# M3 findings — django-oscar (http://localhost:4303/)

Sandbox check: Evidence -> Reports = 0 before first report. OK, proceeding.

Test cases (in order): TC-DJANGO-1 (with TC-X-ESC), TC-DJANGO-2, TC-GEN-ONB-1, TC-GEN-DEBT-1

HARNESS (void): early in this mission every "Table N" cell whose header shows the "SQL" tag
rendered only the red banner "The SQL console is switched off for this run." instead of rows, both
on screen and in the saved PDF (e.g. Tables 1-5 of "Django review: django-oscar", PDF
`01-Django review_ django-oscar.pdf`). The facilitator confirmed this was the sandbox's SQL
console being switched off (TEST-PLAN §3), not a product bug; it was turned on and the session
was restarted (session `m3` stopped/started, sandbox re-checked: Reports 0). TC-DJANGO-1's report
and PDF were re-created after the fix to check the query tables for real; see the "TC-DJANGO-1
(redo)" section below. Everything from here on ran with the SQL console on.

---

## TC-DJANGO-1 · Django project review (with TC-X-ESC)

### [P1] Report's commit/author totals exceed the live Overview totals for the same snapshot
- Test case / step: TC-DJANGO-1 / R1
- Where: Django project review › "The project at a glance" (computed paragraph) vs Overview page (workspace django-oscar, snapshot 24 Sep 16:11 / 11 Sep 17:53, commit 0dfeaa7)
- What happened: The report's computed paragraph reads "The history reaches back 15.8 years: 6,762 commits by 357 authors." The Overview page for the very same open snapshot shows "Commits 6,555" and "Contributors 354" (sub-caption: "to files in the snapshot", i.e. all 1,407 files). The report's number is scoped to at most 649 production files, yet it is larger than Overview's all-files total -- a subset showing a bigger count than the superset.
- Expected: The same snapshot should report the same commit/author totals everywhere, and a production-only count should not exceed the all-files count.
- Evidence: shots/scan1.png (report paragraph), shots/overview-recheck.png (Overview tiles)
- Repro: Create "Django project review" on django-oscar's open snapshot; read the first computed paragraph; compare with Overview's Commits/Contributors tiles for the same snapshot.

### [P1] Component count contradicts itself on the Overview page
- Test case / step: TC-DJANGO-1 / G (pre-check on Overview)
- Where: Overview page, django-oscar, snapshot 24 Sep, 16:11
- What happened: The top summary tile reads "Components 122", but directly below it "Structure > Components in tangles" reads "34 of 121 (28%)" -- two different total component counts (122 vs 121) on the same page. The report itself later says "121 components", agreeing with the tangles denominator but not the page's own headline tile.
- Expected: One page should not show two different totals for the same metric.
- Evidence: shots/overview-component-count.png
- Repro: Open Overview for django-oscar; compare the "Components" tile with "Components in tangles" underneath.

### [P2] Escape does not pause a taking run; the plan's pause/resume flow is not reachable
- Test case / step: TC-DJANGO-1 / C2, TC-X-ESC
- Where: "Taking 1 of 1" modal (Connections view), Django project review taking run
- What happened: This template only has one figure slot ("Apps and their imports"), so the planned "press Escape on the second slot" step from TC-X-ESC could not be performed as written -- there is no second slot. Pressing Escape during the only slot's taking run had no visible effect: no pause bar appeared, the modal stayed open, nothing changed. The bar text visible behind the modal ("Add this view | Skip | Back to report") is not clickable while the modal is open -- clicking "Back to report" hits nothing. The only way out is "Stop" (tooltip: "Stop taking; the slots left stay in the report"), which closes the "Taking N of N" modal and drops you into a manual "Add to report" editor for that one slot (Cancel / Add and open / Fill) -- not a "Resume taking * N left" toolbar affordance as the test plan describes.
- Expected: Escape should pause the run with a clear resumable state ("Resume taking * N left"), matching the flow the test plan describes elsewhere in the product.
- Evidence: shots/c2-taking-figure1.png, shots/x-esc-stop.png
- Repro: Start any report with exactly one figure slot; during the taking run press Escape.

### [P2] PDF page 2 is two-thirds blank because a figure is pushed whole to the next page
- Test case / step: TC-DJANGO-1 / P3
- Where: PDF "Django review: django-oscar", page 2 of 5
- What happened: Page 2 ends after "Table 2. App to app, by references" (one line, since the table is blocked) and then sits blank for the rest of the page; "Figure 1" is pushed entirely onto page 3 instead of starting on the free space of page 2.
- Expected: Page-break logic should use the available space rather than leaving most of a page blank.
- Evidence: pages/01-2.png, pages/01-3.png
- Repro: Save the Django project review PDF (A4) and look at page 2.

### [P3] "Snapshot" is labelled with two different timestamps for the same snapshot
- Test case / step: TC-DJANGO-1 / P3
- Where: Report header / PDF vs sidebar, django-oscar
- What happened: The report and PDF provenance line reads "django-oscar . snapshot 11 Sep, 17:53 . 0dfeaa7 . analysis r3" (the commit time). The sidebar names the same open snapshot "24 Sep, 16:11" (the scan time, confirmed by Overview: "committed 13 days before the scan"). Both are introduced with the plain word "snapshot" with no hint that one is commit time and the other scan time.
- Expected: A junior reader comparing the PDF to the open app would reasonably expect "snapshot <time>" to match the sidebar's snapshot time; as written it silently means something else in the report.
- Evidence: pages/01-1.png ("snapshot 11 Sep, 17:53"), shots/overview-component-count.png ("snapshot 24 Sep, 16:11")
- Repro: Compare the PDF's title-block timestamp with the sidebar's open-snapshot timestamp.

TC-DJANGO-1: done -- 5 findings, PDF `01-Django review_ django-oscar.pdf`

## TC-DJANGO-1 (redo, after the SQL-console fix) · Django project review

With the SQL console on, Tables 1-5 all render real rows (Table 1 "Show all 29 rows" matches
the facilitator's expected 29 apps; Table 5's top row is "oscar.apps.catalogue 32", matching the
expected "most migrations (32)"; Table 2 has exactly 8 rows, matching the expected "app-to-app
references are few (8 rows)"). No contradictions found in the real data. The P1 finding above about
6,762 commits/357 authors vs. Overview's 6,555/354 is unrelated to the SQL-console fix (it is a
plain computed paragraph, not a query table) and still reproduces after the restart -- it stands.

### [P2] Table 1's "app" column is unreadably narrow on screen; the PDF instead truncates "directory"
- Test case / step: TC-DJANGO-1 (redo) / R2, P3
- Where: "Apps and what they hold" (Table 1), both the live report editor and the saved PDF
- What happened: On screen, the "app" column is so narrow it shows only an ellipsis plus the row's last one or two letters for every row ("…r" for oscar.apps.order, "…e" for oscar.apps.catalogue, "…s" for oscar.apps.address/analytics, etc.) -- see shots/redo-table1-crop.png. The adjacent "directory" column is shown in full, so the data exists, but the column meant to name the app is unreadable. In the saved PDF (02-Django review_ django-oscar.pdf, page 1) the columns are re-balanced the other way: "app" is mostly readable but "directory" is now the truncated one ("…c/oscar/apps/order", "…car/apps/catalogue") -- see shots/redo-pdf-table1-crop.png.
- Expected: a reader should not have to guess a row's identity from a single truncated letter; column widths should fit at least one of the two clearly, ideally both, or drop the redundant column.
- Evidence: shots/redo-table1-crop.png (screen), shots/redo-pdf-table1-crop.png (PDF page 1)
- Repro: create "Django project review" on django-oscar; open Table 1 in the report; compare to Table 1 on PDF page 1.

TC-DJANGO-1 (redo): done -- 1 new finding, PDF `02-Django review_ django-oscar.pdf` (6 pages, supersedes `01-...pdf` for table content)

---

## TC-DJANGO-2 · Django app boundaries

G3 band read cleanly: "Focuses on the lines between apps... It is the evidence for merging,
splitting or extracting an app." "Writes 5 sections: 3 paragraphs explaining the terms, 1 paragraph
counted from the snapshot, 4 tables, 1 figure to add from the views and 2 prompts for your
reading." Both prompts found and filled: the title prompt ("The change you are considering...")
and "The boundaries you propose" at the end.

Matrix slot result (probe: <= 40?): django-oscar has 121-122 components, well over 40, and the
matrix slot correctly refused with a clear message: "Connections has nothing to take: The matrix
has 122 columns; group it to 40 or fewer to add it as a table." (shots/tc-django2-matrix-cant-take.png).
Skipped it; the report correctly shows "Table 3 - Dependency matrix (to add)" as a hatched slot with
"Take it from Connections" / "Set it yourself" actions, and the PDF preview header correctly reads
"1 to add, left out". "Apps nothing else uses" (Table 4) has exactly 12 rows, matching the test
plan's expectation. Table 5 "Tangles" (3 rows: 30 + 2 + 2 = 34) is internally consistent with the
paragraph above it ("34 of 121 components... sit in 3 tangles"). No new numeric contradictions
found in this template beyond the ones already logged under TC-DJANGO-1.

### [P2] Table 1's column truncation (same bug as TC-DJANGO-1) recurs, and in the PDF both "app" and "directory" can be cut at once
- Test case / step: TC-DJANGO-2 / R2, P3
- Where: "Apps and what they hold" (Table 1), PDF `04-Django app boundaries_ django-oscar.pdf` page 1
- What happened: same underlying table cell as TC-DJANGO-1's Table 1 (see finding above); reproduced here too. In this PDF, unlike the first report's PDF, both the "app" column ("….apps.catalogue") and the "directory" column ("…car/apps/catalogue") are truncated with a leading ellipsis on the same row, so neither column reliably identifies the app.
- Expected: at least one identifying column should stay fully readable.
- Evidence: shots/tc-django2-table1-pdf-crop.png, pages/04-1.png
- Repro: create "Django app boundaries" on django-oscar; save PDF; look at Table 1 on page 1.

TC-DJANGO-2: done -- 1 new finding (plus 1 recurrence), PDF `04-Django app boundaries_ django-oscar.pdf`

---

## TC-GEN-ONB-1 · Onboarding guide

Note: "Onboarding guide" did not appear among the "New report" dialog's numbered options at
first -- its label showed up only in the raw page text, not as a clickable item. This turned out to be
a harness/tooling artifact of the QA driver's virtualized-list reading, not a product bug: scrolling
the template list down revealed it as a normal, clickable option immediately below "Technical due
diligence". Recorded here only so the facilitator doesn't chase it; not a FINDINGS entry.

G3 band: "A guided tour for someone joining the team... You add the names and context that
numbers cannot give." "Writes 5 sections: 8 paragraphs explaining the terms, 6 paragraphs counted
from the snapshot, 2 tables, 4 figures to add from the views and 4 prompts for your reading." All 4
prompts found and filled (title; "The areas a newcomer should know by name..."; "Who to ask about
which area..."; "The parts that tend to bite...").

### [P1] Paths starting with "." or "./" print with the dot moved to the end, on screen (not in the PDF)
- Test case / step: TC-GEN-ONB-1 / R2
- Where: "The codebase by directory" (Table 2) and "Most changed files" (Table 3), live report editor only
- What happened: on screen, directory ".github" reads "github.", ".tx" reads "tx.", "./setup.py" reads "setup.py/.", "./package-lock.json" reads "package-lock.json/.", "./package.json" reads "package.json/." -- the leading dot (or "./") is stripped from the front and a bare "." appended at the end instead, changing what looks like the actual path. Checked the saved PDF specifically for this (`pdftotext` on `05-Getting to know django-oscar.pdf`): there the same rows print correctly as ".github", ".tx", "./setup.py", "./package-lock.json", "./package.json" -- so the bug is confined to the live on-screen report/editor rendering, not the export.
- Expected: a path should render the same everywhere; a reader reviewing the report on screen (which R2 explicitly asks testers to do) sees wrong file/directory names.
- Evidence: shots/onb-table2-dotcrop.png (screen), shots/onb-scan4.png (screen, setup.py/package-lock.json/package.json rows), PDF `05-Getting to know django-oscar.pdf` page 1 text (correct).
- Repro: create "Onboarding guide" on django-oscar; open Table 2 "The codebase by directory" or Table 3 "Most changed files" in the live report; look at any row whose real path starts with a dot.

### [P2] A figure's caption paragraph describes a "chord diagram" directly under a node-link graph, not under the actual chord figure
- Test case / step: TC-GEN-ONB-1 / R4
- Where: "How it hangs together" section, between Figure 1 "The system's parts" (taken as a force-directed Graph) and Figure 2 "Who imports whom" (taken as a Chord)
- What happened: immediately below Figure 1 (a node-link graph with circles and lines, no arcs or ribbons) sits the sentence "In the chord diagram each arc on the circle is a group of components, and a ribbon between two arcs is the imports between them; the wider the ribbon, the more imports." Figure 1 has no explanation of its own describing what a node-link graph shows. The chord explanation only makes sense once you reach Figure 2, two figures later in reading order, but nothing marks it as "about Figure 2" -- a reader naturally tries to match "arc" and "ribbon" to Figure 1's picture and can't.
- Expected: each figure should be introduced by the explanation of the diagram type actually shown, or the explanation should be visually anchored to the figure it describes.
- Evidence: pages/05-3.png (Figure 1 + the chord paragraph directly below it), pages/05-4.png (Figure 2, the actual chord diagram)
- Repro: create "Onboarding guide" on django-oscar with both figures taken; read the text between Figure 1 and Figure 2.

### [P3] "The middle component" is used with no explanation of what "middle" means
- Test case / step: TC-GEN-ONB-1 / R1
- Where: "How it hangs together" computed paragraph
- What happened: "The most depended-on components are src/oscar/core (83 components depend on it), src/oscar/test/factories (28) and tests/unit/catalogue (27). The middle component has 0 dependents and depends on 3 others." "The middle component" names no component and is never defined; read next to a list of three named components, a junior reader would reasonably (and wrongly) guess it means the second one listed (src/oscar/test/factories, which has 28 dependents, not 0).
- Expected: either name the component, or explain what "middle" is the middle of (e.g. the median across all 121 components).
- Evidence: shots/tc-onb-middle-component.png
- Repro: create "Onboarding guide" (or "Django project review", which has the same text) on django-oscar; read the "How it hangs together" / coupling paragraph.

### [P3] "The largest components" table is topped by three test directories with zero dependents
- Test case / step: TC-GEN-ONB-1 / R2
- Where: Table 1 "The largest components", "What is here" section
- What happened: sorted by raw line count, the top 3 rows are tests/functional/dashboard, tests/integration/dashboard and tests/integration/offer -- each with 0 dependents (nothing in the codebase imports them). The real production apps a newcomer would want to learn first (catalogue, offer, basket, order, all with real dependents) only appear from row 4 on.
- Expected: for a template whose stated job is telling a newcomer what to know first, leading with test-only directories under-serves that goal; sorting or filtering toward components other code actually depends on would match the section's purpose better.
- Evidence: shots/onb-top.png
- Repro: create "Onboarding guide" on django-oscar; read Table 1.

TC-GEN-ONB-1: done -- 4 findings, PDF `05-Getting to know django-oscar.pdf`

---

## TC-GEN-DEBT-1 · Technical debt register

G3 band: clear and concrete -- "Lists the technical debt the snapshot can see (hotspots,
hard-to-change files, circular dependencies and broken rules) as tables you can turn into backlog
items... Use it when you want a concrete, evidence-based list of clean-up work to plan into
sprints." Correctly says "Leaves out Broken dependency rules (no dependency rules are set up for
this codebase)." Both prompts read well and directly answer the probe question ("Is it clear how to
turn rows into backlog items?") -- yes: the closing prompt literally asks "Per item: an owner, what
leaving it costs (time lost, bugs, blocked work), and the next concrete step," which is exactly the
turn-a-row-into-a-ticket structure a junior developer needs. Hotspot files table has all 15 rows on
screen and in the PDF (`Table 1. Hotspot files`, page 1). "Churn against code health" plot's axes
(Commit Count x, Code Health y) match its explanation exactly. This was the cleanest of the four
templates tested in this mission.

### [P2] The view opens with the wrong preset for a figure slot; an orange "taken with other settings" warning has to be caught and fixed by hand
- Test case / step: TC-GEN-DEBT-1 / C2
- Where: taking run, Figure 2 "Nesting depth" (Hotspots view)
- What happened: when the taking run reached Figure 2, the Hotspots view opened on its default "Hotspots" preset (Heat: Hotspot Score) instead of the "Nesting depth" preset (Heat: Maximum Indentation) the template asks for. The right-hand "Asked for" panel correctly flagged this with an orange warning icon next to "Preset: Nesting depth -- taken as Hotspots" and the text "Taken with other settings than the template asks; the words around it may not fit what it shows," with a "Take it as asked" button to fix it. Clicking "Fill and next" without first clicking "Take it as asked" would have captured a Hotspot-coloured treemap right under a paragraph that explicitly says "running hot where the logic is nested deepest" -- a figure that contradicts its own caption.
- Expected: either the view should open already on the preset the template asks for (no manual fix needed), or the mismatch should be harder to miss (it is only a small icon and one line of grey text next to five other "Kept with it" settings).
- Evidence: shots/debt-fig2-warning.png (mismatch), shots/debt-fig2-fixed.png (after "Take it as asked"), pages/06-3.png (the correctly-fixed figure in the PDF, matching its caption).
- Repro: create "Technical debt register" on django-oscar; during the taking run, watch the right panel when Figure 2 "Nesting depth" opens.

TC-GEN-DEBT-1: done -- 1 finding, PDF `06-Technical debt_ django-oscar.pdf`

---

## Summary

The three worst problems: (1) the "getting to know" onboarding report's directory/file tables show
wrong-looking names on screen for any dot-prefixed path -- ".github" reads "github.", "./setup.py"
reads "setup.py/." (the leading dot moves to the end); the saved PDF is unaffected, so this is a
live-editor-only bug. (2) A component-count contradiction on Overview itself (122 vs. 121 for the
same snapshot) and a bigger one between a report's own git-history paragraph (6,762 commits /
357 authors) and the live Overview tiles for the identical open snapshot (6,555 / 354) -- the
report's number is even larger than Overview's all-files total, which is not possible if it is
production-only. (3) The "Apps and what they hold" table's "app" column is so narrow it shows only
a trailing letter with an ellipsis ("...r" for oscar.apps.order) on screen, and in the PDF the
truncation just moves to whichever of "app"/"directory" the layout picks -- never reliably both
readable at once.

What worked well: the "cannot take" messaging for oversized dependency matrices (122 columns,
threshold 40) is exact and actionable, with working "Take it from Connections"/"Set it yourself"
fallbacks; the orange "taken with other settings" warning during a taking run caught a real
preset mismatch before it reached the PDF; the Technical debt register's prompts are concrete and
map straight onto "owner / cost / next step" backlog fields; every numeric fact I could cross-check
against the test plan's expected values (29 production apps, catalogue's 32 migrations, 8 app-to-app
reference rows, "Apps nothing else uses" 12 rows) matched exactly.
