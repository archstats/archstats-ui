# M4 Findings — Sylius (http://localhost:4304/)

Sandbox check: Evidence -> Reports count = 0. OK, proceeding.

Note (not a finding, harness context): the Overview banner reads "Scanned by
an older analysis. Analysis revision 4 changed how scans are read. Scan again
to see them." even though the plan lists M4 at analysis revision 3. Recording
here for traceability; not treated as a product finding unless it affects a
report.

## TC-PHP-1 · PHP application review (M4 Sylius)

### [P1] Analysis revision differs for the same snapshot within one report
- Test case / step: TC-PHP-1 / R1, P3
- Where: PHP application review > every text section vs Figure 1 caption (workspace Sylius, snapshot commit 6b24cc1)
- What happened: Every computed paragraph and table footer reads "Sylius · snapshot 18 Sep, 08:55 · analysis r0", but Figure 1's caption on the same report and same PDF reads "Sylius · snapshot 18 Sep, 08:55 · 6b24cc1 · analysis r3" — same date/commit, different analysis revision.
- Expected: One report should report one analysis revision for the snapshot it ran on.
- Evidence: shots/tc-php-1-take-figure1.png; 01-PHP review_ Sylius.pdf pages 1 and 3.
- Repro: Create "PHP application review" for Sylius, take Figure 1, read the provenance line under each section vs. under the figure.

### [P1] "Roles and layers" fails to detect Symfony roles; near-zero classes found
- Test case / step: TC-PHP-1 / G5, R1
- Where: PHP application review > Roles and layers (workspace Sylius)
- What happened: "Archstats reads this as By structure. The code outside tests declares 67 classes: 2 Models (records and field-heavy types), and 65 that match no rule." For an 11,725-file, 60-Composer-package Symfony codebase (CoreBundle alone is documented at 597 classes / 74 form types), finding only 67 classes total, with no Controllers/Entities/Repositories/Form types detected, contradicts both the template's own promise ("classifies... controllers, entities, repositories, form types, handlers, subscribers") and the known scale of the codebase.
- Expected: Symfony role detection (annotations/base classes as described in the template's own explanation) should recognize Sylius's bundle classes, or the report should say plainly that detection is not available for this workspace rather than silently reporting an implausibly small count.
- Evidence: shots/tc-php-1-gallery-roles.png; 01-PHP review_ Sylius.pdf page 1.
- Repro: Create "PHP application review" for Sylius; read the "Roles and layers" paragraph.

### [P2] Dependency-structure figure is an unreadable, unlabeled cloud of dots
- Test case / step: TC-PHP-1 / C2, P3
- Where: PHP application review > Figure 1 "Dependency structure" (Connections view, Level = By group)
- What happened: With 1,377 components and "Level: By group" selected, the taken figure and printed PDF page show only a dense, borderless cloud of grey dots with no group outlines or labels — matching the Connections view's own warning "1,378 components at once draw as a cloud. Grouping them shows the shape," except the grouping never becomes visually apparent even though "By group" is the level asked for.
- Expected: A figure captioned "Dependency structure" and generated "By group" should show visible group boundaries/labels, or the take flow should warn that this view cannot usefully render at this scale and suggest a narrower group/level.
- Evidence: 01-PHP review_ Sylius.pdf page 3; shots/tc-php-1-take-figure1.png.
- Repro: Create "PHP application review" for Sylius, take Figure 1 as asked (Connections, Graph, By group), view page 3 of the saved PDF.

### [P3] Two sentences with subject/verb agreement or garbled grammar
- Test case / step: TC-PHP-1 / R1
- Where: PHP application review > "Between namespaces" and "Dependency rules" paragraphs
- What happened: "Propagation cost is 2%: of all ordered pairs of components, that share are linked by a chain of imports." (garbled clause, hard to parse) and "1 import break 1 rule of the 2 that apply... The other 1 rule hold." (break/hold should be "breaks"/"holds" for singular "1 import"/"1 rule").
- Expected: Grammatically correct sentences a junior developer can read in one pass.
- Evidence: 01-PHP review_ Sylius.pdf pages 2 and 4.
- Repro: Create "PHP application review" for Sylius; read the "Between namespaces" and "Dependency rules" paragraphs.

TC-PHP-1: done — 4 findings, PDF "01-PHP review_ Sylius.pdf"

## TC-X-LETTER · Page size (M4, on TC-PHP-1)

Switched the PDF preview from Letter (default) to A4 and saved a second copy. Letter = 5 pages
/ 809 KB; A4 = 4 pages / 808 KB (Table 5 fits on one page under A4 instead of splitting across
pages 4-5 under Letter). Both keep table headers intact where a table does split, both keep every
section, and neither breaks a heading across a page. No findings beyond the page count/pagination
difference itself, which is expected reflow, not a bug.

TC-X-LETTER: done — 0 findings, PDF "02-PHP review_ Sylius.pdf"

## TC-PHP-2 · Symfony bundle review (M4 Sylius)

### [P1] Same commit hash shown with two different times in the same session
- Test case / step: TC-PHP-2 / R1 (compared against TC-PHP-1's Figure 1)
- Where: Evidence toolbar "Snapshot the cells run on" selector vs. Figure 1's caption in "PHP review: Sylius" (workspace Sylius)
- What happened: The toolbar's snapshot selector lists an option "16 Sep, 08:50 · 6b24cc1", but the PHP application review report's Figure 1 caption (same session, same workspace) reads "Sylius · snapshot 18 Sep, 08:55 · 6b24cc1 · analysis r3" — the identical commit hash 6b24cc1 is timestamped 16 Sep 08:50 in one place and 18 Sep 08:55 in another.
- Expected: One commit should show one timestamp everywhere in the app.
- Evidence: shots/tc-php-2-snapshot-selector-closed.png; 01-PHP review_ Sylius.pdf page 3.
- Repro: Create the PHP application review, take Figure 1, read its caption; then open the "Snapshot the cells run on" dropdown on Evidence and compare its option for commit 6b24cc1.

### [P2] "Dependency matrix" slot is stuck showing "Taking…" after backing out of a can't-take run
- Test case / step: TC-PHP-2 / C2, C3, R3
- Where: Symfony bundle review > Table 3 "Dependency matrix" slot (workspace Sylius, 1,378 components)
- What happened: Taking Table 3 opens Connections in Matrix view, which correctly refuses with "1378 components are too many for a matrix. A matrix reads well up to 200 nodes. Group the components first…" (this can't-take message is clear and expected). But there is no Skip action in that state, only "Back to report"/"Stop taking". After returning, the report's Table 3 card is left reading "Taking…" next to "Set it yourself" indefinitely — it looks like a stuck spinner/in-progress state, not like a slot that failed to take and needs a manual decision. The reason ("too many components for a matrix") is not shown anywhere on the report page itself, only transiently during the take flow.
- Expected: A slot that could not be taken should say so on the report page itself (e.g. "Couldn't take: 1,378 components are too many for a matrix"), not display a perpetual "Taking…" label.
- Evidence: shots/tc-php-2-matrix-cant-take.png, shots/tc-php-2-snapshot-selector-closed.png.
- Repro: Create "Symfony bundle review" for Sylius, let it take Table 3, back out via "Back to report" without resolving the slot, look at Table 3 on the report page.

TC-PHP-2: done — 2 findings, PDF "03-Symfony bundles_ Sylius.pdf"

## TC-GEN-DEP-1 · Dependency audit (M4 Sylius)

### [P1] "Looks internal" column misses the codebase's own namespace
- Test case / step: TC-GEN-DEP-1 / R2
- Where: Dependency audit > Table 1 "Libraries" (workspace Sylius)
- What happened: The "Looks internal" column reads "yes" for `src/Sylius` and `Sylius\Bundle`, but is blank ("—") for `Sylius\Resource`, even though `Sylius\Resource` is one of the project's own namespaces (the same report's "Between the code's own components" section separately treats `Sylius\Component\Core\Model` etc. as first-party code). A junior reading the table would conclude `Sylius\Resource` is a third-party dependency to audit/upgrade, which it is not.
- Expected: Internal-namespace detection should be consistent for all of the codebase's own `Sylius\*` namespaces, or the column's rule should be explained since it's clearly not a simple prefix match.
- Evidence: 04-Dependency audit_ Sylius.pdf page 1.
- Repro: Create "Dependency audit" for Sylius, take Table 1 "Libraries", compare the "Looks internal" column across the `Sylius\*` rows.

(Same analysis-revision inconsistency as previously filed also reproduces here: Table 1's caption
reads "analysis r3" while the rest of the report reads "analysis r0" — not re-filed as a separate
finding, see the TC-PHP-1 finding above.)

TC-GEN-DEP-1: done — 1 finding, PDF "04-Dependency audit_ Sylius.pdf"

## Harness update — SQL console re-enabled

The facilitator turned the sandbox's SQL console back on and restarted the server mid-mission.
No finding above was filed against the "The SQL console is switched off for this run." table
placeholders — that was treated throughout as a harness fact (§3), not a product bug, so there is
nothing to mark HARNESS (void). Session restarted (`m4 stop` / `m4 start`), sandbox re-checked
(Evidence → Reports = 0), then TC-PHP-1, TC-PHP-2 and TC-GEN-DEP-1 were quickly re-created to
check the query tables (R2) and re-saved as fresh PDFs (05–07); findings below are new.

## TC-PHP-1 re-check with SQL console on (M4 Sylius)

### [P1] "Packages by role" and "Package to package, by references" run but return zero rows
- Test case / step: TC-PHP-1 / R2 (re-check after harness fix)
- Where: PHP application review > Table 2 "Packages by role" and Table 3 "Package to package, by references" (workspace Sylius)
- What happened: Both queries now run (no longer blocked), print their column headers, and then print no data rows at all — not even a "no rows" message. Table 3 finding zero package-to-package references directly contradicts Table 1 on the very same page, whose "internal dependencies" column lists real references (e.g. "sylius/admin-bundle" depends on "sylius/ui-bundle, sylius/core-bundle, sylius/payum-bundle"). Table 2 returning zero rows for Controllers/entities/repositories/etc. is consistent with the "Roles and layers" paragraph's near-zero class count filed earlier, reinforcing that role detection is broken for this workspace rather than merely sparse.
- Expected: A table with real underlying data (Table 1 proves the dependency data exists) should not silently print zero rows; if a query genuinely finds nothing, the report should say so explicitly.
- Evidence: 05-PHP review_ Sylius.pdf pages 2-3.
- Repro: Re-create "PHP application review" for Sylius with the SQL console on; read Table 2 and Table 3.
- Also seen: same emptiness reproduces in "Symfony bundle review" for Sylius — Table 1 "Bundles by what they register" and Table 2 "Package to package, by references" both run and print only column headers, zero rows.

### [P3] Raw rule identifier printed instead of its human-readable name
- Test case / step: TC-PHP-1 / R2 (re-check)
- Where: PHP application review > Table 4 "Imports that break a rule" (workspace Sylius)
- What happened: The "rule" column prints `rules__symfony__component_must_not_depend_on_bundle`, while the paragraph directly above the table already gives the readable name for the same rule: "Component must not depend on Bundle".
- Expected: The table should show the same human-readable rule name the paragraph uses, not the internal snake_case/dunder identifier.
- Evidence: 05-PHP review_ Sylius.pdf page 5.
- Repro: Re-create "PHP application review" for Sylius with the SQL console on; read Table 4's "rule" column.

### [P2] Table 1 and Table 2 are too wide for the page; long cells and headers are ellipsis-truncated
- Test case / step: TC-PHP-1 / P3 (re-check)
- Where: PHP application review > Table 1 "Composer packages" and Table 2 "Packages by role" (workspace Sylius)
- What happened: Table 1's "Name" and "directory" columns are cut to a few characters with a leading "…" (e.g. "…admin-bundle", "…c/Sylius/Bundle/CoreBundle") and its "internal dependencies" cell list is cut off mid-word ("sylius/ui-bundle, sylius/core-bundle, syli…"). Table 2's nine column headers are each truncated to 4-7 characters ("packa…", "contr…", "reposi…", "form t…", "valida…").
- Expected: Column widths (or a narrower column set / wrapped text) that keep names and headers legible in the PDF at report width.
- Evidence: 05-PHP review_ Sylius.pdf pages 1-2.
- Repro: Re-create "PHP application review" for Sylius with the SQL console on; view Table 1 and Table 2 in the saved PDF.

TC-PHP-1 (re-check): done — 3 new findings, PDF "05-PHP review_ Sylius.pdf"

## TC-PHP-2 and TC-GEN-DEP-1 re-check with SQL console on (M4 Sylius)

TC-PHP-2 re-created ("Symfony bundles: Sylius"): Table 1 "Bundles by what they register" and
Table 2 "Package to package, by references" both now run but return zero rows — recorded as an
"Also seen" addition to the zero-rows finding above rather than a new block. PDF saved as
"06-Symfony bundles_ Sylius.pdf" (1 page; Table 3 still correctly left out as "to add").

TC-GEN-DEP-1 re-created ("Dependency audit: Sylius"): Table 2 "Build modules" now runs and
returns real rows (40 of 65, composer/npm packages with dependency counts) — no longer blocked,
no new finding. Table 3 "Imports that break a rule" reproduces the same raw rule identifier
(`rules__symfony__component_must_not_depend_on_bundle`) already filed against TC-PHP-1's Table 4;
not re-filed separately. PDF saved as "07-Dependency audit_ Sylius.pdf".

Note: while re-opening the gallery for TC-GEN-DEP-1, a click on the still-scrolling template list
landed on "Create report" before "Dependency audit" was actually selected, creating a stray,
untouched "Workspace review: Sylius" (JavaScript/TypeScript workspace review) report with 2 slots
left unfilled. This is a tester slip, not a product finding, and was left in place per the "never
delete anything" rule; it does not appear in any saved PDF.

## TC-QW-HIDDEN-1 · Hidden coupling (M4 Sylius)

### [P1] Two tables in the same report disagree on shared-commit counts for the same pairs
- Test case / step: TC-QW-HIDDEN-1 / R2
- Where: Hidden coupling > Table 1 "Changed together, no import between them" vs Table 2 "Hidden coupling" (workspace Sylius)
- What happened: For the identical component pairs, Table 1's "commits that changed both" and Table 2's "shared commits" give different numbers: Sylius\Behat\Context\Setup / …\Ui\Admin = 353 vs 377; …\Api\Admin / …\Ui\Admin = 242 vs 255; Setup / …\Ui\Shop = 147 vs 203; Setup / …\Transform = 129 vs 151; Transform / …\Ui\Admin = 85 vs 91. Both tables claim to count "shared"/"changed together" commits for the same pair in the same snapshot, one page apart in the same PDF.
- Expected: The same pair of components should have one shared-commit count across a single report, or the two tables should explain why they count differently (e.g. different commit windows).
- Evidence: 08-Hidden coupling_ Sylius.pdf page 1 (Table 1) and page 2 (Table 2).
- Repro: Create "Hidden coupling" for Sylius, take both tables, compare the same component pair's commit count in Table 1 vs Table 2.

### [P2] Long, near-identical component names are truncated to indistinguishable text
- Test case / step: TC-QW-HIDDEN-1 / P3
- Where: Hidden coupling > Table 1 "Changed together, no import between them" (workspace Sylius)
- What happened: Several DependencyInjection-namespace pairs print as "…undle\DependencyInjection | …ndle\DependencyInjection" — both columns truncated so heavily that the two different component names in the row look identical, and no way to tell which bundle pair the row is about.
- Expected: Enough column width (or a hover/tooltip, or a shortening rule that keeps the distinguishing prefix) to tell two different rows apart in the printed table.
- Evidence: 08-Hidden coupling_ Sylius.pdf page 1.
- Repro: Create "Hidden coupling" for Sylius, view Table 1's rows for `*BundleDependencyInjection` pairs in the saved PDF.

(Figure 1 "What changes together" reproduces the same unreadable, unlabeled dot-cloud figure problem
already filed under TC-PHP-1's Figure 1; not re-filed as a separate finding.)

TC-QW-HIDDEN-1: done — 2 findings, PDF "08-Hidden coupling_ Sylius.pdf"

## TC-QW-LOAD-1 · Load-bearing components (M4 Sylius)

### [P1] Paragraph promises a test-coverage column the table doesn't have
- Test case / step: TC-QW-LOAD-1 / R2, R4
- Where: Load-bearing components > "The most depended-on components" paragraph vs. Table 1 "Components by how many others depend on them" (workspace Sylius)
- What happened: The paragraph reads "...with what makes a change to them safer or riskier: how easy the code is to work in, how much it is still changing, and whether any test reaches it" — promising a test-coverage signal. Table 1's actual columns are only "components that depend on it", "lines", "code health" and "commits, last 180 days"; there is no "reached by tests" (or equivalent) column anywhere in the table.
- Expected: Either the table should include the test-reach column the paragraph describes, or the paragraph should not promise information that isn't shown.
- Evidence: 09-Load-bearing components_ Sylius.pdf page 1.
- Repro: Create "Load-bearing components" for Sylius; read the intro paragraph, then check Table 1's column headers.

### [P2] "code health" is 10 (max) for nearly every row, with no visible differentiation
- Test case / step: TC-QW-LOAD-1 / R2
- Where: Load-bearing components > Table 1 "Components by how many others depend on them" (workspace Sylius)
- What happened: 13 of the 14 visible rows show "code health" as exactly 10 (the apparent maximum), covering very different components (Core\Model at 4,970 lines down to Locale\Model at 114 lines); only one row (Abstraction\StateMachine) differs, at 9.8. For a table whose stated purpose is to show "what makes a change to them safer or riskier", a column that reads the same for almost every row carries no information for a junior deciding where to focus.
- Expected: Either component-level code health should show real variation the way file-level hotspot scores do elsewhere in the same workspace (Table 5 in the PHP review shows health 6.05-7 for individual files), or the paragraph/column should explain that this is an aggregate that is expected to cluster near the top.
- Evidence: 09-Load-bearing components_ Sylius.pdf page 1.
- Repro: Create "Load-bearing components" for Sylius; read the "code health" column of Table 1.

TC-QW-LOAD-1: done — 2 findings, PDF "09-Load-bearing components_ Sylius.pdf"

## Summary

Worst three problems: (1) query tables can silently return zero rows even when the same data is
clearly present elsewhere in the identical report (Roles/Packages-by-role tables empty against a
597-class-per-bundle codebase; Package-to-package empty against Table 1's own dependency list) —
the most damaging pattern since it makes whole sections look complete but say nothing; (2) the same
fact is shown differently in different places within one report/PDF — analysis revision (r0 vs r3),
a commit's timestamp (16 Sep 08:50 vs 18 Sep 08:55 for 6b24cc1), and shared-commit counts for the
same component pair (353 vs 377 etc.) — undermining trust in every number in the report; (3) Symfony
role/pattern detection essentially does not work for Sylius (67 classes total, "By structure" fallback),
which cascades into several templates (PHP review, Symfony bundle review) losing their core value.
What worked well: prompts (grey italic lines) filled cleanly with no jumps or lost focus every time;
unfillable slots (dependency matrix at 1,378 components) gave a clear, correct can't-take message;
the Cell inspector pane was clear and genuinely explained what a paragraph counted; PDF export
correctly omitted prompts and "to add" slots, kept typed sentences, and reflowed sensibly between
A4 and Letter.

