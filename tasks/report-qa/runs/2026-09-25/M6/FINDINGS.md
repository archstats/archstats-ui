# M6 findings — gin (Go), http://localhost:4306/

Sandbox check: Evidence -> Reports read `0` before the first report. OK, proceeding.

**Harness note (void, not a product finding):** for the first pass through all five test
cases, every query/table cell rendered `The SQL console is switched off for this run.`
instead of its rows (the sandbox had the SQL console off). The facilitator turned it on
and restarted the server partway through this mission. I restarted the session
(`node $D m6 stop` / `start`), re-checked the sandbox (Reports = 0 again), and
re-created every report to check the tables (R2) and save a fresh PDF. Earlier PDFs
(`01`-`04`) are the pre-fix ones without table data; `05` onward are post-fix. No
finding below is about the SQL-off message itself — it's gone now and was never a
product bug.

---

### [P1] Go library names lose their domain dots in the Libraries paragraph
- Test case / step: TC-GO-1 / G5, R1, P3
- Where: Go module review, "Libraries" section (paragraph text), gin (Go), snapshot 22 Sep 09:53
- What happened: the paragraph reads `github/com/stretchr/testify` (in 35 files), `github/com/ugorji/go` (in 5 files) and `github/com/gin-contrib/sse` (in 3 files) — slashes where a Go module path has a dot. The underlying data is fine: in the same report, Table 1 ("Modules") correctly prints `github.com/gin-gonic/gin`, so this is a text-formatting bug specific to the Libraries paragraph, not bad data.
- Expected: `github.com/stretchr/testify`, as every Go developer reads it (and as the app's own Java example, `org.springframework.web`, correctly keeps its dots).
- Evidence: shots/TC-GO-1-redo-findings.png; PDF `05-Go review_ gin _Go_.pdf` page 3 ("Libraries" section)
- Repro: Evidence -> Start a report -> Go module review -> Create report -> read the Libraries paragraph.

### [P2] Grammar breaks when a count is 1 ("All 1 rule that apply hold", "1 component depend on it")
- Test case / step: TC-GO-1 / R1; TC-QW-IMPACT-1 / G3
- Where: Go module review, "Dependency rules" section; Change impact gallery preview with the prefilled component `binding`
- What happened: exact text: "All 1 rule that apply hold: no import breaks them." (both verbs plural against a singular count). Same pattern in the Change impact gallery preview before I changed the component: "1 component depend on it, and it depends on 4 others."
- Expected: singular-agreeing phrasing when the count is 1, e.g. "The 1 rule that applies holds" / "1 component depends on it".
- Evidence: PDF `05-Go review_ gin _Go_.pdf` page 3, "Dependency rules"; shots/TC-GO-1-04-cellpane.png
- Repro: create a Go module review (this workspace has exactly 1 rule); or start a Change impact report and read the prefilled paragraph before choosing a component.

### [P3] Awkward framework-name phrasing: "Go services's own annotations"
- Test case / step: TC-GO-1 / R1
- Where: Go module review, "What each package holds" section, gin (Go)
- What happened: exact text: "Archstats reads this as Go services (906 of its 1,101 types and functions carry Go services's own annotations, base types or imports)." The name "Go services" is repeated verbatim in the same sentence with an awkward double possessive ("Go services's").
- Expected: a pronoun or single mention, e.g. "carry its own annotations, base types or imports".
- Evidence: PDF `05-Go review_ gin _Go_.pdf` page 1, "What each package holds"
- Repro: same report, read the second paragraph of "What each package holds".

### [P1] "7 packages" in the narrative contradicts the report's own 8-row package table
- Test case / step: TC-GO-1 / R1, R2
- Where: Go module review, "Modules and packages" paragraph vs. its own Table 2 ("Packages: types, functions and what they export"), gin (Go), same report
- What happened: the paragraph says "The code builds as 1 Go module with 7 packages, 2 of them internal," but Table 2 directly below it lists 8 rows: `.`, `binding`, `codec/json`, `ginS`, `internal/bytesconv`, `internal/fs`, `render`, `testdata/protoexample`. The Overview view's top stat also reads Components = 8 for this same snapshot, and the Modularization plan report's "Most depended-on components" table also lists all 8. Only the "7 packages" sentence disagrees.
- Expected: the same count everywhere for the same snapshot — either "8 packages" or an explanation of what's excluded (e.g. if `ginS` isn't counted as a real package for some reason, say so).
- Evidence: PDF `05-Go review_ gin _Go_.pdf` page 1 (paragraph) vs. Table 2 same page; Overview view ("Components 8"); PDF `09-Modularizing gin _Go_.pdf` page 2, Table 1 (8 rows)
- Repro: open Overview, note Components = 8; then create a Go module review and compare its opening paragraph to its own Table 2.

### [P1] Change impact: "3 components depend on it" but the dependents table only lists 2, and mislabels a direct import as "2 steps away"
- Test case / step: TC-QW-IMPACT-1 / R1, R2
- Where: Change impact report for `internal/bytesconv`, "The component" paragraph vs. Table 1/Table 2 under "What depends on it", gin (Go)
- What happened: the opening paragraph reads "internal/bytesconv holds 2 files and 147 lines. 3 components depend on it..." The Figure 1 graph shows three direct neighbours (`binding`, `render`, `gin (Go) (root)`), and the Modularization plan report's own table separately confirms internal/bytesconv's "Direct Dependent Count" = 3. But Table 1 ("How far a change... can reach") shows only one row, "2 steps away → 2 components", and Table 2 lists only `binding` and `render` — `gin (Go) (root)` is missing entirely. Worse, Table 2's own "shortest import chain" for those two rows is `binding -> internal/bytesconv` — a single arrow, i.e. one hop — yet the "steps away" column says `2`, directly contradicting the paragraph's own definition just above it: "1 step means they import it directly, 2 steps means they import something that imports it."
- Expected: a table that accounts for all 3 stated dependents, and labels a direct one-hop import as "1 step away" per the app's own definition.
- Evidence: shots/TC-QW-IMPACT-1-redo-prompt.png (shows the "2" steps-away value against a one-arrow chain); PDF `06-Changing internal_bytesconv_ what it affects.pdf`; PDF `09-Modularizing gin _Go_.pdf` page 2 Table 1 (internal/bytesconv: Direct Dependent Count 3)
- Repro: Evidence -> Start a report -> Change impact -> type `internal/bytesconv` -> Create report -> take Figure 1 -> read "What depends on it".

### [P1] Modularization plan's dependency matrix silently shows only 3 of 8 columns
- Test case / step: TC-GEN-MOD-1 / R2, R3, P3
- Where: Modularization plan, "Dependency matrix, in levels" (Table 2), gin (Go), 8 components (≤ 40, expected to fill per the test plan)
- What happened: the table has all 8 rows (`gin (Go) (root)`, `binding`, `render`, `codec/json`, `internal/bytesconv`, `internal/fs`, `testdata/protoexample`, `ginS`) but only 3 columns (headers `1 2 3`). Rows 4-8 show a dash (`—`) in every visible column, which reads as "no dependency", but those rows' real relationships are simply in the unshown columns 4-8 — there's no caption or "N of M columns" note (contrast: the Go module review's Table 5 explicitly says "15 of 65" when it truncates rows). A reader cannot tell the matrix is incomplete.
- Expected: either show the full 8x8 matrix (8 components is well within the "≤ 40, should fill" case), or clearly label how many columns are cut off, the way row truncation is labelled elsewhere.
- Evidence: shots/TC-GEN-MOD-1-report-candidatemodules.png; PDF `09-Modularizing gin _Go_.pdf` page 2, Table 2
- Repro: create a Modularization plan report for gin (Go) and take the "Dependency matrix, in levels" slot.

### [P1] Component names truncated to unreadable fragments in "Most depended-on components"
- Test case / step: TC-GEN-MOD-1 / R2, P3
- Where: Modularization plan, Table 1 "Most depended-on components", Name column; also Go module review, Table 4 "Tagged structs by package", formats column (same root cause: a column too narrow for its content)
- What happened: the Name column renders `codec/json`, `internal/bytesconv` and `testdata/protoexample` as `…son`, `…onv`, `…tdata/protoexample` (varies by render pass — sometimes as little as 3 trailing characters with a leading ellipsis), and `render`/`binding` as `…der`/`…ing`. On their own these fragments are not identifiable — "…der" or "…ing" could be several different names. Separately, in the Go module review's Table 4, the "formats" column (a comma-separated list) is cut mid-word in the PDF: `invalid_name,binding,form,msgpack,json,xml,time_format,time_utc,time_…`.
- Expected: a column wide enough for the longest value, or truncation with a visible ellipsis/tooltip and enough characters left to identify the row (e.g. `codec/js…` not `…son`).
- Evidence: shots/TC-GEN-MOD-1-table1-zoom.png; PDF `09-Modularizing gin _Go_.pdf` page 2, Table 1; PDF `05-Go review_ gin _Go_.pdf` page 2, Table 4
- Repro: create a Modularization plan report and look at Table 1's Name column; or a Go module review and look at Table 4's formats column in the saved PDF.

### [P1] Circular dependencies report: garbled sentence "that share are linked by a chain of imports"
- Test case / step: TC-QW-TWOWAY-1 / R1
- Where: "Circular dependencies to break first", "How tangled the code is" section, gin (Go)
- What happened: exact text: "Propagation cost is 33%: of all ordered pairs of components, that share are linked by a chain of imports." The clause "that share are linked" does not parse — it reads as if a fragment ("that share of ... are linked by...") was reordered incorrectly around the colon.
- Expected: something like "Propagation cost is 33% of all ordered pairs of components: that share is linked by a chain of imports" (or simply "33% of all ordered pairs of components are linked by a chain of imports").
- Evidence: PDF `08-Circular dependencies_ gin _Go_.pdf` page 1
- Repro: create "Circular dependencies to break first" for gin (Go) and read the computed paragraph (Overview separately shows "Dependency levels 4" vs. this report's "3 levels deep" for the same snapshot — noted but could not confirm which is right without reading source, flagging as a secondary discrepancy on the same paragraph).

### [P1] Empty-component PDF prints the editor's placeholder instruction as report content
- Test case / step: TC-QW-IMPACT-2 / P3
- Where: "Changing a component: what it affects" (Change impact created with the Component field left empty), "The component" section, gin (Go)
- What happened: with no component chosen, the live report correctly shows the guidance text "Choose a component for this paragraph." in place of the computed paragraph — reasonable in the editor. But the saved PDF prints that same sentence verbatim as if it were the report's content: "The component / Choose a component for this paragraph." A reader of the exported PDF (who never saw the editor) would think this is a real (broken) sentence, not know it means "no component was selected."
- Expected: either leave the section out of the PDF entirely (the way unfilled prompts are left out), or print a reader-facing message like "No component was chosen for this report."
- Evidence: PDF `07-Changing a component_ what it affects.pdf` (1 page)
- Repro: New report -> Change impact -> clear the Component field -> Create report -> PDF -> Save PDF; read page 1.

TC-GO-1: done — findings: library-slash bug, grammar-singular bug, "Go services's" phrasing, 7-vs-8 packages contradiction. PDFs `01-Go review_ gin _Go_.pdf` (pre-fix, tables empty) and `05-Go review_ gin _Go_.pdf` (post-fix, real tables).
TC-QW-IMPACT-1: done — findings: missing dependent + wrong "steps away" in Change impact. PDFs `02-Changing internal_bytesconv_ what it affects.pdf` (pre-fix) and `06-Changing internal_bytesconv_ what it affects.pdf` (post-fix).
TC-QW-IMPACT-2: done — findings: PDF prints editor placeholder text for an empty component. PDFs `03-Changing a component_ what it affects.pdf` and `07-Changing a component_ what it affects.pdf` (identical content; no query tables in this report so the SQL fix made no difference).
TC-QW-TWOWAY-1: done — findings: garbled propagation-cost sentence; dependency-levels discrepancy noted. No circular pairs exist in this workspace so the report correctly leaves that table out and does not contradict itself. PDFs `04-Circular dependencies_ gin _Go_.pdf` and `08-Circular dependencies_ gin _Go_.pdf`.
TC-GEN-MOD-1: done — findings: silently truncated dependency matrix (3 of 8 columns) and unreadable truncated component names in Table 1. PDF `09-Modularizing gin _Go_.pdf`.

## Summary

The three worst problems: (1) the Change impact report's "What depends on it" tables both
drop a real dependent and mislabel a direct, one-hop import as "2 steps away" —
self-contradicting the paragraph's own definition just above it; (2) the Modularization
plan's dependency matrix silently shows only 3 of 8 columns with no truncation notice, so
a reader would wrongly conclude 5 of the 8 components have zero relationships; (3) the
same report's "Most depended-on components" table truncates names to unreadable
fragments like "…son"/"…der"/"…ing". All three are real product bugs, not sandbox
artifacts, and were confirmed both in the live report and in the saved PDF.

What worked well: prompts (grey italic lines) were consistently clear, easy to fill, and
correctly excluded from PDFs when left blank; the "leaves out" messaging for old-scan
and no-rule cases (TC-QW-IMPACT-2's empty-component case, TC-QW-TWOWAY-1's
zero-circular-pairs case) was honest and did not crash or contradict itself; figures
(component graphs) rendered clearly and matched the expected facts (internal/bytesconv
imported by exactly render, `.`, and binding) in every report that used them; the outline
panel's click-to-scroll worked every time.
