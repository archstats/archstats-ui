# M4-rerun (Sylius, analysis r3 everywhere) — findings

Saved by the facilitator from the tester's final reply (subagent file writes were refused).
PDFs: 01/02 PHP review (Letter/A4), 03 Symfony bundles, 04 Dependency audit, 05 Hidden coupling, 06 Load-bearing components.

### [P1] Hotspots paragraph and Table 5 name completely different files
- TC-PHP-1 / R2, R4 — paragraph names production files (OrderRepository.php, Order.php, MainMenuBuilder.php, Product.php, ProductExampleFactory.php); Table 5 "Hotspot files" lists ten Behat test contexts (src/Sylius/Behat/Context/.../*Context.php), "10 of 11,703" (all files). Paragraph is production-scoped, table is not.
- Evidence: shots/tc-php-1-findings-section.png; 01-PHP review_ Sylius.pdf pp. 6–7

### [P1] Symfony "Entities" role finds 1 class, and it is not an entity
- TC-PHP-1 / R1 — "1 Entities (persistent state)… all in Sylius\Bundle\CoreBundle\Validator\Constraints… HasEnabledEntity". Sylius's Doctrine models (Order, Product…) are not counted.
- Evidence: shots/tc-php-1-roles-scrolled.png; 01-PHP review_ Sylius.pdf p. 3

### [P2] Dependency-structure figure is an unreadable, unlabeled dot cloud (1,378 components "by group")
- TC-PHP-1 / C2, P3; also Hidden coupling "What changes together". Evidence: 01 p. 5; 05 figure page

### [P2] Wide tables truncate names, dependency lists and headers ("packa…", "reposi…", "form t…", "…admin-bundle")
- TC-PHP-1, TC-PHP-2, TC-GEN-DEP-1, TC-QW-LOAD-1. Evidence: 01 pp. 1–2; 06 p. 1

### [P3] Garbled sentences
- "Propagation cost is 2%: of all ordered pairs of components, that share are linked by a chain of imports."; "1 import break 1 rule of the 1 that apply…". Evidence: 01 pp. 4–5; 04 p. 2

### [P2] Matrix slot card shows a bare "Taking…" with no inline reason
- TC-PHP-2 — the take bar says "1378 components are too many for a matrix"; outline says "(to add)"; the Cell pane explains; the card itself does not. Evidence: shots/tc-php-2-matrix-slot-state.png

### [P1] "Looks internal" misses the project's own namespace Sylius\Resource
- TC-GEN-DEP-1 / R2 — yes for src/Sylius, Sylius\Bundle, Sylius\Component; blank for Sylius\Resource (852 imports, 624 files). Evidence: 04 p. 1

### [P1] Hidden coupling: Table 1 (production only) and Table 2 (the view, everything) cover different populations under one heading
- TC-QW-HIDDEN-1 / R2 — Table 1 never shows the strongest pairs (Behat Setup/Ui Admin, 377 shared commits); Table 2 does. No overlap, no explanation. Evidence: shots/tc-qw-hidden-1-table2.png; 05 p. 1

### [P2] Near-identical long names truncated to indistinguishable text
- TC-QW-HIDDEN-1 — "…jection Sylius\Bundle\ProductBundle\DependencyInjection". Evidence: 05 p. 1

### [P2] Code health is 10 for 14 of 15 load-bearing components
- TC-QW-LOAD-1 — no differentiation, no explanation. Evidence: 06 p. 1

### [P3] Raw rule identifier in a table vs readable name in the paragraph (first-run finding, confirmed)

## First-run findings, re-judged
VOID: analysis revision differs within one report; Symfony roles near zero; same commit two times; packages-by-role / package-to-package zero rows (SQL console); paragraph promises a missing "reached by tests" column.
CONFIRMED: dot-cloud figure; garbled sentences; "Looks internal" misses Sylius\Resource; raw rule identifier; wide tables truncated; long names truncated; code health 10 everywhere.
CHANGED: matrix slot "Taking…" (now well explained elsewhere, card still bare); hidden-coupling tables (now a scope mismatch rather than different numbers).

## Summary (tester)
Worst: a paragraph and the table under it naming different files; two tables under one heading covering different populations; truncated wide tables and the unreadable "by group" graph. Worked well: snapshot consistency with the fixed harness; real query data; prompts; the Cell pane exposing the SQL that revealed the scope bug.
