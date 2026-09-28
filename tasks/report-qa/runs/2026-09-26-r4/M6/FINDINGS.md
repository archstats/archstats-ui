# M6 · gin (Go) — run 4 findings

Sandbox check: Evidence showed Reports 0 before creating anything. OK.
Workspace/snapshot: gin (Go), open snapshot 22 Sep, 09:53, analysis r0 — matches VERIFY-R4.

Reports created:
1. Go module review -> "Go review: gin (Go)", 12 cells. PDF: `01-Go review_ gin _Go_.pdf` (3 pages, A4, 43 KB).
2. Change impact on `binding` (prefilled) -> "Changing binding: what it affects", 4 cells, Take it -> Added 1 of 1.
   PDF: `02-Changing binding_ what it affects.pdf` (2 pages, A4, 120 KB).
3. Architecture review -> "Architecture review: gin (Go)", 10 cells, Take all -> Added 3 of 3.
   PDF: `03-Architecture review_ gin _Go_.pdf` (5 pages, A4, 220 KB).

## Checks

C3 ✓ The roles paragraph says "(root)", never a bare "."; Change impact's "Shortest import
chain" column reads "(root) -> binding", not ". -> binding".
- Go review, "Roles in the code" paragraph: "Handlers & Routes across 2 components, the most in
  **(root)** (3) and ginS (1); Middleware across 1 component, all in **(root)**; ... Models
  ... the most in **(root)** (5) and binding (2)." — no bare "." anywhere (this was still broken
  in run 3).
- Change impact on binding, Table 2 "Components that depend on binding": Component = "(root)",
  Shortest import chain = "**(root) -> binding**" (previously ". -> binding").
- Evidence: report text captures above; PDFs `01-Go review_ gin _Go_.pdf` and
  `02-Changing binding_ what it affects.pdf`.

C4 ✗ [P2] The page before the dependency-structure figure is still left substantially empty.
- Architecture review PDF, page 1: "The system at a glance" + "Structure: how the parts depend
  on each other" heading and its full lead-in paragraph print, ending partway down the page (last
  text row at ~379 of 702 px height), then the rest of page 1 is blank space down to the footer —
  measured at ~40% of the full page height (~43% of the content area) left empty. Figure 1
  "Dependency structure" starts fresh at the top of page 2 instead of beginning on page 1.
- This is the same shape of problem the check names ("PDF gap"): the heading+paragraph that
  introduces the figure stays with a large trailing blank instead of either the figure starting
  on page 1 or the heading moving down with it.
- Evidence: pages/pg-1.png (page 1, large blank area under the "Structure" paragraph),
  pages/pg-2.png (Figure 1 + Table 1 start fresh on page 2); PDF `03-Architecture review_ gin
  _Go_.pdf`.
- Repro: gin (Go) -> Architecture review -> Take all -> PDF preview / Save PDF -> look at page 1.

## NEW findings

### [P3, low confidence] "Structs that cross a boundary" tables are empty on this snapshot, where run 3 found rows
- Test case / step: incidental, while reading the Go review for C3
- Where: Go review -> Table 4 "Tagged structs by package" and Table 5 "Structs tagged for the
  most formats" (gin (Go), snapshot 22 Sep, 09:53 — the same snapshot date used in run 3)
- What happened: both tables render with headers only and no rows ("Add a caption" placeholder
  showing, no data). Run 3's FINDINGS.md (M6-4) recorded Table 5 listing two rows, `Test` and
  `Test_OptionalGroup`, both in `testdata/protoexample`, sourced from the generated
  `testdata/protoexample/test.pb.go`. Units search for "protoexample" in this run now shows that
  module's role as "Unclassified" rather than the tagged-struct/Model classification implied by
  run 3's table.
- Expected: unclear whether this is a regression (structs that used to count as tagged no longer
  do) or an intentional change (e.g. generated files now excluded from "production" for this
  table). Flagging as low-confidence since I could not fully trace the cause within budget —
  worth a follow-up look at whether generated-file exclusion or struct-tag detection changed
  between run 3 and run 4's build.
- Evidence: shots/M6__check-table45.png (empty Table 4 and Table 5); PDF `01-Go review_ gin
  _Go_.pdf` pages 1-2 (via pdftotext) also show both tables with no rows.
- Repro: gin (Go) -> Go module review -> Create -> scroll to "Structs that cross a boundary".

## Summary

C3: done — fixed (0 findings)
C4: done — still broken (1 finding, P2, carried from "PDF gap")
Incidental: 1 new finding (P3, low confidence, needs follow-up)
