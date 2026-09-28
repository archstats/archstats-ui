# M3 (django-oscar) shot index

## TC-DJANGO-1 · Django project review (+ TC-X-ESC)
- TC-DJANGO-1__G01-gallery-open.png — gallery first opens, Blank report selected by default
- TC-DJANGO-1__G02-scrolled-list.png — scroll jumped selection to Django project review (⚠ my own navigation, not a product bug)
- TC-DJANGO-1__G03-list-other-ecosystems.png — Other ecosystems expanded, Spring/JPA "not found here"
- TC-DJANGO-1__G04-list-django-templates.png — Other ecosystems list continues (Python/React/Go/.NET not found here)
- TC-DJANGO-1__G05-list-django-project-review.png — Python codebase review "not found here" despite 72% Python (finding)
- TC-DJANGO-1__G06-list-end.png — end of Other ecosystems list (Symfony bundle review last)
- TC-DJANGO-1__G07-list-top-again.png — top of list showing "For django-oscar" group (Django project review, Django app boundaries)
- TC-DJANGO-1__G08-template-band.png — same as G07, used for template band read
- TC-DJANGO-1__C01-after-create.png — screen right after Create, taking Figure 1 starts immediately
- TC-DJANGO-1__C02-take-figure1-chord.png — Figure 1 "Apps and their imports" chord, take panel with Asked-for details
- TC-DJANGO-1__L01-landing-after-run.png — landing on Evidence after the run finishes, Figure 1 filled
- TC-DJANGO-1__R01-report-top.png through R08-scroll7.png — full report scroll-through, one shot per screenful
- TC-DJANGO-1__R09-outline-click-hotspots.png — outline click scrolls to and highlights "Hotspots"
- TC-DJANGO-1__R10/R11/R12 — Cell pane for Table 6 (clear settings: sort, rows, snapshot/commit/analysis)
- TC-DJANGO-1__W01 through W08 — original failed prompt-fill attempts via clickxy (HARNESS void — scaled-screenshot coordinate mismatch, not a product bug)
- TC-DJANGO-1__W09 through W14 — corrected prompt-fill using `click "<prompt text>"`, all 4 prompts filled and confirmed
- TC-DJANGO-1__P01/P02-pdf-preview — PDF preview sheet opening (brief blank flash then renders)
- TC-DJANGO-1__P03-saved.png — "Saved to …" line after Save PDF

## TC-X-ESC · pause/resume (run inside TC-DJANGO-1, only 1 figure slot so no true "second slot")
- TC-X-ESC__C01-escape-pause.png — Escape key had no visible effect while the take modal was open
- TC-X-ESC__C02-back-to-report.png — (unused fallback attempt)
- TC-X-ESC__C03-after-clickxy.png — closing the modal (X) actually paused the run ("Paused" bar)
- TC-X-ESC__C04-back-to-report.png — "Back to report" lands on Evidence, Figure 1 marked "(to add)", toolbar shows "Resume taking · 1 left"
- TC-X-ESC__C05-resumed.png — Resume taking reopens the same Connections chord view

## TC-DJANGO-2 · Django app boundaries
- TC-DJANGO-2__G01-band.png — template band: "4 tables, 1 figure, 2 prompts"
- TC-DJANGO-2__C01-after-create.png — Create jumps straight into the Dependency matrix take (122 columns)
- TC-DJANGO-2__C02-take-matrix.png — matrix still drawing (122x122)
- TC-DJANGO-2__C03-cant-take-matrix.png — correct "has nothing to take: 122 columns; group to 40 or fewer" message
- TC-DJANGO-2__R01-bottom.png — report bottom: Table 5 Tangles + final prompt "The boundaries you propose"
- TC-DJANGO-2__W01-prompt-attempt.png — original failed prompt-fill attempt (HARNESS void, see TC-DJANGO-1 W01-W08 note)
- TC-DJANGO-2__P01-pdf-preview.png — PDF preview, "1 to add, left out" header

## TC-GEN-ONB-1 · Onboarding guide
- TC-GEN-ONB-1__G01-band.png — template band: "2 tables, 4 figures, 4 prompts"
- TC-GEN-ONB-1__C01-take1.png — Table 2 "codebase by directory" take, live Metrics view shows real Commits numbers
- TC-GEN-ONB-1__C02-table2-commits.png — captured Table 2 shows "—" for Commits on every row (P1 finding)
- TC-GEN-ONB-1__C03 through C06 — remaining figure/table takes (force graph, chord, knowledge-by-component)
- TC-GEN-ONB-1__L01-landing.png — landing after the 4-slot run finishes
- TC-GEN-ONB-1__P01-pdf-preview.png — first PDF preview (before prompts were fixed)
- TC-GEN-ONB-1__W01-top-before-fix.png — report top showing prompt 1 unfilled
- TC-GEN-ONB-1__W02/W03 — prompt 1 filled with corrected `click "<text>"` technique
- TC-GEN-ONB-1__W04 through W07 — scrolling to find + read prompts 2-4
- TC-GEN-ONB-1__W08-prompts34-after.png — prompts 3 and 4 filled
- TC-GEN-ONB-1__P02-pdf-preview-fix.png — PDF preview after all 4 prompts filled

## TC-GEN-DEBT-1 · Technical debt register
- TC-GEN-DEBT-1__G01-band.png — template band: "3 tables, 3 figures, 2 prompts"; leaves out Broken dependency rules
- TC-GEN-DEBT-1__C01 through C06 — the 3 figure takes (churn/health scatter, nesting-depth treemap, cycles-in-tangle levels diagram)
- TC-GEN-DEBT-1__L01-landing.png — landing after the run
- TC-GEN-DEBT-1__R01-bottom-prompt.png — Figure 3 (cycles levels diagram) + final prompt "The register"
- TC-GEN-DEBT-1__P01-pdf-preview.png — PDF preview sheet
