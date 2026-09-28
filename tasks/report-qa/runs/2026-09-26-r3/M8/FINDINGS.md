# M8 · archstats-ui (Go + Vue, r4) — port 4408

Sandbox check: Reports count read `0` before the first report was created. OK.

## Checks

M8-1 ✗ [P1] Opening Changes now correctly picks a DIFFERENT commit as the baseline by default
(24 Sep 19:49 · cffe84f vs the open snapshot 25 Sep 09:09 · eea60c6, scanned 25 Sep 17:30) — the
original bug (comparing two scans of the same commit) is fixed. But because the two snapshots
were read by different analysis revisions (r3 and r4), Changes shows a warning first: "These two
snapshots were not read the same way. The scans were read by different analyses (revision 3 and
4); their numbers mean different things. ... Rescan baseline commit cffe84f at r4 · Compare
anyway". Clicking "Compare anyway" makes the entire main content area go BLANK — no Compare/Over
time toolbar, no snapshot pickers, no error, nothing (reproduced twice, from a fresh visit to
Changes each time). So the check's "or says why" path is itself broken: it doesn't say why, it
goes blank. (shots: CH01-changes-compare-warning.png, CH02-after-compare-anyway.png,
CH03-blank-after-compare-anyway-retry.png)
Note: selecting two snapshots of the *same* commit and same analysis revision (25 Sep 17:29 vs
17:30, both eea60c6/r4) works fine and honestly reports "No structural changes between these
snapshots" — so the Compare view itself isn't broken in general, only the "Compare anyway"
continuation from the analysis-mismatch warning.

M8-2 ✓ Go review "roles" and "libraries" paragraphs describe Go only. The roles paragraph (under
"What each package holds"): "No framework is clear enough to name, so Archstats sorts the code by
its structure: the code outside tests declares 147 types and functions: 1 in Entry points ..., 22
Logic and 1 Model ..., and 123 that match no rule. Where they live: Entry points across 1
component, all in `.` ...; Logic across 4 components, the most in `app` (19) and `app/changes`
(1) ...; Models across 1 component, all in `app` ..." — all Go directories, no `vitest`/`vue`/
`pinia`/`frontend/...`. Libraries paragraph: "The code imports 7 libraries from outside its own
components ... besides 26 platform modules. The most widely imported are
github.com/mattn/go-sqlite3 (in 5 files), github.com/archstats/archstats (in 4 files) and
github.com/google/uuid (in 4 files)." — also Go-only. (shot: R02-go-roles-libs.png; PDF
"01-Go review_ archstats-ui.pdf")

M8-3 ✓ Blank report flow: "/" on an empty line opened the Insert menu ("Facts, written out" list
of computed paragraphs, plus a table search). Typing "1) first" stayed a plain paragraph, not an
auto-numbered list item (shot: W01-blank-typing-1-first.png). Searching "table" in Insert found
the table presets (Largest components, Most changed files, Hotspot files, Least healthy files,
Hotspot components, Least healthy components, Most depended-on components) (shot:
W03-insert-table-search.png). PDF saved as "02-Untitled report.pdf".

M8-4 ✓ (with a new P2) Save as template on the Go review: report overflow menu → "Save as
template…" opens a dialog that reads clearly (Name, "What it is for" (optional), "Turn my
paragraphs into prompts" with its explanation, a "Comes with it" checklist: "8 headings", "7
counted paragraphs, counted afresh", "6 tables and queries, run afresh", "9 explanations of the
terms, left out when \"Explain the terms\" is off", "2 prompts", "Not what it found: every cell
runs again on the snapshot it is used with."). Saving shows a confirmation inline in the same
dialog: 'Saved "<name>". It is under Yours when you start a new report.' (shot:
W08-save-template-confirm-check.png). The template does appear under "Yours" in New report
(search finds it; shot W09-yours-group-template.png), with "Explain the terms" still offered and
checked. Creating a report from it and exporting to PDF shows the term explanations are still
printed as explanations (not turned into prompts), e.g. "This section counts what the scan
found. Production code is the code that ships to users; ..." and "In Go a component is a
package: one folder. ..." — present in full in "04-Go reviewMy Go review template_
archstats-ui.pdf".

M8-5 ✓ A long report title wraps instead of clipping. Set the blank report's title to "A very
long report title that should wrap across multiple lines instead of getting clipped by the
layout, to check the title wrapping fix" — it wraps cleanly across 4 lines in the report body
(shot: W04-long-title-wrap.png). (The sidebar Reports list shows the same title single-line with
a trailing "…" ellipsis, which is normal/expected for a list row, not a clip mid-glyph.)

M8-6 ✓ The header shows "N prompts to write": "Snapshot of 25 Sep, 17:30 · commit eea60c6 of 25
Sep, 09:09 · analysis r4 · 13 cells · 2 prompts to write" on the Go review. (shot:
R03-go-header-prompts.png)

## NEW findings

### [P1] "Compare anyway" on a mismatched-analysis Changes comparison leaves the page blank
- Test case / step: M8-1
- Where: Changes › Compare (workspace archstats-ui). Default baseline 24 Sep 19:49 · cffe84f
  (analysis r3) vs open snapshot 25 Sep 09:09 · eea60c6 (analysis r4, scanned 25 Sep 17:30).
- What happened: Changes correctly warns "These two snapshots were not read the same way. ...
  Rescan baseline commit cffe84f at r4 · Compare anyway". Clicking "Compare anyway" clears the
  entire main pane to empty — no toolbar (Compare/Over time/Export), no snapshot selectors, no
  diff, no error text. Reproduced twice by navigating away (Overview) and back to Changes, then
  clicking "Compare anyway" again both times.
- Expected: either the comparison renders across the analysis-revision boundary with a caveat, or
  a clear message explains why it can't ("these can't be compared even so, because ..."), per the
  "or says why" bar set by the improvement plan and by F-9 ("Failures are dead ends").
- Evidence: shots/CH01-changes-compare-warning.png, shots/CH02-after-compare-anyway.png,
  shots/CH03-blank-after-compare-anyway-retry.png.
- Repro: archstats-ui workspace → Changes → (default opens with the warning banner) → click
  "Compare anyway".

### [P1] Saved PDF filename is truncated and loses its .pdf extension for a long report title
- Test case / step: incidental, found while checking M8-5
- Where: PDF preview → "Save PDF…" (workspace archstats-ui, report titled "A very long report
  title that should wrap across multiple lines instead of getting clipped by the layout, to
  check the title wrapping fix")
- What happened: the app's own "Saved to" line reads: ".../M8/03-A very long report title that
  should wrap across multiple lines instead of getting clipped by the layout_ to check the t" —
  cut off mid-word, with no ".pdf" extension. `file` confirms the saved bytes are a valid PDF
  ("PDF document, version 1.3, 1 pages"), but without an extension the OS/Finder won't open it
  as a PDF by default and it's not obviously a PDF from its name.
- Expected: the filename should truncate (if it must) at a word boundary and keep the ".pdf"
  extension, the same way report/table captions elsewhere truncate in the middle rather than
  losing meaning.
- Evidence: shots/P01-pdf-filename-truncated-no-extension.png; the file itself:
  "03-A very long report title that should wrap across multiple lines instead of getting
  clipped by the layout_ to check the t" (123 chars, no extension) in the M8 run folder.
- Repro: create any report, give it a title long enough to exceed the app's filename-truncation
  limit (~120+ characters), PDF preview → Save PDF….

### [P1] Go module review's "packages everything imports" table mixes in Vue/TypeScript frontend folders
- Test case / step: incidental, found while checking M8-2
- Where: Go review › "The packages everything imports" › Table 3 "Packages by how many others
  import them" (workspace archstats-ui)
- What happened: despite the section's own lead-in being Go-specific ("In Go a component is a
  package: one folder. ... Go also refuses import cycles between packages..."), the table and its
  prose list non-Go frontend folders as if they were Go packages: "frontend/src/features/snapshot
  (16 components depend on it), frontend/src/shared (12) and frontend/src/features/groups (9)"
  and the table's top rows are all `frontend/...` and `frontend/wailsjs/go/...` paths, with only
  one Go package (`app/store`) inside the top 12.
- Expected: a "Go module review" table titled around Go-specific semantics (packages, the `.`
  root, `internal`) should be scoped to Go components only, the same way the roles and libraries
  paragraphs correctly are.
- Evidence: shots/R01-go-table3-frontend-mixed.png; "01-Go review_ archstats-ui.pdf".
- Repro: archstats-ui → Evidence → New report → Go module review → Create → scroll to "The
  packages everything imports".

### [P2] "Save as template" Name field is pre-filled but not selected, so typing appends instead of replacing
- Test case / step: M8-4
- Where: Evidence › report overflow menu › "Save as template…" dialog, Name field (workspace
  archstats-ui)
- What happened: the Name field opens pre-filled with a default (here "Go review", trimmed from
  the report's own title "Go review: archstats-ui"). Clicking into the field and typing does not
  select/replace the existing text, so the result is a run-on name: "Go reviewMy Go review
  template" (reproduced a second time as "Go reviewMy Go review template 2").
- Expected: either the field is empty by default, or its text is pre-selected on focus so typing
  replaces it, avoiding a garbled concatenated name landing in the template gallery.
- Evidence: shots/W08-save-template-confirm-check.png (dialog shows "Go reviewMy Go review
  template 2" as the saved name); shots/W09-yours-group-template.png (both garbled names listed
  under "Yours").
- Repro: any report → overflow menu → "Save as template…" → click the Name field → type a name
  without first clearing it.

## Summary

Four reports created (Go module review, Blank report, a long-titled blank report, and a report
from a custom saved template) plus the Changes comparison view, all checked and PDFs saved to
this folder. The most serious problem is M8-1: the Changes view's new "different analyses"
warning is a good addition, but its own "Compare anyway" escape hatch renders a completely blank
page with no error, which is worse than the old dead-end message it replaces. Two other P1s
turned up by chance: saving a PDF for a long report title truncates the filename and drops the
".pdf" extension (the file is still valid PDF bytes, just unopenable by double-click), and the Go
module review's "packages everything imports" table pulls in Vue/TypeScript frontend folders
despite framing itself in Go-only language just above. On the positive side: the roles and
libraries paragraphs in the Go review are cleanly Go-only, the blank-report Insert flow (/, "1)
first" staying plain text, and table search) all work as intended, long report titles wrap
correctly in the report body, "Save as template" preserves explanations and shows a clear
confirmation and does land the template under "Yours", and the header's "N prompts to write"
count is accurate — with the caveat that the template's own Name field silently concatenates
instead of replacing pre-filled text.

M8-1: done — 1 finding (P1)
M8-2: done — 1 finding (P1, incidental)
M8-3: done — 0 findings
M8-4: done — 1 finding (P2)
M8-5: done — 1 finding (P1, incidental)
M8-6: done — 0 findings
