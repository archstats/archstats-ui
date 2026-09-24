---
target: whole app across six languages
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 3
target_identity: "file:/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/src/pages"
timestamp: 2026-09-23T15-10-22Z
slug: frontend-src-pages
---
# Archstats Desktop — whole-app critique across six languages (2026-09-23)
Method: dual-agent (A: four Opus area reviews · B: detector). 250 captures, six languages (Java BroadleafCommerce, C# nopCommerce, PHP Sylius, Python django-oscar, Go gin, TS LibreChat). Caveat: several snapshots predate engine fixes (PHP tree-sitter, identity merge); gin fixture has no git.

## Design health: 24/40
1 Visibility 2 · 2 Match 3 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 1 · 6 Recognition 3 · 7 Efficiency 2 · 8 Minimalism 3 · 9 Recovery 2 · 10 Help 3

## Specificity
Authored: Reading tab, Where to cut, inspector, lens builder. Generic: Overview (inventory + card grid) and file Overview (metric wall). Detector: 4 gray-on-color, all false positives (hover/ternary pairing) in components/dimensions.

## Priority issues
- [P0] False verdicts from missing data: C# Units "none import each other / candidate for deletion" vs 4,653 edges; Go internal/ rule "kept" on Java/C#/PHP/Python/TS; PHP Units 22 modules + JS frameworks offered. Fix: unscoped rules to No opinion; Units sanity check vs component edges; framework options by language; stale-snapshot warning. (/impeccable harden)
- [P0] No "what changed since last scan": no deltas, no diff, no compare. Fix: Since-<scan> strip on Overview, KPI deltas, compare-with on scan list, Changes view on QueryIn + utils/delta.ts. (/impeccable shape)
- [P0] No evidence export: no CSV/PNG/SVG/Markdown/report. Fix: copy-as-CSV, chart export, copy-as-evidence per band, pin-to-report. (/impeccable shape)
- [P1] Non-code ranked as code: redactor.js, styles.css, django.po, style.css hottest; moment-with-locales.min largest unit; vendored admin assets seed the lens builder. Fix: file classification (code/style/locale/vendored/generated/test), excluded by default with toggle. (/impeccable harden)
- [P1] Views break above ~150 components with no lens: Sylius hairball, matrix/chord refuse with advice to close nonexistent groups, chord refuses 122>120. Fix: automatic path roll-up + Save as lens, refusal offers top-level namespaces, partitioned DSM default. (/impeccable shape)
- [P1] History contradicts itself: author counts 141 vs 114 (Java), 966 vs 434 (PHP); author commits > repo commits (Python); duplicate identities; bots counted; Components 1 vs 1,450 files; heatmap ignores range. Fix: label counting scope, manual merge + hide bots, range-anchored heatmap. (/impeccable harden)

## Also
Overview never ranks; Metrics sorted by name with "." row; raw 5-decimal values; hotspot label collisions; git-less hotspots all grey; Python size stats inflated; TS abstractness 82.7%; cycle counts disagree and numbering ignores sort; TS monorepo package resolution; Go root "."; duplicate Read-as select; component Connections roll-up collapses to one band; contradictory percentile sentences; Java tab on .js; tests first in Inside; Rescan without button; badge overlap; commit rows not drillable; thin author detail; git sidebar live without git.

## Missed chances
Hidden coupling; architecture over time from historical snapshots; SQL console + saved queries as views; offline LLM brief export; rules from lenses + archstats check in CI; Conway's-law team-vs-structure check.

## Metrics per persona
Bus factor, main-author share, knowledge loss, degree of change coupling, hidden coupling, SDP violations, propagation cost, core-periphery, lens modularity Q, erosion/cycle growth/violation trend, code age distribution, recent churn x health, test-to-code ratio. Unsurfaced: 30/90/180d churn windows, HITS, harmonic/residual closeness, short-cycle avg/max, file_coupling_view.

## Personas
Consultant: inventory not diagnosis; hairball; styles.css first; no export; false deletion claims. Architect: no delta; Rules "1 kept"; disagreeing totals; no trends. Power user: no Cmd-K, no keyboard path, no commit drill-down.
