# M2 · fineract (4402) · Run 4, group A

A4 ✓ Architecture review → Take all: the run reaches slot "Table 1 · Dependency matrix, in levels" (from Connections) and the strip reads "Connections has nothing to take: 1156 components are too many for a matrix" — the view's own reason, not a generic "drew nothing to take in 15 seconds". Skipped it and took the remaining 3 slots; the finishing summary box reads "Added 3 of 4. Left: Table 1: Connections has nothing to take: 1156 components are too many for a matrix", quoting the same reason. (shot: shots/A4__summary.png; also visible in 01-Architecture review_ fineract.pdf's "Not included" line)

A5 ✓ Executive summary ("fineract: summary"), computed paragraph under "The system in numbers": "Half of those lines went into 3 components; the most into fineract integrationtests (40%), workingcapitalloan service (7%) and workingcapitalloan calc (6%)." — plain-word component names (spaces, no package prefix), not code paths like org.apache.fineract.integrationtests. Report is 1 page · A4 · 55 KB (confirmed both in the app's PDF panel and via pdfinfo on the saved 02-fineract_ summary.pdf, Pages: 1).

A6 ✓ Architecture review PDF (01-Architecture review_ fineract.pdf), "Table 1. Most depended-on components" (numbered Table 2 in the on-screen outline since the matrix table was left out — numbering still has no gap, runs Table 1 here because that slot itself was skipped). Checked instability = Direct Dependency Count ÷ (Direct Dependent Count + Direct Dependency Count) by hand for two rows:
- org.apache.fineract.infrastructure.core.data: dependents 366, dependencies 3 → 3/(366+3) = 0.0081 ≈ 0.008 (table shows 0.008) ✓
- org.apache.fineract.infrastructure.core.exception: dependents 289, dependencies 13 → 13/(289+13) = 0.0430 ≈ 0.043 (table shows 0.043) ✓
Spot-checked two more rows for extra confidence, also exact: security.service (18/170=0.106 vs 0.106) and loanaccount.domain (59/193=0.306 vs 0.306).

## NEW findings

None beyond what's listed above — no new P1/P2/P3 issues found in this group of checks for M2.
