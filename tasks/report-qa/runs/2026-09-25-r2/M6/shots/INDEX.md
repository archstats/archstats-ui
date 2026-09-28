# Shot index — M6 (gin, Go)

- `GALLERY__G01-open.png` — Gallery just opened from "Start a report" (empty state), Go module review preselected.
- `TC-GO-1__G02-template-selected.png` — Go module review band: audience, summary, tally ("Writes 8 sections..."), title/date, first paragraphs.
- `TC-GO-1__G03-preview-scroll1.png` — Preview scrolled: Table 1, "What each package holds" paragraph with the @Service/annotations wording.
- `TC-GO-1__G04-preview-scroll2.png` — Preview scrolled: Tables 4/5, Build constraints, Dependency rules, start of Libraries (java.util/org.springframework wording visible).
- `TC-GO-1__G05-preview-scroll3.png` — Preview scrolled: end of Libraries paragraph (garbled `github/com/...` names), Findings prompt.
- `TC-GO-1__C01-after-create.png` — Screen right after clicking Create report; landed straight on the finished report (no taking run — all cells are queries/computed paragraphs).
- `TC-GO-1__R01-outline-click-libraries.png` — Misclick: label "Libraries" resolved to the left NAV item, not the outline entry; navigated away from Evidence.
- `TC-GO-1__R02-outline-click-libraries.png` — Correct outline click (by control number): scrolls to the Libraries section as expected.
- `TC-GO-1__R03/R04/R05/R06/R07/R08-cellpane-*.png` — Attempts to open the Cell pane: clicking a computed paragraph's text/margin does nothing; clicking an outline **Table** entry does open the Cell pane with its SQL and provenance.
- `TC-GO-1__W01-W09-*.png` — Prompt-filling attempts (top quote, Findings prompt): click + type leaves the grey placeholder unchanged every time.
- `TC-GO-1__P01-pdf-preview.png` — PDF preview sheet, page 1, 4 pages · A4 · 44 KB.
- `TC-GO-1__P02-saved.png` — "Saved to …/M6/01-Go review_ gin _Go_.pdf" line.

## TC-QW-IMPACT-1 (Change impact, component internal/bytesconv)
- `TC-QW-IMPACT-1__G01-template-selected.png` — Band + preview, Component prefilled "binding".
- `TC-QW-IMPACT-1__G02-component-typed.png` — Field shows "internal/bytesconv" typed, but title/body still say "binding" (pre-blur).
- `TC-QW-IMPACT-1__G03-after-tab.png` — After Tab: title/body correctly updated to internal/bytesconv.
- `TC-QW-IMPACT-1__C01-after-create.png` — Taking run starts on Connections, waiting for the graph to draw.
- `TC-QW-IMPACT-1__C02-take-modal.png` — Import preview for Figure 1 (imports and co-change graph).
- `TC-QW-IMPACT-1__L01-landing.png` — Landing on the finished report after "Fill and finish".
- `TC-QW-IMPACT-1__R01-report-top.png`, `R02-tables.png`, `R03-tables2.png` — Report body, figure and tables.
- `TC-QW-IMPACT-1__R04-table1.png` — Table 1/2 showing "steps away: 2" for direct (1-hop) imports.
- `TC-QW-IMPACT-1__R05-cellpane-table1-sql.png` — Cell pane SQL for Table 1 (shortest_path_length).
- `TC-QW-IMPACT-1__P01-pdf-preview.png`, `P02-saved.png` — PDF preview and "Saved to" line.

## TC-QW-IMPACT-2 (Change impact, component left empty)
- `TC-QW-IMPACT-2__G01-empty-component.png` — Accidental Report-name clear (self-corrected, see G02).
- `TC-QW-IMPACT-2__G02-empty-component.png` — Component field empty: tally shrinks, figure slot disappears, "Leaves out" lists all 3 dependent sections.
- `TC-QW-IMPACT-2__L01-landing.png` — Finished report; "Choose a component for this paragraph." placeholder shown as if it were real content.
- `TC-QW-IMPACT-2__P01-pdf-preview.png` — PDF preview; the placeholder text is confirmed printed via pdftotext.

## TC-QW-TWOWAY-1 (Circular dependencies to break first)
- `TC-QW-TWOWAY-1__G01-template-selected.png` — Band: "Leaves out Components that import each other (no components depend on each other in a circle)".
- `TC-QW-TWOWAY-1__L01-landing.png` — Finished 1-cell report.
- `TC-QW-TWOWAY-1__P01-pdf-preview.png` — PDF preview, 1 page.

## TC-GEN-MOD-1 (Modularization plan)
- `TC-GEN-MOD-1__G01-template-selected.png` — Band + preview (found after scrolling the gallery list).
- `TC-GEN-MOD-1__C01-after-create.png` — Taking run starts, 3 slots.
- `TC-GEN-MOD-1__C02-take-figure1.png` — Figure 1 Dependency structure take step.
- `TC-GEN-MOD-1__C03-take-step2.png`, `C04-take-matrix.png` — Table 2 Dependency matrix take step; last column clipped in the take-preview modal.
- `TC-GEN-MOD-1__C05-take-step3.png`, `C06-take-figure2.png` — Figure 2 Candidate modules take step.
- `TC-GEN-MOD-1__L01-landing.png` — Finished 7-cell report.
- `TC-GEN-MOD-1__R01-report-top.png` — Report top.
- `TC-GEN-MOD-1__P01-pdf-preview.png` — PDF preview, 4 pages.
- `pages/05-3.png`, `pages/05-4.png` — Rendered PDF pages 3-4 showing the orphaned "Candidate modules" heading and the ungrouped figure.
