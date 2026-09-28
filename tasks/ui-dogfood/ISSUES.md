# Issue backlog from UI dogfood runs

Every row was checked by a facilitator against the source code or the
snapshot. Harness faults are not listed here; they go in each run's
`facilitator-notes.md`.

- **Severity:**
  - **P0** corrupts what the persona concludes;
  - **P1** blocks an intended workflow;
  - **P2** costs time or trust;
  - **P3** polish.
- **Seen in:** scenario IDs, with run dates.
- **Status:** open, task spawned, fixed (commit), or verified fixed (the run
  that confirmed it).

## Engine

| ID | Sev | Issue | Evidence | Seen in | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | P0 | `.vue` (and `.svelte`) single-file components are not parsed: no component, no import edges. 217 files in archstats-ui. | every `.vue` Imports tab shows 0/0; snapshot `unit_connections` has no `.vue` rows | 06 (2026-09-24 ×3) | task spawned 2026-09-24 |
| E2 | P0 | Framework auto-imports (Nuxt `imports.d.ts` / `components.d.ts`) are not edges. Usage is invisible, and "never imported" is wrong for 17 of 18 stores. | Units never-imported list; About: "no framework packages imported" | 06 | worked around in the UI (workbench S3): imports of unparsed files, auto-imported names and component tags are read from text; engine fix open |
| E3 | P0 | Go imports resolve to same-named local directories: `github.com/wailsapp/wails/v2/pkg/runtime` becomes `frontend/wailsjs/runtime`. A false cross-language edge. | Rules crossings `app/editor.go:13`, `menu.go:10` | 06 | task spawned 2026-09-24 |
| E4 | P1 | Files with a NUL byte in the first 8 KB are silently dropped as binary, even when a language pack claims their extension. | `utils/cycles.ts` and `boundaryFlow.ts` are absent from the snapshot | 06 | task spawned 2026-09-24 |
| E5 | P2 | `.vue` files are not in the file→component index, so group globs over `components/**` match nothing. | group queries | 06 | follows E1 |

## Product (UI)

| ID | Sev | Issue | Evidence | Seen in | Status |
| --- | --- | --- | --- | --- | --- |
| U1 | P0 | File-pattern groups read "0" or "empty" in the Groups manager, the editor counter and the sidebar (they count components only), even though they resolve (`frontend/src/utils/report*` → 6 files). | store: `membersOf` = 6, UI "empty" | 06 | fixed (workbench S5): counters read what the group resolves to |
| U2 | P1 | A new pattern line is pre-filled with `**`, and typing appends to it (`****frontend/…`). | screenshot `qx-pattern.png` | 06 | fixed (workbench S5): a path or glob typed into the seed replaces it |
| U3 | P1 | A saved group resets to "Members" mode, so its query adds nothing until it is switched back to "Query". | s13, s9 | 06 | fixed (workbench S5): a first query saves live; a fixed save freezes the real answer |
| U4 | P1 | The lens "More" menu (Declare dependencies…, Rename, …) is icon-only, missing from the accessibility tree, and closes before an item can be clicked. | s10, s13 | 06 | fixed (workbench S5): teleported, keyboard-usable, visible on the active lens |
| U5 | P1 | Declare dependencies silently places only some groups (3 of 7) and saves without warning. | s10 | 06 | fixed (workbench S5): Declare names the groups left out, with Add all |
| U6 | P1 | Rules says "Nothing crosses the declared order" while Cycles shows a 3-group cycle in the same lens. | s13 | 06 | fixed (workbench S5): cause was groups left out of the layers; Rules and the sidebar now name cycles the declaration does not judge |
| U7 | P1 | The Sandbox cannot create a new component (Merge into a new name gives "Both must be components of this snapshot"). A feature cannot be carved out. | s14 | 06 | fixed (workbench S5): moves and merges into new names |
| U8 | P1 | The Sandbox moves one file at a time (5–6 actions each), with no move from a selection or a search. | s11, s14 | 06 | fixed (workbench S5): move by path, glob or words, as one step; the planner replays a whole plan |
| U9 | P1 | The Sandbox cannot explain a projected tangle. The graph does not redraw for the plan, and clicking a node leaves what-if mode. | s14 | 06 | partly fixed (workbench S5): "Why still tangled" and Light tangles; the graph still does not redraw new components |
| U10 | P2 | The Sandbox "File to move" is a hidden `<datalist>` needing an exact full path. The error ("not in this snapshot's components") gives no format. | `SandboxPlan.vue` | 06 | fixed (workbench S5): live match count, globs and words |
| U11 | P1 | "Depends on" and "Used by" show the same sum of both directions (53 one way and 1 the other both show as 54). | `utils/neighbours.ts` `references` | 06 | open |
| U12 | P2 | No file-level co-change: no "changed together with" on file pages, and no drill-down from a component pair to its files and commits. | s7, s12 | 06 | open |
| U13 | P2 | Cycles "And 9 more" does not expand inline; the full list is only in the matrix cell. | s2, s6, s11 | 06 | open |
| U14 | P2 | Hotspots has no sortable top-N table, and search resets the chosen perspective. | s3 | 06 | open |
| U15 | P2 | Component names are not links in the Metrics table; there is no "Components" entry in the sidebar. | s1 | 06 | open |
| U16 | P2 | The Sandbox's disabled reason is only in a native `title` tooltip ("choose Components and Static"). | round 1 | 06 | open |
| U17 | P2 | The lens builder's "Cut by" looks like a control but is not. A reading that declines to split a component does not say so. | s4, s5 | 06 | open |
| U18 | P2 | Pinned group evidence renders an empty cell in the report. | s4 | 06 | open |
| U19 | P3 | "Who works on it" splits one author into "Ryan Susana" and "Ryan Susana 2". | s4 | 06 | open, check identity merge |
| U20 | P2 | No Pin inside the Sandbox panel; only Export → Add to report works. No pin on a clean Rules result. | s11, s13 | 06 | fixed for the Sandbox (workbench S5) |
| U21 | P1 | `data.openScan` has no guard against overlapping calls: a quick workspace switch mixes two snapshots' data. | harness race, `stores/data.ts` | 06 | task spawned 2026-09-24 |
| U22 | P3 | Search results cannot be grouped by folder. | s12 | 06 | open |
