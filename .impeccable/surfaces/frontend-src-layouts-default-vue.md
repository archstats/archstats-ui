---
version: 1
slug: "frontend-src-layouts-default-vue"
primary_target: "frontend/src/layouts/default.vue"
related_targets: ["frontend/src/components/navbar/NavBar.vue","frontend/src/components/shell","frontend/src/stores/workspaces.ts"]
---

# Surface brief: workspace sidebar and scan flow

Mode: Operate. Scope: the app shell (sidebar) plus the view-area empty/scanning/failed panel. Extension of the incumbent shell inside the established world (navy `archstats-900` rail, orange `secondary` accent, white content). Confirmed with Ryan 2026-09-17.

## Audience and job
Architect returning to a known workspace, or consultant opening a fresh folder. The sidebar answers: which workspace, which snapshot, is a scan running. First run reaches a rendered view with one folder pick; later visits with one click.

## Confirmed decisions
- One active workspace at a time; switcher at the top of the sidebar (popover listing all workspaces, "Add workspace" opens the native folder picker).
- Scan runs async; user keeps exploring the open snapshot; inline phase progress (detecting, analyzing, rendering, saving) with an indeterminate bar and detected-extension chips. Engine gives no percentages; none are invented.
- Auto-open rule: the finished snapshot opens automatically only if the user was on that workspace's newest snapshot or had none open. Choosing an older snapshot is the pin.
- Empty state (zero workspaces) is a teaching panel in the view area: one sentence, three steps, one primary button opening the folder picker. Picking creates the workspace named after the folder basename and starts the scan immediately. Same panel shows scanning and failed states.
- Collapse stays; the floating round chevron button is removed. The toggle is a small icon button in the brand row; when collapsed, a slim edge handle re-expands and a 2px orange line shows a running scan.
- No keyboard shortcuts in this round.
- Duplicate folder paths are refused; the message names the existing workspace and offers "Switch to it".
- Workspace rename inline (double-click the name). Workspace and snapshot deletion use inline two-step confirms, never modals.
- View navigation renders dimmed and inert with no snapshot open.
- Interim `pages/open.vue` and its redirect middleware are removed.

## Ranges and states
Workspaces 1–5 typical, 20 max. Snapshots per workspace 1–50+, history collapsed to three with "Show all". Names 3–40 chars; paths often >60 chars, truncated in the middle. Scans seconds to minutes. States: no workspaces; workspace with running scan and no snapshot; failed-only workspace; folder missing on disk; scan interrupted by app exit (marked failed at startup).

## Direction contract
THESIS: The sidebar is a project header, not a menu. It owns identity (workspace), time (snapshot), and activity (scan) in one column, and refuses the launcher-screen and workspace-tree arrangements.
OWN-WORLD: Inherited. Navy rail `archstats-900` with `archstats-800` panels and `archstats-700` hairlines; orange `secondary-400/500` for the primary action, the open-snapshot marker, and the progress line only; white content ground; one sans (system stack) with mono reserved for paths and timestamps; lucide icons at 1.8 stroke.
STORY: I see my workspace, the snapshot I am reading, and whether a fresh one is coming. I press Scan and keep working. When it lands, I am on it.
FIRST VIEWPORT: 1280×800. Left rail 260px: brand row with the collapse control; workspace header (name bold 15px, path mono 11px, chevron); scan panel (snapshot date + Scan button, three history rows); view nav sections; groups footer. Right: on first run, a centered panel with the mark, one sentence, three steps, and a single orange button.
FORM: Extension of the incumbent shell. No concept roll and no seed key: new-work §3 "Extend an existing surface" governs (inherit world and composition, no concept tournament). The user confirmed the structure in the shape interview (one active workspace, switcher at top; inline progress; teaching empty state) and answered "build it" to the resulting brief on 2026-09-17; no separate roll exemption was asked for or given.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Open, deliberately
Keyboard shortcuts. Icon rail variant of the collapsed state. Scan cancellation (engine has no context support).
