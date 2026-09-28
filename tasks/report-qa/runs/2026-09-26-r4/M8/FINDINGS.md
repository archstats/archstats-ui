# M8 · archstats-ui (Go + Vue, r4) — run 4 findings

Sandbox check: Evidence showed Reports 0 before creating anything. OK.
Workspace/snapshot: archstats-ui, open snapshot 25 Sep, 17:30 · eea60c6, analysis r4 — matches VERIFY-R4.

Reports created:
1. Go module review -> "Go review: archstats-ui", 13 cells. PDF: `01-Go review_ archstats-ui.pdf` (4 pages, A4, 47 KB).
2. Architecture review -> "Architecture review: archstats-ui", 15 cells (no figures taken; only
   needed to read the "structure" paragraph). PDF: `02-Architecture review_ archstats-ui.pdf` (3 pages, A4, 44 KB).
Also exercised: Changes -> Compare (default baseline vs open snapshot) -> Compare anyway;
Go review's report overflow menu -> Save as template.

## Checks

C5 ✓ Changes: default comparison shows the revision warning; Compare anyway shows the
comparison (tangles section included), not a blank page.
- Opening Changes -> Compare shows the same warning as run 3: "These two snapshots were not read
  the same way. The scans were read by different analyses (revision 3 and 4); their numbers mean
  different things. ... Rescan baseline commit cffe84f at r4 · Compare anyway."
- Clicking "Compare anyway" now renders the full comparison: header reads "+28 −3 components ·
  +88 −12 dependencies · +0 tangles", an amber "Compared anyway: ..." banner with a "Rescan
  baseline" button, then "COMPONENTS ADDED AND REMOVED" (28 additions incl. frontend/src/...,
  3 removals), "DEPENDENCIES ADDED AND REMOVED", and a "TANGLES" section — not blank. This is the
  fix for run 3's P1 (M8-1): the page used to go completely empty here.
- Evidence: shots/M8__CH01-warning.png, shots/M8__CH02-compare-anyway.png.

C6 ~ Go review "Packages by how many others import them" lists Go packages only — the table is
fixed, but a NEW contradiction appears in the paragraph right below it.
- Table 3 "Packages by how many others import them" now lists Go packages exclusively: app/store
  (5, 18), app/query (3, 5), app/snapshot (3, 3), app/scan (2, 3), app (1, 1), app/changes (1, 1),
  app/report (1, 1), app/trends (1, 1). No `frontend/...` rows — the run 3 P1 (M8 NEW P1, "table
  and its prose list non-Go frontend folders") is fixed for the table itself.
- BUT the "Coupling" paragraph immediately under that same table, in the same "The packages
  everything imports" section, still says: "The most depended-on components are
  **frontend/src/features/snapshot** (16 components depend on it), **frontend/src/shared** (12)
  and **frontend/src/features/groups** (9)." None of these three appear anywhere in Table 3 above
  them (whose highest is app/store with 5 importers) — the paragraph is describing the whole
  codebase's coupling, not the Go-only table it sits directly under, so the two contradict each
  other in the same section. See NEW finding below.
- Evidence: shots/M8__R01-table3-vs-coupling-paragraph.png; PDF `01-Go review_ archstats-ui.pdf`
  (page with "The packages everything imports").

C7 ✓ Save as template: click into the Name field and type a new name — it replaces the
suggested name.
- Report overflow menu ("..." button on the report row in the Reports list, reached via Tab focus
  since it only reveals on hover/focus) -> "Save as template…" opened the dialog with Name
  pre-filled "Go review" (from the report title "Go review: archstats-ui").
- Clicked into the Name field and typed "My Go template": the field now reads exactly **"My Go
  template"**, fully replacing "Go review" rather than appending to it (run 3 found "Go
  reviewMy Go review template", a run-on concatenation — that P2 is fixed).
- Saved successfully via "Save template".
- Evidence: shots/M8__W07-save-template-dialog.png (before typing, "Go review" prefilled and
  selected), shots/M8__W08-name-typed.png (after typing, "My Go template" only).

C8 ✓ Gallery: preview Architecture review; the structure paragraph shows its number ("the
longest import chain is N levels deep"), both in the gallery preview and in the created report.
- Gallery preview (New report dialog, Architecture review selected, before Create): "...4 of 46
  components (27% of the lines) sit in 1 tangle... Propagation cost is 16%... With each tangle
  taken as one node, the longest import chain is **10 levels** deep."
- Created report, same paragraph, same wording and number: "...the longest import chain is
  **10 levels** deep."
- Evidence: shots/M8__G08-gallery-preview-levels.png; PDF `02-Architecture review_ archstats-ui.pdf`.

## NEW findings

### [P1] Go review's "Coupling" paragraph contradicts the Go-only table directly above it, reintroducing frontend components by another route
- Test case / step: C6
- Where: Go review -> "The packages everything imports" section -> Table 3 "Packages by how many
  others import them" (Go-only, correct) followed immediately by the "Coupling" explanatory
  paragraph (workspace archstats-ui, snapshot 25 Sep, 17:30 · eea60c6, analysis r4)
- What happened: Table 3 is correctly scoped to Go packages (app/store, app/query, app/snapshot,
  app/scan, app, app/changes, app/report, app/trends — 5 importers is the highest). The very next
  paragraph, which explains coupling for that same table ("A component's dependents are the other
  components that import it...The most depended-on components are..."), instead reports
  workspace-wide numbers dominated by frontend folders: "frontend/src/features/snapshot (16
  components depend on it), frontend/src/shared (12) and frontend/src/features/groups (9)." None
  of these three components, nor their dependent counts, appear in Table 3 at all — the table and
  its own descriptive paragraph now disagree within the same section, and the paragraph
  reintroduces exactly the "Go review pulls in Vue/TypeScript folders" problem that run 3 flagged
  for the table (M8 NEW P1), just relocated from the table to the prose.
- Expected: the "Coupling" paragraph in a Go-only report section should describe the same
  Go-scoped components the table above it lists, e.g. app/store as the most depended-on with 5
  dependents — not workspace-wide frontend coupling numbers.
- Evidence: shots/M8__R01-table3-vs-coupling-paragraph.png; reproduces in the saved PDF `01-Go
  review_ archstats-ui.pdf` ("The packages everything imports" page).
- Repro: archstats-ui -> Evidence -> New report -> Go module review -> Create -> scroll to "The
  packages everything imports" -> read the paragraph below Table 3.

### [P3] The "..." report menu (Rename / Duplicate / Save as template… / Delete…) is invisible to keyboard/assistive discovery except via Tab
- Test case / step: incidental, while locating the menu for C7
- Where: Evidence -> Reports list -> report row's overflow button (aria-label "More for <report
  title>") (workspace archstats-ui)
- What happened: the button is implemented with `opacity-0` and only
  `group-hover/r:opacity-100` / `focus-visible:opacity-100` to reveal it, so it never appears in
  a simple hover-simulation (synthetic mouse-move hover did not reveal it reliably) and is easy
  to miss entirely unless you already know to hover exactly over the row or Tab to it — there is
  no visible affordance (e.g. a static faint icon) hinting the control exists until the pointer
  or focus is already on it. This is a minor discoverability issue, not a functional bug (Tab
  focus does reveal and activate it correctly).
- Expected: not a hard requirement, but a slightly more persistent visual hint (e.g. very low but
  nonzero default opacity) would make the menu easier to find for someone unfamiliar with the UI.
- Evidence: shots/M8__W07-save-template-dialog.png shows the menu after it was successfully
  reached via Tab; no screenshot of the "invisible" state is included since it is, by definition,
  not visible.
- Repro: archstats-ui -> Evidence -> hover over a report row without landing precisely on/near
  its right edge, or view the row without keyboard focus — no menu affordance is visible.

## Summary

C5: done — fixed (0 findings)
C6: done — partly fixed (table fixed; 1 NEW finding, P1, in the paragraph below it)
C7: done — fixed (0 findings)
C8: done — fixed (0 findings)
Incidental: 1 NEW finding (P3, minor discoverability)
