# How Archstats is meant to be used (product guide)

This is knowledge about the **product**, the kind a user gets from its docs or
a colleague. It says nothing about the codebase under study. Use it to work
the way the app intends, not only to read its tables.

## The intended workflow of an architect

1. **Slice the code with lenses and groups.** Groups are the app's
   first-class concept: they are how you make your own slices (features,
   layers, teams) and look at everything through them. A lens is one way of
   slicing, made of groups.
   - **Build a lens** (sidebar, Lenses) proposes cuts from ten readings.
     "Made of: Components and parts" lets a reading split one component by
     its files. The builder also has a **hand-sort mode**: it asks "Where does
     this belong?" one component (or part) at a time. Keys: `1`–`9` put the
     question into group 1–9, `N` makes a new group, `X` means "not in this
     cut", `Mod+Z` undoes.
   - **Define a group in text** with the group query language, typed into a
     group's definition (Groups manager) or the query bar at the top of every
     view (`Mod+K`; the grey placeholder `**.controller` is only an example):
     ```
     line   := ["!"] source ["where" cond {"and" cond}]
     source := <glob> | "components" | "files" | "contains" <text>
     cond   := <metric> [op number]      (a bare metric means "> 0")
     ```
     Lines union, `!` lines subtract, `where` narrows. A query does not rot:
     rename files and a line that stops matching says so. Example:
     `frontend/src/utils/report*` on one line and `frontend/src/stores/reports*`
     on the next.
   - **Group from a selection** in any view that lists or draws components
     or files: click, `Shift+click` or `Shift+drag` to select, then "Create
     group" in the tray at the bottom (`Mod+G`).
   - **Scope**: the Files switch (All / Production / Tests) and "Scope to it"
     on a group narrow every view to that part of the code.
2. **Declare the intended architecture, then check it.** In the sidebar's
   Lenses section, each lens has a menu with **"Declare dependencies…"** (also
   reachable from Rules). Order the lens's groups as layers, top first: a layer
   may use anything below it. You can also allow or forbid specific pairs. The
   **Rules** view then lists every import that crosses the declaration, with
   file and line. A group's detail page has its own Rules tab.
3. **Look at the slices.** With a lens applied, Connections draws the edges
   between groups, not components. **Cross-cut** (a Connections mode) shows two
   lenses at once, rows by one and columns by the other, e.g. layer × feature.
   Group detail pages show members, coupling, tangles, hottest files and
   history.
4. **Try a restructure before touching code.** Connections at Components level
   with the Static source has a **Sandbox**: move files to another component,
   merge components or cut imports, and see the tangles and coupling that
   result. The Cycles view's guide proposes and checks cuts.
5. **History as evidence.** Connections' source can be Git (co-change); the
   "Without an import" filter shows hidden coupling. Component and file
   detail pages have History tabs.
6. **Keep and share evidence.** Pin buttons keep a finding with its
   provenance. The Evidence view turns pins, readings and templates into a
   report (a notebook) that re-runs on newer snapshots and exports to Markdown.
7. **Getting around.** `Mod+P` is go to anything (files, components, views).
   `?` shows every shortcut. The Search view searches the code's text. Units
   lists declared names (types, functions, modules) and who imports them.
   Libraries lists external imports.

`Mod` is `Meta` in drive.mjs (`key K Meta`).
