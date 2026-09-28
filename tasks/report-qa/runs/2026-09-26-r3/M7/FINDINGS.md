# M7 · nopCommerce (.NET, r0) — port 4407

Sandbox check: Reports count read `0` before the first report was created. OK.

## Checks

M7-1 ✓ Gallery default is the .NET review: in "New report", under "For nopCommerce" the
selected (highlighted) option is `.NET solution review · Found: 40 .NET projects`, above
`JavaScript/TypeScript workspace review`. (shot: G02-dotnet-selected.png)

M7-2 ✓ JS/TS review makes no claim of React components. Created "JavaScript/TypeScript
workspace review" (renamed by the template to "Workspace review: nopCommerce"). The "Roles in
the code" section reads: "Archstats reads this as By structure. The code outside tests
declares 3,828 classes: 165 Entry points ..., 803 Logic, 72 Data access ... and 1,242 Models
..., and 1,546 that match no rule." No mention of "React" anywhere in the report text or the
saved PDF (grep -in react on both returned nothing). (shot: R03-jsts-roles.png; PDF
"03-Workspace review_ nopCommerce.pdf")

M7-3 ✗ [P1] lib_npm/elfinder (third-party, vendored JS widget) is still listed in the
"Least healthy components" table of the Architecture review, both in the lead-in sentence and
as the top row of the table:
"Among components of 200 lines or more, the lowest rated are
src/Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js (1.1), Nop.Web.Framework.Menu (2.7)
and Nop.Services.ExportImport (2.8)."
Table 4 "Least healthy components" row 1: src/Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js
Code Health 1.07, Line Count 36,049, Hotspot Score 0.
The table's own caption says "Production code only. This scan did not sort its files, so tests
and vendored code are recognised by their path (test folders, *_test.go, *Test.java,
*.spec.ts, vendor)." — the pattern list does not include nopCommerce's lib_npm vendoring
convention, so this third-party bundled library still counts as production code health.
Present on screen and in the saved PDF (page 2, Table 3 there). (shot:
R04-arch-table4-elfinder.png; PDF "01-Architecture review_ nopCommerce.pdf" page 2)

M7-4 ✓ .NET review "Roles and layers": "This snapshot does not record which classes use
which, so the references between roles cannot be counted. A newer scan records them." — present
on screen and in the saved PDF ("02-.NET review_ nopCommerce.pdf").

M7-5 ✓ With the Cell pane closed, Table 1 ("Projects, the most referenced first") shows all 5
columns: Project, Directory, Files, Referenced by projects, References. With the panel open the
last column ("References") is cut off mid-word ("Referenc…"), but closing the panel gives the
table full width and all columns read cleanly. (shots: R01-table1-panel-open.png,
R02-table1-panel-closed.png)

## NEW findings

### [P1] Third-party vendored JS still counted as "production" in code-health table (nopCommerce)
- Test case / step: M7-3
- Where: Architecture review › Code health › Table 4 "Least healthy components" (and its
  lead-in sentence) (workspace nopCommerce, snapshot 21 Sep 22:46, analysis r0)
- What happened: src/Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js (a vendored third-party
  file manager widget, not code the nopCommerce team wrote) is ranked #1 lowest code health
  (1.07) and printed in both the prose and the table, in the app and in the exported PDF.
- Expected: per the improvement plan, preset tables should count "production code only" and say
  so, excluding vendored/third-party code the same way tests are excluded. lib_npm is a
  vendoring path convention this scan's vendor-detection patterns evidently miss.
- Evidence: shots/R04-arch-table4-elfinder.png; "01-Architecture review_ nopCommerce.pdf" page 2
  ("Table 3. Least healthy components", row 1).
- Repro: nopCommerce workspace → Evidence → New report → Architecture review → Create → scroll
  to "Code health".

### [P3] Wide-table column headers cut mid-word in PDF (nopCommerce)
- Test case / step: incidental, seen while checking M7-3
- Where: Architecture review PDF › Table 1 "Most depended-on components" (workspace
  nopCommerce)
- What happened: the header "Distance from Main Sequence" wraps and is cut off as "Distance
  from Main Sequen…" in the printed PDF table.
- Expected: per the improvement plan ("wide tables are set smaller instead of dropping
  columns"), headers should still read in full, even if the type gets smaller.
- Evidence: "01-Architecture review_ nopCommerce.pdf" page 1, Table 1 header row.
- Repro: nopCommerce → Architecture review → Create → PDF preview → page 1.

## Summary

Three reports created and saved to PDF: Architecture review, .NET solution review, and
JavaScript/TypeScript workspace review (Workspace review). The clearest remaining problem is
that the "production code only" health/hotspot tables still let a vendored third-party JS
bundle (lib_npm/elfinder) through as if it were nopCommerce's own code — the vendor-path
detection list doesn't cover this codebase's own vendoring convention. Everything else checked
out: the gallery correctly defaults to the .NET review for this workspace, the JS/TS review
does not fabricate React-specific claims on a non-React codebase, the "snapshot does not record
which classes use which" fallback text reads clearly on this old (r0) scan, and closing the
Cell inspector panel does give report tables their full column width (Table 1 goes from 4
visible + 1 cut-off column to all 5, cleanly).

M7-1: done — 0 findings
M7-2: done — 0 findings
M7-3: done — 1 finding (P1)
M7-4: done — 0 findings
M7-5: done — 0 findings
