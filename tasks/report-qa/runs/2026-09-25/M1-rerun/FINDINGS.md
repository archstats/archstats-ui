# M1-rerun (BroadleafCommerce, analysis r3 everywhere) — findings

Saved by the facilitator from the tester's final reply (subagent file writes were refused).
PDFs: 01 Spring review (9 pp.), 02 Spring layering (3), 03 Entity model (5), 04 Build review (3), 05 Module drift (1).

### [P2] A table's lead-in paragraph is split from its table by a page break
- TC-SPRING-1 (01, pp. 6→7, Table 6) and TC-SPRING-3 (02, pp. 1→2, Table 3)

### [P2] PDF tables truncate values and headers
- 01 Table 2: "kind" prints "MVC …" on every row, GET header "G…", names "AdminBasicEntit…"; Table 4: "base …", "Categor…", repositories cut mid-word; 03 Table 3 "entities it refers to" shows 4 of 15 names, header "lin…". Evidence: 01 pp. 1–4, shots/tc-spring-1-table8.png

### [P2] Capped tables lose their "N of Total" notice in the PDF
- Tables 3 (20 of 36), 4 (25 of 165), 6 (20 of 83), 7 (30 of 85), 8 (10 of 459) end with "N of Total." on screen, nothing in the PDF.

### [P2] Full-screen loading overlay blocked the app for several seconds after typing into a prompt (seen once)
- TC-SPRING-3 / R7 — spinner overlay, no controls, cleared by itself; text kept. Evidence: shots/tc-spring-3-endprompt-typed*.png, -resolved.png

### [P3] Lower-case query-table headers ("package", "kind", "which is") beside Title Case preset tables ("Name", "Code Health")

### [P3] Garbled: "Propagation cost is 23%: of all ordered pairs of components, that share are linked by a chain of imports." (04 p. 2)

## First-run findings, re-judged
VOID (snapshot mix-up): r3 figures vs r0 paragraphs; one commit two times; "All 1 rule that apply hold" on a codebase with no rules.
CONFIRMED: PDF truncation; "N of Total" lost; lower-case headers; garbled propagation sentence.

## Worked well
Snapshot consistency; matrix refusal ("has nothing to take: The matrix has 47 columns; group it to 40 or fewer") and its omission from the PDF; typed prompts; outline navigation; Cell pane provenance; long tables breaking across pages with repeated headers; Module drift facts match (broadleaf-admin-module → broadleaf-common, 244 refs, not declared).
