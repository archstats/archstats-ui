# Frontend layout

The code is organised by what it is about, not by what kind of file it is.
Everything about cycles is in `features/cycles/`, whether it is logic, a
composable, a store or a component.

```
src/
  app.vue, layouts/, pages/, plugins/, assets/, workers/   Nuxt's own folders
  platform/     the runtime seam: Wails bindings, save dialogs, clipboard,
                persisted state, the command registry, the perf stopwatch
  shared/       helpers that know nothing about the product (format, time,
                text, fuzzy, SQL literals) and the UI kit in shared/ui/
  features/     one folder per part of the product
```

## Features

| Feature | What it owns |
| --- | --- |
| `snapshot` | The open snapshot (`data.store`), `useAsyncQuery`, and the engine's vocabulary: metric definitions, derived metrics, file roles, languages, name separators, analysis revisions |
| `workspace` | Workspaces, scans and their order, the scan panel and workspace sheets, config import/export |
| `navigation` | Routes, the view registry, going back |
| `shell` | App chrome: nav bar, view layout, panes, go-to-anything, shortcuts, the native menu, the scope query bar |
| `groups` | Groups, lenses and scope (the first-class slicing concept), the group query language, edges between a lens's groups |
| `rules` | Architecture rules and lens declarations, checked against imports |
| `lens-builder` | Proposing and building a lens: the studio, suggestions, subjects, cut quality, build modules, the lens draft |
| `metrics` | Readings of components and files: health, main sequence, roles, the directory tree, hotspots, the plotter, stat pickers |
| `connections` | Coupling between components, files and groups: the Connections view, neighbours, cross-cuts, file imports |
| `cycles` | Tangles, cut plans and the cycle map |
| `units` | Declared units, the module graph and its boundaries (the Units view) |
| `frameworks` | Framework profiles for every language, and the class facts they read |
| `java` | The Java detail tabs and class wiring |
| `git` | History and people: authors, effort, fix commits, code age, CODEOWNERS, co-change, history windows |
| `trends` | One snapshot against another: Over time, Changes, deltas, comparability |
| `files` | One file at a time: source, code search, open in editor |
| `libraries` | What the code imports from outside itself |
| `export` | Tables and figures leaving the app, with their provenance |
| `reports` | Evidence pins, readings, report notebooks and templates |
| `sql` | The SQL console |
| `overview` | The home view |
| `exhibits` | The exhibit kernel: a definition's schema and facts, the engine that checks, resolves and presents a spec (definitions are registered, never imported), the claim checker, and the drawing primitives |
| `exhibit-catalog` | Every exhibit, registered with the engine; the snapshot an exhibit reads in the app; drawing one to a PNG with nothing on screen |
| `ai` | The AI switch every AI feature obeys, and the model provider settings (keys stay in the Go side and the system keychain) |
| `ask` | Ask: questions about the snapshot answered by a local model through intents, with cited exhibits, the grounding check, threads, and write-ups into reports |

Inside a feature: logic is plain `.ts` next to its test, composables are
`use*.ts`, Pinia stores are `*.store.ts`, and Vue components live in
`components/`. A small feature stays flat; add a subfolder only when a
feature grows a second distinct concern.

## Rules

`src/architecture.test.ts` checks these on every test run:

1. `shared/` and `platform/` never import a feature, a page or a layout.
2. A feature never imports a page or a layout.
3. There is no `utils/`, `stores/`, `composables/` or `components/` folder to
   fall back into. A new file goes in the feature it is about; if it is about
   nothing in the product, it goes in `shared/`.
4. No new pair of features may depend on each other. Five known pairs are
   allowed, each with a reason (below).

And one rule Nuxt enforces for us: **every dependency is an explicit import.**
Auto-imports from our own folders and auto-registered components are off
(`nuxt.config.ts`), so search and any import graph see every use. Vue, Nuxt
and Pinia's own auto-imports still work.

## Known two-way dependencies

- `workspace` with `git`, `groups` and `lens-builder`: selecting a workspace
  loads each feature's per-workspace state (`workspaces.store.select`), and
  those features read the active workspace back. The fix is a
  workspace-selected hook each feature registers with, which changes store
  initialisation order and so was left for its own change.
- `git` with `groups`: `GroupsManager` hosts the workspace config
  import/export, which carries author merges. Splitting the config section
  out of the manager into `workspace` removes it.
- `git` with `metrics`: effort reads file health (`fileHealthSql`) and the
  directory tree reads commit windows. Both are real questions that span the
  two, and the volatility is low.
