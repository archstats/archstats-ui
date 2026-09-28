# M5 · LibreChat (TypeScript) — findings

Sandbox check: Evidence showed Reports 0 before creating anything. OK.
Workspace/snapshot: LibreChat (TypeScript), snapshot 21 Sep, 23:56, analysis r0 — matches TEST-PLAN table.

Report created: "React front end review" -> "Front end review: LibreChat (TypeScript)", 15 cells.
Take all -> both figures taken (Figure 1 from Units, Figure 2 from Hotspots); landing box read "Figures added / Added 2 of 2."
PDF saved: `01-Front end review_ LibreChat _TypeScript_.pdf` (8 pages, A4, 702 KB).

## Checks

M5-1 (checked) React component counts are close across the three places, and each says which numbers:
- Gallery band: "Found: 628 React components, react imported in 535 files" (shot: shots/M5__G01-gallery.png)
- Front-end paragraph: "The production code holds 623 React components: functions named in Pascal case in .tsx and .jsx files."
- Roles paragraph and the folders-table paragraph both: "604 Components (named in Pascal case, in a .tsx or .jsx file)"
All three sit in the 604-628 range (under 4% apart), and the paragraphs explain the different counting rule (regex over all files vs. the role-detector's outside-tests count), so the gap reads as intentional, not a contradiction.

M5-2 (checked) No instance of "No reference runs between two roles" appears anywhere in this report. The layers paragraph ("Do drawing, state and data stay apart?") instead prints real counts: "Read from the top, React code runs Components -> Hooks -> Data & Clients -> Types & Models. Between classes in those roles, 62 references go one step down that order. 20 skip a layer... 57 run back up..." -- i.e. this snapshot does record which classes use which (a.linked true), so the fallback wording never had to fire. Checked the source directly: frontend/src/features/reports/anatomy.ts:228 now gates the new wording ("This snapshot does not record which classes use which, so the references between roles cannot be counted. A newer scan records them.") behind !a.linked, and the old string (anatomy.ts:229) only fires when links exist but the count is truly zero -- the two cases are no longer conflated. Grep confirms this is the only call site in the codebase.

## NEW findings

### [P2] Table header cells wrap mid-word instead of at a word boundary, in the PDF
- Test case / step: M5-1 / P (PDF check)
- Where: React front end review -> Table 1 "Folders by React components and hooks", Table 2 "Hooks used outside their own folder", Table 4 "Hotspot files", Table 5 "Least healthy files" (LibreChat (TypeScript), snapshot 21 Sep 23:56)
- What happened: multi-word column headers break inside a word with no hyphen: "React componen" / "ts" (Table 1), "Other functio" / "ns and" / "types" (Table 1), "Folde" / "rs using" / "it" and "Functio" / "ns using" / "it" (Table 2), "Cod" / "e" / "Healt" / "h" (Table 4/5 "Code Health" split across four lines), "Hotsp" / "ot" / "Score" and "Comm" / "it" / "Count" (Table 4/5).
- Expected: header text wraps at a space ("React" / "components"), or the column widens/shrinks type further, per the improvement plan's "wide tables are set smaller instead of dropping columns."
- Evidence: PDF `01-Front end review_ LibreChat _TypeScript_.pdf`, pages 2, 3, 6, 8.
- Repro: create the React front end review on LibreChat (TypeScript), Take all, open PDF preview / Save PDF, look at Table 1, 2, 4 or 5's header row.

### [P2] A section heading can print alone at the bottom of a page, separated from its table
- Test case / step: M5-1 / P (PDF check)
- Where: React front end review -> "Components and hooks by folder" heading (page 1, last line) -> Table 1 itself starts on page 2 (LibreChat (TypeScript), snapshot 21 Sep 23:56)
- What happened: unlike the other table sections (which pair a heading with an explanatory paragraph before the table, keeping something substantial with the heading), "Components and hooks by folder" has no lead-in sentence, so the heading sits by itself as the last line of page 1 while its table jumps to page 2.
- Expected: per the improvement plan ("a heading or lead-in sentence stays on the page with its table or figure"), the heading should move down to page 2 with its table rather than being orphaned alone at the bottom of page 1.
- Evidence: PDF `01-Front end review_ LibreChat _TypeScript_.pdf`, page 1 (heading at bottom) / page 2 (Table 1 at top).
- Repro: same report; look at the page break right after the "Roles in the code" paragraph.

## Summary

Both VERIFY-R3 checks for M5 pass: the three React-component counts are close enough to read as consistent, and the "no reference runs" wording bug is confirmed fixed (both in the UI -- real reference counts print -- and in the source, where the new message is correctly gated behind whether the snapshot actually links classes). The run (Take all -> 2 of 2) and the PDF export worked cleanly with no missing data, wrong numbers, or undefined/NaN. The two new findings are both PDF layout polish issues: table headers with multi-word column names wrap mid-word rather than at a space, and one table heading with no lead-in paragraph can be separated from its table across a page break. Neither affects correctness of the data, only the PDF's readability.
