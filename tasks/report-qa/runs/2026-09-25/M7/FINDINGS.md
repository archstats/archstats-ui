# M7 findings — nopCommerce (http://localhost:4307/)

Sandbox check: Evidence -> Reports read `0` before the first report. OK, proceeding.

---

### HARNESS (void) Table cell errors print as run-on plain text in the PDF, losing all error styling
- Test case / step: TC-NET-1 / P3
- Status: VOID. The SQL console was switched off in the sandbox at the time; the facilitator turned it on and the tables ran correctly on redo (see PDF 02). The underlying observation (an errored table cell's message runs into the bold caption with no visual separation in the PDF) was only ever seen with this artificial SQL-off error and was not re-observed with a real error, so it is withdrawn rather than re-filed. Superseded by the new findings below.
- Original text kept for the record: In the app, a failed table cell showed a styled red error box ("The SQL console is switched off for this run."); in the PDF it printed as run-on text glued to the table caption. shots/05-net-table1-section.png, pages/01-1.png (page 1 of the first, now-superseded PDF "01-.NET review_ nopCommerce.pdf").

### [P1] Report's snapshot date does not match the workspace's open snapshot, by 3 days, with no explanation of which "time" it is
- Test case / step: TC-NET-1 / G3, R1, P3
- Where: .NET solution review, report header and every cell's provenance line (workspace nopCommerce)
- What happened: The sidebar shows the open snapshot as "21 Sep, 22:46" (and the other as "21 Sep, 00:33"). The gallery preview, the taking run, every cell's "Ran on" detail, the report header, and the saved PDF all instead say "Runs on 18 Sep, 16:23 · analysis r0" / "snapshot 18 Sep, 16:23" — a date that matches neither snapshot listed in the sidebar. Clicking a computed paragraph's Cell pane confirms: "Ran on / Snapshot 18 Sep, 16:23 / Analysis r0 / At 25 Sept, 19:17" (the last line being when the cell actually executed, today).
- Expected: If this is the known commit-time-vs-scan-time split (report/PDF name the snapshot by last commit time, sidebar names it by scan time), the report should say so, since a 3-day gap reads as "this ran on a different, possibly stale, snapshot" — which is exactly the kind of thing a careful reader would flag as a bug. At minimum the two times should be visibly reconciled somewhere in the report or PDF.
- Evidence: shots/10-net-cellpane-paragraph.png (Cell pane detail), shots/02-net-solution-review-gallery.png, pages/01-1.png (PDF header)
- Repro: Open nopCommerce (open snapshot 21 Sep, 22:46) -> Evidence -> Start a report -> .NET solution review -> Create -> read the header, or click any computed paragraph and read "Ran on" in the Cell pane.

### [P1] "No reference runs between two ASP.NET Core roles" despite 138 Controllers and 513 Services in the same solution
- Test case / step: TC-NET-1 / R1, R4
- Where: .NET solution review › "Roles and layers" section (workspace nopCommerce)
- What happened: The paragraph just above states the code has 138 Controllers, 513 Services, 21 Data access classes, 1,236 Entities & DTOs and 76 Middleware & Filters. The very next computed sentence says: "No reference runs between two ASP.NET Core roles." — i.e. zero references of any kind (skip-layer or in-order) between any of these roles, anywhere in a 5,589-file, 40-project solution. Meanwhile the same report's "Between namespaces" section finds a normal, populated import graph (71 components in 9 tangles, 13,623 component imports overall per Overview). A controller that never calls a service anywhere in a real ASP.NET app is implausible.
- Expected: Either this reference count is broken for this codebase (likely tied to the old scan / no-annotation role detection), or the report should explain why zero is plausible here. As written it looks like a bug, not a fact.
- Evidence: pages/01-2.png (PDF page 2, "Roles and layers" section)
- Repro: Create ".NET solution review" on nopCommerce -> read "Roles and layers" section.

### [P2] Dependency structure figure is an unlabeled, illegible cloud of dots
- Test case / step: TC-NET-1 / R3, P3
- Where: .NET solution review › "Between namespaces" › Figure 1, "Dependency structure" (Connections graph, grouped, 702 components)
- What happened: The figure taken from Connections (by group, graph) renders as several hundred overlapping grey dots with almost no visible connecting lines/arrows, no component labels, and only a two-line legend ("Depends on", "In a cycle"). Neither on screen nor in the PDF can a reader identify a single named component or read any structure from it.
- Expected: A figure inserted into a report to illustrate "dependency structure" should let a junior reader see at least the shape described in the paragraph above it (9 tangles, a 33-component one). As taken, it shows nothing actionable.
- Evidence: shots/07-net-figure1-full.png, pages/01-3.png (PDF page 3)
- Repro: Take Figure 1 in the .NET solution review template on nopCommerce with defaults (Graph, By group) and view it at report width.

### [P2] "For nopCommerce" lists and defaults to a JavaScript/TypeScript template ahead of the .NET template, on a codebase that is 48% C# and only 14% JavaScript
- Test case / step: TC-NET-1 / G2, G3
- Where: New report gallery, "For nopCommerce" group (workspace nopCommerce)
- What happened: Opening "Start a report" auto-selects "JavaScript/TypeScript workspace review" (found: 1 npm package) as the first, pre-highlighted option in "For nopCommerce", listed above ".NET solution review" (found: 40 .NET projects). nopCommerce's own Overview shows C# at 48% of lines vs JavaScript at 14%, and the JS/TS preview's own text says the workspace "holds 1 npm package" versus 40 .NET projects — the template's own words argue for .NET being the relevant one, yet it is not the default or first-listed.
- Expected: The template most representative of the workspace (by project/component count, or matching the majority language) should be first/default in "For <workspace>", especially since users are likely to just hit Enter on the highlighted option.
- Evidence: shots/01-gallery-first-view.png
- Repro: nopCommerce -> Evidence -> "Start a report" -> observe the highlighted/first option in "For nopCommerce".

### [P1] JavaScript/TypeScript template claims "1,109 React components" on a codebase that is 0% TypeScript and mostly C#/Razor
- Test case / step: TC-NET-1 / G3 (observed while reading the default-selected gallery template, not created as a report)
- Where: New report gallery › "JavaScript/TypeScript workspace review" preview band (workspace nopCommerce)
- What happened: The preview text reads: "The workspace holds 1 npm package, the largest nopcommerce. TypeScript is 0% of the JavaScript and TypeScript lines. The engine counts 1,109 React components." nopCommerce is an ASP.NET MVC/Razor application; 1,109 React components is implausible for a repo whose own numbers say there is a single npm package and 0% TypeScript.
- Expected: Either React-component detection is misfiring on Razor/.cshtml or other non-React files in this codebase, or the count needs a sanity check against the "1 npm package" fact directly above it in the same paragraph.
- Evidence: shots/01-gallery-first-view.png
- Repro: nopCommerce -> Evidence -> "Start a report" -> the JS/TS template is pre-selected by default -> read its preview paragraph under "Packages".

### [P1] "project" column in Table 2 is truncated to 3-7 illegible characters once the table has 8 columns, making rows impossible to identify
- Test case / step: TC-NET-1 redo (after SQL console was turned on) / R2, P3
- Where: .NET solution review › "What each project holds" › Table 2 (workspace nopCommerce)
- What happened: Table 2 has 8 columns (project, C# files, controllers, services, factories, data access, models and DTOs, validators, middleware and filters). To fit, the PDF shrinks the identifying "project" column until most names are cut to a handful of characters with a leading ellipsis: `Nop....`, `Nop.S...`, `Nop.C...`, `...ework`, `...merce`, `Nop.D...`, `...Brevo`, `...g.UPS`, `...cator`. A reader cannot tell which project a row is about without manually cross-referencing Table 1's full names in the same order — and even that only works because the two tables happen to share row order here.
- Expected: The one column that identifies the row should never be the one sacrificed to fit; either drop/merge less essential columns, wrap the project name, or narrow the numeric columns instead.
- Evidence: pages/02-2.png, pages/02-3.png (PDF "02-.NET review_ nopCommerce.pdf")
- Repro: Create ".NET solution review" on nopCommerce with the SQL console on -> save PDF -> read "What each project holds" (Table 2), page 2 onward.

### [P3] Table 1 and Table 2 use raw lowercase column headers ("project", "referenced by projects", "data access") while Table 3 and Table 4 use Title Case ("Name", "Line Count")
- Test case / step: TC-NET-1 redo / R2
- Where: .NET solution review › Table 1 "Projects, the most referenced first" and Table 2 "Projects by the roles their file names give away" (workspace nopCommerce)
- What happened: Table 1's headers read `project | directory | files | referenced by projects | references` and Table 2's read `project | C# files | controllers | services | factories | data access | models and DTOs | validators | middleware and filters` — all lowercase, unstyled, reading like a raw SQL result. Table 3 and Table 4 in the same report use proper Title Case headers ("Name", "Line Count", "Code Health", "Hotspot Score").
- Expected: Consistent, reader-facing header casing across all tables in the same report.
- Evidence: pages/02-1.png, pages/02-2.png (PDF "02-.NET review_ nopCommerce.pdf")
- Repro: Create ".NET solution review" on nopCommerce -> compare the headers of Table 1/2 against Table 3/4 in the saved PDF.

`TC-NET-1: done — 7 findings (1 voided by harness fix, 2 added on redo), PDFs "01-.NET review_ nopCommerce.pdf" (first pass, SQL off) and "02-.NET review_ nopCommerce.pdf" (redo, SQL on)`

Note: on redo, Table 3's numbers matched the facilitator's expected facts exactly (ProductController.cs, 4,361 lines, code health 2.4), which is a good sign for that table's correctness.

---

## TC-GEN-ARCH-2 · Architecture review, explanations off (M7 nopCommerce)

With "Explain the terms" unticked, the tally line correctly dropped from "10 paragraphs explaining the terms, 7 paragraphs counted..." to just "7 paragraphs counted from the snapshot, 3 tables, 5 figures... and 4 prompts". The report itself reads cleanly with only computed paragraphs and headings — nothing dangled or referred back to a removed explanation. No finding here; this behaved correctly.

The unfilled "Dependency matrix, in levels" slot (702 components, over the ~200-node matrix limit) showed a clear message both in the take bar ("Connections drew nothing to take; set it, then add it") and in the view itself ("702 components are too many for a matrix. A matrix reads well up to 200 nodes."), and correctly stayed out of the saved PDF entirely (no placeholder, no error text) once skipped, with the PDF preview banner honestly flagging "1 to add, left out". No finding here; this behaved correctly and is a good pattern other slot-kinds should probably match.

### [P1] A vendored third-party JS library is ranked #1 in "Least healthy components", contradicting the template's own definition that third-party code is excluded
- Test case / step: TC-GEN-ARCH-2 / R1, R2
- Where: Architecture review › "Code health" › Table 4, "Least healthy components" (workspace nopCommerce)
- What happened: The top row of Table 4 is `src/Presentation/Nop.Web/wwwroot/lib_npm/elfinder/js`, Code Health 1.07, Line Count 36,049, Hotspot Score 0 — a bundled copy of the third-party elfinder file-manager library, identified by its raw path rather than a namespace (every other row is a proper `Nop.*` namespace). The .NET review's own glossary (same workspace, other report) defines "Production code" as excluding "third-party code copied into the repository". This vendored library is nonetheless counted as the single worst-health production component in the codebase, which would send a reader chasing a "fix" that is actually just an unmodified vendored dependency.
- Expected: Vendored/third-party code folders should be excluded from "least healthy" and similar production-code rankings, consistent with the report's own stated definition.
- Evidence: pages/03-5.png (PDF "03-Architecture review_ nopCommerce.pdf" page 5)
- Repro: Create "Architecture review" on nopCommerce with defaults -> take Figure 4/Table 4 (Code health) -> read the top row of "Least healthy components".

### [P2] Report pages are left mostly blank because a figure is pushed to the next page while its heading and paragraph stay behind
- Test case / step: TC-GEN-ARCH-2 / P3
- Where: Architecture review PDF, page 1 → 2 boundary and page 6 (workspace nopCommerce)
- What happened: Page 1 ends after "Structure: how the parts depend on each other" and its one paragraph, with roughly 60% of the page left blank; Figure 1 (which belongs directly under that heading) starts fresh on page 2. Page 6 (the last page, Findings + Recommendations) is about 80% blank in the same way.
- Expected: Either pull the figure up to fill the page, or accept the break — but leaving most of a printed page empty while content flows to a near-empty next page reads as broken layout to a reader flipping through a printed/PDF report.
- Evidence: pages/03-1.png, pages/03-2.png, pages/03-6.png (PDF "03-Architecture review_ nopCommerce.pdf")
- Repro: Create "Architecture review" on nopCommerce with defaults -> save PDF -> look at page 1 and the final page.

`TC-GEN-ARCH-2: done — 2 findings, PDF "03-Architecture review_ nopCommerce.pdf"`

---

## TC-X-OTHER · A template for another ecosystem (M7 nopCommerce, "Spring application review")

This behaved well overall and is worth calling out positively: the gallery band for "Spring application review" on this .NET codebase honestly says "not found here" next to its name in the "Other ecosystems" list, and its "Leaves out" line names each dropped section with a specific, correct reason — e.g. "The web layer: how the controllers are split up (the scan found no controllers or JAX-RS resources)", "Repositories and the entity model (the scan found no JPA entities)", "Beans that switch on and off (no bean is conditional)". The created report does not fabricate Spring data: it says plainly "The snapshot has no Spring beans.", "None of the code's classes match a Spring role.", "The code has no Spring services." — and reuses genuinely language-agnostic sections (Build modules, Hotspots) that still make sense. No finding for the core behaviour; this is a good pattern.

One extra positive: while taking Figure 1, the take bar detected that the current view's settings (left over from a prior view visited earlier in this session) did not match what the template asked for, and showed "Taken with other settings than the template asks; the words around it may not fit what it shows." with a one-click "Take it as asked" fix. Clear and useful; no finding.

### [P3] The "Findings" prompt still asks about "controllers, services or entities" even though this report has none
- Test case / step: TC-X-OTHER / R7
- Where: Spring application review › "Findings" prompt (workspace nopCommerce, report "Spring review: nopCommerce")
- What happened: The report's own sections say plainly there are no Spring beans, roles or services here, and the web-layer/repository/entity sections were left out entirely (see "Leaves out" in the gallery). Yet the "Findings" prompt at the end still reads: "What you found, each tied to the evidence above: where the layers hold, where they leak, and which controllers, services or entities need attention first." A reader following the prompt literally would look for controllers/services/entities evidence that the report never produced.
- Expected: When every section referencing controllers/services/entities is left out, the closing prompt should not still ask the reader to write about them.
- Evidence: shots/29-xother-findings-prompt.png
- Repro: nopCommerce -> Other ecosystems -> Spring application review -> Create -> scroll to "Findings" and read the grey prompt text before filling it.

### [P3] A figure's callout label is clipped at the page edge
- Test case / step: TC-X-OTHER / P3
- Where: Spring application review › Figure 1, "Churn against code health" (Hotspots treemap) (workspace nopCommerce)
- What happened: The chart's "Churning, healthy" callout label is cut off at the right margin of the page, reading "Churning, healt" with the rest clipped off-page.
- Expected: Callout labels should stay within the printable page area, or wrap/reposition instead of running off the edge.
- Evidence: pages/04-2.png (PDF "04-Spring review_ nopCommerce.pdf" page 2)
- Repro: Take the "Churn against code health" figure (Hotspots view, default grouping) into any report and save the PDF; look at the top-right callout.

`TC-X-OTHER: done — 2 findings, PDF "04-Spring review_ nopCommerce.pdf"`

---

## Summary

Worst problems: (1) the "project" identifying column in an 8-column table gets truncated to 3-7 illegible characters once SQL-backed tables were turned on, making rows impossible to match back to a project without cross-referencing another table; (2) a vendored third-party JS library (`lib_npm/elfinder`) is ranked #1 "least healthy" component, directly contradicting the report's own stated definition that third-party code is excluded from production counts — this repeats the pattern of a report contradicting its own words; (3) "No reference runs between two ASP.NET Core roles" despite the same solution having 138 Controllers and 513 Services and a normal, populated import graph elsewhere in the same report — looks like broken role-level reference detection on this old-scan .NET codebase. The report/PDF snapshot date ("18 Sep, 16:23") never matching the sidebar's open-snapshot date ("21 Sep, 22:46") was confirmed as real and reproducible across every report in this mission, and deserves a product-level decision even if it is the known commit-time-vs-scan-time split.

What worked well: the "Other ecosystems" flow (Spring template on a .NET codebase) was honest end to end — clear "not found here" labelling, accurate per-section "Leaves out" reasons, and no fabricated Spring data anywhere in the report or PDF. The matrix "can't take" message for 702 components was clear both in the take bar and the view, and correctly stayed out of the PDF once skipped. Turning off "Explain the terms" cleanly removed only the glossary paragraphs with nothing left dangling. Typed prompts consistently printed as clean plain prose with no stray markdown.

Test cases completed: TC-NET-1, TC-GEN-ARCH-2, TC-X-OTHER — all three, each redone once after the mid-mission SQL-console harness fix. Nothing was left incomplete.
