# Run 4 · re-checking what run 3 found, and the last open items (2026-09-26)

Same environment and rules as `VERIFY-R3.md` (read it first), with:

- Mission folders: `tasks/report-qa/runs/2026-09-26-r4/<M#>/`
  (absolute `/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-26-r4/<M#>/`).
- Driving: `DRIVE_SESSIONS=/private/tmp/claude-501/report-qa-drive-r4`.
- **Never delete, move or overwrite any file** outside your own `shots/` and
  `FINDINGS.md`; never delete a PDF; do not start or stop servers; do not edit code.
- If the Write tool refuses FINDINGS.md, write it with a Bash heredoc.

Each check names what was fixed. Mark ✓ / ✗ / ~ with the exact on-screen or
PDF text as evidence, then list anything NEW (P1 bug, P2 UX/flow, P3 wording).

## A · M1 BroadleafCommerce (4401) · M2 fineract (4402)
1. M1 Spring review: after Create, the right-hand Pool/Cell pane is **closed**; the "Figures to add" box has its explanation as a full-width line under its title row (not squeezed beside the buttons).
2. M1 Spring review, on screen: Table 2 (entry points) and Table 4 (entities) show names readable from the start, cut at the end with "…" when too long, never cut from the left, never overlapping the next column. (was M1-4)
3. M1 PDF of the Spring review: no table header breaks inside a word ("control / ler", "Componen / ts"); "MVC controller" wraps between words. (was P2)
4. M2 Architecture review: Take all; the matrix slot is left out; the summary box line for it quotes the view's reason ("… too many for a matrix"), not "drew nothing to take in 15 seconds". (was M2 NEW P2)
5. M2 Executive summary: component names read as plain words ("fineract integrationtests"), not code paths (`org.apache.fineract.integrationtests`). One page. (P3-8)
6. M2 Architecture review PDF: the "Most depended-on components" table's Instability equals dependencies ÷ (dependents + dependencies) for the rows shown; check two rows by hand. (instability)
7. Duplicate report (P1-13): Spring review on M1 → Take all → on the first slot press **Adjust…**, in the sheet press the fill button twice quickly; carry on, finish the run. The report must hold each section once (check the outline and the PDF page count against a report made without the double click).

## B · M4 Sylius (4404) · M7 nopCommerce (4407) · M9 npo (4409)
1. M4 PHP review PDF: "Packages by role" and "Composer packages" headers wrap between words and are not cut ("Message and command handlers" whole). (was M4-5)
2. M4 PHP review: "Composer declares N Composer packages" — N is about 42, and the Composer table lists `example/test-application` no more than once (was 30 copies).
3. M4 Hidden coupling: Take all; the Connections list slot's strip shows a "Files Production" chip; the taken list and the template's own table both cover production code. After the run, the sidebar's Files switch is back to what it was before.
4. M7 Architecture review: `lib_npm/…` (elfinder) is not in "Least healthy components"; the note under the table explains how production code was recognised on this old scan. (was M7-3)
5. M9 Cleanup candidates: the "(root)" row in "Components no other component imports" shows 250 lines, not 282 (conftest.py no longer counted). (was M9-1)
6. M9 any report: the "size" paragraph ("The snapshot holds …") no longer counts Markdown/YAML as production lines; it says files that are not code are counted apart.

## C · M5 LibreChat (4405) · M6 gin (4406) · M8 archstats-ui (4408)
1. M5 React review: the JS/TS paragraph and the roles paragraph give the **same** React component count (623). (was M5 residual)
2. M5 React review PDF: no heading sits alone at the foot of a page with its table on the next ("Components and hooks by folder"). No header split inside a word. (was M5 NEW P2 ×2)
3. M6 Go review: the roles paragraph says "(root)", never a bare "." ; Change impact on `binding`: the "Shortest import chain" column reads "(root) -> binding", not ". -> binding". (was M6-1)
4. M6 Architecture review PDF: the page before the dependency-structure figure is not left half empty. (PDF gap)
5. M8 Changes: default comparison shows the revision warning; **Compare anyway** shows the comparison (tangles section included), not a blank page. (was M8-1 P1)
6. M8 Go review: "Packages by how many others import them" lists Go packages only (`app/…`), no `frontend/…`. (was M8 NEW P1)
7. M8 Save as template on any report: click into the Name field and type a new name: it **replaces** the suggested name. (was M8 NEW P2)
8. M8 gallery: preview Architecture review; the structure paragraph shows its number ("the longest import chain is N levels deep"), both in the gallery preview and in the created report. (was M2 low-confidence P3)

## Reporting
`FINDINGS.md` per mission, one line per check (A1…, B1…, C1…), then NEW with priority.
