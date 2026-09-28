# M3 · django-oscar (Django, r3) — port 4403

Sandbox check: Reports = 0 before first report. OK.

Report created: "Onboarding guide" template -> "Getting to know django-oscar", all 4 figure/table
slots taken, saved as `01-Getting to know django-oscar.pdf` (6 pages, A4) in this mission folder.

## Checks

M3-1 [OK] Gallery: "Django project review" is selected by default (option marked on) when the New
report dialog opens. "Python codebase review" is listed under "For django-oscar" with subtitle
"Found: 39 Django apps; the Django project review covers it more closely" -- not "not found here".
(shot: M3__G01-gallery-django-default.png)

M3-2 [OK] Onboarding guide, Table 2 "The codebase by directory" keeps a Commits column with real
numbers: src/oscar 35, tests 18, docs 6, .github 1 (0-commit rows show "-"). Confirmed both live in
the report (text dump) and in the saved PDF page 2. (shot: M3__C02-table2-directory-commits.png;
PDF p.2)

M3-3 [OK] Onboarding-guide band tally line reads "Writes 5 sections: 8 paragraphs explaining the
terms, 6 paragraphs counted from the snapshot, 2 tables, 2 tables and 2 figures to add from the
views and 4 prompts for your reading." -- the still-to-add slots are counted as "2 tables and 2
figures", not folded into a figures-only count.

M3-4 [OK] PDF numbering has no gaps: Table 1, Table 2, Figure 1, Figure 2, Table 3, Table 4, in
that order, each series consecutive from 1 (checked via pdftotext -layout and page images; the
initial grep miss for "Table 2" was a pdftotext form-feed artifact at the page break, not a missing
entry -- confirmed present on PDF page 2).

## NEW findings

NEW [P2] Table headers wrap mid-word in the two narrow, many-column tables (font shrunk to fit
per the "wide tables are set smaller" fix), producing fragments a reader has to reassemble:
Table 2 "The codebase by directory" shows "Max hotsp ot", "Lowe st healt h", "Edg es out"; Table 4
"Knowledge by component" shows "Comm it Cou nt", "Line s add ed", "Reach ed by". The
column-shrinking fix works for row data but header text needs word-aware wrapping (or an
abbreviation), not a hard character wrap. (PDF 01-Getting to know django-oscar.pdf pages 2 and 5;
shots: pages/pg-2.png, pages/pg-5.png)

NEW [P3] In Table 4 "Knowledge by component" the two columns shown on screen as "Cover 50%"
and "Cover 80%" both print in the PDF as the same wrapped header "Author s coveri ng...", making
the two columns indistinguishable by their printed headers alone -- a junior reader can no longer
tell which column is the 50%-cover count and which is the 80%-cover count without going back to
the app. (PDF page 5)
