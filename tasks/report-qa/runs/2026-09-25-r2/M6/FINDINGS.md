# M6 findings — gin (Go), run 2 (m6r2)

Sandbox check: Reports = 0 before first report; first report's header read
"Runs on 22 Sep, 09:53 · analysis r0" — sandbox OK, proceeding.

Test cases: TC-GO-1, TC-QW-IMPACT-1, TC-QW-IMPACT-2, TC-QW-TWOWAY-1, TC-GEN-MOD-1.

---

## TC-GO-1 · Go module review

T: Evidence → "Start a report" → gallery opens instantly, "Go module review" preselected (only "For gin (Go)" template) · expected: gallery with no template picked · shots/GALLERY__G01-open.png
T: Read the band and scrolled the preview (G3-G5) · expected: plain explanation of Go concepts · shots/TC-GO-1__G02..G05
T: Click "Create report" → lands directly on the finished, fully-populated report (no taking run — template has no figure slots) · expected: some kind of transition screen or taking run · shots/TC-GO-1__C01-after-create.png
T: Click outline entry "Libraries" by label → resolved to the sidebar nav item "Libraries" instead, navigating away from Evidence to the Libraries view ⚠ · expected: scroll within the report to the Libraries section · shots/TC-GO-1__R01-outline-click-libraries.png
T: Click outline entry "Libraries" by its numbered control → correctly scrolls the report to that section · expected: same · shots/TC-GO-1__R02-outline-click-libraries.png
T: Click a computed paragraph's text, and its left-margin "computed" tag → Cell pane stays on "Select a cell…", nothing selected ⚠ · expected: Cell pane shows the paragraph's inputs · shots/TC-GO-1__R03..R06
T: Click "Table 1 · Modules" outline entry → Cell pane opens with the table's SQL, "Ran on: 22 Sep 09:53 · analysis r0 · At 25 Sept, 20:40" · expected: same · shots/TC-GO-1__R08-cellpane-table1-click.png
T: Click the top prompt ("What the module does…") then type a sentence → placeholder text unchanged, nothing typed ⚠ · expected: prompt text replaced by what I typed · shots/TC-GO-1__W01-W07
T: Click the "Findings" prompt then type a sentence → same, placeholder unchanged even after Escape + re-click, different coordinates, double-click ⚠ · expected: prompt fills like §4-R7 describes · shots/TC-GO-1__W08-W09
T: Open PDF preview (toolbar PDF) → sheet opens immediately, 4 pages · A4 · 44 KB · expected: preview of the report · shots/TC-GO-1__P01-pdf-preview.png
T: Click "Save PDF…" → "Saved to …/M6/01-Go review_ gin _Go_.pdf" line appears · expected: file written to mission folder · shots/TC-GO-1__P02-saved.png

### [P1] Java/Spring wording and concepts leak into the Go template's explanations
- Test case / step: TC-GO-1 / G5, R1
- Where: Go module review › "What each package holds" and "Libraries" sections (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: The "What each package holds" explanation reads: "The paragraph below sorts the code into the roles this framework gives it, the same way the Classes view does: first by annotations and base classes (a class marked `@Service` is a service), then by what it imports, then by its name." Go has no annotations, base classes, or a "Classes view" concept — `@Service` is a Java/Spring annotation. The computed paragraph under it repeats this: "Archstats reads this as Go services (906 of its 1,101 types and functions carry Go services's own annotations, base types or imports)." The "Libraries" explanation similarly reads: "Names are shortened to their first two parts, so `org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`. Modules of the language's own platform, such as `java.util`, are counted separately." — entirely Java/Maven examples, in a report about Go.
- Expected: Go-specific wording and examples (e.g. `github.com/gin-gonic/gin`, Go doesn't have annotations — packages are classified some other way, and library names should use Go's own import-path convention, not Java package names).
- Evidence: shots/TC-GO-1__G03-preview-scroll1.png, shots/TC-GO-1__G04-preview-scroll2.png, shots/TC-GO-1__G05-preview-scroll3.png; PDF pages 1 and 3 (01-Go review_ gin _Go_.pdf)
- Repro: gin (Go) workspace → Start a report → Go module review → scroll the preview to "What each package holds" and "Libraries".

### [P1] Library names garbled for Go: dots become slashes ("github/com/stretchr/testify")
- Test case / step: TC-GO-1 / R1
- Where: Go module review › Libraries paragraph (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: The computed paragraph reads "The most widely imported are `github/com/stretchr/testify` (in 35 files), `github/com/ugorji/go` (in 5 files) and `github/com/gin-contrib/sse` (in 3 files)." The real Go import paths are `github.com/stretchr/testify` etc. — the library-name "roll up to two segments" logic (built for Java's dot-separated group IDs) appears to split on the dot in `github.com` and rejoin with a slash, corrupting the name.
- Expected: The library name printed exactly as Go writes it: `github.com/stretchr/testify`.
- Evidence: shots/TC-GO-1__G05-preview-scroll3.png, shots/TC-GO-1__R02-outline-click-libraries.png; PDF page 3 (01-Go review_ gin _Go_.pdf)
- Repro: gin (Go) workspace → Go module review → scroll to "Libraries" → read the computed paragraph.

### [P1] "Structs tagged for the most formats" table pulls from test files despite the report's stated production-only scope
- Test case / step: TC-GO-1 / R2
- Where: Go module review › "Structs that cross a boundary" › Table 5 (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: The report's own "Modules and packages" section states "tests, generated files, third-party code copied into the repository... are counted apart from" production code, and the computed paragraphs consistently say "outside tests". But Table 5 lists `testJSONAbortMsg`, `FooBarStruct`, `FooDefaultBarStruct`, `FooStruct`, `FooBarStructForTimeType`, `customPath`, `customPathUnmarshalText`, `objectID` etc. — all Go test-fixture struct names (the naming and lower-case `testJSONAbortMsg` are typical of `_test.go` files). Inspecting the cell's SQL (via the Cell pane) confirms it: `SELECT u.name AS "struct", u.component AS package, group_concat(DISTINCT m.key) AS "tagged for" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'struct_tag' AND u.file LIKE '%.go' AND u.file IN (SELECT name FROM files) GROUP BY u.id ORDER BY count(DISTINCT m.key) DESC, 2, 1` — there is no filter excluding test files, unlike the computed paragraphs elsewhere in the same report.
- Expected: Either the table is scoped to production code like the rest of the report, or the heading/caption says it includes tests.
- Evidence: shots/TC-GO-1__G04-preview-scroll2.png; PDF page 2, Table 5 (01-Go review_ gin _Go_.pdf); SQL captured via Cell pane on Table 5.
- Repro: gin (Go) workspace → Go module review → create → scroll to Table 5 "Structs tagged for the most formats" → click the table's outline entry → Cell pane shows the SQL.

### [P2] HARNESS (void) Prompts cannot be filled: click + type leaves the grey placeholder unchanged
- **VOID — harness fault, not a product bug.** Screenshots shown to the tester were scaled down, so `clickxy` coordinates read off them missed the actual prompt elements. Verified by the facilitator that prompts fill normally. Re-tested in this mission with the driver's `click "<text>"` support for prompts (matches the start of the grey text and scrolls it into view) — see the "Prompts fill correctly" verification note added to TC-GO-1 and TC-QW-IMPACT-1 below.
- Test case / step: TC-GO-1 / R7 ⚠
- Where: Go module review › top prompt ("What the module does, and what this review should settle.") and the "Findings" prompt (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: Clicked directly on each prompt's placeholder text (verified against a fresh screenshot each time, several x/y positions, plus a double-click attempt) and typed a full sentence immediately after. In every attempt the placeholder text stayed exactly as it was; nothing appeared anywhere else in the DOM either (checked the nearest SQL editor for stray keystrokes). Both prompts in this report showed the same behaviour.
- Expected: Per §4-R7, clicking a prompt and typing should replace the grey italic placeholder with the typed sentence.
- Evidence: shots/TC-GO-1__W01-prompt-before.png through shots/TC-GO-1__W09-findings-typing.png
- Repro: gin (Go) workspace → Go module review → create → click the top quote or the Findings prompt → type any text.

### [P3] Confusing pairing: "906 of its 1,101 types and functions" (whole codebase) sits next to "246 types and functions... outside tests" (production only) with no label distinguishing them
- Test case / step: TC-GO-1 / R4
- Where: Go module review › "What each package holds" computed paragraph (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: "Archstats reads this as Go services (906 of its 1,101 types and functions carry Go services's own annotations, base types or imports). The code outside tests declares 246 types and functions: ..." A junior reader has no way to tell why 1,101 (evidently including tests) and 246 (excluding tests) both appear in the same paragraph, or how 906 relates to either count.
- Expected: Either use one consistent scope throughout the paragraph, or explicitly label which numbers include tests.
- Evidence: shots/TC-GO-1__G03-preview-scroll1.png; PDF page 1.
- Repro: gin (Go) workspace → Go module review → read "What each package holds".

### [P3] Table 1's two dependency columns are confusingly similar, and the SQL suggests they're swapped
- Test case / step: TC-GO-1 / R2, R6
- Where: Go module review › Table 1 "Modules" (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: Table 1 has adjacent columns "depends on (internal)" (value: `0`, a count) and "internal dependencies" (value: `—`, presumably a list). The underlying SQL aliases them as: `internal_dependencies AS "depends on (internal)"` and `depends_on AS "internal dependencies"` — the SQL field named `internal_dependencies` is shown under the header "depends on (internal)", and the field named `depends_on` is shown under "internal dependencies". The two headers read like near-duplicates of each other and (to a reader who peeks at the query) look swapped from their source field names.
- Expected: Column headers that clearly differ from each other and match their underlying meaning (a count vs. a list).
- Evidence: shots/TC-GO-1__R08-cellpane-table1-click.png; PDF page 1, Table 1.
- Repro: gin (Go) workspace → Go module review → create → click "Table 1 · Modules" in the outline → Cell pane shows the SQL.

### [P2] PDF table column truncated mid-word
- Test case / step: TC-GO-1 / P3
- Where: Go module review › Table 4 "Tagged structs by package", "formats" column (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: In the saved PDF, the `formats` column for package `.` is cut off mid-word: "form,uri,binding,time_format,time_utc,time_location,json,xml,header,ya…" — the reader cannot see the full list of formats.
- Expected: Either the column wraps to show the full list, or the cut is clearly marked as elided (e.g. "+N more") rather than a mid-word ellipsis.
- Evidence: PDF page 2, Table 4 (01-Go review_ gin _Go_.pdf)
- Repro: gin (Go) workspace → Go module review → create → Save PDF → open page 2, Table 4.

TC-GO-1: done — 7 findings, PDF `01-Go review_ gin _Go_.pdf`

---

## TC-QW-IMPACT-1 · Change impact (component `internal/bytesconv`, typed)

T: New report → Change impact → Component field prefilled "binding" · expected: some sensible default · shots/TC-QW-IMPACT-1__G01-template-selected.png
T: Click Component field, clear, type "internal/bytesconv" → field shows the typed value but title/preview/name still say "binding" ⚠ · expected either live update or some visible pending state · shots/TC-QW-IMPACT-1__G02-component-typed.png
T: Press Tab (blur) → title, name field and body all update correctly to "internal/bytesconv" (holds 2 files, 147 lines, 3 components depend on it, code health 10.0 — matches the workspace's known facts) · expected: update on blur · shots/TC-QW-IMPACT-1__G03-after-tab.png
T: Click "Create report" → taking run starts on Connections (graph), "Waiting for Connections to draw…" then draws quickly · expected: some kind of taking flow · shots/TC-QW-IMPACT-1__C01-after-create.png
T: Import preview modal for Figure 1 → clear graph, internal/bytesconv highlighted with its 3 neighbours · expected: readable capture · shots/TC-QW-IMPACT-1__C02-take-modal.png
T: "Fill and finish" → lands back on Evidence with the finished report · expected: same · shots/TC-QW-IMPACT-1__L01-landing.png
T: Read Table 1/Table 2 ("What depends on it") ⚠ · expected: numbers consistent with the paragraph above · shots/TC-QW-IMPACT-1__R04-table1.png, shots/TC-QW-IMPACT-1__R05-cellpane-table1-sql.png
T: Open PDF preview → 2 pages · A4 · 119 KB; Save PDF → "Saved to …/M6/02-Changing internal_bytesconv_ what it affects.pdf" · expected: normal save · shots/TC-QW-IMPACT-1__P01-pdf-preview.png, shots/TC-QW-IMPACT-1__P02-saved.png

### [P1] "Steps away" is wrong for direct dependents, and the paragraph's dependent count doesn't match the table
- Test case / step: TC-QW-IMPACT-1 / R1, R2
- Where: Change impact › "What depends on it" › Table 1 and Table 2 (gin (Go), snapshot 22 Sep 09:53, analysis r0, component `internal/bytesconv`)
- What happened: The computed paragraph above the tables says "internal/bytesconv holds 2 files and 147 lines. **3 components** depend on it". Table 1 ("How far a change to internal/bytesconv can reach") has exactly one row: `steps away = 2, components = 2`. Table 2 ("Components that depend on internal/bytesconv") lists exactly two rows: `binding, steps away 2, shortest import chain "binding -> internal/bytesconv"` and `render, steps away 2, shortest import chain "render -> internal/bytesconv"`. Both listed chains are a single arrow (one hop, i.e. a *direct* import — the template's own explanation text says "1 step means they import it directly, 2 steps means they import something that imports it"), yet both are labelled "2" steps away, not "1". Separately, the paragraph says 3 components depend on it (matching the Connections view's "Coupled with 3: gin (Go) (root), binding, render"), but the tables only ever show 2 — `gin (Go) (root)` is missing from Table 2 and from the "2 components" total in Table 1 entirely, even though the figure right above shows an edge from `gin (Go) (root)` straight into `internal/bytesconv`.
- Expected: A direct import should read "1 step away", and the tables' total should match the paragraph's "3 components depend on it" (i.e. `gin (Go) (root)` should appear as a row).
- Evidence: shots/TC-QW-IMPACT-1__R04-table1.png, shots/TC-QW-IMPACT-1__R05-cellpane-table1-sql.png (SQL: `SELECT shortest_path_length AS "steps away", count(*) AS components ...`); PDF page 2, Tables 1 and 2 (02-Changing internal_bytesconv_ what it affects.pdf)
- Repro: gin (Go) → Change impact → component `internal/bytesconv` → create → scroll to "What depends on it".

### [P3] "Leaves out" reason for Change impact appears to contradict the Go module review's own file-role counts
- Test case / step: TC-QW-IMPACT-1 / G3
- Where: Change impact band, "Leaves out" line (gin (Go), same snapshot)
- What happened: The gallery band reads: "Leaves out ... Tests that reach it (the scan did not sort files into production and test code)." But the same workspace's "Go module review" report (TC-GO-1) explicitly and repeatedly distinguishes "153 production files" from tests ("tests, generated files, ... are counted apart from it"), and the sidebar itself has a "Tests" lens button ("47 test files"). A junior reader would reasonably wonder why one template says the scan has no production/test split while another template (and the sidebar) clearly does.
- Expected: Consistent wording — if the scan does have file roles (as the Go module review and sidebar show), say why "tests that reach it" is still left out (e.g. it needs a different kind of data: which tests exercise which production code, not just a file's role) rather than "did not sort files into production and test code".
- Evidence: shots/TC-QW-IMPACT-1__G01-template-selected.png
- Repro: gin (Go) → New report → Change impact → read the band's "Leaves out" line; compare with the Go module review's "Modules and packages" section.

TC-QW-IMPACT-1: done — 2 findings, PDF `02-Changing internal_bytesconv_ what it affects.pdf`

---

## TC-QW-IMPACT-2 · Change impact, component left empty

T: New report → Change impact → cleared the Component field, Tab to blur → tally shrinks to "Writes 2 sections: 1 paragraph counted from the snapshot and 2 prompts", figure slot and its checkbox disappear entirely, "Leaves out" grows to list all three component-dependent sections with "(no component is chosen)" · expected: some honest explanation of what's missing · shots/TC-QW-IMPACT-2__G02-empty-component.png
T: Click "Create report" → no taking run (nothing to take), lands straight on a 1-cell report titled "Changing a component: what it affects" · expected: same · shots/TC-QW-IMPACT-2__L01-landing.png
T: Read the report body → the one computed-paragraph cell shows the italic placeholder text "Choose a component for this paragraph." instead of a paragraph or a fair "no component chosen" sentence ⚠ · expected: either a real sentence explaining nothing was computed, or the "Leaves out" treatment used elsewhere · shots/TC-QW-IMPACT-2__L01-landing.png
T: Open PDF preview → 1 page · A4 · 22 KB; Save PDF → "Saved to …/M6/03-Changing a component_ what it affects.pdf" · expected: normal save · shots/TC-QW-IMPACT-2__P01-pdf-preview.png

### [P1] Editor-only placeholder text ("Choose a component for this paragraph.") is printed into the saved PDF
- Test case / step: TC-QW-IMPACT-2 / R1, P3
- Where: Change impact › "The component" section, with the Component field left empty (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: Creating the report with no component chosen produces a report whose only real content is a computed-paragraph cell showing "Choose a component for this paragraph." — clearly an editor-facing instruction, not reader-facing prose. Unlike the grey italic prompts (which the app explicitly promises are "never printed or exported"), this text is **not** styled as a prompt and **is** printed: `pdftotext` on the saved PDF confirms the sentence appears verbatim on page 1, right under the "The component" heading, as if it were the paragraph's real content.
- Expected: Either the "Create report" button is disabled/warns when a required component is missing, or this text is treated as a prompt (excluded from the PDF) like everywhere else in the app, or the printed paragraph says something reader-appropriate ("No component was chosen for this report.").
- Evidence: shots/TC-QW-IMPACT-2__G02-empty-component.png, shots/TC-QW-IMPACT-2__L01-landing.png, shots/TC-QW-IMPACT-2__P01-pdf-preview.png; PDF page 1 (03-Changing a component_ what it affects.pdf) — `pdftotext -layout` output: "The component\nChoose a component for this paragraph."
- Repro: gin (Go) → New report → Change impact → clear the Component field → Tab → Create report → Save PDF → read page 1.

TC-QW-IMPACT-2: done — 1 finding, PDF `03-Changing a component_ what it affects.pdf`

---

## TC-QW-TWOWAY-1 · Circular dependencies to break first

T: New report → "Circular dependencies to break first" → band reads "Leaves out Components that import each other (no components depend on each other in a circle)" — correctly anticipates Go's zero-cycle guarantee producing no pairs on this snapshot · expected: sensible template behaviour on a Go codebase · shots/TC-QW-TWOWAY-1__G01-template-selected.png
T: Click "Create report" → no taking run needed, lands on a 1-cell report "Circular dependencies: gin (Go)" · expected: same · shots/TC-QW-TWOWAY-1__L01-landing.png
T: Read the computed paragraph ⚠ · expected: a grammatical sentence · (see finding below)
T: Open PDF preview → 1 page · A4 · 26 KB; Save PDF → "Saved to …/M6/04-Circular dependencies_ gin _Go_.pdf" · expected: normal save · shots/TC-QW-TWOWAY-1__P01-pdf-preview.png

### [P3] Broken sentence in the propagation-cost paragraph: "that share are linked by a chain of imports"
- Test case / step: TC-QW-TWOWAY-1 / R1, R4 (also present in TC-GEN-MOD-1's "Where it stands" section, same wording)
- Where: "How tangled the code is" / "Where it stands" computed paragraph, propagation-cost sentence (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: "Propagation cost is 33%: of all ordered pairs of components, that share are linked by a chain of imports." This does not parse as English — "that share are linked" reads like a template placeholder ("share" was probably meant to be replaced by a number, or the sentence needs "that share [is/are] linked" fixed and a subject added, e.g. "...of all ordered pairs of components, that share is linked by a chain of imports."). A junior reader cannot get a coherent meaning from this clause as written.
- Expected: A grammatical sentence, e.g. "Propagation cost is 33% — of all ordered pairs of components, 33% are linked by a chain of imports."
- Evidence: PDF page 1 (04-Circular dependencies_ gin _Go_.pdf) and PDF page 1 (05-Modularizing gin _Go_.pdf, "Where it stands" section)
- Repro: gin (Go) → any template that includes the "propagation cost" paragraph (e.g. Circular dependencies to break first, Modularization plan) → read the sentence after "Propagation cost is NN%:".

TC-QW-TWOWAY-1: done — 1 finding (shared with TC-GEN-MOD-1), PDF `04-Circular dependencies_ gin _Go_.pdf`

---

## TC-GEN-MOD-1 · Modularization plan

T: New report → scrolled the gallery list to find "Modularization plan" under General (below the fold, not visible without scrolling) · expected: findable in the list · shots/TC-GEN-MOD-1__G01-template-selected.png
T: Click "Create report" → taking run starts, 3 of 3 slots (Figure 1 Dependency structure, Table 2 Dependency matrix, Figure 2 Candidate modules) · expected: taking flow · shots/TC-GEN-MOD-1__C01-after-create.png
T: Figure 1 (Connections graph) → draws quickly, "Fill and next" · expected: readable capture · shots/TC-GEN-MOD-1__C02-take-figure1.png
T: Table 2 (Dependency matrix, By levels, 8 components ≤ 40) → fills fully; in the *take preview modal* the last column "Distance from Main Sequence" is clipped at the modal's right edge (header cut to "Distance from Main Se…", no values visible) ⚠ · expected: full column visible or a horizontal scroll affordance · shots/TC-GEN-MOD-1__C04-take-matrix.png
T: Figure 2 (Candidate modules, graph by group) → "Fill and finish" · expected: same · shots/TC-GEN-MOD-1__C06-take-figure2.png
T: Land back on Evidence, finished 7-cell report · expected: same · shots/TC-GEN-MOD-1__L01-landing.png
T: Open PDF preview → 4 pages · A4 · 238 KB; Save PDF → "Saved to …/M6/05-Modularizing gin _Go_.pdf" · expected: normal save · shots/TC-GEN-MOD-1__P01-pdf-preview.png

### [P2] "Candidate modules" heading is orphaned at the bottom of a page, separated from its figure
- Test case / step: TC-GEN-MOD-1 / P3
- Where: Modularization plan › "Candidate modules" heading + Figure 2 (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: In the saved PDF, the heading "Candidate modules" prints alone at the very bottom of page 3, with nothing else below it; Figure 2 "Candidate modules" (the graph itself) starts at the top of page 4. A reader flipping through the PDF sees a bare heading with no content on page 3.
- Expected: Keep a heading with at least the start of its content (standard "keep with next" page-break behaviour).
- Evidence: pages/05-3.png, pages/05-4.png (rendered from 05-Modularizing gin _Go_.pdf)
- Repro: gin (Go) → Modularization plan → create and take all 3 slots → Save PDF → look at the bottom of page 3 / top of page 4.

### [P2] "Candidate modules" figure doesn't actually show any module grouping
- Test case / step: TC-GEN-MOD-1 / R3
- Where: Modularization plan › Figure 2 "Candidate modules" (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: Figure 2 is set to Connections "Shown as Graph, Level By group", but the rendered graph looks like a plain import graph — the same 8 components and edges as Figure 1 "Dependency structure", with no visible clustering, colour-coding, or boundary that would suggest which components are being proposed as a module together. On this repo `ginS` sits alone and the rest form one blob.
- Expected: Some visual indication of proposed module boundaries (grouping/colour/enclosure), since the section's whole purpose (per the template's own summary) is "which modules you propose".
- Evidence: pages/05-4.png (Figure 2, page 4 of 05-Modularizing gin _Go_.pdf)
- Repro: gin (Go) → Modularization plan → create → take Figure 2 → Save PDF → view page 4.

### [P3] Instability values in Table 1 don't match the standard formula against the table's own counts — could not confirm the intended formula
- Test case / step: TC-GEN-MOD-1 / R2
- Where: Modularization plan › Table 1 "Most depended-on components" (gin (Go), snapshot 22 Sep 09:53, analysis r0)
- What happened: The report's own explanation says "instability runs from 0 ... to 1 ...". Using the table's own "Direct Dependent Count" (Ca) and "Direct Dependency Count" (Ce) columns with the usual instability formula I = Ce/(Ce+Ca): `render` (Ca=2, Ce=4) gives I = 0.667, but the table shows 0.571; `binding` (Ca=1, Ce=4) gives I = 0.8, but the table shows 0.455. Rows where either count is 0 (`codec/json`, `internal/bytesconv`, `testdata/protoexample`, `internal/fs`, `.`, `ginS`) do match the naive formula exactly. I could not tell whether Instability is computed from a different, valid input (e.g. weighted import counts rather than distinct-component counts) or whether this is a real calculation bug — flagging for someone who can check the source.
- Expected: Either the displayed counts should be the ones the Instability formula actually uses, or the formula/column should be documented so the numbers can be checked by a reader.
- Evidence: PDF page 3, Table 1 (05-Modularizing gin _Go_.pdf); pages/05-3.png
- Repro: gin (Go) → Modularization plan → create and take → read Table 1 "Most depended-on components".

TC-GEN-MOD-1: done — 3 findings (+1 shared with TC-QW-TWOWAY-1), PDF `05-Modularizing gin _Go_.pdf`

---

## Summary

The three worst problems: (1) the "steps away" / dependent-count mismatches in Change impact (TC-QW-IMPACT-1) — a direct one-hop import labelled "2 steps away", and a component the paragraph counts but the table omits; this is the kind of number-contradicts-number bug that undermines trust in every table in the app. (2) Editor-only placeholder text ("Choose a component for this paragraph.") gets printed straight into a saved PDF when a required field is left empty (TC-QW-IMPACT-2), which is the sort of thing that must never reach a reader. (3) The Go module review template is heavily un-adapted from a Java/Spring original — `@Service` annotations, `org.springframework`/`java.util` examples, and garbled `github/com/...` library names — which would visibly embarrass anyone using this template on a real Go codebase.

What worked well: the "leaves out" reasoning is honest and mostly consistent (old-scan warnings, no-cycles-on-Go, >40-components can't-take are all explained in plain terms); the take-and-fill flow for figures/tables is fast and the import previews are legible; PDF export is quick and, but for the two page-layout nits above, clean; the Cell pane's SQL/provenance view (once you find the right click target) is genuinely useful for verifying a number.

Two process notes: prompts (grey italic lines) could not be filled by click + type anywhere in this session — every attempt across two different reports left the placeholder unchanged, so §4-R7 could not be completed for M6. And clicking a report's outline entry by matching label text is unreliable when the same word also exists in the left sidebar nav (e.g. "Libraries") — worth a note for future testers using this harness, not a product bug.

---

## Prompt re-verification (facilitator fix: driver now supports `click "<prompt text>"`)

The "prompts cannot be filled" P2 above was a harness/tester fault (scaled screenshots made `clickxy` miss). Re-tested with the fixed driver's `click "<prompt text start>"` support, which matches the grey text and scrolls it into view.

T: TC-GO-1 recreated (Go module review, gallery steps skipped) → `click "What the module does"` → typed a sentence → `key Escape` → placeholder replaced immediately, no jump · shots/TC-GO-1__W10–W13-*-fix.png
T: `click "What you found"` (Findings prompt) → typed a sentence → `key Escape` → replaced immediately · shots/TC-GO-1__W14–W16-*-fix.png
T: Saved PDF (06-Go review_ gin _Go_.pdf) → `pdftotext` confirms both typed sentences print verbatim ("This review covers the gin HTTP framework's package layout..." / "Rules should be added to keep binding structs...") and neither original placeholder string appears anywhere in the PDF.
T: TC-QW-IMPACT-1 recreated (Change impact, component `internal/bytesconv` typed, "Then take the figure" unticked to save time) → `click "The change you plan"` → typed → Escape; `click "Who to tell"` → typed → Escape → both replaced immediately, no jump, Cell/Pool pane unaffected · shots/TC-QW-IMPACT-1__W01–W06-*-fix.png
T: Saved PDF (07-Changing internal_bytesconv_ what it affects.pdf) → `pdftotext` confirms both typed sentences print and the header correctly shows "1 to add, left out" for the skipped figure slot.

**Result: prompts fill correctly.** §4-R7 is satisfied for TC-GO-1 and TC-QW-IMPACT-1. The P1 "steps away" / dependent-count mismatch (Table 1/2, "What depends on it") reproduced identically in this retest — confirmed not an artifact of the earlier session.

No new product findings from this retest beyond what's already recorded above.
