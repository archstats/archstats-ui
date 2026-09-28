# M4 · Sylius (Symfony/PHP, r4) — port 4404 — Run 4, group B

Sandbox check: Reports = 0 before first report. OK.

Reports created: "PHP application review" -> "PHP review: Sylius" (7 pages, A4, saved as
`01-PHP review_ Sylius.pdf`); "Hidden coupling" -> "Hidden coupling: Sylius" (checked on screen,
not exported to PDF).

## Checks

B1 ✓ PDF table headers wrap between words, never mid-word, never with a losing ellipsis.
Table 1 "Composer packages" header: "Depends / on / (internal)" (wraps between words). Table 2
"Packages by role" headers all wrap on word boundaries and print in full: "Entities / and /
models", "Form / types", "Message / and / command / handlers" (whole, not "handlers" dropped),
"Event / subscribers / and / listeners". Verified both in `pdftotext -layout` output and visually
in a 100dpi render of PDF page 3 (shot: shots/M4_B1_table2_page3-3.png). This is a real fix over
run 3's M4-5 finding ("Entiti/es and/mode...", losing "ls"; "Messag/e and/comma/nd...", losing
"handlers" entirely) and the run-3 NEW finding on Table 1's "Depends on (internal)" header.

B2 ✓ "Composer declares 42 Composer packages." (on screen and in PDF, section "The application
at a glance"). Table 1 "Composer packages" shows "30 of 42 rows." with 42 as the true total (not
72 from 30 duplicate `example/test-application` rows as in run 3). Searched the full report text,
the expanded on-screen table, and the saved PDF text for "test-application" / "example/" — zero
matches in all three. The 30 rows shown (of 42) are 30 distinct Composer packages, no repeats.

B3 ✓ Hidden coupling, Take all: the Table 2 strip ("Table 2, Hidden coupling · 1 of 2") shows a
"Files" chip reading "Production files" (screenshot: shots/M4_B3_strip_production.png), and the
sidebar's Files lens switched from "All" (its state before the run) to "Production" while that
slot was open, matching the URL `facet=production`. The taken Table 2's caption in the report
reads "...analysis r4 · production files". The template's own Table 1 ("Changed together, no
import between them", a SQL cell that runs on create, not taken from a view) filters to
production in its SQL: `pair_1 IN (SELECT component FROM files WHERE role = 'production') AND
pair_2 IN (...)`. After the run finished ("Added 2 of 2"), the sidebar's Files switch read "All"
again — back to what it was before the run started (shot: shots/M4_B3_figure1_strip.png shows
the second slot, Figure 1 "What changes together", which the template does not ask to be
Production-scoped — its strip carries no Files chip and it draws all 1,378 components; this is
by template design, not the same slot B3 is about, and not scored as a problem).

## NEW findings

None. All three checks (B1, B2, B3) are fixed and hold up under both on-screen and PDF
inspection; no regressions found elsewhere in the two reports created.

## Summary

Clean run: the PDF table-header wrapping bug (M4-5 and its NEW sibling from run 3) is fixed, the
Composer package count/dedup bug (M4 P3) is fixed, and Hidden coupling's production-files
scoping (both the taken table's chip and the template's own query) works exactly as specified,
with the sidebar Files lens correctly restored to "All" after the run.
