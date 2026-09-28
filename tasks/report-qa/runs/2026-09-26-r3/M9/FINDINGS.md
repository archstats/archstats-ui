# M9 · npo-data-pipeline (Python, r0) — port 4409

Sandbox check: Reports = 0 before first report. OK. (Old scan, analysis r0, as expected for this
mission -- old-scan warnings are expected and not reported as findings.)

Report created: "Cleanup candidates" -> "Cleanup candidates: npo-data-pipeline", saved as
`01-Cleanup candidates_ npo-data-pipeline.pdf` (1 page, A4) in this mission folder.

## Checks

M9-1 [FAIL, P2] Table 1 "Components no other component imports" lists "(root)" with 282 lines.
Querying the snapshot directly (SQL console) shows "(root)" is made of exactly three files:
./conftest.py (32 lines), ./pipeline.py (241 lines), ./setup.py (9 lines) = 282, matching the table
exactly. Switching Files to the "Tests" lens filter and searching "conftest" confirms the app itself
classifies ./conftest.py as a test file (shown under the Tests lens even on this old, role-less
scan, i.e. the path-based test detection the improvement plan added does work) -- but the Cleanup
candidates table's "(root)" total still includes those 32 test lines instead of scoping to
production only. So this check still fails: a "no test files" leak, on the very check this fix was
meant to close. (shots: M9__R01-cleanup-table1.png, M9__F01-conftest-is-test-file.png; PDF page 1)
setup.py (a packaging/build script) is also in that total; more debatable as "non-code" so not
counted as a separate failure here, but worth a look.

M9-2 [OK] Both named templates are greyed out with a clear reason and gate creation behind
"Create it anyway":
- "Where tests are missing": gallery subtitle "Nothing in this snapshot fits it"; selecting it shows
  "Nothing in this snapshot fits this template: every section it would write is left out ('Tests in
  the codebase', because this scan did not sort files into production and test code; scan again to
  include it; 'Components no test reaches', because ...)."; Create button reads "Create it anyway".
  (shot: M9__G04-where-tests-missing-nothing-fits.png)
- "Module drift check" (listed under "Other ecosystems (12)"): gallery subtitle "Nothing in this
  snapshot fits it"; selecting it shows "Nothing in this snapshot fits this template: every section
  it would write is left out ('Used but not declared', because the build is not Maven...; 'Declared
  but not used', because the build is not Maven...)"; Create button reads "Create it anyway".
  (shot: M9__G03-module-drift-nothing-fits.png)

M9-3 [OK] "Cleanup candidates" gallery preview: "Leaves out 'Large files nobody has changed in two
years', because this scan is older than the code-age measure; scan again to include it." -- a
plain sentence, not a code/field-name dump. (shot: M9__G05-cleanup-candidates-leaves-out.png) I did
not find a template with a separate prose "code age" paragraph on this workspace to check
in-report wording (Health check-in and Python codebase review's visible sections did not surface
one within the scroll checked); the gallery leave-out reason is the clearest evidence available and
it reads as a sentence, so this check is scored OK on that basis.

## NEW findings

NEW [P3] Table 1 "Components no other component imports" mixes a real Python source file
(pipeline.py) with a pytest fixture file (conftest.py) and a packaging script (setup.py) under the
single misleading label "(root)" -- a junior reader has no way to tell, from the report alone, that
a third of that row's "unused code" is actually test scaffolding and packaging boilerplate rather
than a cleanup candidate. Tying into M9-1: once tests are correctly scoped out, "(root)" should
probably read as 250 lines (pipeline.py + setup.py) or 241 (pipeline.py alone, if setup.py is also
treated as non-production).
