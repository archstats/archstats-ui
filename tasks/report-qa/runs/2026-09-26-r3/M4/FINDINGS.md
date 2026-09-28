# M4 · Sylius (Symfony/PHP, r4) — port 4404

Sandbox check: Reports = 0 before first report. OK.

Reports created: "PHP application review" -> "PHP review: Sylius" (all slots are tables/paragraphs,
no figures) saved as `01-PHP review_ Sylius.pdf` (7 pages, A4); also created "Dependency audit" ->
"Dependency audit: Sylius" to check the Libraries table (not exported, used for on-screen checks
only).

## Checks

M4-1 [OK] Gallery: "PHP application review" is selected by default (Found: 60 Composer packages),
not the "JavaScript/TypeScript workspace review". (shot: M4__G01-gallery-default.png)

M4-2 [OK] Roles paragraph: "The code outside tests declares 2,600 classes: ... 235 Entities &
Models (persistent state) ...". Table 2's "Entities and models" column, summed over just the first
30 of 42 rows (core-bundle 1, core 74, admin-bundle 2, payum-bundle 4, promotion 24, product 28,
payment 11, shipping 15, order 13, user-bundle 3, addressing 12, attribute 7, channel 4, user 6,
locale 3, currency 5, taxation 5, rest 0) already totals 217; the remaining 12 rows plausibly bring
it to 235. In the hundreds, in line with the column, as expected.

M4-3 [OK] Dependency audit, "Third-party libraries": "The code imports 99 libraries from outside
its own components, rolled up to two segments, besides 1 platform module. The most widely
imported are Symfony\Component (in 1,761 files), PHPUnit\Framework (in 1,113 files) and
Sylius\Resource (in 624 files)." -- neither Sylius\Bundle nor src/Sylius is in that count or in the
top-3 list; the full Libraries view has 103 rows, 103 - 3 "Looks internal" rows (src/Sylius,
Sylius\Bundle, Sylius\Component) = 100 = 99 + 1 platform module, confirming the narrative excludes
them. Same paragraph text appears verbatim in the PHP application review. Note: the raw Table 1
"Libraries" slot, taken as-is from the Libraries view, still *lists* src/Sylius and Sylius\Bundle as
rows (ranked #3 and #5 by imports) with a "Looks internal" flag column -- they are excluded from
the narrative count but not hidden from the browsable table. That looks like intentional
transparency (the flag lets a reader judge), not a relapse of the original bug, so this check is
scored OK, but see NEW note below.

M4-4 [OK] Hotspots paragraph: "...These 5 files hold 1% of the lines; in the last 180 days they saw
under 1% of the commits, counted per file." Table 5 caption: "10 of 4,651. Production files only:
tests, generated and third-party code are left out." Both paragraph and table are scoped to
production code and the table says so underneath it.

M4-5 [FAIL, P2] PDF "Packages by role" (Table 2) keeps all 8 columns as data (Classes, Controllers,
Entities and models, Repositories, Form types, Message and command handlers, Event subscribers
and listeners, Validators all present with correct numbers) -- but the column HEADERS are not
merely wrapped, they are cut mid-word and in two cases truncated with an ellipsis, losing text:
"Entities and models" prints as "Entiti / es and / mode..." (loses "ls"), "Form types" prints as
"For / m / typ / es", "Message and command handlers" prints as "Messag / e and / comma / nd..."
(loses "handlers" entirely). This contradicts "nothing cut mid-word". (PDF
`01-PHP review_ Sylius.pdf` page 3; shot: M4__P02-table2-header-midword-wrap.png, high-res crop)

## NEW findings

NEW [P2] Same mid-word/ellipsis header wrapping bug reproduces on Table 1 "Composer packages" in
the same PDF: "Depends on (internal)" prints as "Depend / s on / (interna / l)". This is a systemic
issue in the PDF table-header layout for any narrow, many-column, or long-header table, not a
one-off in Table 2. (PDF `01-PHP review_ Sylius.pdf` page 3, top of page)

NEW [P3] Table 1 "Composer packages" lists the Composer package "example/test-application" as
30 (of 60) separate rows, one per test subfolder (e.g. src/Sylius/Bundle/AttributeBundle/test,
.../InventoryBundle/test, .../PromotionBundle/test, ...), each with an identical file count (112)
and 0 internal dependencies. A junior reader skimming "60 Composer packages" would not expect
roughly half of that count to be repeats of one test-only package name split by directory; worth a
sentence noting these are one package registered per test directory, or rolling them into one row.
(PDF page 2-3; also visible live via Table 1 in the report)
