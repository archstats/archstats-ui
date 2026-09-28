# M2 (fineract) findings

Written by the facilitator from the tester's final reply: the tester's sandbox refused file writes.
Screenshots in shots/ (33), PDFs 01–06 (01 before the SQL-console fix, 02 after).

Test cases: TC-SPRING-2, TC-JVM-3, TC-GEN-ARCH-1, TC-GEN-EXEC-1, TC-GEN-DD-1 — all done.

### [P1] Three incompatible Controller/Service/Repository/Entity counts on one report
- TC-SPRING-2 / R1 — Spring review: fineract
- "The application at a glance": "834 services, 23 repositories, 2 controllers"; "Roles in the code": "1 Controllers... 1,760 Services... 205 Repositories... 278 Entities"; Units view (Figure 1 source): "Controllers 3, Services 1839, Repositories 205, Entities 279". No explanation for the differing methods.
- Evidence: shots/TC-SPRING-2_G5_scroll1.png, shots/TC-SPRING-2_C2_figure1-counts.png

### [P1] Web-layer paragraph ignores JAX-RS despite promising to count it
- TC-SPRING-2 / R1, R4
- Explanation: "Some Spring applications use JAX-RS instead... both are counted here." Computed: "The code has 1 Controllers... They reference no other role." Table 1 shows 85 packages / ~170 JAX-RS entry points directly below.
- Evidence: 02-Spring review_ fineract.pdf pp. 1–2

### [P1] Whole report duplicated in place, in-app and in PDF
- TC-SPRING-2 / C2–C3, P3 (after resuming a paused taking flow / double "Fill and finish")
- Outline and PDF contain the entire report twice; "Findings" twice at the end. Verify, don't assume (unusual sequence: Skip → Fill-and-finish clicked twice across overlapping states).
- Evidence: shots/TC-SPRING-2_v2_duplicate-outline.png, 02-Spring review_ fineract.pdf (15 pages, repeats from p. 8)

### [P1] Table query timeout prints as broken content
- TC-SPRING-2 / R2, P3 — "Table 5. Entities, the most used first" renders only "stopped after 10s" (no headers, no rows), app and PDF.
- Evidence: 02-Spring review_ fineract.pdf p. 4

### [P1] Executive summary is not one page as promised
- TC-GEN-EXEC-1 — "Leadership, on one page"; PDF is 3 pages. Evidence: 05-fineract_ summary.pdf

### [P1] "No names are written here" is false — table prints names and email addresses
- TC-GEN-DD-1 / R1, R2, P3 — paragraph says no names; next element "Table 1. Knowledge by component" is an Author / Email / Commits / Lines table with real names and emails; also not per component.
- Evidence: 06-Technical due diligence_ fineract.pdf pp. 1–2

### [P2] "Drew nothing to take; set it, then add it" gives no actionable next step
- TC-SPRING-2 / C2, TC-GEN-ARCH-1 / C2 (Units/Classes, Connections matrix). The view itself already explains better ("1156 components are too many for a matrix… Propose a lens / Show the graph").
- Evidence: shots/TC-SPRING-2_C2_figure1-counts.png, shots/TC-GEN-ARCH-1_C2_table1-matrix-cant-take.png

### [P2] "Taken with other settings than the template asked" doesn't say what differs
- TC-SPRING-2 / C2 — Figure 2 (Hotspots, Churn against health); asked and actual read identical.
- Evidence: shots/TC-SPRING-2_C2_figure2-hotspots.png

### [P2] Figure label clipped at the PDF page edge
- TC-SPRING-2 / P3 — "Churning, hea", "fineract-progressive-loan-embeddable-schedule-ge...github". Evidence: 01-Spring review_ fineract.pdf p. 5

### [P2] Page break splits a table's lead-in sentence from its table
- TC-SPRING-2 / P3 — pp. 3→4, Table 7. Evidence: 01-Spring review_ fineract.pdf

### [P2] Fully-left-out report prints as a near-blank PDF with no explanation
- TC-JVM-3 — Module drift on Gradle: PDF is a title and the bare heading "Changes to make". Evidence: 03-Module drift_ fineract.pdf

### [P3] Raw package names in leadership-facing prose
- TC-GEN-EXEC-1 — "...the most into org.apache.fineract.integrationtests (40%)...". Evidence: 05-fineract_ summary.pdf p. 1

### [P3] Code health text mixes "files" and "components"
- TC-GEN-ARCH-1 — intro "rates each file"; next sentence and table are per component without saying they are rollups. Evidence: 04-Architecture review_ fineract.pdf p. 5

## Summary (tester)
Verified not a bug (tester's judgement): the commit-time vs scan-time snapshot naming is explained by the snapshot picker.
Worked well: Architecture review clean; figures crisp; matrix "too many" empty state clear; outline navigation and Cell pane good; prompt filling smooth.
