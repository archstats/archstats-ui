# Run 3 · verifying the improvement plan (2026-09-26)

Runs 1 and 2 found the problems (`FINDINGS.md`); `IMPROVEMENT-PLAN.md` fixed
them in four phases. This run checks each fix in the app, ends every test in
a PDF, and looks for anything new the fixes broke. Same priorities as
`TEST-PLAN.md` §1 (P1 bug, P2 UX/flow, P3 wording for a junior developer).

## Environment

As in `TEST-PLAN.md` §2, with these differences:

- Build: the current working tree (all four phases), served from a worktree.
- Mission folders: `tasks/report-qa/runs/2026-09-26-r3/<M#>/`
  (absolute `/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/tasks/report-qa/runs/2026-09-26-r3/<M#>/`).
  Screenshots go in `<mission>/shots/`, named `<TC>__<step>.png`.
- Driving: `DRIVE_SESSIONS=/private/tmp/claude-501/report-qa-drive-r3`, one session per mission (`m1`, `m2`, …).
- **Never delete, move or overwrite any file** outside your own `shots/` and
  `FINDINGS.md`, and never delete a PDF. Do not start or stop servers.

## What changed, so you know what to expect

- **Create lands on the report.** No automatic run to the views. At the top
  of a new report a box lists the figures and tables to add ("Figures to
  add"), with **Take all** and a **Take** per slot.
- **Taking is a strip, not a modal.** In a run, the view shows one strip at
  its top: the slot's number and title, the settings asked for (amber when
  the view does not match), a thumbnail, and **Adjust… · Take · Skip · Stop**.
  Enter takes, Escape pauses. **Adjust…** opens the full Add to report sheet.
  When a view cannot give anything, the strip says why in the view's words.
- **The run ends with a summary** in that same box: "Added 2 of 3. Left: …".
- **Gallery:** opens on the template that fits the codebase best (by the
  share of production lines), has a search box, shows "Leaves out …" as an
  amber box above the summary line, and greys out templates that would write
  nothing ("Nothing in this snapshot fits it"; its button reads "Create it anyway").
- **Numbers share a scope:** preset tables (hotspots, health, size) count
  production code only and say so under the table; the root package "." is
  counted everywhere and shown as "(root)"; old scans without file roles
  recognise tests by their path.
- **PDF:** long cells wrap instead of being cut; wide tables are set smaller
  instead of dropping columns; "N of M rows." under a cut table; numbering
  has no gaps; a last line "Not included: …" lists slots left empty; a heading
  or lead-in sentence stays on the page with its table or figure.
- **Writing:** "/" on an empty line opens Insert; "1)" stays text; template
  explanations open for editing on double-click; Save as template confirms.

## Missions and checks

Each check names the finding it verifies. Mark each ✓ (fixed), ✗ (still
wrong, with evidence) or ~ (partly). Then note anything new.

### M1 · BroadleafCommerce (Spring, r3) — port 4401
1. Gallery default is the Spring review; search "entity" finds the JPA entity model. (F-1)
2. Spring review: Create → you stay on the report; "Figures to add" box lists the slots; header does not flash "ran elsewhere". (F-5, P3-7)
3. Take all: each view opens with the strip; Hotspots opens on the preset the slot asks for (no amber chip). Take each; at the end the box shows the summary. (F-6, F-7, F-8, F-11)
4. In the report, table names are cut in the middle (`org/…/ProductImpl.java`), never from the left. (P1-11)
5. PDF: tables wrap, "N of M rows." shows where a table is cut, numbering is consecutive. (P2-1, P2-2, P2-3)
6. JPA entity model: Create → the box shows its table slot; Take it works. (F-5 JPA)

### M2 · fineract (Spring + JAX-RS, r4) — port 4402
1. Spring review: the Spring paragraph mentions the JAX-RS resources; the roles paragraph counts Controllers including them. (P1-4 Spring, P1-7)
2. Units flow slot ("How … relate"): taken, from the Units view. (P1-15)
3. Architecture review: the matrix slot is left out with the view's reason in the strip; the explanation of the matrix does **not** print in the PDF; the PDF ends with "Not included: …". (P1-16, F-16)
4. Executive summary: fits one page, one figure. (P2-5)
5. JPA entity model / Spring review: no table says "stopped after 10s"; a slow one says it in a sentence. (P1-9)
6. Architecture review: no "By group" dot cloud; a sentence says the graph is left out. (P2-6)

### M3 · django-oscar (Django, r3) — port 4403
1. Gallery: Django review is the default; "Python codebase review" is listed under this codebase, not "not found here". (F-1)
2. "The codebase by directory" (onboarding): the directory table keeps its commit numbers. (P1-14)
3. The band counts table slots as tables ("2 tables and 1 figure"). (P1-12)
4. PDF numbering has no gaps. (P2-3)

### M4 · Sylius (Symfony/PHP, r4) — port 4404
1. Gallery default is the PHP review, not the JS/TS review. (F-1)
2. PHP review: roles paragraph counts "Entities & Models" in the hundreds, in line with the "entities and models" column. (P1-4, P1-7)
3. Dependency audit: `Sylius\Bundle` / `src/Sylius` are not counted as libraries. (P1-4 libraries)
4. Hotspots paragraph and table: both production code; the table says so under it. (P1-4 PHP hotspots)
5. PDF: the "Packages by role" table keeps every column (smaller type), nothing cut mid-word. (P2-1)

### M5 · LibreChat (React, r0) — port 4405
1. React review: React component counts in the JS/TS paragraph, the roles paragraph and the folders table are close; say the numbers. (P1-4 React)
2. Anything that reads "No reference runs between two roles" on this old scan should instead say the snapshot does not record which classes use which. (P1-5)

### M6 · gin (Go, r0) — port 4406
1. Go review: "N packages" in the paragraph equals the rows of the package table; the root package shows as "(root)". (P1-4 Go)
2. Libraries: `github.com/stretchr/testify` with dots. (P1-8)
3. Change impact on a component with dependents: "N production components import it directly" matches step 1 of "How far a change can reach"; no direct import says "2 steps away". (P1-4 change impact)
4. Go "Structs tagged for the most formats" lists no `_test.go` structs. (P1-5)
5. Change impact without a component: Create is still possible, but "Choose a component…" never prints in the PDF. (P1-10)

### M7 · nopCommerce (.NET, r0) — port 4407
1. Gallery default is the .NET review. (F-1)
2. JS/TS review (from the list): no claim of React components. (P1-5)
3. Architecture review: `lib_npm/elfinder` (third-party) is not in the least-healthy table. (P1-6)
4. .NET review layers: says the snapshot does not record which classes use which, if so. (P1-5)
5. The report on screen: with the Cell pane closed, Table 1 shows all its columns. (F-12)

### M8 · archstats-ui (Go + Vue, r4) — port 4408
1. "What changed since the last snapshot": Changes compares against a different commit, and finds something (or says why). (P1-17, F-9)
2. Go review: the roles and libraries paragraphs describe Go only (no `vitest`, `vue`, `pinia`, no `frontend/...` folders). (P1-7)
3. Blank report: "/" on an empty line opens Insert; typing "1) first" stays a paragraph; searching "table" in Insert finds the table presets. (F-14)
4. Save as template on a template-made report: explanations stay explanations (the reused template still offers "Explain the terms"); a confirmation shows. (F-15)
5. A long report title wraps instead of clipping. (P2-7)
6. The header shows "N prompts to write". (F-13)

### M9 · npo-data-pipeline (Python, r0) — port 4409
1. Cleanup candidates / largest components: no test or non-code files. (P2-8)
2. "Where tests are missing" and "Module drift": greyed out in the gallery if they would be empty; creating asks "Create it anyway". (F-2, P1-5)
3. Code age paragraph: if left out, the reason is a sentence. (P3-6)

## Reporting

Write `<mission>/FINDINGS.md` if you can; if writing is refused, put the same
content in your final reply. Format per check:

```
M4-2 ✓ Roles: "235 Entities & Models" … column total 241 (shot: M4__R02-roles.png)
M4-3 ✗ [P1] "Sylius\Bundle" still listed … (shot …)
NEW [P2] <what> · <where> · <shot>
```
