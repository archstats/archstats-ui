---
version: 1
slug: "frontend-src-pages-views-evidence-vue"
primary_target: "frontend/src/pages/views/evidence.vue"
related_targets: ["frontend/src/components/report","frontend/src/stores/reports.ts","app/report"]
---

# Evidence: the report notebook

Scope: the Evidence route (`/views/evidence`) and what feeds it (Pin, Export "Add to report"). Mode: **Operate** — the visitor writes and maintains reports from evidence.

Audience and job: the consultant writing the written report for a client, and the architect arguing for a refactoring to their team. Both collect findings while exploring (pins), then compose several reports (exec summary, full audit, team retro) from one pool, keep them true as the code moves, and hand over a PDF.

Decisions (2026-09-24, from Ryan): many reports drawing on one pool of pins; live Markdown editing in the style of Typora; data cells frozen at their run, re-runnable against a newer snapshot; PDF rendered natively in Go with go-pdf/fpdf, Inter and JetBrains Mono embedded. Ryan also asked that adding views and tables feels good.

## Direction contract

THESIS: A report is a notebook. Prose and frozen evidence cells alternate in one column, each cell saying which snapshot it ran on, with the pool of pins and the selected cell's provenance in the panes beside it. It refuses the board of pinned cards and the export-only report.

OWN-WORLD: The app's world unchanged: white surface page, ground panes, hairlines, Inter 13px chrome, the report body in Inter at reading size, evidence in mono, one orange for the run affordance, the drop line and the selected cell's inset bar.

STORY: Collect while exploring (Pin, or Export › Add to report). Open a report, type Markdown that renders as you leave the line, press / or drag from the pool to place evidence, re-run what went stale, export the PDF.

FIRST VIEWPORT: Left 232px: reports, then the open report's outline. Centre: toolbar (title, runs-on snapshot, stale count with Run all, Raw toggle, Export) over a 760px notebook column; data cells carry a gutter with ▶ and the run label. Right 300px: Pool | Cell tabs.

FORM: Three-pane notebook (JupyterLab lineage), position 1 of 7 on my ordered list, dealt second; seed key ad855f31.

FINISH: per this repo's token budget (CLAUDE.md), the build ends with `npm run check`, the detector once, one batched capture round with fixes, and DESIGN.md updated by hand; the finish reviewer and documenter run only if Ryan asks.
