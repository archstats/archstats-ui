# M8 findings — archstats-ui (2026-09-25)

Sandbox check: Evidence → Reports = 0 before first report. OK, proceeding.

---

### [P1] Garbled sentence: "that share are linked by a chain of imports"
- Test case / step: TC-GEN-CHECK-1 / G5, R1
- Where: Health check-in › Shape section, second computed paragraph (workspace archstats-ui, snapshot 25 Sep 09:09, analysis r4)
- What happened: The paragraph reads exactly: "4 of 45 components (27% of the lines) sit in 1 tangle: each can reach every other in its tangle by following imports. Propagation cost is 16%: of all ordered pairs of components, that share are linked by a chain of imports. With each tangle taken as one node, the longest import chain is 9 levels deep." The middle sentence does not parse: "Propagation cost is 16%: of all ordered pairs of components, that share are linked by a chain of imports" has no coherent subject/verb structure and "that share are" disagrees in number.
- Expected: A grammatical sentence, e.g. "Propagation cost is 16%: the share of all ordered pairs of components linked by a chain of imports."
- Evidence: shots/g5-healthcheck-preview3.png, 01-Check-in_ archstats-ui.pdf page 1
- Repro: Evidence → Start a report → Health check-in (any workspace with a tangle) → read the Shape section's second computed paragraph.

### [P1] Broken grammar: "All 1 rule that apply hold"
- Test case / step: TC-GEN-CHECK-1 / R1
- Where: Health check-in › Rules section, computed paragraph (archstats-ui, snapshot 25 Sep 09:09, analysis r4)
- What happened: Exact text: "All 1 rule that apply hold: no import breaks them." Subject-verb agreement is wrong twice over ("rule ... apply", "rule ... hold" instead of "applies"/"holds"), and reads as though written for a plural count that was not adjusted for the singular case (1 rule).
- Expected: Something like "The 1 rule that applies holds: no import breaks it." (or handle the N=1 case specially, as good pluralization code usually does).
- Evidence: shots/r7-bottom-prompt.png, 01-Check-in_ archstats-ui.pdf page 2
- Repro: same as above; read the Rules section on a workspace with exactly 1 dependency rule (archstats-ui has 1).

### [P3] Table row-count caption "8 of 46." is unexplained and vanishes in the PDF
- Test case / step: TC-GEN-CHECK-1 / R2, P3
- Where: Health check-in › Shape › Table 1 "Hotspot components" (archstats-ui, snapshot 25 Sep 09:09)
- What happened: Under Table 1 the app shows "8 of 46." with no label (e.g. "8 of 46 components shown"). It also looks inconsistent with the Shape paragraph's "45 components" two paragraphs above — the table is in fact counting all 46 components (including a non-production one) while the paragraph counts 45 production-only, but nothing says so. In the saved PDF, this "8 of 46." line is dropped entirely, so a PDF reader has no indication the table is a top-8 slice at all.
- Expected: A caption a junior developer can read without opening the Cell pane, e.g. "Top 8 of 46 components by hotspot score", printed into the PDF too.
- Evidence: shots/r5-outline-click.png, shots/r6-cell-pane-table.png, 01-Check-in_ archstats-ui.pdf page 2 (table has no such line)
- Repro: Create Health check-in on archstats-ui, look under Table 1 in-app vs. in the saved PDF.

### Could not test: "Snapshot the cells run on" selector does not respond to the driving harness
- Test case / step: TC-GEN-CHECK-1 / probe ("use the Snapshot the cells run on selector to switch the cells to an older snapshot and back")
- Where: Evidence toolbar, native `<select>` control, report "Check-in: archstats-ui"
- What happened: Clicking the control, then sending ArrowDown/Enter or typing to type-ahead, produced no visible change: the toolbar still read "Runs on newest · 25 Sep, 09:09 · eea…" and every computed number in the report (401 files, 45 components, etc.) stayed identical after several attempts. This is very likely a limitation of driving a native `<select>` through this headless harness (native dropdowns/tooltips are known not to render, per the test plan's harness facts) rather than a product bug, so it is reported as "could not tell" rather than a finding.
- Evidence: shots/r-select-dropdown-open.png, shots/r-select-after-multi-arrowdown.png, shots/r-select-typeahead.png
- Repro: Evidence → open a report → click the "Snapshot the cells run on" selector in the toolbar → try to pick an older snapshot.

TC-GEN-CHECK-1: done — 3 findings (2 P1, 1 P3) + 1 "could not test", PDF `01-Check-in_ archstats-ui.pdf`.

---

## TC-X-SAVE — Save as template, then reuse it

Harness note: the facilitator switched the sandbox's SQL console ON and restarted the app server partway through this mission (query/SQL-backed table cells had been untested until then). The m8 driving session was restarted and the sandbox check re-run (Reports = 0, OK). TC-GEN-CHECK-1 was re-created and re-verified — Table 1 "Hotspot components" produced the same 8 correct rows both before and after the restart, so none of the TC-GEN-CHECK-1 findings above need voiding. Report `01-Check-in_ archstats-ui.pdf` is the pre-restart PDF; `02-Check-in_ archstats-ui.pdf` is the post-restart re-save of the same report (same content, confirms the table was never actually broken).

### [P2] "Save template" gives no confirmation
- Test case / step: TC-X-SAVE / (Save as template dialog → Save template)
- Where: Report overflow menu (⋯) › Save as template… dialog, on report "Check-in: archstats-ui"
- What happened: Clicking "Save template" closes the dialog silently and returns to the report page. There is no toast, banner, or any other acknowledgement that a template was saved, or where to find it. The only way to confirm it worked is to open New report and scroll down to a new "Yours" group.
- Expected: A brief confirmation (toast or inline message) naming the template and where it went, e.g. "Saved as 'Check-in' under Yours."
- Evidence: shots/x-save-after.png
- Repro: Open any report → ⋯ → Save as template… → Save template → observe no feedback.

### Confirmed working: saved template delivers what the dialog promised
- Test case / step: TC-X-SAVE / R1-R3, P3
- Where: New report → Yours › Check-in (saved from archstats-ui)
- What happened: The dialog's promise ("Your structure, cells and prompts; nothing it found before comes with it. Writes 6 sections: 8 paragraphs counted from the snapshot, 1 table, 2 figures ... and 12 prompts") held up: the reused template's preview showed all 10 "explaining the terms" paragraphs as grey italic prompts (guidance text, not printed) while the 8 computed paragraphs and Table 1 re-ran fresh numbers identical to the source report. The printed PDF (`03-Check-in_ archstats-ui.pdf`, 2 pages) correctly omitted every unfilled prompt and printed only the computed paragraphs, headings and Table 1 — no leftover prompt text, no `undefined`/`[object Object]`. This is not a bug — noted as confirmation the flow works as designed, since the test plan asks specifically whether "the saved template bring[s] what the dialog promised."
- Evidence: shots/x-yours-template.png, 03-Check-in_ archstats-ui.pdf

TC-X-SAVE: done — 1 finding (P2), PDFs `02-Check-in_ archstats-ui.pdf` (re-save), `03-Check-in_ archstats-ui.pdf` (reused template).

---

## TC-QW-30D-1 — The last 30 days

### [P3] "component" column mixes real values and unexplained "—"
- Test case / step: TC-QW-30D-1 / R2
- Where: "archstats-ui: the last 30 days" › New files › Table 3 "Production files first committed in the last 30 days" (archstats-ui, snapshot 25 Sep 09:09)
- What happened: The "component" column shows a real folder path for some rows (e.g. `frontend/wailsjs/go/models.ts` → `frontend/wailsjs/go`) and a bare "—" for others (e.g. `frontend/src/features/connections/components/ConnectionsGraph.vue`, `frontend/src/pages/views/dimensions.vue`, `frontend/src/pages/views/evidence.vue`, `frontend/src/features/units/components/BoundaryFlow.vue`) with no legend or note explaining what "—" means (no component assigned? file sits above/outside any recognised component folder?). A junior reader has no way to tell whether this is missing data, an error, or an intentional "not grouped" state.
- Expected: Either a short note near the table explaining what "—" means, or the column header itself hints at it (e.g. "component (if any)").
- Evidence: 04-archstats-ui_ the last 30 days.pdf page 2 (Table 3)
- Repro: Create "The last 30 days" on archstats-ui, look at Table 3's component column.

TC-QW-30D-1: done — 1 finding (P3), PDF `04-archstats-ui_ the last 30 days.pdf`. Numbers were consistent across the four sub-sections (30-day churn: 84 commits/41,163 lines/43 components; Figure 1's right-most bar correctly shows this same recent spike at the current end of the timeline once viewed at full width — initial low-res read looked like the chart omitted the current month, but a higher-resolution re-check showed the bar is there, just at the very right edge of the page; not a finding).

---

## TC-GO-2 — Go module review on a mostly-Vue codebase

### [P1] Go module review is not filtered to Go: package count, roles, coupling table and libraries all leak the whole multi-language repo
- Test case / step: TC-GO-2 / R1, R2, R4 (probe: "does a Go template on a mostly-Vue codebase read sensibly?")
- Where: "Go review: archstats-ui" report (archstats-ui, snapshot 25 Sep 09:09, analysis r4) — this codebase is Vue 51%, TypeScript 36%, Go 8% of lines (per the Shape paragraph itself, printed in this same report).
- What happened: Several sections of the Go-specific template clearly pull data from the entire repository instead of Go only, contradicting both the template's own explanatory text and its own tables on the same pages:
  1. **Package count is wrong by 5x.** The computed paragraph states: "The code builds as **1 Go module with 45 packages**, 0 of them internal." But Table 1 (Modules) and Table 2 ("What each package holds") together show only **9 actual Go packages** (`.`, `app`, `app/changes`, `app/query`, `app/report`, `app/scan`, `app/snapshot`, `app/store`, `app/trends`) with no truncation/"show more" indicator. 45 is the *whole-repository* component count (stated two paragraphs earlier: "grouped into **45 components**"), reused here as if it were the Go package count.
  2. **Roles paragraph mixes in Vue code.** The "By structure" paragraph says Entry points live "the most in `frontend/src/features/reports` (64) and `frontend/src/features/lens-builder` (32)", and names `useDimensionStudio` as the entry point "using the most other code" — this is a Vue composable/hook, not Go code, appearing directly under the explanation "In Go a component is a package: one folder... Entry points (has main, or nothing references it)."
  3. **Table 3 "The packages everything imports" lists Vue/TS folders as Go packages.** Of 15 rows, most are frontend paths with no Go relevance at all: `frontend/src/features/snapshot`, `frontend/src/shared`, `frontend/src/features/groups`, `frontend/src/features/sql`, etc. Only `app/store`, `app/query`, `app/snapshot`, `app/scan` are genuinely Go.
  4. **Libraries section names JS testing/framework libraries as "the most widely imported."** "The most widely imported are `vitest` (in 77 files), `vue` (in 30 files) and `pinia` (in 20 files)" — none of these are Go dependencies; they are the Vue/Vitest frontend's libraries, surfacing in a report titled "Go review."
- Expected: Every section of a language-specific template (Go module review) should scope its counts, tables and named entities to that language's components only. If a mixed count is intentional in a fallback case, it should say so explicitly (e.g. "computed over all components, not just Go, because...").
- Evidence: 05-Go review_ archstats-ui.pdf pages 1-3 (all four quotes above appear verbatim); shots/go2-top.png, shots/go2-findings.png
- Repro: On archstats-ui (or any repo where Go is a minority language), Evidence → Start a report → Go module review → Create report → read "Modules and packages", "The packages everything imports" and "Libraries" sections.

TC-GO-2: done — 1 finding (P1, four symptoms of one root cause), PDF `05-Go review_ archstats-ui.pdf`.

---

## TC-X-BLANK — Blank report

### [P2] Typing "/" does not open the insert menu; only the "Insert below" button does
- Test case / step: TC-X-BLANK / (Insert evidence with the slash command)
- Where: Blank report "QA smoke test report", empty paragraph block
- What happened: The empty-block placeholder itself says "Write, or press / to add evidence", and the "Insert below" button's tooltip is literally "(/)". Typing `/` as the first character of an empty paragraph block does not open the insert-evidence menu — it just inserts a literal "/" character into the text, confirmed reproducible twice. The menu only opens by clicking the "Insert below" (+) button. Since typing was done through the same input path used successfully for all other text in this session, this looks like a real gap between the documented shortcut and its behaviour, not just a driving-harness artifact — but it is flagged with that caveat since keyboard-triggered UI affordances are occasionally harder for automated typing to trigger than a real browser key event.
- Expected: Typing "/" at the start of an empty block should open the same insert menu the button opens, matching the placeholder text's instruction.
- Evidence: shots/blank-slash-retry.png (shows a literal "/" character typed into the block, no menu), shots/blank-insert-click.png (menu opens fine via the button)
- Repro: Create a blank report, place the cursor in a new empty paragraph, type "/".

### Confirmed working: insert menu (button path) is clear and well organized
- Test case / step: TC-X-BLANK / R1-R3, P3
- Where: Blank report insert-evidence menu (search box "Insert a pin, table, query or block")
- What happened: Once opened via the button, the menu is easy to use: a live-filtered search box, grouped sections ("Facts, written out" for computed paragraphs, then a components/files "Tables" group, "Query" for raw SQL, "Text" for headings/markdown), and a right-hand preview pane showing exactly what the selected item will insert (with real numbers) before committing. Inserting a computed paragraph ("Size and languages") and a table preset ("Hotspot files") both worked correctly and produced clean output with no jumps. The printed PDF (`06-QA smoke test report.pdf`, 1 page) correctly included the title, my typed paragraph, my typed heading, the computed paragraph and the full 10-row table — no `undefined`, no leftover placeholder UI.
- Evidence: shots/blank-insert-click.png, shots/blank-table-inserted.png, 06-QA smoke test report.pdf

### [P3] Table row-count caption dropped from PDF (same as earlier finding)
- Test case / step: TC-X-BLANK / P3
- Where: Blank report Table 1 "Hotspot files"
- What happened: In-app the table showed "10 of 597." under the rows (10 files shown out of 597 total). This line does not appear anywhere in the saved PDF, same gap already logged for TC-GEN-CHECK-1's Table 1. Not re-filed as a separate finding — noting here only to confirm it is a recurring behaviour of the table-caption feature, not specific to Health check-in.

TC-X-BLANK: done — 1 new finding (P2), PDF `06-QA smoke test report.pdf`.

---

## Summary

Three worst problems:
1. **Go module review does not scope itself to Go** (P1): on this mostly-Vue/TS codebase the template's package count ("45 packages", really ~9), its "By structure" roles paragraph (cites the Vue composable `useDimensionStudio`), its "packages everything imports" table (lists `frontend/src/features/snapshot` etc.), and its Libraries section ("vitest", "vue", "pinia" as top imports) all leak whole-repository data into a report that explicitly explains Go-only semantics ("In Go a component is a package: one folder..."). This is the clearest, most reproducible bug found this mission and directly answers the mission's own probe question for TC-GO-2 negatively.
2. **Two grammatically broken computed sentences** (P1) recur in every report that includes the Shape/Rules sections: "Propagation cost is 16%: of all ordered pairs of components, that share are linked by a chain of imports" and "All 1 rule that apply hold: no import breaks them." Both read as un-proofread template text, and the second is a singular/plural bug (N=1 case not handled).
3. **Table row-count captions ("N of M.") never make it into the PDF**, so a reader of the printed report has no way to know a table is a partial top-N slice — seen consistently across every template tested.

What worked well: the gallery/creation flow, the taking-run mechanics (including the "drew nothing to take" message for two identical rescanned snapshots), prompt fill/escape behavior, the Save-as-template flow (delivered exactly what its dialog promised on reuse), and the insert-evidence menu (once opened via the button) were all clear, fast and free of jumps or crashes. PDFs were consistently well-formed: no stray `**`/backticks, no printed prompts, correct figure/table numbering, and unfilled slots correctly omitted.

Could not fully test: the toolbar "Snapshot the cells run on" native `<select>` resisted click/arrow-key/type-ahead automation through this harness, so its "switch to an older snapshot and back" behaviour (TC-GEN-CHECK-1's specific probe) could not be verified either way.
