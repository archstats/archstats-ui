# M5 findings — LibreChat (TypeScript), run 2 (m5r2)

Sandbox check: PASS — Evidence showed Reports 0 before first report.

Test cases in order: TC-REACT-1, TC-NODE-1, TC-GEN-OWN-1, TC-GEN-REF-1

---

## TC-REACT-1 · React front end review (M5 LibreChat)

T: Evidence → "Start a report" → gallery dialog opens instantly, default selection "Blank report" · expected: dialog opens · shots/TC-REACT-1__G01-gallery-open.png
T: click "React front end review" (group "For LibreChat (TypeScript)") → band updates to show name/audience, summary, tally "Writes 9 sections: 7 paragraphs explaining the terms, 8 paragraphs counted from the snapshot, 5 tables, 2 figures to add from the views and 3 prompts for your reading", preview switches · expected: preview updates · shots/TC-REACT-1__G02-band-and-roles.png
T: scroll preview through full length → paragraphs (workspace facts, roles in the code, components/hooks tables, data-fetching table, layers paragraph + Figure 1, hotspots + Table4 + Figure2, code health + Table5, "Findings" prompt) → preview ends right after the "Findings" prompt heading, footer immediately below · expected: to see 3 prompts as the tally promises but only found 1 ("Findings") in the whole scroll · shots/TC-REACT-1__G03-preview-end.png ⚠

### [P1] Tally line promises 3 prompts, preview shows only 1
- Test case / step: TC-REACT-1 / G3, G5
- Where: React front end review › gallery preview (workspace LibreChat (TypeScript), snapshot 5 Jun 2025 05:11, analysis r0)
- What happened: band tally reads "Writes 9 sections: 7 paragraphs explaining the terms, 8 paragraphs counted from the snapshot, 5 tables, 2 figures to add from the views and 3 prompts for your reading." Scrolling the whole preview end to end (5 scroll passes, confirmed bottom reached twice with identical content) only ever shows one grey italic prompt: "Findings — What you found, each tied to the evidence above: folders to reorganise, hooks to stabilise, and data fetching to bring together." No second or third prompt appears anywhere in the preview.
- Expected: tally count should match what is actually shown in the preview (3 prompts visible), or the wording should not promise a count the preview does not deliver.
- Evidence: shots/TC-REACT-1__G03-preview-end.png
- Repro: Evidence → Start a report → select "React front end review" (LibreChat workspace) → read tally line → scroll preview to the very bottom.

T: click "Create report" → taking run starts immediately on slot 1 of 2 (Figure 1, Units › Boundary flow view, flow=components,data), chart already drawn, "Taken as the template asks" shown, no wait/spinner · expected: land in a take flow · shots/TC-REACT-1__C01-take-figure1.png
T: click "Fill and next" → moves straight to slot 2 of 2 (Figure 2, Hotspots by directory, Table 4 already filled and visible with real data) · expected: next slot · shots/TC-REACT-1__C02-take-figure2.png
T: click "Fill and finish" → lands back on Evidence, report open with all 15 cells filled (Reports 1, "Front end review: LibreChat (TypeScript) 15 cells · just now") · expected: land on finished report · shots/TC-REACT-1__L01-landing.png
T: click outline entry "Findings" → scrolls report to the Findings heading/prompt, entry highlighted in outline · expected: scroll to that section, works correctly · shots/TC-REACT-1__R02-outline-jump-findings.png
T: click into the "Findings" prompt text → caret appears at start of the italic placeholder, ready to type · expected: focus the prompt · shots/TC-REACT-1__W02-prompt-focused.png
T: select-all + type a real sentence into the prompt → placeholder replaced entirely, text renders as normal (non-italic) prose as I type · expected: prompt disappears as you type, no jump · shots/TC-REACT-1__W03-prompt-typing.png
T: press Escape → focus leaves the cell, typed text stays, no jump · expected: exit editing cleanly · shots/TC-REACT-1__W04-prompt-after.png
T: click computed paragraph ("The workspace holds 7 npm packages…") then Cell tab → Cell pane shows title "JavaScript and TypeScript", "A paragraph counted from the snapshot", "Counted" explanation, "Write as my own" button, Ran on / Snapshot / Analysis r0 / At timestamp · expected: readable explanation of what the cell counts · shots/TC-REACT-1__R04-cellpane-paragraph.png
T: click outline "Table 1" then Cell tab → Cell pane shows "Table 1 · Folders by React components and hooks", "A read-only query on the snapshot", the SQL query editable, "Rows kept 25" · expected: readable cell info · shots/TC-REACT-1__R05-table1-view.png

Note: Table 1 in the report shows 25 of 103 rows with headers "folder / React components / hooks / other functions and types" — clear, junior-readable, no raw snake_case ids. Data spot-checked (e.g. `client/src/components/svg` 74 React components) is internally consistent with the roles paragraph above it (same folder, same top count 72/74 — off by 2, see finding below).

### [P3] Small count mismatch between paragraph and table for the same folder
- Test case / step: TC-REACT-1 / R1 vs R2
- Where: Front end review › "Components and hooks by folder" paragraph vs Table 1 (workspace LibreChat (TypeScript), snapshot 5 Jun 2025 05:11, analysis r0)
- What happened: the paragraph says "the most in `client/src/components/svg` (72), `client/src/components/ui` (52)"; Table 1 (same report, same query family) lists `client/src/components/svg` = 74 React components and `client/src/components/ui` = 71.
- Expected: the narrative paragraph and the table it sits next to should agree on the same folder's count, or the difference (e.g. paragraph counts something slightly different from the table) should be explained.
- Evidence: shots/TC-REACT-1__R01-top.png (paragraph, "72"/"52"), shots/TC-REACT-1__R05-table1-view.png (table, "74"/"71")
- Repro: create "React front end review" on LibreChat, compare the "Components and hooks by folder" paragraph counts to Table 1 directly below it.

T: click "PDF" (toolbar) → PDF preview sheet opens showing "Front end review: LibreChat (TypeScript) · 7 pages · A4 · 773 KB", real PDF.js viewer with page thumbnails · expected: preview sheet · shots/TC-REACT-1__P01-pdf-preview.png
T: click "Save PDF…" → "Saved to /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-25-r2/M5/01-Front end review_ LibreChat _TypeScript_.pdf" line appears with a "Reveal" button; file confirmed on disk (791,607 bytes) · expected: save confirmation · shots/TC-REACT-1__P02-saved.png

PDF check (pdftotext/pdftoppm, 7 pages): title + provenance line correct ("LibreChat (TypeScript) · snapshot 5 Jun 2025, 05:11 · analysis r0" plus "Written with Archstats Desktop dev · 25 Sept 2026"); all 9 sections present in order; no `**`/backticks anywhere, prose reads clean; Table 1-5 all present with readable headers, correctly sorted (Table 4 hotspot scores descending: 100, 62.62, 61.65, 61.5, 50.58…); Figure 1 (Sankey/boundary-flow) and Figure 2 (circle-pack treemap with "Coolest"/"Hottest" callouts) both render legibly; my typed Findings sentence prints on page 7, no leftover prompt text; no hatched/unfilled slots printed. The "72/52" vs table's "74/71" mismatch from the P3 finding above also appears identically in the PDF (page 1 paragraph vs page 1-2 table).

TC-REACT-1: done — 2 findings (1 P1, 1 P3), PDF 01-Front end review_ LibreChat _TypeScript_.pdf (7 pages)

## TC-NODE-1 · JavaScript/TypeScript workspace review (M5 LibreChat)

T: from the open gallery, click "JavaScript/TypeScript workspace review" → band updates: tally "Writes 7 sections: 6 paragraphs explaining the terms, 7 paragraphs counted from the snapshot, 4 tables, 2 figures to add from the views and 2 prompts for your reading", "Leaves out Tests (the scan did not sort files into production and test code)" · expected: preview updates · shots/TC-NODE-1__G01-template-selected.png
T: scroll preview to the "Libraries" section → paragraph uses a Java/Spring example instead of a JS/TS one (see finding below) · expected: an example relevant to this ecosystem · shots/TC-NODE-1__G03-packages-section.png ⚠
T: scroll preview to the very bottom → only one prompt found ("Findings — What you found, each tied to the evidence above.") though tally promises 2 · expected: 2 prompts · shots/TC-NODE-1__G02-scroll-check.png ⚠

### [P1] "Libraries" explanation paragraph uses Java/Spring package names on a JS/TS report
- Test case / step: TC-NODE-1 / G3, G5
- Where: JavaScript/TypeScript workspace review › "Libraries" section, explanation paragraph (workspace LibreChat (TypeScript), snapshot 5 Jun 2025 05:11, analysis r0)
- What happened: the explanatory paragraph reads: "Names are shortened to their first two parts, so `org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`. Modules of the language's own platform, such as `java.util`, are counted separately." This is a Java/Maven-flavoured explanation (Spring package names) embedded verbatim inside a report whose whole point is a JavaScript/TypeScript workspace; the workspace's actual libraries are npm packages like `react`, `recoil`, `lucide-react` (correctly named two sentences later).
- Expected: the explanation should use an example relevant to the ecosystem being reviewed (an npm scoped package such as `@librechat/frontend`), or at minimum not name a completely different language's framework in a JS/TS template.
- Evidence: shots/TC-NODE-1__G03-packages-section.png
- Repro: Evidence → Start a report → "JavaScript/TypeScript workspace review" (LibreChat workspace) → scroll to "Libraries" section.

### [P1] Tally line promises 2 prompts, preview shows only 1 (second instance)
- Test case / step: TC-NODE-1 / G3, G5
- Where: JavaScript/TypeScript workspace review › gallery preview (workspace LibreChat (TypeScript), snapshot 5 Jun 2025 05:11, analysis r0)
- What happened: same issue as TC-REACT-1 above — tally reads "…and 2 prompts for your reading" but scrolling the whole preview end to end only ever shows one grey italic prompt ("Findings — What you found, each tied to the evidence above."). Adding this as a second occurrence of the first React finding rather than a new bug class, but noting the template name here since it repeats.
- Expected: tally count should match the preview.
- Evidence: shots/TC-NODE-1__G02-scroll-check.png
- Repro: Evidence → Start a report → "JavaScript/TypeScript workspace review" (LibreChat workspace) → scroll preview to bottom, count prompts vs tally.

T: click "Create report" → taking run starts on slot 1 of 2 (Figure 1, Connections graph view) · expected: land in take flow · shots/TC-NODE-1__C01-take-figure1.png
T: click "Fill and next" → moves to slot 2 of 2 (Table 4, Libraries view, table already populated) · expected: next slot · shots/TC-NODE-1__C02-take-table4.png
T: click "Fill and finish" → lands on Evidence with new report "Workspace review: LibreChat (TypeScript) 13 cells · just now", Reports count now 2 · expected: land on finished report · shots/TC-NODE-1__R01-top.png
T: click outline "Roles in the code" → scrolls correctly; roles paragraph auto-detects React and reuses the same React-roles text as the React template (expected: this template auto-detects the framework) · shots/TC-NODE-1__R02-roles.png
T: click outline "Findings" then click at the start of the italic prompt text (coordinates read off a fresh screenshot, over the "W" of "What you found") → click instead landed on/merged into the "Findings" **heading** block; select-all + type replaced the heading's own text, producing a single run "FindingsThe api package fans out to 891 references…" with no space, and the actual prompt paragraph below was untouched · expected: click+select-all+type should only ever affect the block directly under the cursor, and a heading should not silently absorb typed body text with no separator · shots/TC-NODE-1__W02-prompt-after.png ⚠ (see P1 finding below)
T: re-locate the real prompt paragraph by outline-jump + a coordinate read off a fresh screenshot, click precisely on "What you found…" → this time focus lands correctly in the prompt (caret visible, heading no longer highlighted) · expected: focus the prompt · shots/TC-NODE-1__W05-precise-click.png
T: select-all + type a real sentence into the correctly-focused prompt → placeholder replaced cleanly, non-italic prose, no jump; the corrupted heading above is left exactly as it was (not further affected) · expected: prompt fills cleanly · shots/TC-NODE-1__W06-final.png

### [P1] Typing into a section heading merges body text into it with no separator, and is easy to trigger by mistake
- Test case / step: TC-NODE-1 / R7 (filling the "Findings" prompt)
- Where: Workspace review: LibreChat (TypeScript) › "Findings" section heading (workspace LibreChat (TypeScript), snapshot 5 Jun 2025 05:11, analysis r0)
- What happened: clicking just above the intended prompt paragraph (in the same visual block as the "Findings" heading, immediately adjacent to the prompt with almost no gap) placed the cursor inside the **heading** text instead of the prompt below it. Select-all + type there replaced the heading's plain text "Findings" with "FindingsThe api package fans out to 891 references and dominates library usage; treat it as internal shared code and keep react, recoil and lucide-react up to date as the top external dependencies." — the heading and a full sentence of body prose fused into one run, still styled as a bold heading, with no space after "Findings" and no warning that a heading (not the prompt) was being edited. The heading is a structural, hand-named element (used for the outline and PDF section title), so corrupting it is worse than corrupting a paragraph — the outline entry itself now reads "FindingsThe api package fans…" instead of "Findings".
- Expected: either the heading and the prompt paragraph should have enough separation / a visible edit affordance that a click this close cannot land in the wrong block, or overwriting a heading's default text with unrelated body prose (producing a run-on like "FindingsThe...") should be prevented or at least visually distinguished before commit.
- Evidence: shots/TC-NODE-1__W02-prompt-after.png, shots/TC-NODE-1__W03e-fixed.png, shots/TC-NODE-1__W04-outline-jump.png (outline entry reads "FindingsThe api package fans...")
- Repro: create any template report, scroll to the closing prompt section, click at the very top edge of the prompt paragraph (right under the section heading) and type — on a real display the heading and prompt sit close enough that this is an easy misclick.

T: click "PDF" → preview sheet opens · shots/TC-NODE-1__P01-pdf-preview.png
T: click "Save PDF…" → "Saved to …/02-Workspace review_ LibreChat _TypeScript_.pdf" · shots/TC-NODE-1__P02-saved.png

PDF check (5 pages): title/provenance correct; all 7 sections present; Table 1-5 readable, correctly formatted; Figure 1 (force-directed dependency graph with legend "Depends on" / "In a cycle") renders legibly; the Java/Spring "Libraries" example bug (org.springframework.web/data, java.util) prints verbatim on page 3, confirming it is not just a preview-only issue; the corrupted "FindingsThe api package fans out to 891 references…" heading prints as a bold heading-styled line at the bottom of page 4, confirming the heading-corruption bug reaches the exported PDF; my correctly-typed prompt sentence prints cleanly on page 5. No `**`/backticks, no stray prompt placeholder text.

TC-NODE-1: done — 3 findings (2 P1, part of a repeated P1 tally count noted as continuation), PDF 02-Workspace review_ LibreChat _TypeScript_.pdf (5 pages)

## TC-GEN-OWN-1 · Ownership and knowledge (M5 LibreChat)

T: New report → click "Ownership and knowledge" not directly reachable — mouse-wheel scroll over the template list did nothing (list stayed at the same scroll position after two scroll attempts over the list panel); had to click the last visible item ("Onboarding guide") then press ArrowDown three times, which auto-scrolled the list and landed on "Ownership and knowledge" · expected: the template list should respond to mouse-wheel scrolling like any other scrollable panel · shots/TC-GEN-OWN-1__tmp-list2.png (no change after scroll), shots/TC-GEN-OWN-1__tmp-list3.png (after arrow-key nav) ⚠

### [P2] Template gallery list does not respond to mouse-wheel scrolling
- Test case / step: TC-GEN-OWN-1 / G2
- Where: New report dialog › template list (left column), any workspace
- What happened: with "Onboarding guide" as the last visible template, scrolling the mouse wheel over the list (two separate scroll actions, 400-600 units) produced no visible change — the list stayed exactly as before. Only keyboard ArrowDown navigation (after clicking an option to focus the listbox) scrolled further templates ("Refactoring case", "Technical debt register", "Ownership and knowledge", and presumably "Dependency audit"/"Modularization plan") into view.
- Expected: a scrollable list should scroll with the mouse wheel; a user without a reason to try arrow keys would conclude the gallery only has the templates currently visible and never find "Ownership and knowledge", "Dependency audit" or "Modularization plan".
- Evidence: shots/TC-GEN-OWN-1__tmp-list2.png, shots/TC-GEN-OWN-1__tmp-list3.png
- Repro: Evidence → Start a report → scroll down inside the template list with the mouse wheel past "Onboarding guide".

T: click "Ownership and knowledge" (via keyboard nav) → band updates: audience "Engineering managers", tally "Writes 4 sections: 5 paragraphs explaining the terms, 3 paragraphs counted from the snapshot, 1 table, 4 figures to add from the views and 2 prompts for your reading" · expected: preview updates · shots/TC-GEN-OWN-1__tmp-list3.png
Note: "History" paragraph reads "The history reaches back 16 months: 1,808 commits by 147 authors." — matches the git status snapshot facts exactly (1,808 commits, 147 contributors), a good consistency check.

T: Create report → take run starts on slot 1 of 4 (Figure 1, Activity view, Commits tab) · shots/TC-GEN-OWN-1__C01-take1.png
T: "Fill and next" → slot 2 of 4 (Table 1, Authors view, "Knowledge by component" — Main author names column present but unchecked by default, matching the report's "No names are written" promise) · shots/TC-GEN-OWN-1__C02-take2.png
T: "Fill and next" → slot 3 of 4 (Figure 2, Metrics component plot, Authors vs Churn preset) · shots/TC-GEN-OWN-1__C03-take3.png
T: "Fill and next" → slot 4 of 4 (Figure 3, Activity Effort tab) → view settles on "In the 90 days to 21 Sep 2026, no lines changed" (0 changed lines) and the take bar shows "Activity drew nothing to take; set it, then add it" · expected: a clear can't-take message; got one, though "set it, then add it" is terse (doesn't say what to change) · shots/TC-GEN-OWN-1__C05-take4-nothing.png
T: click "Skip" → lands on Evidence with the new report "Ownership: LibreChat (TypeScript) 8 cells", Reports now 3 · expected: land with 3 of 4 slots filled, 1 skipped · shots/TC-GEN-OWN-1__L01-landing.png

TC-GEN-OWN-1: done — 0 new findings beyond the two logged for this template (list-scroll P2 applies to every template), PDF pending

### HARNESS (void): TC-NODE-1 "typing into a heading" finding retracted
- The facilitator's harness note (received mid-mission) explains that screenshot coordinates I was reading and converting for `clickxy` were unreliable (scaling mismatch), and that a driver-level `click "<prompt text>"` command exists specifically for report prompts. Re-testing prompt-filling in TC-GEN-OWN-1 with `click "<text>"` worked correctly and precisely every time (intro prompt and closing prompt both focused exactly, no merging). This strongly indicates the TC-NODE-1 "FindingsThe api package fans out…" heading corruption was caused by my own imprecise `clickxy` coordinates landing on the wrong element, not a genuine product defect. **Retracting that P1 finding** ("Typing into a section heading merges body text into it with no separator"). The corrupted heading remains in that saved report/PDF only as a byproduct of my testing error, not evidence of a product bug.
- The rest of TC-NODE-1's findings (Java/Spring library-example text, tally/prompt-count mismatch) are unaffected and stand as reported — those were confirmed via `text`/`look` output and outline inspection, not coordinate clicks.

T: `click "Why ownership is being looked at now"` → precisely focuses the intro prompt (driver's new prompt-matching) · shots/TC-GEN-OWN-1__W02-intro-focused.png
T: type + Escape → prompt replaced cleanly with typed sentence, no jump, no merge · shots/TC-GEN-OWN-1__W04-intro-filled.png
T: `click "Where one person leaving would stall work"` → precisely focuses the closing prompt · type + Escape → filled cleanly · shots/TC-GEN-OWN-1__W05-risks-filled.png

Note: the skipped Figure 3 slot now shows a clear resume affordance inline: "Take it from Activity" / "Set it yourself" buttons plus "Tab Effort" — clear and understandable (R3 check passed).

T: PDF preview → Save PDF → "Saved to …/03-Ownership_ LibreChat _TypeScript_.pdf" · shots/TC-GEN-OWN-1__P01-pdf-preview.png, shots/TC-GEN-OWN-1__P02-saved.png

PDF check (3 pages): title/provenance correct; my two typed prompts print cleanly (intro + closing); Table 1 and Table 2 readable (Table 2 correctly shows all zeros for the no-activity 180-day window rather than an error); Figure 1 and Figure 2 render; the skipped Figure 3 slot ("Where changed lines went") is correctly **not printed** anywhere in the PDF — confirms unfilled/skipped slots are cleanly omitted from export. No author names appear anywhere in the printed report, matching the "No names are written here" promise.

TC-GEN-OWN-1: done — 0 new findings (the earlier list-scroll P2 applies here too), PDF 03-Ownership_ LibreChat _TypeScript_.pdf (3 pages)

## TC-GEN-REF-1 · Refactoring case (M5 LibreChat; component prefill, then change)

T: New report → arrow-nav to "Refactoring case" → band shows tally "Writes 5 sections: 2 paragraphs explaining the terms, 1 paragraph counted from the snapshot, 3 tables, 2 figures to add from the views and 4 prompts for your reading"; Component field prefilled `api/app/clients` (matches "starts on the biggest hotspot" — api/app/clients/OpenAIClient.js was among the top hotspot files) · shots/TC-GEN-REF-1__G01-selected.png

### [P1] Component field: Cmd+A does not select existing text; typing appends/inserts instead of replacing, corrupting the value
- Test case / step: TC-GEN-REF-1 / G4
- Where: "Refactoring case" (and likely every template with a Component field) › Component text input, New report dialog (workspace LibreChat (TypeScript))
- What happened: with the Component field focused and showing its prefilled value `api/app/clients`, pressing Cmd+A (standard OS/browser select-all) followed by typing a replacement value does not replace the text — it appends the new text after the old value with no separator, e.g. typing `client/src/hooks` after Cmd+A produced `api/app/clientsclient/src/hooks`. This was reproduced twice cleanly from a known-good default value (not a one-off): both times Cmd+A silently failed to select anything, confirmed by screenshots showing no text highlighted in the field immediately after the Cmd+A keypress. The resulting garbled path is naturally "not in this snapshot", so the report visibly breaks (title, Figure 1 caption, and "component today" paragraph all show the concatenated garbage) until manually cleared character-by-character with repeated Backspace from the End position.
- Expected: Cmd+A in a plain text input should select all its text like any native browser text field, letting a user simply select-all-and-retype to change the prefilled component. A junior/any user following the template's own instruction ("Choose the component below") by clearing and retyping would silently produce a broken, garbled component name.
- Evidence: shots/TC-GEN-REF-1__tmp-clean-selectall.png (Cmd+A pressed, nothing visibly selected), shots/TC-GEN-REF-1__G05-clean-select-all-result.png (typed text appended: `api/app/clientsclient/src/hooks`)
- Repro: Evidence → Start a report → "Refactoring case" → click the Component field (prefilled `api/app/clients`) → press Cmd+A → type any new path → observe the old and new text concatenated rather than replaced.

### [P2] Canceling "New report" does not discard edits to the Component field; they resurface next time the dialog opens
- Test case / step: TC-GEN-REF-1 / G4
- Where: New report dialog › Component field, across a Cancel + reopen cycle (workspace LibreChat (TypeScript))
- What happened: after corrupting the Component field (see above finding) and clicking "Cancel" to close the dialog, reopening "New report" and reselecting "Refactoring case" did **not** restore the per-template default (`api/app/clients`) — the garbled value from the cancelled attempt was still there, and further edits appended onto that same stale garbage. Only navigating away to a different view (Overview) and back to Evidence before reopening the dialog reset the field to its correct default.
- Expected: clicking Cancel should discard the whole draft, including the Component field, so the next "New report" open starts clean for whichever template is chosen.
- Evidence: shots/TC-GEN-REF-1__G04-component-fixed.png / G04-component-fixed2.png (stale garbled value reappearing after Cancel+reopen), shots/TC-GEN-REF-1__tmp-after-navigate-reset.png (field correctly reset to `api/app/clients` only after a full view navigation)
- Repro: New report → any component template → mangle the Component field → Cancel → New report again → same template: the mangled value is still there.

T: Cmd+A retype cleanly reproduced above, then fixed manually (End + repeated Backspace + type `client/src/hooks`, Tab) → report title, "The component today" paragraph, and Figure 1 caption/selection all update correctly to `client/src/hooks` (18 files, 1,342 lines, 32 dependents, 19 dependencies, tangle of 74, code health 10.0) · expected: preview updates on blur/Tab, not per-keystroke (acceptable) · shots/TC-GEN-REF-1__G07-preview-updated.png

T: Create report → take run: slot 1 of 2 (Figure 1, Connections graph around client/src/hooks) → "Fill and next" → slot 2 of 2 (Figure 2, Cycles tangle view, Table 1 already filled with real per-file hotspot data) → "Fill and finish" → lands on Evidence, "Refactoring client/src/hooks 6 cells", Reports now 4 · shots/TC-GEN-REF-1__C01-take1.png, shots/TC-GEN-REF-1__C02-take2.png
T: filled all 4 prompts (intro, Why-now closing line, Cost and risk, Plan) via `click "<prompt text>"` → every one focused precisely and filled cleanly, no jumps · shots/TC-GEN-REF-1__R01-top.png
T: PDF preview → Save PDF → "Saved to …/04-Refactoring client_src_hooks.pdf" · shots/TC-GEN-REF-1__P01-pdf-preview.png, shots/TC-GEN-REF-1__P02-saved.png

### [P3] Typing "1)" at the start of a prompt auto-converts it into a numbered list item
- Test case / step: TC-GEN-REF-1 / R7 (Plan prompt)
- Where: Refactoring client/src/hooks › "Plan" section (workspace LibreChat (TypeScript))
- What happened: I typed the plain sentence "1) Extract hooks/chat with tests green; 2) extract hooks/auth; 3) extract hooks/ui; 4) update the 32 dependents' imports one component at a time, verified by the existing test suite after each." into the Plan prompt. The saved PDF renders it as an indented numbered-list line: "1. Extract hooks/chat with tests green; 2) extract hooks/auth; 3) extract hooks/ui; 4) update the 32 dependents' imports..." — only the leading "1)" was silently converted to "1." with list indentation; the later "2)", "3)", "4)" mid-sentence were left as plain text. A user who typed a single sentence with a leading number gets unexpected list formatting.
- Expected: either typed text prints exactly as typed, or the auto-list behavior is visible while editing (not just discovered later in the PDF).
- Evidence: 04-Refactoring client_src_hooks.pdf page 4 ("Plan" section)
- Repro: in any prompt, type a sentence starting with "1) " followed by more text, then check the PDF.

PDF check (4 pages): title/provenance correct; all 5 sections present in order; Figure 1 (neighbours graph) and Figure 2 (tangle) both render legibly; Table 1-3 readable with sensible per-file/per-component data (Table 1 sorted by hotspot descending, all code health 10 consistent with the "component today" paragraph's 10.0); all 4 typed prompts print correctly (see list-formatting finding above); no unfilled slots, no `**`/backticks elsewhere.

TC-GEN-REF-1: done — 3 findings (1 P1, 1 P2, 1 P3), PDF 04-Refactoring client_src_hooks.pdf (4 pages)

---

## Summary

The three worst problems: (1) the Component text field in every component-taking template (Refactoring case, Change impact, etc.) silently fails to select-all on Cmd+A, so the normal "select and retype" edit pattern appends garbage onto the prefilled value instead of replacing it — reproduced cleanly twice from a known-good default; Cancel on the New report dialog also fails to discard this corrupted draft, so it resurfaces on the next open. (2) The "Libraries" explanation paragraph in the JavaScript/TypeScript workspace review hard-codes a Java/Spring example (`org.springframework.web`, `java.util`) even when reviewing a pure JS/TS codebase — confirmed in both the live preview and the exported PDF. (3) Two templates' tally lines ("…and N prompts for your reading") overcount the actual number of prompts in the preview/outline by one (React front end review: promises 3, has 1; JS/TS workspace review: promises 2, has 1).

What worked well: every take run drew real, correctly-scoped data on the first try (no dead ends besides one legitimate, clearly-messaged "nothing to take" case on an old scan with zero recent commits); skipped slots are cleanly omitted from PDFs and offer a clear "Take it from X / Set it yourself" resume path; outline navigation, Cell panes, and prompt-filling (once using the right click target) all worked precisely; PDFs across all four reports were clean, well up to spec (no `**`/backticks, correct page counts, legible figures, correct provenance lines) and consistently matched the live preview and each other's cross-referenced numbers (propagation cost, commit/author counts, useLocalize usage all cross-checked against Overview and each other).

One TC-NODE-1 finding (typing merging into a section heading) was investigated further and retracted as a harness/coordinate artifact rather than a confirmed product bug — see the "HARNESS (void)" note under TC-GEN-OWN-1.

