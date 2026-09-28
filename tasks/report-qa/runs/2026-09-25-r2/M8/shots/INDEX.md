# Shot index — M8 (archstats-ui), run 2

## TC-GEN-CHECK-1 · Health check-in

- `TC-GEN-CHECK-1__G01-gallery-opens-reshot.png` — Gallery with Health check-in selected (band + top of preview); the default "New report" first-open view (JS/TS workspace review) was not separately captured, this reshoot shows the modal chrome.
- `TC-GEN-CHECK-1__G02-template-selected-band.png` — Health check-in band: name/audience, summary, "Use it when…", tally line, "The grey italic lines are prompts…".
- `TC-GEN-CHECK-1__G03-preview-scrolled.png` — Preview scrolled: Shape paragraphs with real numbers (4 of 45 components, 27%, 16%, 9 levels), Change section start with hotspot components.
- `TC-GEN-CHECK-1__G04-preview-scrolled2.png` — Preview scrolled further: hotspot table slot, Health section.
- `TC-GEN-CHECK-1__G05-preview-scrolled3.png` — Preview scrolled: Tests section, "Since last time" section with Figure 1 (Trends) and Table 2 (Changes) slots.
- `TC-GEN-CHECK-1__G06-preview-scrolled4.png` — End of preview: closing prompt, footer (name, checkboxes both on).
- `TC-GEN-CHECK-1__C01-after-create-click.png` — Right after "Create report": jumped straight into the taking run on the Trends/Changes view (Figure 1, 1 of 2).
- `TC-GEN-CHECK-1__C02-take-trends.png` — Take modal for Figure 1 · Trends: preview panel shows the captured chart, right pane shows "Asked for".
- `TC-GEN-CHECK-1__C03-take-changes-table.png` — Take modal for Table 2, 2 of 2, on the Changes view comparing 17:29 vs 17:30 scans of the same commit: "No structural changes between these snapshots".
- `TC-GEN-CHECK-1__C04-take-changes-nothing-to-take.png` — Same screen, header now reads "Changes drew nothing to take; set it, then add it" (take-failure message). See P1 finding.
- `TC-GEN-CHECK-1__L01-landing.png` — Landing after Skip: report page, 11 cells, Table 2 still shows "(to add)" in outline.
- `TC-GEN-CHECK-1__R01-report-top.png` — Report top: title, provenance line, empty (unfilled) opening prompt, Shape section.
- `TC-GEN-CHECK-1__R02-cell-pane-paragraph.png` — Cell pane for a computed paragraph ("Size and languages"): Counted/Ran on/Write as my own — clear.
- `TC-GEN-CHECK-1__R03-outline-click-table1.png` — Clicking "Table 1 · Hotspot components" in the outline scrolled correctly and auto-selected the cell pane (table settings visible, readable columns).
- `TC-GEN-CHECK-1__R04-scroll2.png` — Scroll: Health, Rules, Tests sections; consistent numbers.
- `TC-GEN-CHECK-1__R05-scroll3.png` — Scroll: Trends figure filled, Table 2 slot still unfilled with "Take it from Changes"/"Set it yourself".
- `TC-GEN-CHECK-1__R06-end-of-report.png` — End of report after filling the closing prompt.
- `TC-GEN-CHECK-1__W01-prompt-before.png` — Back at top before filling the opening prompt.
- `TC-GEN-CHECK-1__W02-prompt-clicked.png` — Accidental click landed inside a computed paragraph mid-document; cursor visible and literal asterisks shown around italic terms ("*tangle*", "*Propagation cost*"). See P1 finding.
- `TC-GEN-CHECK-1__W03-after-escape.png` — After Escape: asterisks gone, italics render normally again, paragraph shown with a selection highlight.
- `TC-GEN-CHECK-1__W04-back-to-top.png` — Scrolled back to top, prompt visible in grey italic.
- `TC-GEN-CHECK-1__W05-prompt-focused.png` — First click attempt near the prompt (imprecise coordinates, no visible cursor yet).
- `TC-GEN-CHECK-1__W06-prompt-focused2.png` — Cursor correctly placed at the start of the opening prompt.
- `TC-GEN-CHECK-1__W07-prompt-typing.png` — Prompt replaced by typed sentence; placeholder gone, no layout jump.
- `TC-GEN-CHECK-1__W08-prompt-after.png` — After Escape: prompt text committed.
- `TC-GEN-CHECK-1__W09-closing-prompt-typed.png` — Closing prompt ("What moved…") filled with a typed sentence.
- `TC-GEN-CHECK-1__W10-snapshot-selector-click.png` — Clicked the "Snapshot the cells run on" toolbar select.
- `TC-GEN-CHECK-1__W11-snapshot-selector-after-arrowdown.png` — After ArrowDown: value unchanged ("Runs on newest · 25 Sep, 09:09").
- `TC-GEN-CHECK-1__W12-snapshot-selector-changed.png` — After ArrowDown + Enter: still unchanged.
- `TC-GEN-CHECK-1__W13-snapshot-selector-2downs.png` — After click + 2×ArrowDown + Enter: still unchanged. Could not verify the snapshot-switch flow. See P2 finding.
- `TC-GEN-CHECK-1__P01-pdf-preview.png` — PDF preview sheet: "3 pages · A4 · 224 KB · 1 to add, left out", page 1 rendered.
- `TC-GEN-CHECK-1__P02-saved-to.png` — "Saved to …/M8/01-Check-in_ archstats-ui.pdf" confirmation line.

## TC-X-SAVE · Save as template, then reuse it

- `TC-X-SAVE__W01-report-list.png` — PDF preview closed, back on the Check-in report.
- `TC-X-SAVE__W02-overflow-attempt.png` — Report list item overflow menu opened (Rename/Duplicate/Save as template.../Delete...).
- `TC-X-SAVE__W03-save-as-template-dialog.png` — "Save as template" dialog: name prefilled "Check-in", "Turn my paragraphs into prompts" checked by default, "Comes with it" checklist (6 headings, 8 counted paragraphs, 1 table, 2 figures, 12 prompts).
- `TC-X-SAVE__W04-dialog-filled.png` — Dialog with "What it is for" filled in.
- `TC-X-SAVE__L01-after-save.png` — Back on the report after saving (no visible confirmation toast).
- `TC-X-SAVE__G01-gallery-yours.png` — New report gallery, scrolled to find "Yours" group.
- `TC-X-SAVE__G02-yours-template-selected.png` — "Check-in" template selected from Yours: explanation paragraphs now render as grey italic prompts, not fixed text; only "Then take the 2 figures" checkbox remains (no "Explain the terms" checkbox). See P2 finding.
- `TC-X-SAVE__C01-taking-run.png` — Taking run started on the new report from the saved template; two reports both named "Check-in: archstats-ui" visible in the left list.
- `TC-X-SAVE__P01-pdf-preview.png` — PDF preview: "2 pages · A4 · 216 KB · 1 to add, left out" (shorter than the original 3-page report since explanation text became prompts, not printed).
- `TC-X-SAVE__P02-saved-to.png` — "Saved to .../M8/02-Check-in_ archstats-ui.pdf".

## TC-QW-30D-1 · The last 30 days

- `TC-QW-30D-1__G01-template-selected.png` — "The last 30 days" template selected: band, "archstats-ui: the last 30 days" preview with real churn numbers.
- `TC-QW-30D-1__C01-take-activity.png` — Taking run opens the Activity/Git view (Work over time, 1 of 1).
- `TC-QW-30D-1__L01-landing.png` — Landing on the new report, figure already filled, Table 1 visible.
- `TC-QW-30D-1__R01-scroll1.png` — Scroll: end of Table 1 (15 of 576 rows), Figure 1 (Work over time) filled, start of Hotspots touched / Table 2.
- `TC-QW-30D-1__R02-scroll2.png` — Scroll: end of Table 2, Table 3 "New files" showing "15 of 319" rows, closing prompt "What it tells us".
- `TC-QW-30D-1__W01-prompt-check.png` — Click near Table 3 selected the table cell instead of the prompt (Cell pane shows Table 3's SQL query).
- `TC-QW-30D-1__W02-prompt-typed.png` — Same state, prompt still unfilled below.
- `TC-QW-30D-1__W03-prompt-locate.png` — Scrolled slightly to locate the actual prompt text before the closing prompt.
- `TC-QW-30D-1__W04-prompt-filled.png` — Closing prompt filled with a sentence explaining the refactor-driven inflation. See P2 finding below (large-refactor commit inflates "new files"/"files changed" counts).
- `TC-QW-30D-1__W05-top-prompt.png` — Scrolled back to top, opening prompt still grey italic.
- `TC-QW-30D-1__W06-top-prompt-check.png` — Opening prompt filled cleanly.
- `TC-QW-30D-1__P01-pdf-preview.png` — PDF preview: "3 pages · A4 · 62 KB", no "to add" tag (fully filled).
- `TC-QW-30D-1__P02-saved-to.png` — "Saved to .../M8/03-archstats-ui_ the last 30 days.pdf".

## TC-GO-2 · Go module review (archstats-ui, Go is only part of the code)

- `TC-GO-2__G01-template-selected.png` — "Go module review" band + preview top: title, opening prompt, "Modules and packages" section with real numbers.
- `TC-GO-2__L01-landing.png` — Landing on the report immediately after Create (no taking run — this template has no figures).
- `TC-GO-2__R01-roles-paragraph.png` — "What each package holds" roles paragraph: explains Java/Spring-style `@Service` annotation sorting, then reports entity counts dominated by Vue frontend paths (`frontend/src/features/reports`, `useDimensionStudio`) and "The packages everything imports" table listing mostly frontend folders, not Go packages. See P1 finding.
- `TC-GO-2__R02-libraries.png` — Table 4/5/6 (tagged structs, build constraints) correctly scoped to Go packages only (app, app/changes, app/store, etc.) — contrast with R01/R03.
- `TC-GO-2__R03-libraries2.png` — "Libraries" section: explanation paragraph is verbatim Java/Spring boilerplate (`org.springframework.web`, `java.util`) with zero Go-specific wording, followed by a computed sentence naming vitest/vue/pinia (npm libraries) as the "most widely imported" libraries in a Go module review. See P1 finding. "Findings" closing prompt visible below.
- `TC-GO-2__W01-findings-prompt-filled.png` — Findings prompt filled with a realistic sentence.
- `TC-GO-2__W02-opening-prompt-filled.png` — Opening prompt filled; report top shown with computed Shape paragraphs.
- `TC-GO-2__P01-pdf-preview.png` — PDF preview: "4 pages · A4 · 45 KB", no "to add" tag (no figures in this template).
- `TC-GO-2__P02-saved-to.png` — "Saved to .../M8/04-Go review_ archstats-ui.pdf".

## TC-X-BLANK · Blank report

- `TC-X-BLANK__G01-blank-selected.png` — Gallery, "Blank report" selected: "Untitled report", "An empty page. Write, or press / to add evidence."
- `TC-X-BLANK__L01-landing.png` — Landing on the new blank report, 0 cells.
- `TC-X-BLANK__W01-title-paragraph-typed.png` — Title changed to "QA scratch report", one plain paragraph typed; report list/header still say "0 cells" (plain prose does not count as a cell).
- `TC-X-BLANK__W02-insert-menu.png` — Pressed "/" at the start of a new empty line: the "/" was typed literally into the paragraph, no insert menu opened. See P2 finding.
- `TC-X-BLANK__W03-insert-below-clicked.png` — Clicked the "Insert below" toolbar button instead: same insert menu opened correctly.
- `TC-X-BLANK__W04-insert-menu-open.png` — Insert menu open: search box, "Facts, written out" category of computed paragraphs, live preview pane on the right showing exact wording before inserting.
- `TC-X-BLANK__W05-computed-inserted.png` — "Size and languages" computed paragraph inserted (1 cell), Cell pane confirms it.
- `TC-X-BLANK__W06-table-search.png` / `W07-insert-cleared.png` — Typing "table" in the insert search only surfaced the generic Markdown "Table" block, not any named table preset.
- `TC-X-BLANK__W08-insert-menu-full.png` — Insert menu reopened, browsing the full "Facts, written out" list from the top.
- `TC-X-BLANK__W09-insert-scrolled.png` / `W10-insert-arrowdown.png` — Arrowed down through ~17 framework-specific paragraph presets (Spring, Django, Go, .NET, PHP, ...).
- `TC-X-BLANK__W11-insert-arrowdown2.png` — Reached the "Tables" category further down the same list: Hotspot components, Most depended-on components, Least healthy components, each with a live data preview.
- `TC-X-BLANK__W12-table-preset-hotspot.png` — "Hotspot components" table preset highlighted with full live preview (real rows, real numbers).
- `TC-X-BLANK__W13-table-inserted.png` — Table inserted into the report (2 cells), Cell pane shows its settings (sort, rows, columns).
- `TC-X-BLANK__W14-heading-typed.png` — Typed "## Notes" on a new line below the table; it became a real H2 heading and appeared in the Outline panel immediately.
- `TC-X-BLANK__P01-pdf-preview.png` — PDF preview: "1 page · A4 · 29 KB".
- `TC-X-BLANK__P02-saved-to.png` — "Saved to .../M8/05-QA scratch report.pdf".
