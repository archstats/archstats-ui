# M6 - gin (Go) - findings

Sandbox check: Evidence showed Reports 0 before creating anything. OK.
Workspace/snapshot: gin (Go), open snapshot 22 Sep, 09:53, analysis r0 (4 snapshots available; the open one is the pinned sandbox snapshot).

Reports created:
1. "Go module review" -> "Go review: gin (Go)", 12 cells, all query-cell tables (no figures). PDF saved: `02-Go review_ gin _Go_.pdf` (3 pages, A4, 44 KB).
2. "Change impact" with component "binding" (the prefilled value) -> "Changing binding: what it affects", 4 cells, Take it -> Figure 1 taken, landing box read "Figures added / Added 1 of 1."
3. "Change impact" with the Component field cleared -> "Changing a component: what it affects", 1 cell (no figure slot offered since nothing is selected). PDF saved: `01-Changing a component_ what it affects.pdf` (1 page, A4, 22 KB).

## Checks

M6-1 (partly fixed) "N packages" in the paragraph matches the table row count, but the root package is only "(root)" in table cells, not in prose:
- Paragraph: "The code builds as 1 Go module with 8 packages, 2 of them internal." Table 2 "What each package holds" has exactly 8 rows: (root), binding, codec/json, ginS, internal/bytesconv, internal/fs, render, testdata/protoexample. Counts match.
- Table 2's Package column, and Table 6's Package column, both correctly print "(root)" for the root package (shot: shots/M6__R01-root-package-inconsistency.png).
- BUT the "Roles in the code" narrative paragraph (same report, same section) still prints the bare "." three times: "Handlers & Routes across 2 components, the most in . (3) and ginS (1); Middleware across 1 component, all in .; ... Models ... the most in . (5) and binding (2)." (shot: shots/M6__R02-roles-paragraph-dot.png; also present in the saved PDF, page 1: "the most in . (3) and ginS (1)").
- The same inconsistency recurs in the Change impact report: Table 2 "Components that depend on binding" shows Component = "(root)" but, in the same row, "Shortest import chain" = ". -> binding" (shot: shots/M6__R03-change-impact-root-dot.png).
- Filed as a NEW finding below.

M6-2 (checked) Libraries: "The most widely imported are github.com/stretchr/testify (in 35 files), github.com/ugorji/go (in 5 files) and github.com/gin-contrib/sse (in 3 files)." Dots print correctly, matches the fix.

M6-3 (checked, partly) Change impact on binding (1 direct dependent): paragraph "1 production component imports it directly" matches Table 1 "How far a change to binding can reach" exactly: Steps away 1 -> Components 1. Second half of the check ("no direct import says '2 steps away'") could not be exercised: gin is a very small, shallow package graph (8 packages), and every component tried (binding: 1 direct; internal/fs: 2 direct; codec/json: 3 direct; ginS: 0 direct AND 0 indirect, fully isolated) has either direct dependents or none at all - none has dependents that are indirect-only. Recorded as "could not tell" rather than guessed.

M6-4 (checked) "Structs tagged for the most formats" (Table 5) lists only Test and Test_OptionalGroup, both in testdata/protoexample. Looked the module up in Units (search "protoexample"): it resolves to file `testdata/protoexample/test.pb.go` - a generated protobuf file, not a `*_test.go` file. No test-file structs appear in the table.

M6-5 (checked) Change impact with the Component field left empty: Create still works ("Changing a component: what it affects", 1 cell). The unfilled paragraph shows only the prompt "Choose a component for this paragraph." in the UI (grey italic, never printed). Saved and read the PDF directly (`pdftotext`): headings "The component" and "Before you change it" print with nothing under them - no "Choose a component" text, no `undefined`, no crash.

## NEW findings

### [P2] Root package prints as the raw "." outside table cells, inconsistent with the fixed "(root)" table cells
- Test case / step: M6-1 / R, M6-3 / R
- Where: Go module review -> "Roles in the code" paragraph (gin (Go), snapshot 22 Sep 09:53); Change impact on `binding` -> Table 2 "Components that depend on binding", "Shortest import chain" column
- What happened: Table 2 and Table 6 of the Go review correctly print the root package as "(root)". But the prose paragraph right below Table 2 ("Roles in the code") prints the bare "." three times: "the most in . (3) and ginS (1)", "all in .;", "the most in . (5) and binding (2)." Separately, in the Change impact report's Table 2, the Component column reads "(root)" while the adjacent "Shortest import chain" column in the same row reads ". -> binding".
- Expected: per the improvement plan ("the root package '.' is counted everywhere and shown as '(root)'"), every place the root package is named - table cells, prose, chain descriptions - should say "(root)", not the bare path.
- Evidence: shots/M6__R01-root-package-inconsistency.png, shots/M6__R02-roles-paragraph-dot.png, shots/M6__R03-change-impact-root-dot.png; also reproduces in the saved PDF `02-Go review_ gin _Go_.pdf`, page 1 ("the most in . (3) and ginS (1)").
- Repro: create the Go module review on gin (Go); read the "Roles in the code" paragraph. Or create Change impact on `binding`; read Table 2's "Shortest import chain" column.

### [P2] Table header cells wrap mid-word in the PDF (same bug as seen on M5/LibreChat)
- Test case / step: M6-1 / P (PDF check)
- Where: Go module review -> Table 1 "Modules", Table 3 "Packages by how many others import them", Table 4 "Tagged structs by package" (gin (Go), snapshot 22 Sep 09:53)
- What happened: multi-word column headers break inside a word with no hyphen: "Depend" / "s on" / "(interna" / "l)" for "Depends on (internal)" (Table 1), "Packag" / "es" / "importin" / "g it" for "Packages importing it" (Table 3), "Tagge" / "d" / "struct" / "s" for "Tagged structs" (Table 4).
- Expected: header text wraps at a space, or the column widens/shrinks type further, per the improvement plan's "wide tables are set smaller instead of dropping columns." This is the same pattern already reported for M5 (LibreChat) - flagging here since it reproduces on a completely different template and workspace, so it looks like a general PDF table-header layout bug rather than a one-off.
- Evidence: PDF `02-Go review_ gin _Go_.pdf`, pages 1-2 (via `pdftotext -layout`).
- Repro: create the Go module review on gin (Go), open PDF preview / Save PDF, look at Table 1, 3 or 4's header row.

## Summary

Four of the five checks pass cleanly: the Go package count matches its table, `github.com/stretchr/testify` prints with dots, the change-impact math for a component with one direct dependent is internally consistent, and the tagged-structs table correctly excludes `_test.go` files (the two structs shown come from a generated `test.pb.go`, not a test file). The empty-component change-impact report also behaves well: it's still creatable and the unfilled prompt never leaks into the PDF. The one check that's only partly fixed is the root-package naming: tables now correctly show "(root)", but the same report's narrative paragraph and the change-impact "shortest import chain" column still print the bare "." - so the fix from the improvement plan is real but incomplete. The PDF table-header mid-word-wrap bug already seen on M5 reproduces here too, on unrelated tables, which suggests it's a general column-width/wrapping issue rather than specific to one template.
