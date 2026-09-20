# Archstats Desktop (archstats-ui)

Wails v2 shell around a Nuxt 3 SPA in `frontend/` (hash routing, `srcDir: src/`, Pinia, Tailwind on token ramps, D3). Design contract: `DESIGN.md`, product context: `PRODUCT.md`, current work plan: `tasks/views-plan.md`.

## Dev server (read before touching the frontend)

- The user runs `wails dev` from the repo root. It starts `nuxt dev` on :3000 and proxies it at http://localhost:34115. Do not start, stop, or restart it yourself unless asked.
- **Never run `nuxi build`, `nuxt generate`, or `npm run build|generate` while `wails dev` is running.** It overwrites `.nuxt/dist` and the dev server then serves a stale production manifest. Recovery: `cd frontend && npm run dev:reset`.
- Compile check for the files you changed (fast, no browser):
  ```bash
  cd frontend && npm run check            # all changed/untracked files under src/
  cd frontend && npm run check -- src/pages/index.vue   # specific files
  ```
  It curls each module from the Vite dev server and prints the compiler error on failure. Run it before every capture and before reporting a task done.
- Screenshots of the running app (headless Chrome, real snapshot data, light and dark):
  ```bash
  cd frontend && npm run capture -- --out .impeccable/review/<name>           # 12 primary views, both schemes
  cd frontend && npm run capture -- --out DIR --routes deps=/views/components/<name>/dependencies --scheme dark
  ```
  Options: `--routes name=/hash/path,...`, `--scheme light|dark|both`, `--workspace NAME` (default `eai-3540597-qp-common`, 52 components), `--size WxH`, `--wait MS`. `.impeccable/review/` is gitignored.
- Unit tests: `cd frontend && npm test` (vitest).
- Browser pane: `.claude/launch.json` has `archstats` (attach to the running server) and `wails-dev` (starts it; only if the user asked).

## Product rule

Groups are a first-class concept: they are how the architect or developer cuts their own slices, layers and views of the codebase. Every view that lists or draws components or files must let the user select and create a group from the selection with the same gestures and the same tray (see `tasks/desktop-shell-plan.md` §11). Never introduce a competing grouping concept (clusters, communities) in the UI; at most offer suggestions the user accepts into groups.

## Conventions

- `.ui-*` classes in `src/assets/index.css` are the vocabulary; hairlines are plain `hairline`, `hairline-t/b/l/r`; active-row marker is an inset shadow, not `border-l-2`. Colours come from token ramps, never hex in components. Charts read `chartTheme()`.
- SQL against the snapshot goes through `sqlLiteral`/`sqlIn`/`sqlLikeLiteral` in `src/utils/sql.ts`. `component_connections_indirect.shortest_path_length` counts nodes (hops = length − 1).
- `grep` on this machine is ugrep; use `/usr/bin/grep`. Quote zsh globs.
- No commits or pushes unless asked. Never add AI attribution anywhere.

## Token budget for design and UI work

These are defaults, not suggestions. The user pays per token; a full impeccable cycle over many views cost more than the build itself.

- **One surface per run.** Target a single page or component (`--target`). Do not sweep the whole `pages/` tree; if the task spans views, write a plan file under `tasks/` and run stages in separate sessions.
- **Code is written by the main session (Fable 5.1), never by a subagent.** Subagents run on Sonnet by default (project setting) and are for verification only: screenshots, driving the UI, reading captures, reporting what they see. Spawn impeccable agents with an explicit `model: "sonnet"` too, since their definitions inherit the parent model.
- **No finish reviewer or documenter unless the user asks**, and never per stage. At most one reviewer pass at the end of a feature; give it a short list of files and at most four captures, not the whole build.
- **Verify cheaply.** `npm run check` first, always. Capture only the route you changed, one scheme, `--size 1200x750`, and read the PNG only when the fix needs eyes. Never capture all 12 views to confirm a one-file change.
- **The design detector hook is off here.** Run `impeccable detect --json --target <file>` once per stage instead of on every edit.
- **Read narrowly.** `src/assets/index.css`, `DESIGN.md`, and `tasks/views-plan.md` are large; read a section with `sed -n` rather than the whole file, and do not re-read files already in context after a compaction unless you edit them.
- **Report short.** Agent reports under 200 words, with file paths, not file contents.
