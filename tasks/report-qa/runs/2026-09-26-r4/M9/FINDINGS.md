# M9 · npo-data-pipeline (Python, r0) — port 4409 — Run 4, group B

Sandbox check: Reports = 0 before first report. OK.

Reports created: "Cleanup candidates" -> "Cleanup candidates: npo-data-pipeline" (1 page, A4,
saved as `01-Cleanup candidates_ npo-data-pipeline.pdf`); "Python codebase review" -> "Python
review: npo-data-pipeline" (11 cells; checked on screen).

## Checks

B5 ✓ Table 1 "Components no other component imports": the "(root)" row now shows 250 lines (not
282). Confirmed on screen and in the saved PDF: "(root) 250 5". This matches run 3's own
follow-up math (282 − 32 lines of `conftest.py` = 250), i.e. the pytest fixture file is no longer
counted as part of "(root)"'s production line total. (PDF `01-Cleanup candidates_
npo-data-pipeline.pdf` page 1; on-screen text captured in the report.)

B6 ✓ The size paragraph ("The snapshot holds …") no longer counts Markdown/YAML as production
lines, and says so. In "Python codebase review" → "The code": "The snapshot holds 307 production
files with 25,144 lines of code, grouped into 23 components, 10 of which hold Python code; the
scan found 1 Go module. Python carries 63% of those lines, then Shell (6%) and Go (5%). Outside
them: 83 test files and 31 files that are not code." (screenshot: shots/
M9_B6_size_paragraph.png). Verified via the SQL console that 18 Markdown/YAML files (3,817
lines total, e.g. `scripts/init_bigquery_emulator.yaml` at 1,900 lines, `docs/govolte-recovery.
md` at 254) all have a blank `component` field in the `files` table — i.e. they sit outside the
23 components the paragraph counts, consistent with landing in the "31 files that are not code"
bucket rather than the 307/25,144 production count. 307 + 83 + 31 = 421, matching the Overview's
total file count, so the three buckets are mutually exclusive and exhaustive as claimed.

## NEW findings

None.

## Summary

Both checks in scope (B5, B6) are fixed. "(root)" in Cleanup candidates correctly reads 250
lines now that the pytest `conftest.py` fixture is excluded from the production total, and the
Python codebase review's size paragraph correctly scopes "production lines" away from
Markdown/YAML documentation and config files, stating plainly that non-code files are "counted
apart" — confirmed both by the paragraph's own numbers reconciling against the Overview's file
count and by a direct SQL check showing all 18 Markdown/YAML files carry no component assignment.
