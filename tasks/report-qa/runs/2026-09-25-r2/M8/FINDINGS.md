# Findings — M8 (archstats-ui), run 2

Sandbox check: Evidence showed Reports 0 before the first report. The first report's header
read "Runs on 25 Sep, 09:09 · eea60c6 · analysis r4", matching the table (M8 → analysis
revision 4). Sandbox OK, proceeding.

---

## TC-GEN-CHECK-1 · Health check-in (defaults)

T: Evidence → "Start a report" → gallery opens with JS/TS workspace review preselected · expected: a template picker · shots/TC-GEN-CHECK-1__G01-gallery-opens-reshot.png
T: Scrolled template list, clicked "Health check-in" → band + preview switch to Check-in template, "Runs on 25 Sep, 09:09 · eea60c6 · analysis r4" · expected: template preview updates · shots/TC-GEN-CHECK-1__G02-template-selected-band.png
T: Scrolled preview 4x, read Shape/Change/Health/Rules/Tests/Since-last-time sections, all fully computed (no "still counting"), footer both checkboxes on → expected: full preview readable before create · shots/TC-GEN-CHECK-1__G03..G06
T: Click "Create report" → straight into taking Figure 1 (Trends), 1 of 2, no gallery-closing flash noticed → expected: either land on report or start taking; landing in taking run was a little abrupt (no "creating..." beat) but acceptable · shots/TC-GEN-CHECK-1__C01-after-create-click.png
T: Fill and next on Figure 1 → moves to Table 2 (Changes), 2 of 2, "Waiting for Changes to draw..." then within ~1s "Changes drew nothing to take; set it, then add it" · expected: a table of what changed · ⚠ nothing to take because the "previous" snapshot picked by Changes is a same-commit rescan · shots/TC-GEN-CHECK-1__C03-take-changes-table.png, TC-GEN-CHECK-1__C04-take-changes-nothing-to-take.png
T: Skip → lands back on report page, 11 cells, Table 2 still "(to add)" in outline → expected: land on the report; clear which slot is unfilled · shots/TC-GEN-CHECK-1__L01-landing.png
T: Click outline "Table 1 · Hotspot components" → scrolls to the table and auto-selects it in the Cell pane → expected: scroll to section; the auto-select into the Cell pane was a pleasant surprise, not documented anywhere · shots/TC-GEN-CHECK-1__R03-outline-click-table1.png
T: Click a computed paragraph mid-document (to inspect a Cell) → cursor lands inside it and literal *asterisks* appear around italic terms · expected: either the paragraph is not directly editable (per the Cell pane's own text: "To change the words, make it yours"), or it shows normal italics · ⚠ see P1 below · shots/TC-GEN-CHECK-1__W02-prompt-clicked.png
T: Escape → asterisks disappear, italics restored, paragraph left highlighted · expected: cursor/edit state clears · shots/TC-GEN-CHECK-1__W03-after-escape.png
T: Click into the opening prompt, type a sentence → placeholder italic text replaced immediately, no jump · expected: prompt fills as you type · shots/TC-GEN-CHECK-1__W06/W07/W08
T: Click into the closing prompt, type a sentence → same, clean · shots/TC-GEN-CHECK-1__W09-closing-prompt-typed.png
T: Click "Snapshot the cells run on" toolbar select, then ArrowDown, then ArrowDown+Enter, then click+2xArrowDown+Enter → displayed value never changed from "Runs on newest · 25 Sep, 09:09 · eea..." · expected: switching to an older snapshot and back per the probe · ⚠ could not verify this flow — see P2 below (could not tell whether this is a real product bug or a harness/headless-select limitation)
T: Open PDF preview → header "3 pages · A4 · 224 KB · 1 to add, left out" · expected: preview with clear status · shots/TC-GEN-CHECK-1__P01-pdf-preview.png
T: Save PDF → "Saved to .../M8/01-Check-in_ archstats-ui.pdf" · shots/TC-GEN-CHECK-1__P02-saved-to.png

### [P1] Take run: "Changes" slot fails because "the one before" means the last scan, not the last different snapshot
- Test case / step: TC-GEN-CHECK-1 / C2
- Where: Health check-in > Since last time > Table 2 "What changed since the last snapshot" (archstats-ui, snapshot 25 Sep 09:09/eea60c6, analysis r4)
- What happened: Taking Table 2 opens Changes comparing "25 Sep, 09:09 · eea60c6 · scanned 25 Sep, 17:29" against "...scanned 25 Sep, 17:30" — two scans of the identical commit — so it reports "No structural changes between these snapshots" and the take bar says "Changes drew nothing to take; set it, then add it". A genuinely different snapshot (24 Sep, 19:59 · cffe84f) exists in the sidebar's history and would have produced a real diff.
- Expected: The "since last snapshot" comparison should pick the last snapshot that differs (or at least the last one of a different commit), not simply the immediately preceding scan record, so a template whose whole point is "what moved since last time" doesn't come up empty on a workspace that was scanned twice in a row.
- Evidence: shots/TC-GEN-CHECK-1__C03-take-changes-table.png, shots/TC-GEN-CHECK-1__C04-take-changes-nothing-to-take.png
- Repro: On archstats-ui (6 snapshots, two of them same-commit rescans 17:29/17:30), create Health check-in, take Table 2 from Changes.

### [P1] Computed paragraph shows literal asterisks around italic terms while a cursor is placed inside it
- Test case / step: TC-GEN-CHECK-1 / R1 (incidental, while trying to reach the Cell pane / the opening prompt)
- Where: Health check-in > Shape section, second computed paragraph (any computed paragraph reproduces it)
- What happened: Clicking directly into the body of a computed (non-"made mine") paragraph places a text cursor and re-renders the paragraph showing raw markdown: *tangle*, *Propagation cost*, *Dependency levels* instead of italic text. Pressing Escape restores normal italic rendering.
- Expected: Either the paragraph should not be directly enterable at all (the Cell pane says explicitly "Facts only... To change the words, make it yours" — implying it isn't meant to be edited in place), or if cursor placement is allowed for selection/copy purposes, it should not surface raw markdown syntax. Per the test plan, literal markdown marks are a P1 example.
- Evidence: shots/TC-GEN-CHECK-1__W02-prompt-clicked.png (asterisks visible), shots/TC-GEN-CHECK-1__W03-after-escape.png (correct italics after Escape)
- Repro: Open any report with a computed paragraph containing italic terms (e.g. Health check-in's Shape section), click into the middle of the paragraph text, observe asterisks; press Escape to see it revert.

### [P2] "Snapshot the cells run on" selector did not respond to keyboard (Tab/click + ArrowDown + Enter)
- Test case / step: TC-GEN-CHECK-1 / probe (switch cells to an older snapshot and back)
- Where: Report toolbar, Health check-in report (archstats-ui)
- What happened: Clicked the select, pressed ArrowDown, pressed Enter (tried single and double ArrowDown, and Enter after each); the visible value stayed "Runs on newest · 25 Sep, 09:09 · eea..." throughout. Never saw it change to an older snapshot, so the "does it say what moved since the run" part of the probe could not be exercised.
- Expected: Arrow keys should move through the option list and Enter should commit a different snapshot, per the test plan's own suggested workaround ("try keyboard focus... before giving up").
- Evidence: shots/TC-GEN-CHECK-1__W10..W13
- Repro: On the Health check-in report, click the "Snapshot the cells run on" toolbar select, press ArrowDown then Enter.
- Note: could not tell whether this is a real product bug or a limitation of driving a native <select> through this headless harness — flagging for a follow-up check in a non-headless session.

### [P3] Awkward singular wording in the Rules paragraph
- Test case / step: TC-GEN-CHECK-1 / R1
- Where: Health check-in > Rules section (archstats-ui)
- What happened: "All 1 rule that apply hold: no import breaks them."
- Expected: Should read naturally for a count of 1, e.g. "The 1 rule that applies holds" or "All rules (1) hold".
- Evidence: PDF 01-Check-in_ archstats-ui.pdf, page 2; shots/TC-GEN-CHECK-1__R04-scroll2.png
- Repro: Create Health check-in on a workspace with exactly 1 dependency rule (archstats-ui has 1).

TC-GEN-CHECK-1: done — 4 findings (2xP1, 1xP2, 1xP3), PDF 01-Check-in_ archstats-ui.pdf

## TC-X-SAVE · Save as template, then reuse it (after TC-GEN-CHECK-1)

T: Report overflow menu ("...") on the report list item → Rename/Duplicate/Save as template.../Delete... appear · expected: a menu of report actions · shots/TC-X-SAVE__W02-overflow-attempt.png
T: Click "Save as template..." → dialog opens, name prefilled "Check-in" (workspace suffix dropped), "Turn my paragraphs into prompts" ON by default, checklist shows "12 prompts" · expected: name/description fields and a save action · shots/TC-X-SAVE__W03-save-as-template-dialog.png
T: Fill "What it is for", click "Save template" → dialog closes silently, no confirmation toast, back on the same report · expected: some confirmation the template was saved (a toast or highlight) · shots/TC-X-SAVE__L01-after-save.png
T: New report → gallery → scrolled to find "Yours" group after Health check-in, before "Other ecosystems" → found "Check-in" with my "what it is for" text as the second line · expected: a new group near the top; scrolling to find it was a minor hunt · shots/TC-X-SAVE__G01-gallery-yours.png
T: Click "Check-in" under Yours → preview shows ALL prose (both the template's own glossary/explanation paragraphs and my typed prompts) as grey italic prompts; the footer now has only "Then take the 2 figures from their views" — "Explain the terms" checkbox is gone entirely · expected, per the save dialog's own words ("Your words stay as guidance... headings, lists and cells come as they are"): only what I personally typed should turn into prompts, the template's built-in explanations should stay as normal text · ⚠ see P2 below · shots/TC-X-SAVE__G02-yours-template-selected.png
T: Create report → taking run starts on Figure 1 (Trends) again, then Table 2 (Changes) again shows "No structural changes" (same root cause as TC-GEN-CHECK-1's P1) → Skip → lands on report, 2 reports now both named "Check-in: archstats-ui" in the left list · expected: distinguishable report names · shots/TC-X-SAVE__C01-taking-run.png
T: Open PDF preview → "2 pages · A4 · 216 KB · 1 to add, left out" (down from 3 pages/224 KB on the original) · expected: shorter report since all explanatory prose became un-printed prompts · shots/TC-X-SAVE__P01-pdf-preview.png
T: Save PDF → "Saved to .../M8/02-Check-in_ archstats-ui.pdf" · shots/TC-X-SAVE__P02-saved-to.png

### [P2] "Turn my paragraphs into prompts" converts the template's own explanation text too, not just what the user wrote
- Test case / step: TC-X-SAVE / W (save-as-template dialog + reuse)
- Where: Evidence > report overflow menu > Save as template... (archstats-ui, Health check-in report)
- What happened: The dialog's checkbox reads "Turn my paragraphs into prompts — Your words stay as guidance in the empty page; headings, lists and cells come as they are." In practice, every prose paragraph in the report — including the template's own built-in glossary/explanation text ("This section counts what the scan found. Production code is...", "Components depend on each other...", etc., which the user never wrote) — became a grey-italic prompt in the resulting template, not just the two sentences the user actually typed into the two prompts. As a side effect, the resulting template's create dialog lost the "Explain the terms" checkbox altogether, and the reused report's PDF dropped from 3 pages to 2 because none of the explanatory prose prints any more.
- Expected: Based on the dialog's own wording, only paragraphs the user wrote/edited (i.e. filled prompts, or paragraphs turned into "my own") should become prompts; the template's fixed explanatory copy should stay as fixed text (or at minimum the checkbox should say plainly that it converts all prose, not just "my words").
- Evidence: shots/TC-X-SAVE__W03-save-as-template-dialog.png (dialog text), shots/TC-X-SAVE__G02-yours-template-selected.png (all prose now grey italic, no Explain-the-terms checkbox), shots/TC-X-SAVE__P01-pdf-preview.png (2 pages vs 3), PDF `02-Check-in_ archstats-ui.pdf`
- Repro: Create any template-based report, leave "Explain the terms" on, fill its prompts, then "Save as template..." with "Turn my paragraphs into prompts" checked; start a new report from the saved template and compare its preview/PDF to the original.

### [P3] Saved reports are not disambiguated by name
- Test case / step: TC-X-SAVE / C
- Where: Evidence, Reports list (archstats-ui)
- What happened: After creating a second report from the "Check-in" template (which defaults its report name to "Check-in: archstats-ui", identical to the first report's name), the left-hand Reports list shows two entries both titled "Check-in: archstats-ui", distinguishable only by the "7 min ago" / "just now" timestamp.
- Expected: Either a numeric suffix (e.g. "Check-in: archstats-ui (2)") or some other disambiguation so two reports aren't visually identical in the list.
- Evidence: shots/TC-X-SAVE__C01-taking-run.png, shots/TC-X-SAVE__L01-after-save.png (report count "Reports 2")
- Repro: Create two reports from templates that produce the same default name (e.g. the same custom template twice).

TC-X-SAVE: done — 2 findings (2×P2/P3, no new P1), PDF `02-Check-in_ archstats-ui.pdf`

## TC-QW-30D-1 · The last 30 days (defaults)

T: New report → scrolled to Quick wins, clicked "The last 30 days" → band + preview switch, "Writes 4 sections: 4 paragraphs explaining the terms, 1 paragraph counted from the snapshot, 3 tables, 1 figure to add from the views and 2 prompts" → expected: template preview updates · shots/TC-QW-30D-1__G01-template-selected.png
T: Create report → straight into taking Figure 1 (Work over time), 1 of 1, on the Activity/Git view → expected: land on report or start taking; consistent with other templates · shots/TC-QW-30D-1__C01-take-activity.png
T: Fill and finish → lands on report top, Table 1 already computed, Figure 1 already filled (single-slot taking run had no extra confirmation step) → expected: land on the finished report · shots/TC-QW-30D-1__L01-landing.png
T: Scrolled through Table 1 (15 of 576 rows), Figure 1, Table 2 (15 of 469 rows), Table 3 "New files" (15 of 319 rows) → all rendered, numbers internally consistent with the churn paragraph (84 commits / 41,163 lines / 43 components) · shots/TC-QW-30D-1__R01-scroll1.png, R02-scroll2.png
T: Click near Table 3 to reach the closing prompt → instead selected the Table 3 cell (Cell pane shows its SQL query) → expected: click the prompt text; had to scroll and re-click precisely · shots/TC-QW-30D-1__W01-prompt-check.png, W02-prompt-typed.png, W03-prompt-locate.png
T: Click precisely on the closing prompt, type a sentence → fills cleanly, no jump → shots/TC-QW-30D-1__W04-prompt-filled.png
T: Scroll to top, click opening prompt, type a sentence → fills cleanly → shots/TC-QW-30D-1__W05-top-prompt.png, W06-top-prompt-check.png
T: Open PDF preview → "3 pages · A4 · 62 KB", no "to add" tag → shots/TC-QW-30D-1__P01-pdf-preview.png
T: Save PDF → "Saved to .../M8/03-archstats-ui_ the last 30 days.pdf" → shots/TC-QW-30D-1__P02-saved-to.png

### [P2] "New files" table is dominated by a mass-rename/restructure commit, making the 30-day new-file count wildly overstated
- Test case / step: TC-QW-30D-1 / R2 (probe: "Numbers consistent across the four?")
- Where: The last 30 days > New files > Table 3 "Production files first committed in the last 30 days" (archstats-ui, snapshot 25 Sep 09:09/eea60c6, analysis r4)
- What happened: Table 3 reports 319 of 401 total production files (about 80%) as "first committed in the last 30 days". The git log (visible while taking Figure 1) shows this is dominated by a single commit, `eef741a "refactor(frontend): organise the code by feature, not by kind of file"`, which touched 386 files in one go — almost certainly moves/renames that archstats' git layer counts as brand-new files rather than renames. A reader using this template for "a sprint review, a monthly update, or to see where the team's time actually went" (the template's own stated purpose) would conclude 80% of the codebase is new work this month, which is misleading.
- Expected: Either the "first committed" query should account for renames/moves (so a reorganisation commit doesn't inflate the new-files count), or the report should surface this kind of outlier commit explicitly (e.g. call out that one commit accounts for N of the M "new" files) so the reader isn't misled without reading every row.
- Evidence: shots/TC-QW-30D-1__R02-scroll2.png (Table 3, "15 of 319"), shots/TC-QW-30D-1__W01-prompt-check.png (Cell pane SQL: `SELECT name, complexity__lines AS lines, component FROM file ...`), PDF `03-archstats-ui_ the last 30 days.pdf` page 2-3
- Repro: On archstats-ui (or any repo with a recent file-reorganisation commit), create "The last 30 days" and read Table 3.

### [P2] Clicking near a table to reach a prompt below it selects the table's Cell instead
- Test case / step: TC-QW-30D-1 / R2/W
- Where: The last 30 days report, between Table 3 and the closing prompt "What it tells us"
- What happened: A click aimed at the grey italic prompt text right after a table landed on the table cell instead (the Cell pane switched to show Table 3's SQL/settings), with no visible cursor in the prompt. Only after scrolling slightly and clicking more precisely did the prompt receive focus.
- Expected: Clicking clearly below a table's caption/provenance line, on a separate paragraph of prompt text, should always target that paragraph, not the table above it — the hit area for the table seems to extend further down than its visible border.
- Evidence: shots/TC-QW-30D-1__W01-prompt-check.png, shots/TC-QW-30D-1__W02-prompt-typed.png
- Repro: Scroll a report so a table's bottom edge and the next paragraph are both visible; click just below the table's provenance line.

TC-QW-30D-1: done — 2 findings (2xP2), PDF `03-archstats-ui_ the last 30 days.pdf`

## TC-GO-2 · Go module review (M8 archstats-ui, where Go is only part of the code)

T: New report → "For archstats-ui" group, clicked "Go module review" ("Found: 1 Go module") → band + preview switch to "Go review: archstats-ui", no figure checkbox (only "Explain the terms") → expected: template preview updates · shots/TC-GO-2__G01-template-selected.png
T: Create report → no taking run (template has 0 figures), lands straight on the finished report, 13 cells → expected: skip the taking UI entirely when there's nothing to take; this worked cleanly · shots/TC-GO-2__L01-landing.png
T: Read "What each package holds" roles paragraph and "The packages everything imports" table → both describe/list the WHOLE polyglot codebase (Vue-heavy), not just the Go module → ⚠ see P1 below · shots/TC-GO-2__R01-roles-paragraph.png
T: Read "Libraries" section → explanation paragraph is unedited Java/Spring boilerplate, computed sentence lists npm libraries (vitest/vue/pinia) as a Go module's "most widely imported" libraries → ⚠ see P1 below · shots/TC-GO-2__R02-libraries.png, R03-libraries2.png
T: Click "Findings" prompt, type a sentence → fills cleanly · shots/TC-GO-2__W01-findings-prompt-filled.png
T: Click opening prompt, type a sentence → fills cleanly · shots/TC-GO-2__W02-opening-prompt-filled.png
T: Open PDF preview → "4 pages · A4 · 45 KB", no "to add" tag · shots/TC-GO-2__P01-pdf-preview.png
T: Save PDF → "Saved to .../M8/04-Go review_ archstats-ui.pdf" · shots/TC-GO-2__P02-saved-to.png

### [P1] "Go module review" template's Roles and Libraries sections are not scoped to Go, and reuse unedited Java/Spring example text, on a mixed-language codebase
- Test case / step: TC-GO-2 / R1 (probe: "does a Go template on a mostly-Vue codebase read sensibly?")
- Where: Go module review > "What each package holds" (roles paragraph + Table 3 "The packages everything imports") and > "Libraries" (archstats-ui, snapshot 25 Sep 09:09/eea60c6, analysis r4)
- What happened, in three parts, all from the same template on the same report:
  1. The roles paragraph explaining how code gets sorted into roles reads: "first by annotations and base classes (a class marked `@Service` is a service), then by what it imports, then by its name" — this is Java/Spring-specific wording that has no meaning for Go (Go has no annotations or `@Service`), and is followed immediately by "Archstats reads this as **By structure**" (i.e. no framework profile matched, confirming the annotation-based explanation never actually applied — see the known M8 fact "no framework profile matches"). The computed counts that follow are drawn from the *entire* codebase, not the Go module: "the most in `frontend/src/features/reports` (64)" and "the one using the most other code is `useDimensionStudio`" — both are Vue/TypeScript, not Go.
  2. "The packages everything imports" (Table 3) lists almost entirely frontend Vue/TS folders (`frontend/src/features/snapshot`, `frontend/src/shared`, `frontend/src/features/groups`, ...) with only 2 of 15 shown rows being actual Go packages (`app/store`, `app/query`).
  3. The Libraries section's explanation paragraph is verbatim, unedited Java example text: "Names are shortened to their first two parts, so `org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`. Modules of the language's own platform, such as `java.util`, are counted separately." — nothing here is Go-specific (no mention of Go modules or `go.mod`). The computed sentence right after names `vitest`, `vue` and `pinia` — all npm/JS libraries — as the Go module's "most widely imported" libraries.
  In contrast, Tables 4-6 (tagged structs, build constraints/embedded files) are correctly scoped to only the actual Go packages (`app`, `app/changes`, `app/store`, etc.), showing the template *can* filter to Go when it wants to.
- Expected: A "Go module review" should scope every section to the Go module's own packages, and its explanatory prose should describe Go's own conventions (or a language-neutral "by structure" explanation when no framework matched), not leftover Java/Spring annotation and package-naming text.
- Evidence: shots/TC-GO-2__R01-roles-paragraph.png, shots/TC-GO-2__R02-libraries.png, shots/TC-GO-2__R03-libraries2.png; PDF `04-Go review_ archstats-ui.pdf` (roles paragraph and Libraries section, both pages 2-3)
- Repro: On a mixed Go+other-language codebase (archstats-ui: Go + Vue/TypeScript), create "Go module review" and read "What each package holds" and "Libraries".

TC-GO-2: done — 1 finding (1xP1), PDF `04-Go review_ archstats-ui.pdf`

## TC-X-BLANK · Blank report (M8)

T: New report → "Blank report" → preview shows "Untitled report" / "An empty page. Write, or press / to add evidence." → expected: a truly empty starting point · shots/TC-X-BLANK__G01-blank-selected.png
T: Create report → lands on the blank report immediately, 0 cells → shots/TC-X-BLANK__L01-landing.png
T: Typed a title and one plain paragraph → both render immediately; report list still reads "0 cells" (a typed paragraph is not counted as a cell, only inserted evidence is) → shots/TC-X-BLANK__W01-title-paragraph-typed.png
T: Pressed Enter then typed "/" at the start of a new line, expecting the Insert menu (per the harness/product's own documented shortcut) → the "/" was typed as a literal character into the paragraph instead, no menu appeared → expected: the Insert menu to open · ⚠ see P2 below · shots/TC-X-BLANK__W02-insert-menu.png
T: Deleted the stray "/", clicked the "Insert below" toolbar button instead → Insert menu opened correctly with a search box and a live preview pane → shots/TC-X-BLANK__W03-insert-below-clicked.png, W04-insert-menu-open.png
T: Typed "table" in the insert search → only the generic Markdown "Table" block matched; none of the named table presets (e.g. "Hotspot components") are searchable by the word "table" → expected: typing "table" to at least surface the "Tables" category → shots/TC-X-BLANK__W06-table-search.png
T: Cleared the search, arrowed down through the full "Facts, written out" list (paragraphs, including ~10 framework-specific ones e.g. Spring/Django/Go/.NET/PHP) to reach a separate "Tables" category further down → found "Hotspot components", "Most depended-on components", "Least healthy components", each with a live data preview → expected: reachable, but the number of framework paragraphs to page through before reaching tables was a long scroll · shots/TC-X-BLANK__W09..W12
T: Inserted "Hotspot components" → table appears with real data (2 cells total) → shots/TC-X-BLANK__W13-table-inserted.png
T: Typed "## Notes" on a new line → instantly became a real H2 heading, appeared in the Outline panel → expected, worked well · shots/TC-X-BLANK__W14-heading-typed.png
T: Open PDF preview → "1 page · A4 · 29 KB" → shots/TC-X-BLANK__P01-pdf-preview.png
T: Save PDF → "Saved to .../M8/05-QA scratch report.pdf", all content present and correctly formatted (heading, prose, computed paragraph, table) → shots/TC-X-BLANK__P02-saved-to.png

### [P2] Typing "/" in a blank report's new paragraph does not open the Insert menu
- Test case / step: TC-X-BLANK / W (insert flow)
- Where: Blank report, a new empty paragraph line (archstats-ui)
- What happened: Per the test plan and the app's own footer text in the New report dialog ("Start from nothing; add facts, tables, queries and pins as you write" / "An empty page. Write, or press / to add evidence."), typing "/" at the start of an empty line should open the Insert menu. Instead, the "/" character was typed literally into the paragraph text, and no menu appeared. The "Insert below" toolbar button opens the identical menu reliably.
- Expected: Typing "/" at the start of an empty paragraph should open the Insert menu, as the empty-page placeholder text itself promises.
- Evidence: shots/TC-X-BLANK__W02-insert-menu.png (literal "/" character visible with a text cursor, no menu)
- Repro: Create a Blank report, press Enter to start a new empty paragraph, type "/".
- Note: could not fully rule out a harness key-dispatch quirk for a single non-alphanumeric character, but the character was received and inserted as text (not ignored), which argues against a simple dispatch failure.

TC-X-BLANK: done — 1 finding (1xP2), PDF `05-QA scratch report.pdf`

---

## Summary

Worst three problems: (1) the "Go module review" template does not scope its Roles or Libraries
sections to the Go module on a mixed-language codebase — it reports Vue/TypeScript entry points
and npm libraries (vitest, vue, pinia) as if they were Go findings, and its Roles explanation is
unedited Java/Spring `@Service`-annotation text that never applies (TC-GO-2). (2) The built-in
"Changes" comparison a check-in template takes its "since last snapshot" table from picks the
immediately preceding *scan*, not the last *different* snapshot, so on a workspace rescanned twice
in a row the slot always comes up empty (TC-GEN-CHECK-1, recurs in TC-X-SAVE). (3) "Save as
template" with "Turn my paragraphs into prompts" silently converts the template's own built-in
explanatory prose into prompts too, not just what the user wrote, contradicting its own dialog text
and quietly dropping the "Explain the terms" option from the reused template (TC-X-SAVE).

What worked well: the outline-click-to-scroll-and-select flow, the Cell pane's clarity for both
computed paragraphs and tables, prompt-filling (type-to-replace, no jumps), the Insert menu's live
preview of exactly what will be inserted, "## " auto-converting to a real heading, and every PDF
export being clean (no stray markdown, correct page counts, tables/figures rendering well).
