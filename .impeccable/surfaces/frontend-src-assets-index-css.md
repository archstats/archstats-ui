---
version: 1
slug: "frontend-src-assets-index-css"
primary_target: "frontend/src/assets/index.css"
related_targets: ["frontend/tailwind.config.js","frontend/src/components/ui","frontend/src/components/ViewWorkspaceLayout.vue","frontend/src/pages/index.vue","frontend/src/pages/views/components","frontend/src/components/navbar/NavBar.vue","frontend/src/layouts/default.vue"]
---

# Surface brief: design foundation (tokens, primitives, shell, dashboard, Components views)

Mode: Operate. Scope for this round (Ryan, 2026-09-17): a replacement visual world applied to the token layer, the shared primitives, the app shell, the dashboard, and the Components view family (walker, matrix, chord, clustering, hotspots, cycles, plotter, table, comparison, group coupling). Git, Files, Java, and drill-down views follow on the same system in later rounds. Light and dark appearances following the OS.

## Audience and job
Same users as PRODUCT.md. The app is judged at the craft level of JetBrains IDEs (New UI) and Linear: a category-fluent user must trust every control on sight. Nothing may read as decoration.

## Confirmed decisions
- Reference bar: JetBrains New UI and Linear (Ryan chose the canon in plain words: "premium desktop app… think JetBrains").
- Both appearances, following the OS. The palette is designed as two complete sets, not a filter.
- Foundation first; view internals (D3 layouts, data logic, copy) are preserved; their chrome, controls, colors and type are replaced.
- The logo orange stays the single accent. Navy leaves the chrome and survives only as the tint of the dark neutrals and in the logo.

## Direction contract
THESIS: An instrument, not a dashboard. Archstats reads like an IDE tool window: flat surfaces, hairline structure, one type family at 13px, one accent, evidence set in mono. It refuses the card-deck arrangement (icon tile, eyebrow, big number, colored halo), every emoji and badge, and every gradient.
OWN-WORLD: Cool neutral ramp, navy-tinted. Light: content #FFFFFF, panels and rail #F7F8FA, hairline #E6E8EE, ink #1F2329, secondary ink #6C7280. Dark: content #1E2026, panels and rail #262932, hairline #363A45, ink #E3E6EB, secondary ink #8B919E. Accent: orange #E08A19 (light) / #F0A033 (dark) on the primary button, focus ring, active nav row (10–12% tint plus 2px inset bar), and selection; never on labels or icons. Semantic: green #3E9B5F, amber #D48D1E, red #DA4E4E with dark-tuned partners; data palette inherits the groups HSL set. Type: Inter (self-hosted variable) at 13px/18 base, 11px/16 meta, 12px/16 secondary, 15px/20 panel titles, 20px/26 page titles, one weight step (500) for emphasis and 600 only on titles; JetBrains Mono (self-hosted) 12px/16 for paths, identifiers, timestamps and numbers, tabular. Radius 4px controls, 6px panels and popovers. Depth: hairlines everywhere; a shadow only on floating layers (menus, popovers, tooltips): 0 8px 24px -8px rgba(15,18,28,.24) plus the hairline. Icons: lucide 16px, stroke 1.5, secondary ink. Controls: 28px tall inputs and buttons, 24px in toolbars; segmented controls for view modes; checkboxes and selects rebuilt in the same vocabulary.
STORY: I open a workspace and read the overview as an evidence sheet: counts, ratios, activity, then the views as a directory. Every view opens under the same 40px toolbar (title, count, controls on the right, search where it belongs) with the same right-hand inspector when one exists. Nothing moves but the data.
FIRST VIEWPORT (dashboard, 1440×900, light): rail 240px on #F7F8FA with workspace header, scan row and nav rows 28px tall, the active one orange-tinted with a 2px inset bar. Content on white: page title "Overview" 20px with the snapshot time in mono beside it; a stats row of six label/value pairs in one hairline-framed strip (values 22px Inter tabular); below, two hairline panels side by side: "Structure" (abstraction, instability, distance-from-main-sequence summary) and "Activity" (commit calendar); then "Views", a directory list grouped by family, each row 44px with a 72×44 thumbnail, name, one-line description, chevron. No cards, no icon tiles, no shadows in the content area.
FORM: The canon, played straight (new-work standing exit): JetBrains New UI and Linear as the bar, no concept roll and no seed key. Ryan chose this in plain words on 2026-09-17 and named the two products when asked.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Implementation consequences
- Token layer: semantic CSS custom properties on :root with a `prefers-color-scheme: dark` set; `color-scheme: light dark`. Tailwind's `archstats`, `secondary`, `slate`, `gray`, `white`, and the accent/semantic families (`indigo`/`sky`/`blue`→accent-neutral, `emerald`/`green`→success, `amber`/`orange`→warning, `rose`/`red`→danger, `violet`/`purple`→violet data ramp) are remapped onto those variables so the 2,000+ existing utility usages inherit the world and dark mode without a rewrite. Steps invert in dark mode.
- Fonts: `@font-face` for InterVariable and JetBrains Mono from `/fonts/`, no runtime network.
- Primitives: `.ui-btn`, `.ui-btn-primary`, `.ui-input`, `.ui-select`, `.ui-segmented`, `.ui-panel`, `.ui-toolbar`, `.ui-table`, `.ui-menu`, `.ui-tooltip` component classes plus rebuilt Vue primitives (Button family, Checkbox, SingleSelect, MultiSelect, StatSelect, ElementTable, InfoTable, tab-panel, ModalTrigger, Card, Headline).
- View chrome: `ViewWorkspaceLayout` becomes the tool-window frame (toolbar, content, inspector with segmented tabs); the standalone toolbars in table, matrix, plotter, comparison, walker adopt `.ui-toolbar`.
- D3: a `useChartTheme()` composable exposes the token values (read from computed style, refreshed on scheme change) so canvas and SVG diagrams stop hardcoding hex.

## Open, deliberately
Per-view diagram redesign (layouts, interactions), Git/Files/Java families, drill-down pages, keyboard shortcuts, a settings surface for appearance override.
