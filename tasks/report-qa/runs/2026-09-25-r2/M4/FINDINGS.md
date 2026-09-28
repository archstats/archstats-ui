# M4 (Sylius) — run 2 — FINDINGS

Sandbox check: Reports = 0 before first report. New report (JavaScript/TypeScript workspace review, prefilled by default) header read "Runs on 16 Sep, 08:50 · 6b24cc1 · analysis r4" — analysis r4 confirmed. Sandbox OK, proceeding.

Note: sidebar shows the open snapshot as "25 Sep, 20:23 · 2.3 @ 6b24cc1"; the report band shows the same commit as "16 Sep, 08:50 · 6b24cc1" — commit time vs scan time, matches the §5 "known candidate" to verify. Watching across test cases before writing a finding block.

## TC-PHP-1 · PHP application review (with TC-X-LETTER)

T: Evidence → "Start a report" → dialog opens, JS/TS workspace review preselected → expected: some default or blank selected · shots/SANDBOX__G01-gallery-open.png
T: Click "PHP application review" in list → band updates to PHP template, preview shows "PHP review: Sylius" → expected: same · shots/TC-PHP-1__G02-template-selected.png

G2: sits under "For Sylius" group; second line "Found: 60 Composer packages" — clear and concrete.
G3: band reads well: "A tour of a PHP application: its Composer packages and what each holds (controllers, entities, repositories, form types, handlers, subscribers, validators)...". "Writes 9 sections: 10 paragraphs explaining the terms, 10 paragraphs counted from the snapshot, 5 tables, 1 figure to add from the views and 2 prompts for your reading." No component field for this template.
G5: scrolled the whole preview. Noted: "The application at a glance" (4,651 production files, 183,370 lines, 1,377 components, 60 Composer + 5 npm packages), git history (18,944 commits/463 authors/15 years), roles paragraph (Symfony roles: 60 Controllers, 1 Entities, 171 Repositories, 351 Bundles & Subscribers, 116 Services, 1,901 no-rule), "Between namespaces" (tangles/propagation cost), "Dependency rules" (1 import breaks 1 rule), "Libraries" (99 libraries), "Hotspots" (top 5 files), then "Findings" and presumably "Recommendations" prompts.

T: Click "Create report" → jumps straight into "Taking 1 of 1" on the Connections view for Figure 1 (only one figure slot to fill) → expected: land on the report first, or a clear "taking" screen; got the latter immediately, no flash · shots/TC-PHP-1__C01-after-create.png
T: Take modal shows the figure already drawn in the "Adding" preview → click "Fill and finish" → lands on the finished report in Evidence, Reports count now 1 · expected: same · shots/TC-PHP-1__C02-take-figure1-dependency-structure.png, shots/TC-PHP-1__L01-landing-after-run.png
T: Click outline entry "Table 5 · Hotspot files" → scrolls report to that table and highlights it, Cell pane fills with the table's definition → expected: same · shots/TC-PHP-1__R05-outline-click-table5.png
T: Click directly on a computed paragraph's text → Cell pane shows "A paragraph counted from the snapshot" with a "Write as my own" button → expected: same · shots/TC-PHP-1__R06-cellpane-paragraph.png · HARNESS (void): my first two attempts missed because I was clicking with raw screen coordinates eyeballed off a scaled-down screenshot, not because the app's hit-area is narrow — see the void note near the end of this test case.
T: Click the intro prompt, ⌘A, type a sentence → grey italic prompt style is replaced by normal paragraph text as soon as typing starts; Escape leaves the sentence in place · expected: same · shots/TC-PHP-1__W01..W04
T: Click just below "Findings" heading, using raw eyeballed coordinates → missed the prompt and landed on the insert-cell "+" affordance, opening a "/" search popup → retried with correct coordinates and it worked · HARNESS (void) — coordinate math error on my part, not a product finding; see the void note below · shots/TC-PHP-1__W06-findings-prompt-typing.png
T: Click "PDF" (toolbar) → preview sheet opens, defaults to Letter (not A4), 7 pages, 806 KB → expected: some default; no strong expectation either way · shots/TC-PHP-1__P01-pdf-preview.png
T: Click "Save PDF…" → "Saved to .../M4/01-PHP review_ Sylius.pdf", file confirmed on disk · shots/TC-PHP-1__P02-saved-letter.png
T: Click "A4" toggle → page count stays 7, size 805 KB → Save PDF… again → "Saved to .../M4/02-PHP review_ Sylius.pdf" · expected: same · shots/TC-X-LETTER__P03-pdf-a4.png, shots/TC-X-LETTER__P04-saved-a4.png

### [P1] Hotspots table shows unrelated Behat test files, contradicting the paragraph right above it
- Test case / step: TC-PHP-1 / R2, R4
- Where: PHP application review › Hotspots section (workspace Sylius, snapshot 16 Sep 08:50 · 6b24cc1 · analysis r4)
- What happened: The "Hotspots" paragraph reads: "The highest hotspot scores are in `src/Sylius/Bundle/CoreBundle/Doctrine/ORM/OrderRepository.php`, `src/Sylius/Component/Core/Model/Order.php`, `src/Sylius/Bundle/AdminBundle/Menu/MainMenuBuilder.php`, `src/Sylius/Component/Product/Model/Product.php` and `src/Sylius/Bundle/CoreBundle/Fixture/Factory/ProductExampleFactory.php`. These 5 files hold 1% of the lines; in the last 180 days they saw under 1% of the commits, counted per file." Directly below it, Table 5 "Hotspot files" (sorted by Hotspot Score, highest first) lists 10 entirely different files, all under `src/Sylius/Behat/Context/...` (e.g. `ProductContext.php` score 100, `CheckoutContext.php` score 98.36) — Behat test/step-definition files, not the 5 files the paragraph just named. The table's own caption says "10 of 11,703" — 11,703 is the total file count across the whole repo (production + tests + non-code + third-party per the report's own opening paragraph: 4,651 + 3,427 + 3,623 + 2 = 11,703), so the table query is running over every file including the 3,623 test files the report elsewhere says it counts apart from production code, while the paragraph's hotspot score is evidently computed over production files only.
- Expected: The paragraph and the table directly below it should describe the same evidence; at minimum a "Hotspots" section in a report that otherwise carefully separates production code from tests should not silently rank test files as the codebase's top "hotspots".
- Evidence: shots/TC-PHP-1__R05-outline-click-table5.png (Cell pane confirms scope "Files", "10 of 11,703"); PDF `01-PHP review_ Sylius.pdf` page 6-7 (pdftotext confirms the same mismatch is printed).
- Repro: Create "PHP application review" for Sylius (defaults) → scroll to "Hotspots" → compare the paragraph's 5 named files with Table 5's 10 rows.

### [P2] "Packages by role" table runs off the page edge in the PDF, silently dropping the "validators" column
- Test case / step: TC-PHP-1 / P3
- Where: PHP application review › "What each package holds" › Table 2 (workspace Sylius)
- What happened: In the PDF (both Letter and A4), Table 2 is too wide for the page. The "package" header itself is cut to "packa…", package names truncate to fragments like "…undle", "…/core", "…otion", the last visible header is cut mid-word to "event subscribers and list[eners…]", and the table's 9th column ("validators", visible in the app as the last column) is entirely absent from the printed page — not shown, not wrapped to a new page, no "N more columns" note.
- Expected: A table exported to PDF should either fit the page (narrower columns, wrapped text, smaller font) or say plainly that columns were left out, not drop a whole column silently while also truncating the row-identifying "package" column so some rows are hard to tell apart.
- Evidence: shots/tasks/report-qa/runs/2026-09-25-r2/M4/pages/table2-2.png (rendered from the saved PDF, page 2); PDF `01-PHP review_ Sylius.pdf` and `02-PHP review_ Sylius.pdf`, page 2.
- Repro: Create "PHP application review" for Sylius → open PDF preview (either page size) → page 2, "Table 2. Packages by role".

### [P1] "1 Entities" in the Roles paragraph contradicts the "entities and models" column in the table right above it
- Test case / step: TC-PHP-1 / R1, R2
- Where: PHP application review › "What each package holds" (Table 2) and "Roles and layers" paragraph (workspace Sylius)
- What happened: Table 2 "Packages by role", "entities and models" column, shows non-zero counts for many packages read straight down the visible rows: sylius/core 6, sylius/payum-bundle 1, sylius/promotion 10, sylius/product 60→11, sylius/attribute-bundle 3, etc. — clearly more than one entity class in the codebase. Immediately below, the "Roles and layers" paragraph says: "The code outside tests declares 2,600 classes: 60 Controllers ..., **1** Entities (persistent state), 171 Repositories ..." and adds "Entities across 1 component, all in `Sylius\Bundle\CoreBundle\Validator\Constraints`, and the most used is `HasEnabledEntity` (by 1)" — i.e. exactly one class, in a validation-constraints namespace that is not where Sylius keeps its real entity/model classes (those are the same classes Table 2 is counting in "entities and models").
- Expected: A junior reader has no way to reconcile "1 Entities" in the very next paragraph with the double-digit "entities and models" counts in the table just above it. Even if the two numbers are legitimately different metrics (a strict annotation/base-class rule vs. a looser role tally), the report should not use the same word "Entities" for both without saying why they disagree so badly (1 vs. dozens).
- Evidence: shots/TC-PHP-1__R06-cellpane-paragraph.png; PDF page 2 (Table 2) vs. page 3 ("Roles and layers" paragraph): pdftotext -layout output.
- Repro: Create "PHP application review" for Sylius (defaults) → read Table 2's "entities and models" column, then the "Roles and layers" paragraph immediately under "What each package holds".

### [P2] Connections figures ("by group") are unreadable point clouds, on screen and in the PDF
- Test case / step: TC-PHP-1 / C2, R3, P3; also seen in TC-QW-HIDDEN-1 / C2, R3, P3
- Where: PHP application review › "Between namespaces" › Figure 1 "Dependency structure"; and Hidden coupling › Figure 1 "What changes together" (both Connections graphs, Shown as Graph, Level "By group", workspace Sylius)
- What happened: Every Connections-view figure taken "by group" for this workspace (2 templates so far, both taken exactly as the template asks) renders as a faint cloud of small grey dots with no visible labels, no visible grouping boundaries, and almost no structure a reader could interpret — true before and after taking, and again in the saved PDF at full page width. The Connections view's own on-screen copy says grouping "shows the shape" and the "What changes together" caption promises "Thick links between groups that should be independent are hidden coupling", but no shape or thick link is visible in either capture. With 1,377-1,378 components in this workspace and no lens defined, "by group" appears to still plot every individual component rather than collapsing them into visible groups.
- Expected: A figure placed in a report to illustrate specific claims ("18 of 1,377 components sit in 8 tangles", "thick links between groups") should show enough structure for a reader to see what the surrounding paragraph or caption is describing, not an undifferentiated dot cloud both times.
- Evidence: shots/TC-PHP-1__C02-take-figure1-dependency-structure.png, PDF `01-PHP review_ Sylius.pdf` page 5 (tasks/report-qa/runs/2026-09-25-r2/M4/pages/fig-5.png); shots/TC-QW-HIDDEN-1__C04-take-figure1-drawn.png, PDF `05-Hidden coupling_ Sylius.pdf` page 2 (tasks/report-qa/runs/2026-09-25-r2/M4/pages/hidden-2.png).
- Repro: Create "PHP application review" or "Hidden coupling" for Sylius (defaults, no lens) → take the Connections figure as the template asks → view the report or PDF.

### [P3] "Libraries" explanation paragraph uses Java examples in a PHP report
- Test case / step: TC-PHP-1 / R4
- Where: PHP application review › "Libraries" section (workspace Sylius)
- What happened: The explanatory paragraph reads: "Names are shortened to their first two parts, so `org.springframework.web` and `org.springframework.data` count as one library, `org.springframework`. Modules of the language's own platform, such as `java.util`, are counted separately." This is a Java/Spring example inside a report whose whole point is a PHP/Composer/Symfony application; the worked examples in the very same paragraph's next sentence are PHP ones (`Symfony\Component`, `PHPUnit\Framework`, `Sylius\Resource`).
- Expected: The explanation of "how names are shortened" should use a PHP example (e.g. `Symfony\Component\...`) to match the rest of the paragraph and the report's subject, rather than switching languages mid-explanation.
- Evidence: shots/TC-PHP-1__R06-cellpane-paragraph.png region not captured directly; PDF `01-PHP review_ Sylius.pdf` page 6, "Libraries" section (pdftotext -layout output).
- Repro: Create "PHP application review" for Sylius (defaults) → read the "Libraries" section, second sentence.
- Also seen: same verbatim paragraph in TC-GEN-DEP-1 "Dependency audit: Sylius" → "Third-party libraries" section (PDF `04-Dependency audit_ Sylius.pdf` page 1) — this is a shared explanation block reused unchanged across templates, so it's a single wording fix, not a per-template one.

TC-PHP-1: done — 4 findings (2×P1, 1×P2, 1×P3) + 1 voided harness artifact, PDFs `01-PHP review_ Sylius.pdf` (Letter), `02-PHP review_ Sylius.pdf` (A4, TC-X-LETTER)

## TC-PHP-2 · Symfony bundle review

T: Evidence → "New report" → gallery reopens with the previous selection (JS/TS workspace review) still highlighted → select "Symfony bundle review" → band updates · expected: same · shots/TC-PHP-2__G02-template-selected.png
T: "Create report" → jumps into "Taking Table 3, Dependency matrix" on Connections (Shown as Matrix, Level By group, Order By levels), header says "Waiting for Connections to draw…" · expected: some wait; got one · shots/TC-PHP-2__C01-after-create.png
T: ~5-8s later → the "1378 components are too many for a matrix" explanation and "Propose a lens"/"Show the graph" buttons are already drawn, but the top-right status text still reads "Waiting for Connections to draw…" and no Skip button is present yet; only after a further couple of seconds does it flip to "Connections drew nothing to take; set it, then add it" with a Skip button → expected: the "waiting" indicator to clear as soon as the view has an answer (even a can't-take answer), not lag behind the message that's already on screen · shots/TC-PHP-2__C02-take-matrix-waiting.png, shots/TC-PHP-2__C03-take-matrix-cant-take.png ⚠
T: Click "Skip" → lands on the new report, Table 3 shows as an unfilled card "(to add)" in the outline, a "Take it from Connections / Set it yourself" card in the body, and "Take 1 table" appears in the toolbar to resume later → expected: same · shots/TC-PHP-2__L01-landing-after-skip.png
T: Click intro prompt, type a sentence, Escape → works cleanly · shots/TC-PHP-2__W01-prompt-typing.png
T: Click "Findings" prompt with raw eyeballed coordinates → same coordinate-math miss as TC-PHP-1, same "/" search popup → Escape, retried with corrected coordinates, worked → shots/TC-PHP-2__W02-findings-typing.png · HARNESS (void), not a product finding
T: Click "PDF" → header reads "Symfony bundles: Sylius · 2 pages · A4 · 33 KB · 1 to add, left out" → Save PDF… → "Saved to .../M4/03-Symfony bundles_ Sylius.pdf" · expected: same · shots/TC-PHP-2__P01-pdf-preview.png, shots/TC-PHP-2__P02-saved.png

R2/R3: Table 1 "Bundles by what they register" and Table 2 "Package to package, by references" both fit the PDF page width cleanly (contrast with TC-PHP-1's Table 2, which has the same "…undle"-style package names but overflowed) — likely because this table has 5 data columns instead of PHP review's 8, and package names are bare bundle names (e.g. "CoreBundle") rather than the "sylius/xxx-bundle" strings used elsewhere.
R1/R4: single explanation paragraph reads clearly; no computed-number paragraphs to cross-check, so no contradiction risk in this template.
P3: the skipped "Table 3 · Dependency matrix (to add)" slot correctly does **not** print in the PDF (verified with pdftotext) — only "Findings" follows Table 2, exactly as the header's "1 to add, left out" promises. This is a positive: unlike some findings above, this template handles a skipped slot cleanly end-to-end.

### HARNESS (void) — "insert-cell search" misclick was my own coordinate error, not a product bug
- What I originally wrote: a P2 claiming clicks near a one-line prompt (esp. "Findings") could miss and open a "/" insert-cell search instead of focusing the prompt.
- Why it's void: I was clicking with raw `clickxy` using coordinates eyeballed off a *displayed* (scaled-down) screenshot, without multiplying back up to the actual 2880×1800 screenshot space `clickxy` expects. That put my clicks tens of pixels away from the intended target — sometimes past the prompt's own block, onto the "+" insert affordance underneath it. Once I switched to the harness's `click "<text>"` prompt-matching (which finds a report prompt by its grey placeholder text and clicks it directly, added for exactly this reason — see the driver's header comment), every prompt in every later test case (TC-GEN-DEP-1, TC-QW-HIDDEN-1) focused correctly on the first try, including "Findings"-style prompts with empty space below them. I could not reproduce the insert-popup mix-up once clicking correctly, so I'm retracting it as a product finding.
- Original evidence (kept for the record, not as a finding): shots/TC-PHP-1__W06-findings-prompt-typing.png, shots/TC-PHP-2__W02-findings-typing.png

TC-PHP-2: done — 0 new findings (the insert-popup issue shared with TC-PHP-1 was voided as a harness/coordinate artifact, not a product bug), plus the ⚠ stale "Waiting" indicator noted as a transition; PDF `03-Symfony bundles_ Sylius.pdf`

## TC-GEN-DEP-1 · Dependency audit

T: Evidence → "New report" → gallery reopens on the JS/TS default; the General group only shows 5 templates (Architecture review, Executive summary, Technical due diligence, Onboarding guide, Refactoring case) until scrolled — "Dependency audit" and 4 others (Technical debt register, Ownership and knowledge, Modularization plan, Health check-in) are below the fold with no visible "more" affordance at first glance → expected: either the list is short enough to see all of it, or a scroll hint; had to scroll blind to find it · shots/TC-GEN-DEP-1__G02-template-selected.png ⚠ (minor — scrolling a list is normal, but the initial view gives no hint 5 more General templates exist below)
T: Select "Dependency audit" → Create report → jumps into "Taking Table 1, Libraries" on the Libraries view, table already drawn → expected: same · shots/TC-GEN-DEP-1__C01-after-create.png, shots/TC-GEN-DEP-1__C02-take-table1-libraries.png
T: "Fill and finish" → lands on report (Reports now 3) · shots/TC-GEN-DEP-1__L01-landing.png
T: Fill both prompts (intro, "Actions") → both worked first try this time (clicked well inside the text, not near the lower edge) · shots/TC-GEN-DEP-1__W01-prompt-typing.png, shots/TC-GEN-DEP-1__W02-actions-typing.png
T: PDF → Save PDF… → "Saved to .../M4/04-Dependency audit_ Sylius.pdf" · shots/TC-GEN-DEP-1__P01-pdf-preview.png, shots/TC-GEN-DEP-1__P02-saved.png

### [P1] "Libraries" table and paragraph count the app's own code as a third-party library
- Test case / step: TC-GEN-DEP-1 / R1, R2
- Where: Dependency audit › "Third-party libraries" › Table 1 (workspace Sylius, snapshot 16 Sep 08:50 · 6b24cc1 · analysis r4)
- What happened: The paragraph defines libraries as "code the project uses but did not write" and states "The code imports **99 libraries** from outside its own components". Table 1 "Libraries", sorted by Imports, has a "Looks internal" column, and two of its top rows are flagged `yes`: `src/Sylius` (1,391 imports, 737 files) and `Sylius\Bundle` (639 imports, 331 files) — both plainly the application's own code (Sylius is the codebase under review), not a third-party dependency. They are still counted in the "99 libraries" total and sit at #3 and #5 by import count, ahead of genuine third-party libraries like Webmozart\Assert and Doctrine\Common.
- Expected: A table and paragraph that explicitly define libraries as code "outside its own components" should exclude rows the tool itself has already flagged as "Looks internal: yes", or at least not fold them into the headline "99 libraries" count without comment.
- Evidence: shots/TC-GEN-DEP-1__C02-take-table1-libraries.png; PDF `04-Dependency audit_ Sylius.pdf` page 1 (pdftotext -layout confirms the same two rows print as-is).
- Repro: Create "Dependency audit" for Sylius (defaults) → read Table 1 "Libraries" → check the "Looks internal" column.

TC-GEN-DEP-1: done — 1 new finding (P1); also confirms the Java-example wording in the "Libraries" explanation paragraph (already logged as a P3 under TC-PHP-1) repeats here verbatim; PDF `04-Dependency audit_ Sylius.pdf`

## TC-QW-HIDDEN-1 · Hidden coupling

T: "New report" → select "Hidden coupling" → band: "Finds pairs of components that keep changing in the same commits although neither imports the other... Writes 2 sections: 2 paragraphs explaining the terms, 1 table, 2 figures to add from the views and 3 prompts for your reading." → shots/TC-QW-HIDDEN-1__G02-template-selected.png
T: "Create report" → "Taking Table 2, Hidden coupling · 1 of 2" on Connections (list, source=git, no-import) → drawn within ~4s → shots/TC-QW-HIDDEN-1__C01-after-create.png, shots/TC-QW-HIDDEN-1__C02-take-table2-waiting.png
T: "Fill and next" → "Taking Figure 1, What changes together · 2 of 2" on Connections graph, by group → drawn within ~4s → "Fill and finish" → lands on report (Reports 4) → shots/TC-QW-HIDDEN-1__C03-take-figure1.png, shots/TC-QW-HIDDEN-1__C04-take-figure1-drawn.png, shots/TC-QW-HIDDEN-1__L01-landing.png
T: filled all 3 prompts using `click "<text>"` prompt matching (per the harness note) — every one focused correctly on the first click, no misses · shots/TC-QW-HIDDEN-1__W01-intro-typing.png, W02-toppairs-typing.png, W03-actions-typing.png
T: PDF → 3 pages · A4 · 775 KB → Save PDF… → "Saved to .../M4/05-Hidden coupling_ Sylius.pdf" · shots/TC-QW-HIDDEN-1__P01-pdf-preview.png, P02-saved.png

R2: Table 1's last column "% of the quieter one's commits" is explained in the paragraph directly above it ("of the commits that changed the less active of the two, the share that also changed the other") — an unusual metaphor ("the quieter one") but not left unexplained, so not flagged as a wording finding on its own.
R2: Table 2 "Hidden coupling" always shows 0 for "references" and "dynamic references" across every visible row — correct by construction (this table is specifically pairs *without* an import), not a bug.
R3/P3: Figure 1 "What changes together" repeats the same unreadable-point-cloud problem as TC-PHP-1's Figure 1 — folded into that finding above rather than a new one.

TC-QW-HIDDEN-1: done — 0 new findings (the figure-legibility issue was merged into the existing P2 from TC-PHP-1); PDF `05-Hidden coupling_ Sylius.pdf`

## TC-QW-LOAD-1 · Load-bearing components

T: "New report" → select "Load-bearing components" → band: "Lists the components the most other components depend on... Writes 2 sections: 2 paragraphs explaining the terms, 1 table, 1 figure to add from the views and 2 prompts for your reading." → shots/TC-QW-LOAD-1__G02-template-selected.png
T: "Create report" → "Taking Figure 1, The main sequence" on Metrics (Plot, preset "Distance to Main Sequence") → drawn quickly → "Fill and finish" → lands on report (Reports 5) → shots/TC-QW-LOAD-1__C01-after-create.png, shots/TC-QW-LOAD-1__C02-take-figure1-mainseq.png, shots/TC-QW-LOAD-1__L01-landing.png
T: filled both prompts with `click "<text>"` — both focused correctly first try → shots/TC-QW-LOAD-1__W01-intro-typing.png, W02-closing-typing.png
T: PDF → 2 pages · A4 · 263 KB → Save PDF… → "Saved to .../M4/06-Load-bearing components_ Sylius.pdf" · shots/TC-QW-LOAD-1__P01-pdf-preview.png, P02-saved.png

R2: Table 1 columns (dependents, lines, code health, commits last 180 days, reached by tests) are all readable, plain-English headers. In the app the "Name" column is narrow and shows only "…del"/"…ory"-style suffixes until widened or hovered; in the PDF the names print with a leading "…" ellipsis but stay recognisable (e.g. "…ius\Component\Core\Model") because the table isn't over-width like TC-PHP-1's Table 2 — not flagged as a finding.
R2 (observation, not a finding): 14 of the top 15 rows show "code health 10" (the apparent maximum) and "commits, last 180 days" mostly 0; plausible for stable, simple model classes but worth a human's second look before publishing — noting for the record rather than as a bug, since I have no baseline to say it's wrong.
R3/P3: Figure 1 "The main sequence" is a genuinely readable scatter plot — labelled axes (Instability, Abstractness), gridlines, a dotted "Main sequence" diagonal, and a visible cluster in the "zone of pain" corner — both on screen and in the PDF (pages/load2-2.png). This is a strong positive contrast to the Connections-view "by group" figures flagged as unreadable elsewhere in this run: a Metrics plot scales to 1,378 components far better than a Connections graph does.

TC-QW-LOAD-1: done — 0 new findings (this template held up well); PDF `06-Load-bearing components_ Sylius.pdf`

---

## Mission summary

Ran all 5 M4 test cases (TC-PHP-1 with TC-X-LETTER, TC-PHP-2, TC-GEN-DEP-1, TC-QW-HIDDEN-1, TC-QW-LOAD-1) against Sylius, snapshot 16 Sep 08:50 · 6b24cc1 · analysis r4. 6 PDFs saved, 4 real findings kept (2×P1, 1×P2, 1×P3 — one P2 spans two templates), plus 1 harness/coordinate-error item explicitly voided rather than reported as a product bug.

**Three worst problems:**
1. **Hotspots table contradicts its own paragraph** (P1, TC-PHP-1): the "Hotspots" prose names 5 specific production files, but the table directly beneath it lists 10 completely different Behat test files — the query behind the table silently includes the 3,623 test files the rest of the report is careful to count apart from production code.
2. **"1 Entities" contradicts the table above it** (P1, TC-PHP-1): the Roles paragraph claims exactly 1 Entity class in the whole codebase, immediately under a table whose "entities and models" column shows dozens across multiple packages — same word, wildly different numbers, no explanation.
3. **The app's own code counted as a third-party library** (P1, TC-GEN-DEP-1): `src/Sylius` and `Sylius\Bundle` appear in the "Libraries" table (flagged "Looks internal: yes" by the tool itself) and are folded into the headline "99 libraries" count, in a report whose whole first paragraph defines libraries as code "outside its own components".

**What worked well:** the Metrics "main sequence" scatter plot (TC-QW-LOAD-1) is genuinely readable and well-labelled, in sharp contrast to every Connections-view "by group" figure in this run, which renders as an unreadable dot cloud (P2, spans TC-PHP-1 and TC-QW-HIDDEN-1). Skipped slots (the Symfony-bundle Dependency matrix, "1378 components are too many for a matrix") are handled cleanly end-to-end: clear can't-take message, Skip works, the PDF header says "1 to add, left out", and the unfilled slot is correctly left out of the printed PDF. Prompts fill and print correctly once clicked precisely (the harness's `click "<text>"` prompt matcher, added mid-run, fixed my own earlier coordinate-scaling misses — see the voided item under TC-PHP-1).
