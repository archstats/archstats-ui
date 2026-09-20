---
name: Archstats Desktop
description: An IDE tool window for reading a codebase; flat cool-gray surfaces, hairline structure, Inter at 13px, evidence in mono, one orange.
colors:
  accent: "#E08A19"
  accent-hover: "#F2A33A"
  accent-pressed: "#C4740F"
  accent-link: "#9F5D0C"
  accent-tint: "#FFF6E8"
  accent-selection: "#FFD596"
  accent-tint-edge: "#FBBE5F"
  on-accent: "#1F2329"
  surface: "#FFFFFF"
  ground: "#F7F8FA"
  surface-hover: "#EEF0F4"
  hairline: "#E3E6EC"
  hairline-strong: "#CED3DC"
  ink: "#1E2026"
  ink-strong: "#262932"
  ink-body: "#4B515E"
  ink-secondary: "#6C7280"
  ink-muted: "#9AA1AF"
  data-blue: "#3D74EA"
  data-green: "#3E9B5F"
  data-green-ink: "#2F7E4C"
  data-amber: "#D48D1E"
  data-red: "#DA4E4E"
  data-red-ink: "#9B2F2F"
  data-violet: "#7759DB"
typography:
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.01em"
  stat:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "28px"
    fontVariation: "tabular-nums"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    fontFeature: "'cv11', 'ss01', 'calt'"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  overline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.04em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    fontFeature: "'calt', 'zero'"
    fontVariation: "tabular-nums"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
  full: "9999px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-secondary-hover:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
  button-secondary-active:
    backgroundColor: "{colors.surface-hover}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-primary-active:
    backgroundColor: "{colors.accent-pressed}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.data-red-ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-small:
    padding: "0 8px"
    height: "24px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  input-small:
    padding: "0 6px"
    height: "24px"
    typography: "{typography.label}"
  segmented:
    backgroundColor: "{colors.surface-hover}"
    rounded: "{rounded.md}"
    padding: "2px"
    height: "28px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
  segmented-option-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  chip-active:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
  chip-muted:
    textColor: "{colors.ink-muted}"
  tag:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink-body}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  toolbar:
    backgroundColor: "{colors.surface}"
    padding: "0 12px"
    height: "40px"
  nav-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "26px"
  nav-row-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  nav-row-active:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
  menu:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "4px"
  menu-item:
    textColor: "{colors.ink-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  menu-item-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  menu-item-active:
    backgroundColor: "{colors.accent-tint}"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  table-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    padding: "0 8px"
    height: "32px"
  table-cell:
    textColor: "{colors.ink-strong}"
    typography: "{typography.body}"
    padding: "0 8px"
    height: "28px"
  table-row-selected:
    backgroundColor: "{colors.accent-tint}"
  stat-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.stat}"
    padding: "12px 16px"
  breadcrumb:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    padding: "0 2px"
    height: "36px"
  tab-active:
    textColor: "{colors.ink}"
  scope-chip:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  empty-state:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    padding: "40px 24px"
  neighbour-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-strong}"
    typography: "{typography.mono}"
    padding: "0 12px"
    height: "32px"
  code-gutter:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono}"
    padding: "12px 8px 12px 12px"
---

# Design System: Archstats Desktop

## Overview

**Creative North Star: "The Tool Window"**

Archstats Desktop is an instrument, not a dashboard. Every screen reads like a tool window in a modern IDE: flat surfaces separated by one-pixel hairlines, a single 13px type family, evidence set in monospace, and one orange that marks the primary action and the current selection and nothing else. The bar it is judged against is the JetBrains New UI and Linear, played straight; a category-fluent user must trust every control on sight. Nothing on screen may read as decoration.

The world is built as two complete palettes, light and dark, that follow the OS (`prefers-color-scheme`); the dark set is re-tuned per step, not inverted. The navy of the old identity survives only as the cool tint in the gray ramp and in the logo. Content sits on pure white (or the dark content ground), while the rail and the right-hand inspector sit one step down on the panel ground, so structure is legible without a single drop shadow. The visualizations are the product; the chrome exists to reach them and then recede.

The build refuses the card-deck arrangement (icon tile, eyebrow, big number, colored halo), badges and emoji, and gradients. Depth comes from tonal steps and hairlines; a shadow appears only under a floating layer.

**Key Characteristics:**
- Flat, tonal layering: content on surface, rail and inspector one step down on ground; hairlines are the only structure.
- One accent (logo orange) for the primary action, focus, caret, selection, progress, and the active row; blue, green, amber, red, violet are data-only ramps.
- One type family, Inter, at a 13px/18px base with exactly two emphasis weights (500, 600); JetBrains Mono for every identifier, path, timestamp, and number.
- Dense, keyboard-first controls: 28px buttons and inputs, 24px in toolbars, 26px nav rows, a 40px view toolbar.
- Both appearances shipped from one token file, generated into CSS variables; the same utility classes render either palette.
- One click model and one detail frame: a click selects, a double-click opens, every name is a link, and component, file and author each land in the same breadcrumb-and-tabs frame.

## Colors

A navy-tinted cool-gray ramp in two complete appearances, one warm orange accent, and five data hues that never touch the chrome. The frontmatter records the light appearance; every token's dark partner is generated from the same source (`frontend/design/tokens.cjs`) and listed in the sidecar.

### Primary
- **Logo Orange** (accent, #E08A19; dark #F0A033): the one accent. It fills the primary button ("Scan again", "Choose folder…"), the indeterminate progress sweep, the input caret, the 2px inset bar on the active nav row, and the hover state of a splitpane divider. It never colors a label, an icon, or a heading.
- **Orange Lift** (accent-hover, #F2A33A; dark #C48425): the primary button on hover and the 2px focus ring on every focusable element. In the dark appearance the hover step is the deeper tone; that is how the ramp was tuned, not a mistake.
- **Orange Press** (accent-pressed, #C4740F; dark #F5B155): the primary button while pressed.
- **Orange Ink** (accent-link, #9F5D0C; dark #F8C27C): the only inline link color the chrome uses, seen in the "Switch to it" recovery link on the first-run notice.
- **Orange Tint** (accent-tint, #FFF6E8; dark #3A2A12): the wash that marks the active nav row, a selected table row, an active chip, an active menu item, and the selected inspector row. Always paired with neutral ink, never with orange text.
- **Orange Selection** (accent-selection, #FFD596; dark #8E621C): text selection highlight and the edge of the conflict notice; **Orange Edge** (accent-tint-edge, #FBBE5F; dark #8E621C) outlines the active chip.
- **Ink on Orange** (on-accent, #1F2329; dark #1E2026): dark text on the orange button in both appearances; orange never carries white text.

### Neutral
- **Surface** (#FFFFFF; dark #1E2026): the content ground, every button, input, panel, popover, and menu.
- **Ground** (#F7F8FA; dark #262932): the rail, the collapsed rail handle, the right inspector, and the hover wash on secondary buttons and table rows. One step down from surface; that step is the layering system.
- **Surface Hover** (#EEF0F4; dark #2B2F38): the segmented-control track, tag backgrounds, nav-row hover, quiet-button hover, menu-item hover, pressed secondary buttons, and the divider between table body rows.
- **Hairline** (#E3E6EC; dark #363A45): the 1px line that draws every boundary: rail edge, toolbar bottom, panel outline, table header rule, stats strip cells, section separators.
- **Hairline Strong** (#CED3DC; dark #444956): the 1px stroke around interactive controls (buttons, inputs, chips, checkboxes) and the scrollbar thumb; it lifts to Ink Muted on hover.
- **Ink** (#1E2026; dark #F5F6F8): page titles, panel titles, stat values, primary text, and the tooltip background.
- **Ink Strong** (#262932; dark #D5D9E0): button labels, nav rows at rest, table cells, menu items.
- **Ink Body** (#4B515E; dark #B0B5BF): quiet-button labels, secondary descriptions, chip text, numeric cells.
- **Ink Secondary** (#6C7280; dark #8B919E): labels, section titles, toolbar meta, table headers, key column of key/value lists, descriptions under view names.
- **Ink Muted** (#9AA1AF; dark #656B79): rail icons, placeholders, chevrons, disabled-looking chip text, the step numerals on the first-run screen.

### Tertiary (data only)
- **Data Blue** (#3D74EA; dark #6293EE), **Data Green** (#3E9B5F; dark #58B27A), **Data Amber** (#D48D1E; dark #E0A43A), **Data Red** (#DA4E4E; dark #E86464), **Data Violet** (#7759DB; dark #9581E6): the five ramps D3 reads through `chartTheme()` for diagram fills, strokes, and the additions/deletions bar. **Green Ink** (#2F7E4C) and **Red Ink** (#9B2F2F) are the readable text steps of the same ramps, used for the "+added / −removed" readouts and the danger button. The heat ramp runs Hairline Strong → Orange Selection → Orange Lift → red-400 → red-700.

### Named Rules
**The One Orange Rule.** Orange appears only as the primary action, the focus ring, the caret, the selection wash, the progress sweep, and the active row's bar and tint. If orange is on a label, an icon, or a heading, it is a defect.
**The Data-Only Hue Rule.** Blue, green, amber, red, and violet exist for data (chart marks, churn bars, danger) and never color chrome, labels, or navigation. Every Tailwind color family (slate, gray, indigo, sky, emerald, rose, purple, …) resolves to one of the seven ramps, so a stray utility cannot introduce an eighth hue.
**The Ink-on-Orange Rule.** Orange carries dark ink in both appearances; never white text on the accent.

## Typography

**Display Font:** none; Inter carries every size.
**Body Font:** Inter variable (self-hosted at `/fonts/InterVariable.woff2`, with system-ui fallback), features `cv11`, `ss01`, `calt`.
**Label/Mono Font:** JetBrains Mono (self-hosted, weights 400/500/600), features `calt`, `zero`, tabular numerals.

**Character:** A product-UI scale, not an editorial one: 13px base, 18px leading, steps of one or two pixels, and only two emphasis weights. Inter reads as the chrome; JetBrains Mono reads as the evidence. Nothing is set larger than 32px and nothing in the shipped shell exceeds 22px.

### Hierarchy
- **Headline** (600, 20px/26px, −0.01em): the page title ("Overview", "Point Archstats at a folder"). One per page.
- **Stat** (500, 22px/28px, tabular): the readings in the stat strip on the dashboard and on every detail overview. The only place a number is set larger than body.
- **Title** (600, 15px/20px): panel titles ("Structure", "Activity", "Views") and the Groups modal heading.
- **Toolbar title** (600, 13px): the view name in the 40px toolbar; it is body-sized on purpose so the toolbar stays a toolbar.
- **Body** (400, 13px/18px): everything else: nav rows, buttons, inputs, menu items, table cells, descriptions. 500 marks emphasis (view names in the directory, active nav, button labels).
- **Label** (500, 12px/16px, Ink Secondary): stat labels, axis labels, table headers, toolbar meta, secondary descriptions.
- **Overline** (600, 11px/16px, uppercase, +0.04em, Ink Secondary): the family titles in the rail ("COMPONENTS", "GIT") and section titles inside panels and the inspector. This is the only uppercase text in the system.
- **Mono** (400 or 500, 12px/16px or 11px/16px, tabular): workspace paths, snapshot timestamps, component names in tables, numeric cells, key/value values, tags, counts in the toolbar.

### Named Rules
**The Two Weights Rule.** Emphasis is 500; titles are 600. Requests for bold, extrabold, or black collapse to 600 at the Tailwind layer; requests for thin or light collapse to 400.
**The Mono Evidence Rule.** Any identifier, path, hash, timestamp, or number the user might copy or compare is set in JetBrains Mono with tabular numerals. Prose stays in Inter.
**The 10px Floor Rule.** The smallest size on the scale is 10px/14px and it is reserved for D3 labels; chrome never drops below 11px.

## Layout

The window is a fixed two-column shell: a 240px rail on Ground with a hairline right edge, and a content column on Surface that scrolls independently. The rail collapses to a 20px handle that keeps the ground color and shows the orange progress sweep while a scan runs. The native window is 960px at minimum and typically 1280px and wider; there is no phone target and no breakpoint below `lg` (1024px) affects the shell. Between `lg` and `2xl` a few toolbars hide hints and the dashboard grids collapse from six columns to three and from two panels to one.

Every view opens inside the same tool-window frame: a 40px toolbar (title left, mono count beside it, search and controls pushed right with `gap-2`), the visualizer filling the remainder, and an optional right inspector (340px, Ground, hairline left edge) with a 36px underline tab row and a 16px-padded body. Toolbars that need more controls (Plotter) wrap onto a second row rather than shrinking their controls.

The dashboard is the exception to full-bleed: a 1200px max-width column with 32px side padding and 28px top padding. Its rhythm is a stats strip (six cells, hairline-framed, 16px/12px cell padding), two panels in a 16px gap, a details row, then the "Views" directory as hairline panels with 56px rows (64×40 thumbnail, name, description, chevron).

Detail pages (component, file, author) share one frame: the same 40px toolbar carrying a back button, a breadcrumb, the mono title, a kind tag and two or three mono key stats; a 36px tab strip under it (4px-padded tabs, 16px apart, 16px side padding); then the tab body. The Overview tab is a centered 1040px column with 24px side padding and 20px top padding that opens with the stat strip; the other tabs run full-bleed (a table, a three-pane walk, a source pane, the commit history). Commit history splits into a scrolling column and a 260px contributors aside on Ground with a hairline left edge.

**The Detail Frame Rule.** An entity has one detail surface: toolbar (back, breadcrumb, title, kind, stats), tab strip, body. No second rail, no pill strip, no hero header.
**The Two-Tab Rule.** A tab strip is drawn only when there are two or more tabs; a lone tab is rendered as its content with no strip.

Spacing runs on the 4px grid: 4px between icon and label, 8px between sibling controls, 12px toolbar and cell padding, 16px panel padding and panel gaps, 24px inside the visualizer, 32px page gutters. Control heights are fixed: 28px for buttons and inputs, 24px for their small variants inside toolbars, 26px nav rows, 20px tags, 14px checkboxes, 32px table headers, 28px table rows.

## Elevation & Depth

The system is flat and tonal. Depth is conveyed by one tone step (Surface over Ground) and by hairlines; nothing in the content area, the rail, or the inspector casts a shadow. Controls at rest carry a 1px Hairline Strong ring drawn as a box-shadow, so borders never change layout. The `shadow-sm` and smaller Tailwind steps are mapped to `none`; `shadow` and `shadow-md` are the hairline ring; `shadow-lg` and larger are the float shadow.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 0 0 1px rgb(var(--c-neutral-200))`): panels, menus' base ring, thumbnails, the stats strip. On controls the ring uses neutral-300 and darkens to neutral-400 on hover.
- **Float** (`0 8px 24px -8px rgb(15 18 28 / 0.24), 0 0 0 1px rgb(var(--c-neutral-200))`; dark `0 12px 32px -8px rgb(0 0 0 / 0.6)` plus the ring): menus, popovers, tooltips, and the Groups modal. Nothing else.
- **Focus** (`outline: 2px solid` Orange Lift, 1px offset; inputs use a 2px Orange Lift ring in place of the hairline): the only glow in the system.
- **Modal scrim** (`rgb(0 0 0 / 0.4)` with a 2px backdrop blur): under modals only.

### Named Rules
**The Float-Only Shadow Rule.** A shadow means the element is floating above the window (menu, popover, tooltip, modal). If it is in the layout flow, it gets a hairline.
**The Ground Step Rule.** Secondary regions (rail, inspector, hover states) sit one tone below Surface; there is no third tone in the chrome.

## Shapes

Corners are small and consistent: 2px on checkboxes, 3px on tags and segmented-control options, 4px on buttons, inputs, chips, nav rows, menu items, and tooltips, 6px on panels, menus, popovers, and the modal card, 8px only on the scrollbar thumb; Tailwind's `rounded-xl` through `rounded-2xl` all collapse to 6px and `rounded-3xl` to 8px. Fully round shapes are limited to progress bars and the group color dots. Borders are always 1px, drawn as box-shadow rings on controls and as real 1px borders on separators, so hover and focus never shift layout. Icons are Lucide at 14–16px with a 1.75 stroke in Ink Muted or Ink Secondary; the Icon primitive fixes the stroke at 1.75.

## Components

### Buttons
- **Shape:** 4px corners, 28px tall, 10px horizontal padding, 6px gap between icon and label, body size at 500; the small variant is 24px tall with 8px padding at 12px.
- **Secondary (default):** Surface fill, Ink Strong label, 1px Hairline Strong ring. Hover to Ground with Ink; pressed to Surface Hover. This is the workhorse; every select trigger and the "Groups" footer button are this.
- **Primary:** Logo Orange fill with dark Ink on Orange, no ring. Hover Orange Lift, pressed Orange Press. One per region: "Scan again" in the rail, "Choose folder…" on first run. While a scan runs the same button becomes a neutral progress readout with the orange sweep along its bottom edge.
- **Quiet:** transparent, Ink Body label, no ring; hover Surface Hover with Ink. Used for icon-only affordances (collapse rail, close popover, pagination).
- **Danger:** Surface fill, Red Ink label, 1px red-200 ring; hover red-50 with red-800.
- **Icon:** square 28px (24px small), padding removed.
- **Disabled:** 50% opacity, default cursor.
- **Split action:** a secondary button containing a label and a 24px native select separated by a hairline.

### Inputs / Fields
- **Style:** Surface fill, 4px corners, 28px tall (24px small), 8px padding, body size, 1px Hairline Strong ring; hover ring lifts to Ink Muted. Search inputs carry a 13px Lucide search glyph at the left and an inline clear button.
- **Focus:** the ring becomes 2px Orange Lift; no outline.
- **Mono variant:** JetBrains Mono at 12px for regex filters.
- **Checkbox:** 14px square, 2px corners, Hairline Strong ring at rest, Orange fill with dark check when on.
- **Select:** a secondary button (min 120px, chevron-down in Ink Muted) opening a menu.

### Segmented control
- **Style:** 28px track on Surface Hover with 2px inset padding, options at 12px/500 in Ink Body with 3px corners.
- **Active:** Surface fill with a hairline ring, Ink text. Used for view modes and inspector tabs where the tab underline is not used.

### Chips
- **Style:** 24px, 4px corners, 8px padding, 12px/500 Ink Body on Surface with a Hairline Strong ring; a 8px color dot leads when the chip stands for a group; hover to Ground.
- **State:** active is Orange Tint with an Orange Edge ring and Ink text; muted (hidden group) drops to Ink Muted with a plain hairline and a strike-through label.

### Tags
- **Style:** 20px, 3px corners, 6px padding, JetBrains Mono 11px/500 Ink Body on Surface Hover. Used for counts ("21", group count), the snapshot-family markers ("Java", "Spring", "JPA"), and group membership in tables (where the group's own color fills the tag).

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** Surface, always; a panel never sits on Surface Hover.
- **Shadow Strategy:** hairline ring only (see Elevation).
- **Border:** the ring is the border; internal sections separate with hairline-b and panel section titles use the Overline style with 12px/10px padding.
- **Internal Padding:** 16px (dashboard panels), 20px (`Card` primitive).

### Toolbar (tool-window header)
- 40px tall, Surface, hairline bottom, 12px side padding, 8px gaps. Title at 13px/600, meta in mono 12px Ink Secondary, a 1px × 16px separator between control groups, labels ("X", "Y", "Preset") in Label style. Controls right-aligned with `ml-auto`; the inspector toggle is an icon button whose pressed state is Surface Hover.

### Navigation (rail)
- 240px on Ground with a hairline right edge. Brand row 44px (20px icon, wordmark swapped per appearance), workspace switcher as a 28px folder tile on Surface plus name (13px/600) and mono path (11px), the primary scan button, a snapshot list, then view families under Overline titles.
- Rows: 26px, 4px corners, 8px padding, 14px Lucide icon in Ink Muted, body text in Ink Strong. Hover Surface Hover with Ink. Active: Orange Tint, 500 weight, Ink, and a 2px orange inset bar on the left edge. While no snapshot is open the whole list stays visible at 40% opacity and inert.
- Footer: hairline top, the "Groups" secondary button with a count tag.

### Inspector
- Right aside, 340px, Ground, hairline left edge. Tab row 36px with 12px gaps: 12px/500 labels, active tab in Ink with a 2px Orange underline, others Ink Secondary. Body 16px padding with 16px stack gaps. Selected rows inside use Orange Tint with a 2px orange left bar, mirroring the rail.

### Detail frame
- Toolbar: quiet 24px back arrow, then the breadcrumb in body size (crumbs Ink Secondary, Ink on hover, 12px chevrons in Hairline Strong), the title at 13px/600 (mono 12px when it is a file path), a mono kind tag ("Component", "File", "Author"), and key stats as toolbar meta ("Files 21 · Lines 8,644 · Commits 180", value in mono Ink Strong, hidden below `lg`). Actions sit right (`ml-auto`).
- Tab strip: 36px, tabs at 12px/500 in Ink Secondary, active in Ink with a 2px orange underline, an optional mono 11px count in Ink Muted beside the label. The same strip rule serves the inspector (12px gaps, 12px side padding).
- Overview body: the stat strip first, then Overline-titled sections (rank table "Among 52 components" with value, rank "2 / 52" in mono and a neutral percentile bar; Groups; "All metrics" as key/value lists in a two-column grid).

### Stat strip
- One `dl` in a 6px hairline frame, cells divided by hairlines, 16px/12px cell padding: label at 12px Ink Secondary over the Stat value (22px/500 tabular) in Ink. A health or hotspot value carries an 8px level dot before it; a signed line count is the only cell that may take Green Ink or Red Ink.

### Health levels
- `useHealth()` is the one threshold table: code health ≥ 8 good, ≥ 5 watch, else alert; hotspot score < 40 good, < 70 watch, else alert; missing values read "—". Levels map to the data ramps only: text green-700 / amber-700 / red-700, dots green-500 / amber-500 / red-500, canvas fills through `chartTheme()`; "none" is Ink Secondary text and a Hairline Strong dot.

### Scope chip and counts
- The active-scope chip is the active chip (Orange Tint, Orange Edge ring, Ink label) capped at 260px, led by the group's 8px color dot and ended by a 16px clear button; it renders nothing when no scope is set, so toolbars stay quiet. Toolbar counts are mono: "Components 52" at rest, "12 of 52" while a scope or search narrows the rows.
- The rail's Groups section lists saved groups as toggles styled exactly like the active nav row (Orange Tint plus the 2px bar) when they scope the views; the empty section reads "No groups yet. Select components in any view to create one."

### Grain and representation switches
- Grain (Components | Directories | Files), representation (Table | Plot; Packed | Flat), period (All | 1y | 180d | 90d | 30d) and mode (Top | Explore) are segmented controls in the toolbar with an `aria-label` naming the axis, placed right of the search. A view never forks into a second view for a second grain.

### Loading, empty and error states
- Loading: the 2px orange progress sweep, 128px wide, over a 12px Ink Secondary verb ("Reading components…"); centred, at least 120px tall.
- Empty: a 20px Lucide icon in Hairline Strong, a 13px/500 Ink Body title, a 12px Ink Secondary reason capped at 42ch, and the buttons that clear the cause ("Clear search", "Clear scope") as small secondary buttons. Errors use the same block with the `alert` icon and the message as the reason.

### Search
- The toolbar search is the small input with a 13px search glyph and an inline clear; its placeholder names the grain ("Search components", "Search files", "Filter dependencies"). It filters rows already loaded and never re-runs a query per keystroke.

### Pair table and neighbour list
- Pair table: the data table with the neighbour name as a mono 12px link, an optional group column in Ink Body, then right-aligned mono evidence columns: Refs, Hops, Shared, Co-change (%), Similarity (0–1), Path; unknown values read "—". Headers sort on click with a 12px chevron; a 36px hairline-topped footer shows "N pairs" in mono and "n / m" pagination.
- Neighbour list (walk panes): 36px header with an Overline title, mono count and a hint; a small filter input row; 32px rows with the short mono name as a "walk" button, a mono hop tag ("2h") past one hop, a right-aligned mono reference count, and an open-arrow quiet button that appears on hover or focus.

### Commit history
- One anatomy on the Activity page, the three History tabs and the dashboard: a 40px control row (period segmented left; mono meta right: Commits, Authors, +added in Green Ink, −removed in Red Ink, the date span), the calendar heatmap, an optional Overline-titled "Lines added and removed by month" with 140px diverging bars (green up, red down), the commit table (mono short hash, message, author as a link, date, files, ± lines), a "Show more · N left" small button, and the 260px Contributors aside (32px rows: name, mono count, 48px neutral bar; "Show all N" quiet button).

### Code viewer
- A 6px hairline panel (full-height in the Source tab): 32px header with a file-code icon, mono basename, mono "N lines" in Ink Muted and a copy button; a Ground gutter with right-aligned mono 11px/20px numbers and a hairline right edge; the body in mono 11px/20px Ink Strong. The targeted line takes the Orange Tint wash and the 2px orange inset bar. Syntax colors are the data ramps: comments Ink Secondary italic, keywords violet-700, strings green-700, numbers amber-700, functions blue-700, types blue-800, attributes neutral-800, meta amber-800, deletions red-700, so both appearances hold without a theme file.

### Zoom controls
- One overlay for every canvas: three small icon buttons (zoom in, zoom out, reset) stacked with 4px gaps, 16px from the bottom-right corner (top-right when the bottom is taken).

### Named Rules
**The Click Model Rule.** Single click selects and fills the inspector; double-click, Enter, or the inspector's "Open" button goes to detail; hover only shows the tooltip. Every name rendered anywhere is a link to its detail.
**The One Strip Rule.** Every overview opens with one hairline-framed stat strip, label over a 22px tabular value in neutral ink; a level dot marks health and hotspot scores. There are no stat tiles.
**The Scope Chip Rule.** A saved-group scope is announced once, as the active chip in the toolbar, and every count it narrows reads "N of M".
**The Switch, Not Family Rule.** Grain, representation and period are segmented controls in the toolbar, never sibling views.
**The Reason Rule.** A loading state names what is being read; an empty state names why it is empty and offers the button that clears the cause.
**The Loaded Rows Rule.** Search filters loaded rows and its placeholder names the grain.
**The Crowded Label Rule.** A dense graph labels its hubs (the top twenty by degree), the selection, the traced path and search hits; every other node gets its name on hover. Packed circles label what fits and truncate the rest.
**The Evidence Column Rule.** Coupling is shown as a pair table whose columns are the evidence (Refs, Hops, Shared, Co-change, Similarity, Path), sortable and paginated, never as a prose verdict.
**The One Health Rule.** Health and hotspot thresholds and colors come from `useHealth()` alone; no view carries its own.

### Menus, popovers, tooltips
- **Menu:** Surface, 6px corners, 4px padding, float shadow. Items 28px, 4px corners, body Ink Strong; hover Surface Hover; active Orange Tint. Section titles in Overline style. Opens with a 160ms fade and 2px rise.
- **Popover:** Surface, 6px, float shadow; the Configure popover is 288–320px with a 12px padding and a hairline header.
- **Tooltip:** Ink background, Surface text at 12px/16px, 4px corners, 6px/8px padding, float shadow. D3 tooltips use the same class.
- **Modal:** Surface card at 6px with the float shadow over a 40% black scrim with 2px blur; the Groups workspace is 960×720 max.

### Tables
- Header 32px, sticky, Surface, 12px/500 Ink Secondary, hairline rule below; sortable headers show a 12px chevron. Rows 28px with a Surface Hover divider; cells body Ink Strong, names in mono 12px/500 Ink, numbers right-aligned mono 12px tabular Ink Body. Hover Ground; selected Orange Tint. Pagination is two quiet icon buttons and a mono "n / m".
- **Key/value list:** two-column grid, 16px column gap, 4px row gap; keys Ink Secondary, values right-aligned mono.

### Progress
- The indeterminate sweep: a 2px bar filled Logo Orange at 20% with an orange segment sweeping across in 1.4s; vertical along the collapsed rail, horizontal along the scan button's bottom edge. Under reduced motion it pulses opacity instead.

### Charts (D3)
- Read every color from `chartTheme()`: Surface, Ground, Hairline, Hairline Strong, Ink, Ink Secondary, Ink Muted, Orange (with a 200-step soft partner), and the five data hues with their soft partners. Fonts are Inter and JetBrains Mono. Redraw on `version` when the OS appearance flips; never hardcode hex in a diagram.

## Do's and Don'ts

### Do:
- **Do** compose every view from the tool-window frame: 40px toolbar, visualizer, optional 340px inspector on Ground.
- **Do** draw structure with 1px hairlines (neutral-200 for boundaries, neutral-300 rings on controls) and reserve the float shadow for menus, popovers, tooltips, and modals.
- **Do** set identifiers, paths, timestamps, counts, and numeric cells in JetBrains Mono with tabular numerals.
- **Do** mark selection with Orange Tint plus a 2px orange inset bar (rail rows, inspector rows) or Orange Tint alone (table rows, chips, menu items), always with neutral ink.
- **Do** use the `.ui-*` vocabulary (`ui-btn`, `ui-input`, `ui-segmented`, `ui-chip`, `ui-tag`, `ui-panel`, `ui-toolbar`, `ui-menu`, `ui-tooltip`, `ui-popover`, `ui-table`, `ui-kv`, `ui-label`, `ui-section-title`) before writing new utility stacks.
- **Do** read chart colors through `chartTheme()` so diagrams follow the OS appearance.
- **Do** keep controls at 28px (24px in toolbars) and rows at 26–28px; the density is the point.
- **Do** ship both appearances from `frontend/design/tokens.cjs` and regenerate `tokens.css` with `npm run tokens`.
- **Do** wire every canvas and table to the click model: click selects, double-click or "Open" navigates, and every name is a router link.
- **Do** build detail pages on `DetailFrame`, overviews on `StatStrip`, coupling on `PairTable`, history on `CommitHistory`, and canvases on `ZoomControls`, `LoadingState` and `EmptyState`.
- **Do** read health and hotspot levels from `useHealth()` and give every empty state its reason.

### Don't:
- **Don't** put orange on labels, icons, headings, or chart marks that are not the heat ramp.
- **Don't** color chrome or navigation with blue, green, amber, red, or violet; they are data ramps.
- **Don't** use card-deck stat tiles (icon tile, eyebrow, big number, colored halo); the stats strip is one hairline frame with label/value pairs.
- **Don't** add gradients, emoji, badges, or pill-shaped labels; counts are mono tags at 20px.
- **Don't** set chrome text below 11px, or use a weight other than 400, 500, 600.
- **Don't** put a shadow on anything in the layout flow, including panels, thumbnails, and the inspector.
- **Don't** load fonts, icons, or images from the network; Inter, JetBrains Mono, and Lucide are bundled.
- **Don't** render white text on the orange accent; the accent carries dark ink in both appearances.
- **Don't** hardcode hex in a component or diagram; every color is a `--c-*` variable so the dark appearance stays complete.
- **Don't** fork a view per grain or per source, add a second zoom overlay, or draw a tab strip for a single tab.
- **Don't** put a stat in a tile, a scope in a banner, or a count outside the mono toolbar meta.

## Groups, dimensions and the tree (added 2026-09-18)

- **Dimension Rule.** Every group has a dimension (Domain, Layer, …). A unit may
  sit in one group per dimension. Views colour by one dimension and roll up by
  one dimension; never blend two into one hue. The inspector shows one chip per
  dimension, dimension name in secondary ink before the group name.
- **Scope Grammar.** Scope chips read "A or B and C": groups in the same
  dimension widen, different dimensions narrow. Each chip has its own remove.
- **Stay In Place Rule.** A name in the inspector points at something in the
  picture, not at another page. Clicking one opens whatever holds it, selects
  it and brings it to the middle of the view. Leaving for a detail page is its
  own small control, never the default.
- **Inspector Rule.** A selected node answers three questions in order: what
  is this (identity and memberships), what is inside it (its contents, worst
  first, with a way in), and how does it sit in the system (dependencies split
  by direction, strongest first, with the cyclic ones marked). A bare number
  never stands alone: it carries its share or its rank.
- **Split Rule.** A component split across groups is drawn as the groups that
  hold it — one wedge each, in the share each holds — never as one colour. It
  keeps its place and its size on the map and only stops being whole, so no
  node can read as belonging entirely to a group that has part of it.
- **A Part Never Wears The Whole Name.** Wherever a share of a component is
  listed it carries its fraction, 4/11, and a dashed ring filled to that share
  instead of the solid disc a whole one gets. A count never adds the two
  together: sixteen whole and two parts is written 16+2, never 18.
- **Splitting Is An Act, Not A State.** Nothing splits by itself and nothing
  splits as a side effect. It takes a named gesture, it says what stays behind
  and where the rest is going, and Rejoin undoes it in one click.
- **Covering Everything Is Not Finishing.** A first pass that places every
  component has not done the work, it has hidden it: on BroadleafCommerce the
  Domains pass proposed 47 groups covering all 454, a median group of seven,
  and kept under a third of references inside. The engine proposes only a group
  it can stand behind — enough members, and enough of its own work kept inside
  — and hands the rest back unplaced. Refusing to answer is an answer, and it
  beats a group someone has to undo. The gate refuses proposals, never
  decisions: anything a person has touched is exempt.
- **Demand What The Cut Is Made Of.** A quality floor must ask the question the
  cut is actually about. Cohesion is right for a domain and wrong for a layer,
  whose members deliberately do not reference each other — the same gate that
  doubles a domain pass's modularity moves a layer's by 0.001 and throws away
  194 components for nothing. Horizontal cuts carry a size floor and no
  cohesion demand.
- **Put The New Idea Inside The Abstraction That Already Means It.** A typed
  query had to filter the graph, the table and the treemap. The scope store
  already meant "a lens on any view" — its own comment said so — and all three
  surfaces already filtered through it, so the query went INTO the scope
  rather than into each page: it narrows exactly the way another dimension
  does, because that is what it is. Three surfaces for one change, and every
  view added later gets it without being told. Before writing a mechanism that
  reaches across surfaces, find the one already reaching across them.
- **Offer The Inference, Never Apply It.** Pointing at twelve of fourteen
  components is not the same as meaning "everything under booking", and only
  the person pointing knows which they meant. So the engine generalises a
  selection into a pattern, shows the pattern and what it would cost in lines,
  and waits. The same rule holds for a frozen group whose query has since
  matched more: it reports the candidates and adds nothing. Anywhere the app
  knows something the architect has not said yet, the answer is a visible
  offer with a keystroke, not a silent default.
- **Ship Where The Work Happens, Not Where The Code Was Easy To Find.** The
  query feature was integrated first into the selection tray and the groups
  store, neither of which the dimension builder uses — it has a parallel
  selection bar and its own draft model. Everything worked, every test passed,
  and none of it was visible on the one surface the work is actually done on.
  Grep finds callers; it does not find the screen somebody is looking at.
- **Say A Number Once.** The builder's rail opened with coverage stated five
  ways — a fraction, a bar, a confirmed/proposed/left sentence, a split count,
  a percentage of the code — and quality three ways beneath it. Nine lines
  before a single group appeared, and a reader still had to work out which
  number was the one to act on. Every additional phrasing of a fact competes
  with it. Pick the reading that drives a decision, put the rest in the title
  attribute, and let the bar be the only illustration.
- **A Gate Nobody Measured Is A Gate Nobody Has.** The engine's refusal to
  propose a weak group was written, documented with numbers, covered by tests,
  and did nothing at all: it asked for a component's references in a table
  keyed by file, missed every time, read the miss as "nothing to judge", and
  passed everything. It shipped like that. On the qp visualizer it was letting
  through 242 groups where 26 survive judging, and a one-component group
  labelled 0%. No threshold on the output would have caught it, because the
  output looked like an engine with an opinion. Anything that decides what the
  architect is shown gets a bench that runs it against a real codebase and
  prints what it removed — `npm run bench`, which is also where a claim in a
  doc comment now has to come from.
- **Measure The Thing You Are Going To Change, From The State The User Starts
  In.** The frame bench first sampled after the layout settled, so it timed an
  idle page and reported the same build at 17ms and at 30ms depending on
  whether the simulation had happened to stop. It samples from the moment the
  view opens now, which is the part anyone waits through. A before-and-after
  measured two different ways is not a before-and-after.
- **A Measured Win Can Still Be The Wrong Answer.** The map's folding view cut
  454 bubbles and 2,603 edges to 10 and 20, and was removed anyway, because it
  was confusing to use. It put three kinds of thing — a group, a package of
  unsorted components, a component — on one canvas at three levels of
  abstraction, changed what a bubble stood for as you worked, and made clicking
  mean something different depending on which you hit. Numbers justify a change
  only where the thing being measured is the thing that was wrong; crowding was
  the symptom, and comprehension was the cost. Where a view must show less,
  prefer changing what it IS — one stable meaning per mark — over showing a
  varying amount of the same thing.
- **One Surface, One Axis.** A region may be driven by what you are doing or
  by what you have selected, never by both. The dimension studio's sidebar was
  tabbed by mode (Sort, Grab) and filled by selection (a group, a pile), so a
  tab marked "Sort" showed a group editor. The rail is the dimension — groups
  and piles open in place, under their own row, where their identity already
  is — and the sidebar is intake, every tab a way of getting components in.
- **One Selection, Many Ways To Build It.** Where two surfaces can both gather
  things, they gather into the same set and one bar acts on it. A tree that
  can search but not select, beside a map that can select but not search,
  leaves "start a group from a considered set" impossible in both. Ticking a
  branch and drawing a box fill one basket.
- **A Heuristic Never Overrules An Instruction.** Once the interface asks a
  question, the answer is binding: merging asks "keep which name?", so the
  chosen name wins even when another group is larger. A rule may only decide
  what was never asked — a placeholder name loses to a real one because a
  placeholder is the absence of a choice, not a choice.
- **The Detector's Score Is The Measure.** Where the engine proposes a change
  to a cut, it is scored by what it does to the cut's own quality measure, not
  by a separate heuristic that is hoped to correlate with it. A proposal that
  does not improve the measure scores zero and is never offered. This is the
  only thing that stops a detector proposing work for its own sake, and it is
  why the measure must price what a change COSTS as well as what it buys:
  dividing a component dilutes every reference pointing at it, so splitting
  something widely depended on must be allowed to score negative.
- **Refusing Is The Feature.** A detector is judged on what it declines. Every
  proposal an architect has to say no to spends their attention and some of
  their trust, so the guards are tuned for precision, not coverage — measured
  on Broadleaf, the stricter the guard the higher the hit rate against held-out
  evidence. Refusals are counted and named ("agreed", "sliver", "no gain"),
  because a detector that finds nothing in a codebase with nothing wrong is
  working, not broken.
- **Propose The Line, Not The Destination.** The engine can see that a
  component's files disagree; it cannot see where the minority belongs. What a
  file imports is what it USES, which is not the same as what it IS — half of
  a catalog DAO leans at the extension framework, but those are catalog's
  extension handlers. So a proposal names the split and leaves the destination
  to the architect, new group included.
- **Validate On A Signal The Engine Cannot See.** A change scored on one
  signal is proved on another: tear lines found in static imports are checked
  against git co-change, with a null model of the same shape. An improvement
  that only shows up in the number being optimised is overfitting, and is not
  evidence of anything.
- **Grain Belongs To The Question, Not To Taste.** What a dimension is made of
  — whole components, or files that may divide one — is a property of the way
  it is being cut, not a preference and not a feature flag. Most ways are made
  of whole components and say so; a layer is the one question a single package
  answers two ways at once, so only a layer arrives able to divide one. The way
  supplies the grain, the architect may overrule it, and the toolbar names it
  beside the way so it is never something you have to go and check.
- **Absent, Not Disabled.** An affordance that cannot apply is removed, not
  greyed out. A dimension made of whole components has no splitting to offer,
  so it shows no split gesture, no fraction, no dashed ring and no divided
  count — a dimmed button would only keep asking a question the mode already
  answered. The rule generalises: never leave the shape of a thing on screen
  as evidence that it is missing.
- **A Mode Is Enforced In The Model.** Whatever a mode forbids, the store
  forbids: at component grain `move` reads a file list as "move the component",
  so no caller, keystroke or restored draft can produce a part the interface
  says cannot exist. Hiding a button describes a rule; only the model keeps it.
- **An Override Releases Itself.** Where a default is derived — the way of
  cutting supplying the grain — overriding it by hand must not be a state you
  get stuck in. Asking for what the default already wants counts as agreement
  and hands control back, so no reset button is needed and no setting outlives
  the reason for it. A mode name must also finish the sentence it sits in:
  "Made of Whole components" and "Made of Components and parts" both read;
  "Made of Files may split" was the first draft and could only be misread.
- **A Sheet Takes The Focus It Asks For.** A popover that opens without taking
  focus cannot be reached or dismissed from the keyboard, and leaves Escape to
  whichever global listener happens to win — which is a race, not a design. The
  sheet takes focus when it opens, handles Escape itself and stops it there,
  and gives focus back to the button it came from.
- **A Mode You Can Always Leave.** Turning a mode off may not quietly discard
  work done inside it. Going back to whole components rejoins every divided
  component into the group already holding most of its files, says so in plain
  numbers before it happens, and lands in one undo step. What is on the board
  outranks what was stored: a draft holding parts is a file-grain draft however
  it was saved.
- **Kind Rule.** Colour belongs to the dimension, so the kind is carried by
  the mark: a group is a rounded box (it holds components), a component a
  filled disc (it holds files), a file a hollow ring (it holds nothing).
  Size stays honest about mass, so a group of little code is a small box.
  Each kind keeps its own label voice: a group in sans semibold and always
  shown, a component in mono, a file in smaller, quieter mono. A key names
  the marks on screen whenever more than one kind is drawn.
- **Tree Rule.** Groups ⊃ components ⊃ files is one tree opened per node.
  Double-click opens a node one level; its menu closes it. "Open everything
  to" is a preset, not a mode. Matrix and Chord draw the same mix as the Graph.
- **Cut Rule.** A cycle is never only reported. The panel names the edges
  that hold it shut, lightest first, each one selectable as a pair; it counts
  what is caught inside (members, inner edges, lines); and it ranks the
  members by how tangled they are. A pair that points both ways says so, with
  the cost of each direction, because that is a cycle of two.
- **Cycle Marking.** Cycles are marked in the red data hue only. Showing every
  cycle at once is soft: tinted edges, 1.5px rings, loop markers on mutual
  pairs only. Showing one cycle is strong: full edges, a marker on every edge,
  everything else faded. A closed node carries a red count badge for cycles
  folded inside it. Cycle marking never uses the accent.

## Classes view (added 2026-09-18)

- **Lane Rule.** Lanes come from a framework profile, never from Spring alone.
  Lane order is the flow of a request: entry points left, models right. A
  class is drawn inside its lane and cannot leave it; lanes are facts.
- **Other Rule.** The unclassified lane is named with what it also holds
  ("Services & Other", "Beans & Other", "Logic & Other"), never plain "Other"
  when a framework is active.
- **Next Layer Rule.** Show the strongest dozen with the reason ("via X") and a
  relevance bar; fold weak, hub and test classes behind counts. Never a wall
  of chips.
- **Seed Picker.** Starting an exploration is a palette: search, lane and
  component filters, suggested starts, keyboard first, one primary action.

## Groups (revised 2026-09-18)

- **Group Rule.** There is one kind of group. A group is a set of units, and a
  unit is a whole component or a single file; a Java class is its file. Never
  show "component group" or "file group" as types; show what a group holds
  ("3 components · 12 files").
- **Coverage Rule.** A component partly held by a group is drawn as partial:
  a half-filled dot and "K of N files" wherever the group is named next to
  the component. A component listed whole reads "all N files" and follows
  the code as it grows.
- **Nearness Rule.** The next layer favours what stays close to the whole
  explored set: same package first, same component next, one lane along the
  flow after that; a class that fans out to many others loses a little. The
  row says why ("via X · same package").

## Suggestions (added 2026-09-18)

- **Affinity Rule.** Suggestions come from weighted signals the architect
  can see and move, never from an opaque number. Every dashed hull says why
  in real terms ("co-changed 42 times", "share 3 domain types").
- **Cut Rule.** A preset names its cut: vertical (domains, ownership) clusters,
  horizontal (layers) bands. The dimension a suggestion lands in is shown
  before it is accepted.
- **Split Rule.** A component whose files disagree is split rather than
  forced whole; the label counts the splits and the group stores the files.
- **Region Rule.** A suggestion is a region: its members sit together and
  apart from other suggestions, and hovering it lights only its members. A
  list beside the graph shows the same groups member by member.
- **Balance Rule.** One domain is one group: same-named clusters merge,
  giants are cut again, dwarfs fold into a neighbour. Balancing is a toggle,
  on by default.
- **Dials Rule.** The everyday surface is one choice, one field, one slider.
  Every other dial lives behind Fine-tune, and a changed dial can be saved
  as a preset with a plain name.
- **Draft Rule.** Suggestions land in a draft of one dimension, never
  straight into saved groups. The draft is edited in place (rename, move,
  add, lock, reshuffle) and saved in one step; the same surface edits a
  saved dimension. Locked means decided: a reshuffle never moves it.

## Dimensions (added 2026-09-18)

- **Dimension Rule.** A dimension is a record of its own: a name, a cut
  (vertical, horizontal, free), an order and a starting hue. Groups belong
  to one by name; nothing is ever "just a group": a quick group lands in the
  lens dimension, or in "Ad hoc" when nothing exists yet. Two dimensions
  never start on the same colour.
- **Lens Rule.** One dimension is the lens of the workspace. Every view
  colours, legends and rolls up by it unless its own state says otherwise,
  and the sidebar shows which one it is. Saving a dimension makes it the lens.
- **Weigh The Commit, Not The Count.** A shared commit is evidence in
  proportion to how focused it was: full weight for two components, a
  twentieth for twenty, none at all for a sweep. Counting commits flat lets a
  handful of licence headers and renames decide the whole architecture.
- **Do Not Re-measure What The Engine Measured.** Where the snapshot already
  carries PageRank, HITS, betweenness and communities, use them. A hand-rolled
  proxy for a metric sitting in the next table is invention, not judgement.
- **Strongest Here Means Not Stronger Elsewhere.** A candidate is judged
  against every group, not only the open one. Whatever leans harder somewhere
  else says so on its own row and cannot be called strongly related here.
- **Judge The Partition, Not Its Progress.** A cut is measured over the graph
  it actually partitions: an edge with an unplaced end belongs to no partition
  yet, and counting it scores every half-finished dimension as arbitrary, which
  only restates what coverage already says. And a measure that cannot be high
  across two groups says so rather than calling them arbitrary.
- **Say When A Group Is Not A Module.** A group that keeps almost none of its
  own references inside is a name, not a unit, and sorting harder will not
  change that. The surface says so while it is being built, because that is a
  finding about the codebase rather than a failure of the tool.
- **Measure The Cut.** A dimension reports its own quality — modularity, the
  share of references kept inside, the giant group, the singletons — so
  "finished" and "good" stay different words, and so any future change to the
  algorithm can be shown to help rather than asserted to.
- **Adjacency Finds Domains, Equivalence Finds Layers.** What two components
  do to each other tells you they belong to the same part of the business;
  what is done to both of them tells you they do the same job. A controller and
  its service are adjacent and belong to different layers; two controllers in
  different domains never touch and belong to the same one. The way being cut
  by decides which question is asked.
- **Ask For As Long As You Are Worth Listening To.** Suggestion quality decays
  steeply: the first handful for a group are right about half the time, the
  sixteenth to twentieth about one time in twenty. A surface that offers twenty
  is spending attention it has not earned, so the band that invites judgement
  is short whatever the scores say.
- **A Refusal Is Evidence.** Saying no is not only a note to skip something. A
  candidate bound tightly to what was already turned down is wrong for the same
  reason, and the ranking says so.
- **Association, Not Volume.** Coupling is measured as a share, never a count.
  A reference or a co-change is divided by the geometric mean of both ends'
  totals, so what counts is how much of a component's coupling points at this
  group — not how busy it is. Hubs are shaved further, never zeroed.
- **Strong Means Something.** A band is measured against the group's own
  cohesion: "strongly related" means it binds about as hard as the group's
  members already bind to each other. Measuring against the best candidate
  instead would call the top of a weak field strong.
- **One Engine, Two Places.** The guess under Enter and the list inside a group
  are the same score. Two engines would eventually disagree in front of the user.
- **Every Language's Spelling.** Nothing assumes the JVM. Namespaces separate
  on a dot, a slash, a backslash or a double colon, and a file extension names
  a language, not a subject, so it never counts as a shared name.
- **Shared By All Is Evidence Of Nothing.** Proximity is measured in how much
  a shared prefix narrows the codebase down, never in segments counted. Every
  component shares the root, so sharing it proves nothing; a package only two
  of five hundred sit in proves a great deal. The same rule governs name tokens
  and the layer bases.
- **Say It Once, Mark The Exceptions.** When a reason is the same for nearly
  every row, it belongs in the heading, not repeated down the list. Only the row
  that differs earns a word of its own. A column of identical sentences is
  noise wearing the costume of information.
- **One Click, Because Undo Is One Key.** An action that is cheap and reversible
  is taken on the first click, never selected and then committed. Bulk is a
  shift-click run or an "add all", not a checkbox ritual.
- **Quiet The Long Tail.** The band worth reading is open; the rest wait behind
  a count and a heading. Two hundred rows of "loosely related" are a number, not
  a list.
- **A Lap, Not A Pile.** Setting something aside never creates a second place
  to go and finish up. What is set aside comes round again on its own once
  everything else is placed, and the card says which lap it is on. Only a real
  destination — outside this cut — earns a row of its own.
- **Answer Changes The Question.** Every placement re-aims what is asked next:
  the queue leans towards whatever leans towards the group just added to, so a
  domain is finished in a run instead of arriving in pieces.
- **A Group Is A Place, Not A Mode.** Opening a group shows what it is called,
  what is in it and what wants in next, and carries its own rename and delete.
  Growing a group is not a third way to work; it is what a group is.
- **Sort, Do Not Partition.** A dimension is built by answering one question
  at a time about the biggest thing still unsorted, never by auditing a
  finished split. A question is a bundle, so one answer places several things,
  and it carries the engine's guess under one key with every override one key
  away. Three answers exist, not two: a group, later, or not in this cut.
- **Standing Rule.** What the engine placed is proposed and drawn faintly;
  what a person placed is confirmed. The count says how much of a dimension
  was actually vouched for, and a preset run only ever proposes.
- **One Builder Rule.** A dimension is made or changed in one place, the
  builder, which starts from a preset, an empty slate or a copy. No
  suggestion tool lives in a toolbar; no banner repeats the builder's head.
  A shortcut that derives groups (lanes, an explored set) fills a draft or
  the selection tray; it never writes saved groups on its own.
- **Cross-cut Rule.** Two dimensions at once are a table: rows one, columns
  the other, cells the intersections. Uncovered code gets its own last row
  and column rather than vanishing.
- **Delimiter Rule.** The level separator is read off the names, never
  assumed: a dot in Java and Python, a backslash in PHP, a slash in a file
  tree, a double colon in Rust and C++. Prefixes are compared level by level,
  never as text, so `core.orders` is not inside `core.order`.
- **Keep The Shape Rule.** A search never flattens what it found. Matches
  come back in the tree they live in, so a word that recurs across domains
  answers with one takeable branch per domain rather than one long list.
- **Say The Third Way.** Where a surface offers several ways to work, the
  ways are visible at once and named where the work happens, each with a line
  saying what it is for. A mode that has to be known about does not exist.
- **Show Second Place.** When the engine guesses, it shows its runners-up
  with their reasons. One verdict cannot be checked; a ranking can.
- **Hand Over Engine.** Anything the engine can do, a hand can do directly:
  draw a box around nodes on the map, drag one onto a group, take a whole
  branch. A selection carries every answer with it, at the pointer.
- **Way Rule.** A dimension answers one question, and which question it is
  gets chosen before anything is sorted: what part of the business, what job,
  whose, or what moves together. The way is named in the toolbar, and it
  decides three things at once — how the pool is cut into questions, what the
  engine means by close, and which preset a first pass runs. No way is the
  silent default dressed as neutrality.
- **Say What It Goes On.** A way that the snapshot cannot support says so
  before it is picked, and a way that can says what it will use: the framework
  role, the shared word, the distance from the entry points, the hands in the
  history. Never degrade silently to a weaker basis.
- **A Bucket For Everything Is No Answer.** Where several bases could serve,
  the one that divides evenly wins over the one that is merely available, and a
  basis whose groups have names beats one whose groups have only numbers.
  "Controller" is a layer; "6 hops in" is a measurement.
- **State The Box.** Every zoom behaviour declares its own extent. d3 resolves
  the extent inside the transition's tween, and its default reads the svg's own
  width: on an element sized in CSS that throws mid-frame, killing the
  transition silently. Six graphs shared the defect; none of them showed it.
- **Aim Is Not Paint.** What the pointer must hit is never the size of what is
  drawn. Every node carries an invisible target that stays a fingertip wide
  however far the view is zoomed out.
