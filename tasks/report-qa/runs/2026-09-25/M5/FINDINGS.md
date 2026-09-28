# M5 findings — LibreChat (TypeScript), http://localhost:4305/

Sandbox check: Evidence -> Reports read `0` before the first report. OK, proceeding.

---

### [P2] Snapshot named by three different times in one report
- Test case / step: TC-REACT-1 / R1, P3
- Where: React front end review -> report header and PDF (workspace LibreChat (TypeScript), snapshot commit 5 Jun 2025 05:11, scanned 21 Sep 23:56)
- What happened: the report header reads "Runs on 5 Jun 2025, 05:11 - analysis r0"; the sidebar's snapshot button reads "Snapshot from 21 Sep, 23:56, open, 113 MB"; the saved PDF's provenance line reads "Written with Archstats Desktop dev - 25 Sept 2026". Three different dates, all describing the same one snapshot/report, with no label telling a reader which is "when the code was last changed" vs "when we scanned it" vs "when this PDF was made".
- Expected: a junior reading the PDF or the report page should be able to tell, without guessing, which date is the commit time of the code and which is when the scan ran. At minimum the header's "Runs on 5 Jun 2025, 05:11" should say what kind of date it is (e.g. "the code as of its last commit, 5 Jun 2025").
- Evidence: shots/g3-react-band.png, 01-Front end review_ LibreChat _TypeScript_.pdf page 1
- Repro: create any template on LibreChat (TypeScript) and compare the report header's "Runs on ..." date with the sidebar's snapshot button and the PDF's "Written with..." line.

### [P2] Code Health prints as a bare integer for every row in one table, decimals in the next
- Test case / step: TC-REACT-1 / R2, P3
- Where: React front end review -> Table 4 "Hotspot files" (workspace LibreChat (TypeScript))
- What happened: all 10 rows of Table 4 show Code Health as exactly `7` -- client/src/style.css (2,753 lines, hotspot 100), api/typedefs.js (1,978 lines, hotspot 62.62), ... api/app/clients/AnthropicClient.js (992 lines, hotspot 30) -- ten files of very different size and hotspot score, all reading precisely "7" with no decimal. Table 5 ("Least healthy files") in the same report shows decimals for other files (4, 5.5, 6.71, 7.3, 7.4, 7.6), so the underlying metric clearly carries decimal precision elsewhere in the same report.
- Expected: either Code Health should show its real decimal value in Table 4 too, or (if these ten files genuinely all round to 7.0) that coincidence is surprising enough to double check.
- Evidence: shots/r2-table4-hotspot-health.png, 01-Front end review_ LibreChat _TypeScript_.pdf page 3
- Repro: create "React front end review" on LibreChat (TypeScript), open Table 4 "Hotspot files", read the Code Health column.
- Note: could not tell whether this is a real value or a display/rounding bug -- did not read source code.

### [P3] SQL-off notice runs into the table caption with no punctuation
- Test case / step: TC-REACT-1 / P3
- Where: React front end review -> Table 1 "Folders by React components and hooks" (and Tables 2, 3), PDF page 1
- What happened: the printed caption reads as one run-on sentence: "Table 1. Folders by React components and hooks The SQL console is switched off for this run." -- no full stop or line break between the table's own title and the reason it has no rows.
- Expected: the two pieces of text (caption, and why the table is empty) should be visually or grammatically separated, e.g. "Table 1. Folders by React components and hooks. (The SQL console is switched off for this run.)"
- Evidence: pages/01-p1-1.png
- Repro: create any template whose tables depend on the SQL console in a sandbox where it's switched off, then save the PDF.

TC-REACT-1: done -- 3 findings, PDF `01-Front end review_ LibreChat _TypeScript_.pdf`. HARNESS (void): Tables 1-3 showing no rows was the SQL console being off in this sandbox, not a product bug -- re-verified below after the facilitator turned the SQL console on and the session was restarted. Figure 1 (Sankey) and Figure 2 (treemap) both rendered and were legible in the PDF.

### [P2] "Libraries" table's top row is an internal folder, not a library
- Test case / step: TC-NODE-1 / R2, P3
- Where: JavaScript/TypeScript workspace review -> Table 4 "Libraries" (workspace LibreChat (TypeScript))
- What happened: Table 4 is titled "Libraries" and its prose says "Libraries are code the project uses but did not write... a possible source of security issues". Sorted by Imports, the very first row is `api` (891 imports, 450 files) -- more than double `react`'s 536 imports, which is second. `api` is LibreChat's own backend folder, not an npm package; the table's own "Looks internal" column correctly marks it "yes". Row 10, `packages/data-provider`, is also "Looks internal: yes" and is likewise an internal folder, not a dependency. Both appear in the PDF unfiltered.
- Expected: a table whose stated purpose is "code the project uses but did not write" should not put internally-looking folders at the top of a dependency-risk list ahead of real third-party packages, or should filter/group them out of the default sort so a reader isn't led to think "api" is the project's single biggest dependency.
- Evidence: shots/r2-node-libraries-internal.png, 02-Workspace review_ LibreChat _TypeScript_.pdf page 3
- Repro: create "JavaScript/TypeScript workspace review" on LibreChat (TypeScript), take Table 4 "Libraries" from the Libraries view, sort by Imports (default).

TC-NODE-1: done -- 1 finding, PDF `02-Workspace review_ LibreChat _TypeScript_.pdf`. HARNESS (void): Tables 1-3 and Table 3 "Tangles" showing no rows was the SQL console being off in the sandbox, not a product bug -- re-verified after the facilitator turned the SQL console on; see the redo below. Figure 1 (Sankey dependency structure) rendered and was legible.

### [P1] Table and paragraph disagree on the same folder's component count
- Test case / step: TC-REACT-1 (redo after SQL console fix) / R1, R2
- Where: React front end review -> "Components and hooks by folder", Table 1 vs the computed paragraph right below it (workspace LibreChat (TypeScript))
- What happened: Table 1's query result gives `client/src/components/svg` 74 React components, `client/src/components/ui` 71, `client/src/components/Prompts` 30. The computed paragraph immediately under the table, about the same folders, says "the most in client/src/components/svg (72), client/src/components/ui (52) and client/src/components/Prompts (28)". All three numbers disagree with the table directly above them (74 vs 72, 71 vs 52, 30 vs 28). The table also lists 103 folders total ("25 of 103") while the paragraph says the components are spread "across 94 components".
- Expected: the table and the paragraph describing the same evidence in the same section of the same report should count the same thing the same way, or the report should explain why they differ (e.g. one counts nested subfolders, the other doesn't).
- Evidence: shots/r1-table1-vs-prose-mismatch.png, 03-Front end review_ LibreChat _TypeScript_.pdf (redo) page 1
- Repro: create "React front end review" on LibreChat (TypeScript) (with SQL console on), open Table 1 "Folders by React components and hooks" and compare its top rows with the "Components and hooks by folder" paragraph directly below.

### [P3] "Tangles" table names each cycle after one folder, not the group
- Test case / step: TC-NODE-1 (redo after SQL console fix) / R2
- Where: JavaScript/TypeScript workspace review -> Table 3 "Tangles" (workspace LibreChat (TypeScript))
- What happened: Table 3's column is headed "tangle" but each row's value is a single folder path (`client/src/Providers` 74, `api/app` 65, `client/src/components/Files` 3, `packages/data-provider/src` 2). The prose above says a tangle is "a group of components that depend on each other in a circle" of up to 74 components, so `client/src/Providers` here is only one member of a 74-component cycle, not "the tangle" itself, but the table reads as if it names the whole thing.
- Expected: label the row as something like "Tangle 1 (rooted near client/src/Providers)" or add a column explaining that the folder is a representative member, so a junior doesn't think a single folder contains 74 components.
- Evidence: 04-Workspace review_ LibreChat _TypeScript_.pdf (redo)
- Repro: create "JavaScript/TypeScript workspace review" on LibreChat (TypeScript) (SQL console on), open Table 3 "Tangles".

TC-REACT-1 / TC-NODE-1 redo: done -- SQL console confirmed working (Tables 1-3 now show real rows in both reports); 2 new findings above (P1 number mismatch, P3 tangle naming). PDFs `03-Front end review_ LibreChat _TypeScript_.pdf`, `04-Workspace review_ LibreChat _TypeScript_.pdf`.

### [P1] Report prose commit/author totals do not match the view they're taken from (bot commits silently included/excluded)
- Test case / step: TC-GEN-OWN-1 / C2, R1
- Where: Ownership and knowledge -> "History" paragraph vs Figure 1 "Work over time" (taken from the Activity view), workspace LibreChat (TypeScript)
- What happened: the report's "History" paragraph says "The history reaches back 16 months: 1,808 commits by 147 authors." The Activity view it takes Figure 1 from, visible on the very same screen while taking that figure, reads "Commits 1,771 · Authors 145" and separately notes "37 bot commits hidden". 1,808 minus 1,771 is exactly 37 -- so the paragraph counts bot commits and the view it's illustrating does not, with nothing in the report explaining the gap.
- Expected: the paragraph and the figure it introduces should agree on the same history, or the report should say plainly that bot commits are counted in the prose but filtered from the chart (or vice versa).
- Evidence: shots/c2-own-commit-count-mismatch.png (dialog partly covers the background Activity numbers; full values were visible in the accessibility tree: "Commits 1,771 · Authors 145" and "37 bot commits hidden")
- Repro: create "Ownership and knowledge" on LibreChat (TypeScript), start taking Figure 1 "Work over time" from Activity, and compare the report's "History" paragraph with the Activity toolbar stats and its "N bot commits hidden" note.

TC-GEN-OWN-1: done -- 1 finding (the P1 commit-count mismatch above), PDF `05-Ownership_ LibreChat _TypeScript_.pdf`. Worked well: the report's promise "No names are written here" held all the way to the PDF -- Table 1 and the prose never print an author name, even though the live Authors/Activity views used to build the figures show names freely. Figure 3 "Where changed lines went" could not be taken (Activity's default 90-day window is empty this far after the snapshot's last commit; message was "Activity drew nothing to take; set it, then add it") -- skipped per procedure, and the PDF correctly left it out with no trace of the prompt or an empty slot.

### [P3] Gallery preview does not refresh while typing in the Component field
- Test case / step: TC-GEN-REF-1 / G4
- Where: Refactoring case gallery dialog, Component field (workspace LibreChat (TypeScript))
- What happened: the field prefills with `api/app/clients` (the biggest hotspot) and the preview pane shows its stats. Clearing the field and typing `api/app/clients/agents` character by character left the preview showing the old component's numbers throughout typing; it only updated ("holds 1 file and 8 lines...") after pressing Tab to leave the field.
- Expected: either update the preview as the user types (debounced), or show some visual cue (e.g. a loading state) that the preview is stale until the field is committed, so a user doesn't read outdated numbers as current.
- Evidence: verified via accessibility-tree snapshots before/after Tab in this session (see repro)
- Repro: open "New report" -> Refactoring case on LibreChat (TypeScript), clear the Component field, type a different valid component name, and read the preview before tabbing out.

TC-GEN-REF-1: done -- 1 finding, PDF `06-Refactoring api_app_clients_agents.pdf`. Changing the component (api/app/clients -> api/app/clients/agents, picked from the suggestion list) correctly renamed the report ("Refactoring api/app/clients/agents") and rewrote every stat once committed. The chosen component turned out tiny (1 file, 8 lines) -- the report handled that honestly (low file count, no padding), which is a good sign. Figure 2's 65-component tangle matrix prints legibly at PDF size but with small row/column labels; still readable with the highlighted row.

---

## Summary

Three worst problems: (1) the two P1s are both "numbers disagree on the same page" bugs — a table and the paragraph right below it counting the same folders differently (React front end review, Table 1), and a report's commit/author totals silently including bot commits that the figure it introduces excludes (Ownership and knowledge) — both are exactly the kind of thing that would make a reader stop trusting the report. (2) The "Libraries" table ranks LibreChat's own `api` folder above `react` by import count, in a table whose whole point is flagging third-party dependency risk. (3) Snapshot time is given three different ways across one report (commit time in the header, scan time in the sidebar, PDF-generation date in the footer) with no label distinguishing them.

What worked well: the "Ownership and knowledge" template's promise "No names are written here" held everywhere, including the PDF, even though the live views it pulls figures from show names freely. Templates that hit an empty slot (Figure 3 in Ownership; Table 4 "Libraries" oddities) explained themselves clearly and left the printed PDF honestly incomplete rather than faking data. Figures rendered legibly in every saved PDF.
