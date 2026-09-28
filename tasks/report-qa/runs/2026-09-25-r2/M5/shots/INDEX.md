# Shot index — M5 (LibreChat (TypeScript)), run 2

| File | Caption |
| --- | --- |
| TC-REACT-1__G01-gallery-open.png | Gallery first opens (mission-level shot); "For LibreChat" group visible with React/JS-TS templates |
| TC-REACT-1__G02-band-and-roles.png | React front end review band + "Roles in the code" paragraph, code chips render fine |
| TC-REACT-1__G03-preview-end.png | Preview scrolled to the very bottom — only the "Findings" prompt visible (tally promises 3) |
| TC-REACT-1__C01-take-figure1.png | Take run 1 of 2: Units boundary-flow view already drawn for Figure 1 |
| TC-REACT-1__C02-take-figure2.png | Take run 2 of 2: Hotspots-by-directory view, Table 4 already filled |
| TC-REACT-1__L01-landing.png | Landing after the run: report open, all 15 cells filled |
| TC-REACT-1__R01-top.png | Report top after scrolling back up |
| TC-REACT-1__R02-outline-jump-findings.png | Outline click on "Findings" scrolls correctly to that section |
| TC-REACT-1__R03-top-after-jump.png | Report top, re-check before Cell pane clicks |
| TC-REACT-1__R04-cellpane-paragraph.png | Cell pane for a computed paragraph — clear explanation |
| TC-REACT-1__R05-table1-view.png | Table 1 with readable headers + Cell pane showing its SQL query |
| TC-REACT-1__W01-prompt-before.png | "Findings" prompt before editing (grey italic) |
| TC-REACT-1__W02-prompt-focused.png | Prompt correctly focused (caret visible) |
| TC-REACT-1__W03-prompt-typing.png | Prompt replaced cleanly while typing |
| TC-REACT-1__W04-prompt-after.png | Prompt after Escape, text kept, no jump |
| TC-REACT-1__P01-pdf-preview.png | PDF preview sheet, 7 pages, A4 |
| TC-REACT-1__P02-saved.png | "Saved to …" line after Save PDF |
| TC-NODE-1__G01-template-selected.png | JS/TS workspace review band selected, tally "2 prompts" |
| TC-NODE-1__G02-scroll-check.png | Preview bottom — only "Findings" prompt visible (tally promises 2) |
| TC-NODE-1__G03-packages-section.png | "Libraries" explanation uses Java/Spring example (org.springframework, java.util) on a JS/TS report |
| TC-NODE-1__C01-take-figure1.png | Take run 1 of 2: Connections graph view for Figure 1 |
| TC-NODE-1__C02-take-table4.png | Take run 2 of 2: Libraries view, Table 4 already filled ("api" flagged "Looks internal: yes") |
| TC-NODE-1__R01-top.png | Report landed, 13 cells |
| TC-NODE-1__R02-roles.png | "Roles in the code" auto-detects React profile inside the generic JS/TS template |
| TC-NODE-1__W01-prompt-before.png | "Findings" prompt before editing |
| TC-NODE-1__W02-prompt-after.png | Misclick merged typed text into the "Findings" **heading** instead of the prompt (see void note in FINDINGS.md — later traced to imprecise clickxy coordinates, not a confirmed product bug) |
| TC-NODE-1__W03-heading-bug.png | Confirms corrupted heading state persisted after a stray click elsewhere |
| TC-NODE-1__W03b-check.png / W03c-check.png / W03d-check.png | Diagnostic clicks trying to relocate the corrupted heading text |
| TC-NODE-1__W03e-fixed.png | Heading text restored to plain "Findings" via select-all + retype |
| TC-NODE-1__W04-outline-jump.png | Outline entry still reads "FindingsThe api package fans…" before the fix landed on the real prompt |
| TC-NODE-1__W05-precise-click.png | Real prompt correctly focused this time (caret at "What you found…") |
| TC-NODE-1__W06-final.png | Real prompt filled cleanly, corrupted heading left as-is above it |
| TC-NODE-1__P01-pdf-preview.png | PDF preview sheet, 5 pages |
| TC-NODE-1__P02-saved.png | "Saved to …" line after Save PDF |
| TC-GEN-OWN-1__tmp-list.png | Template gallery list, "Onboarding guide" is the last visible item |
| TC-GEN-OWN-1__tmp-list2.png | Same list after two mouse-wheel scroll attempts — no change (scroll does not work) |
| TC-GEN-OWN-1__tmp-list3.png | List after ArrowDown keyboard nav — "Ownership and knowledge" now visible and selected |
| TC-GEN-OWN-1__G02-preview-mid.png | "No names are written here" + "four fifths" wording, Table 1/Figure 2 slot cards |
| TC-GEN-OWN-1__G03-preview-end.png | Preview end — "Risks and actions" prompt, 2 prompts total matches tally |
| TC-GEN-OWN-1__C01-take1.png | Take run 1 of 4: Activity view (Commits tab) for Figure 1 |
| TC-GEN-OWN-1__C02-take2.png | Take run 2 of 4: Authors view, Table 1 "Knowledge by component" (no name column selected) |
| TC-GEN-OWN-1__C03-take3.png | Take run 3 of 4: Metrics component plot, Authors vs Churn preset |
| TC-GEN-OWN-1__C04-take4.png | Take run 4 of 4: Activity Effort tab, waiting/loading state |
| TC-GEN-OWN-1__C05-take4-nothing.png | "Activity drew nothing to take; set it, then add it" — clear can't-take message |
| TC-GEN-OWN-1__L01-landing.png | Landing after Skip: 8 cells, "Take 1 figure" resume button in toolbar |
| TC-GEN-OWN-1__W01-intro-prompt.png | Report top with intro prompt, Figure 1 chart rendered |
| TC-GEN-OWN-1__W02-intro-focused.png | Old clickxy attempt on intro prompt (no visible focus change) |
| TC-GEN-OWN-1__W03-intro-after.png | Confirms the clickxy attempt had no effect (harness coordinate issue) |
| TC-GEN-OWN-1__W04-intro-filled.png | Intro prompt correctly filled after switching to `click "<text>"` |
| TC-GEN-OWN-1__W05-risks-filled.png | Closing "Risks and actions" prompt correctly filled; skipped Figure 3 shows "Take it from Activity / Set it yourself" |
| TC-GEN-OWN-1__P01-pdf-preview.png | PDF preview sheet, 3 pages |
| TC-GEN-OWN-1__P02-saved.png | "Saved to …" line after Save PDF |
| TC-GEN-REF-1__G01-selected.png | Refactoring case selected, Component prefilled `api/app/clients` |
| TC-GEN-REF-1__G02-component-changed.png | Cmd+A + type appended instead of replacing: `api/app/clientsclient/src/components/svg` |
| TC-GEN-REF-1__G03-component-fixed.png | Backspace-clear left one stray "svg" behind: `client/src/components/svgsvg` |
| TC-GEN-REF-1__G04-component-fixed2.png | Second clear attempt (shift+Home) produced worse concatenation — confirms clearing is unreliable |
| TC-GEN-REF-1__tmp-after-navigate-reset.png | Field only resets to the correct default after a full view navigation, not Cancel |
| TC-GEN-REF-1__tmp-clean-selectall.png | Clean retest: Cmd+A pressed on a fresh, known-good field — nothing visibly selected |
| TC-GEN-REF-1__G05-clean-select-all-result.png | Clean retest result: typed text appended (`api/app/clientsclient/src/hooks`), confirms the bug |
| TC-GEN-REF-1__G06-component-clean.png | Field correctly cleared via End + repeated Backspace, then retyped |
| TC-GEN-REF-1__G07-preview-updated.png | Preview correctly updates to `client/src/hooks` after Tab |
| TC-GEN-REF-1__G08-preview-mid.png | Preview scroll showing all 4 prompts (intro, why-now, cost-and-risk, plan) — matches tally |
| TC-GEN-REF-1__C01-take1.png | Take run 1 of 2: Connections graph around client/src/hooks |
| TC-GEN-REF-1__C02-take2.png | Take run 2 of 2: Cycles tangle view, Table 1 already filled with per-file data |
| TC-GEN-REF-1__R01-top.png | Report top: intro prompt filled, Figure 1 graph legible |
| TC-GEN-REF-1__P01-pdf-preview.png | PDF preview sheet, 4 pages |
| TC-GEN-REF-1__P02-saved.png | "Saved to …" line after Save PDF |
