# M3 run 2 (django-oscar, analysis r3) — findings

Saved by the facilitator from the tester's final reply (the tester's file write was refused). 65 screenshots in shots/ (no INDEX.md). PDFs: 01 Django review (6 pp.), 02 Django app boundaries (3), 03 Getting to know django-oscar (5), 04 Technical debt (5).
Sandbox check passed. ⚠ transitions: 2 (one was the tester's own scroll mistake).

### [P1] Captured "Commits" column shows "—" instead of numbers, in the app and the PDF
- TC-GEN-ONB-1 / C-take1, R2 — Table 2 "The codebase by directory" (Metrics → Directories): the live view shows commits per directory (src/oscar 35, tests 18, docs 6…); the captured table shows "—" on every row, and so does the PDF p. 1.
- Evidence: shots/TC-GEN-ONB-1__C01-take1.png, shots/TC-GEN-ONB-1__C02-table2-commits.png, 03 p. 1

### [P1] Identifier columns truncate to "…" plus a character in the live report (the PDF is fine)
- TC-DJANGO-1 / R2, R3 — Table 1 app column, Tables 3/4 file column, Table 6 Name: five different files all read "…bstract_models.py".
- Evidence: shots/TC-DJANGO-1__R02-scroll1.png, shots/TC-DJANGO-1__R07-scroll6.png

### HARNESS (void) Could not type into prompts
- Facilitator: coordinates read off scaled-down screenshots missed; the product fills prompts fine (verified). Redone with click-by-text after the fix.

### [P2] PDF table numbering skips an unfilled slot: Table 1, 2, 4, 5
- TC-DJANGO-2 / P3 — the matrix slot (Table 3, 122 columns) is left out of the PDF but keeps its number. Evidence: 02 pp. 1–2

### [P2] "Python codebase review" is marked "not found here" on a codebase that is 72% Python
- TC-DJANGO-1 / G2–G3 — Other ecosystems list; the Django band says "Python carries 72% of those lines". Evidence: shots/TC-DJANGO-1__G05-list-django-project-review.png

### [P2] Report and PDF name the snapshot by commit time (11 Sep, 17:53), the sidebar by scan time (24 Sep, 16:11)
- All four reports. Evidence: shots/TC-DJANGO-1__G01-gallery-open.png

### [P3] Django's "Roles in the code" explanation uses a Spring example: "(a class marked `@Service` is a service)"
- TC-DJANGO-1 / R4. Evidence: shots/TC-DJANGO-1__R02-scroll1.png

### [P3] Band says "4 tables, 1 figure" but the report labels all five slots "Table 1…5"
- TC-DJANGO-2 / G3, R1 — the matrix slot reads "Table 3 · Dependency matrix". Evidence: shots/TC-DJANGO-2__C02-take-matrix.png

## Passed checks (tester)
8-row App to app; 29 production apps; catalogue 32 migrations; 12 apps nothing else uses; 15-row hotspot and health tables; matrix can't-take message clear; pause → "Paused" bar → Back to report → "Resume taking · N left" worked; figures legible in app and PDF; no markup leaks; unfilled slots left out of PDFs; "No names are written here" true in the onboarding guide.

## Prompt redo (after the driver fix)
- TC-DJANGO-1 recreated: all 4 prompts filled with click-by-text; they print in `05-Django review_ django-oscar.pdf` (5 pp.), no placeholder text, no markup.
- TC-GEN-ONB-1 recreated: all 4 prompts filled; `06-Getting to know django-oscar.pdf` (6 pp.).
- The Table 2 "Commits → —" bug reproduced on the fresh report.
- T: click prompt "What the project does…" → cursor placed, text typed, Escape keeps it as prose · expected: this · shots/TC-DJANGO-1__W10, W11
- T: click prompt "Who this guide is for…" → same, clean · shots/TC-GEN-ONB-1__W02, W03
- No new findings. 85 shots in shots/, INDEX.md written.
