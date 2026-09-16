# Implementation Plan: Archstats Desktop

Spec: [`specs/desktop-app.md`](../specs/desktop-app.md)

## Overview

Evolve archstats-ui into a Wails v2 desktop app. The archstats engine is imported as a Go library (no subprocess); the Vue frontend is ported off Nuxt onto Vite + vue-router; the sql.js WASM worker is replaced by a Go query service over stored scan snapshots. Workspaces (one folder each) and full scan history persist in an app-data registry.

## Key findings from reconnaissance (drives ordering)

**Engine seam (archstats repo):** the library call path is clean and cobra-free —
`core.New(&core.Config{RootPath: absPath, Extensions: exts}).Analyze()` → `results.RenderView(name)` for each of `results.GetViewFactories()` → `sqlite.SaveToDB(&sqlite.SqlOptions{...}, results, views)` (`cmd/export/sqlite/sqlite.go:158`).

But four hazards must be handled before embedding in a long-lived process:

1. **`log.Fatal` in `core/walker/walker.go:105,135`** — an unreadable subdirectory calls `os.Exit(1)` and kills the whole desktop app. Must become error returns. *(upstream fix)*
2. **`panic` in `extensions/treesitter/common/language_pack.go:127`** — raised on a walker goroutine, so `recover()` in the caller can't catch it. *(upstream fix)*
3. **No `context.Context` / cancellation anywhere** — v1 accepts non-cancellable scans (run async, disable re-scan while running). No progress callbacks exist either; v1 progress = coarse phases + file count pre-computed via exported `walker.GetAllFiles(root)`.
4. **Git/declbased extension config is cobra-only** (concrete types unexported) — v1 uses the exported defaults (`git.Extension()`, `declbased.Extension()`, etc.), which match CLI default behavior.

Extension **auto-detection is reusable without cobra**: the `DiscoveryTrigger` funcs on `common.Optional()` take a `config.DiscoveryContext{RootDir, Files}` we can construct ourselves.

**CGO is mandatory** (tree-sitter grammars + `mattn/go-sqlite3`) — fine for per-platform Wails builds; macOS is the primary target.

**Frontend seam (this repo):** the entire app consumes data through one choke point — `stores/data.ts` `query(sql): Promise<T[]>`, backed by a `DbWorker` class (`init`, `query`, `terminate`). Swap `DbWorker` for a Wails-backed implementation and almost nothing above it changes. Critical constraint (documented at `stores/data.ts:14-17`): the db handle must stay **outside** Pinia reactive state or `watchEffect` loops infinitely. `hasData` (referenced in 48 files) remains the reactivity trigger.

**Nuxt coupling is shallow:** no server routes, no runtimeConfig, no useFetch/useAsyncData; auto-imports barely used (2 implicit components, 1 implicit composable, ~29 files relying on auto-imported vue APIs); 48 pages → vue-router routes (4 nested-parent pages, one catch-all `[...name]` carrying slashed file paths); 1 middleware → router guard; 1 layout → wrapper component; 56 `<NuxtLink>` uses; 30 `definePageMeta`/`useSeoMeta` sites (SEO meta is deletable in a desktop app). SSR was effectively broken already (`matrix.vue:116` reads `window` in setup) — dropping it removes constraints.

**Known landmines:** Tailwind `content` globs currently match nothing (Nuxt module papered over it); `tsconfig` must be written from scratch (`~/*` alias is pervasive); `middleware/redirect-if-no-data.ts` calls `useDataStore()` at module scope (don't copy into the guard); catch-all route params become arrays under vue-router's repeatable syntax; groups-store persistence is dead code (`initForProject` never called) — wiring it to workspace ids is part of this project; TS 4.9 must bump to 5.x for Vite/Vue 3.5 tooling.

## Architecture Decisions

- **Wails v2** (stable). v3 re-evaluated only if v2 blocks us.
- **Engine consumed as a Go module.** During development, a `go.work` (or `replace` directive) points at the sibling `../archstats` checkout; release/CI builds require the upstream fixes merged and a tagged/pseudo-versioned `github.com/archstats/archstats`. The `replace` never ships in a release build.
- **Upstream changes to archstats are minimal and general-purpose:** error returns instead of `log.Fatal`/goroutine panics. No desktop-specific code lands upstream. (Per spec boundary: archstats changes are ask-first — approval requested at the plan gate.)
- **Query transport:** frontend keeps sending raw SQL strings; Go executes against the selected scan snapshot (read-only) and returns JSON rows. Preserves all 18 tables/queries plus `sqlite_master`/`PRAGMA_TABLE_INFO` introspection for free (it's real SQLite now). Acceptable because the DB is local, user-owned, and opened read-only.
- **`DbWorker` API preserved:** a `WailsDb` class implements the same `query`/`terminate` surface; `init(bytes)` becomes `open(scanId)`. `stores/data.ts` gains `openScan(scanId)` replacing `setViews(bytes)`.
- **Auto-imports replaced by tooling, not hand-edits:** `unplugin-auto-import` (vue APIs) + `unplugin-vue-components` keep the 29 implicit-import files working with minimal diff.
- **Scan lifecycle:** scan runs in a goroutine; Wails events (`scan:started`, `scan:phase`, `scan:done`, `scan:failed`) drive the UI; a scan row in `app.db` has status `running|complete|failed`. Snapshots are immutable; failed scans keep no snapshot.

## Task List

### Phase 0 — De-risk spike (highest-risk first)

- [ ] **Task 1: Wails skeleton + engine embed proof** (M)
  Scaffold Wails v2 in this repo (`main.go`, `wails.json`, throwaway `frontend/` placeholder) with `go.work` pointing at `../archstats`. A bound `SpikeService.AnalyzeToDb(dir, out string)` runs the full library path (analyze → render views → `SaveToDB`) on a small fixture.
  **Acceptance:** `wails build` produces a runnable macOS app; clicking a button produces a `.db` that `sqlite3` can query (`components`, `files` tables exist).
  **Verify:** manual run + `sqlite3 <out.db> '.tables'`.
  **Depends:** none. **Files:** new `main.go`, `wails.json`, `app/spike.go`, `go.mod`, `go.work`, placeholder frontend.

### Checkpoint 0
- [ ] CGO + tree-sitter + sqlite build under Wails confirmed on macOS. If this fails, the architecture decision gets revisited **before** any porting work.

### Phase 1 — Engine hardening (archstats repo — pre-approved at plan gate)

- [ ] **Task 2: Error returns instead of process-killers** (M, in `../archstats`)
  `core/walker/walker.go:105,135` `log.Fatal` → propagated errors; `core/walker/ignore_file.go:46` panic → error; `language_pack.go:127` goroutine panic → recovered and surfaced as a file-level error. `Analyze()` returns partial results + error where sensible.
  **Acceptance:** analysis of a tree containing an unreadable dir returns an error, process survives.
  **Verify:** new walker tests with an unreadable fixture dir; `go test ./...` green; existing e2e tests green.
  **Depends:** none (parallel with Task 1).

### Phase 2 — Backend foundation (Go, this repo)

- [ ] **Task 3: Registry (`app.db`) + workspace service** (M)
  Schema: `workspaces(id, name, folder_path, created_at)`, `scans(id, workspace_id, status, started_at, finished_at, error, snapshot_path)`. CRUD service bound to Wails. Storage rooted at `os.UserConfigDir()/archstats/`.
  **Verify:** `go test ./app/workspace/...` — create/list/delete round-trip against a temp dir.

- [ ] **Task 4: Scan service** (M)
  Orchestrates: build `DiscoveryContext` from `walker.GetAllFiles` → evaluate triggers → construct **fresh** extensions per run (git extension caches state; never reuse) → `Analyze()` in a goroutine → `SaveToDB` to `scans/<ws-id>/<scan-id>.db` → update scan row → emit Wails events. Re-scan disabled while a scan runs (no cancellation in v1).
  **Verify:** integration test — scan a 2-repo fixture folder; snapshot exists, known queries return rows, scan row is `complete`; a failing scan yields status `failed` and no snapshot.
  **Depends:** 1, 2, 3.

- [ ] **Task 5: Query service** (S)
  `Query(scanId, sql) → []map[string]any` (JSON-safe), snapshot opened read-only (`mode=ro`), one open handle per selected scan with explicit close on switch.
  **Verify:** unit tests incl. `sqlite_master` + `PRAGMA_TABLE_INFO` passthrough and error propagation for bad SQL.
  **Depends:** 3 (+ a fixture snapshot from 4).

### Checkpoint A
- [ ] `go test ./...` green; from a REPL-style dev build: create workspace → scan → query rows end-to-end, app restart shows persisted registry.

### Phase 3 — Frontend port (Vite + vue-router)

- [ ] **Task 6: Vite scaffold + toolchain** (M)
  Move Vue app to `frontend/`; `vite.config.ts` (vue plugin, `~` alias, unplugin-auto-import/components), fresh `tsconfig.json` (TS 5.x), Tailwind wired natively (fix `content` globs, import `assets/index.css` in `main.ts`), `vitest.config.ts` + **add `test` script**; drop `@nuxt/image`, gtag plugin, SSR remnants (`process.client` guards, `<ClientOnly>`).
  **Acceptance:** `npm run dev` boots a blank-shell app under `wails dev`; existing 3 vitest suites pass.
  **Verify:** `npm test`, `npm run build`.
  **Depends:** 1.

- [ ] **Task 7: Data layer swap** (S)
  `utils/db.ts`: `WailsDb` with `open(scanId)`, `query(sql)`, `terminate()` calling Wails bindings. `stores/data.ts`: `setViews(bytes)` → `openScan(scanId)`; `_dbInstance` stays module-scoped/non-reactive; `_initializeState()` and all 17 getters untouched.
  **Verify:** vitest for the store against a mocked binding; manual — `hasData` flips true after `openScan`.
  **Depends:** 5, 6.

- [ ] **Task 8: Routing + page migration** (L — mechanical but wide)
  Route table for all 48 pages: nested children under the 4 parent pages (`<NuxtPage>` → `<router-view>`), catch-all as `/views/files/:name(.*)` (non-repeatable — params stay strings; audit every `route.params.name` consumer), `definePageMeta` → route `meta`, middleware → `router.beforeEach` (store instantiated *inside* the guard), layout → wrapper component, `NuxtLink` → `RouterLink` (56 sites, mechanical), `navigateTo` → `router.push`, `#imports` (6 files) → explicit imports, delete `useSeoMeta` sites, fix the 2 implicit component usages + 1 implicit composable, port the 3 plugins (`click-outside`, `emitter`) to `app.use`/`app.directive`.
  **Acceptance:** every route renders without console errors against a real scan.
  **Verify:** `npm run build` clean; scripted route-visit smoke (dev) + manual spot checks.
  **Depends:** 6, 7.

### Checkpoint B
- [ ] `wails dev`: create workspace → scan → browse Matrix, Chord, Clustering, Hotspots, Cycles, Plotter, Git views, Files views with real data. This is the parity heart-check.

### Phase 4 — IDE shell & workspace UX (vertical slices)

- [ ] **Task 9: Workspace sidebar + creation flow** (M)
  New `frontend/src/shell/`: sidebar listing workspaces; "New workspace" uses Wails' native directory dialog; replaces `pages/load-data/` as the entry experience; empty-state screen.
  **Verify:** manual — create, switch, delete workspace; state survives restart.
  **Depends:** 3, 8.

- [ ] **Task 10: Scan flow UI** (M)
  Scan button + progress (phase events + file count), scan-history list per workspace, selecting a scan calls `openScan`, delete scan (with confirm). Active scan indicator; re-scan disabled while running.
  **Verify:** manual — two scans of the same workspace, flip between them, delete one.
  **Depends:** 4, 9.

- ~~**Task 11: Tabs + panes shell**~~ — **DEFERRED to v2** (decided 2026-08-10). V1 ships sidebar + single view area; window title = workspace name folds into Task 9.

- [ ] **Task 12: Groups persistence wired to workspaces** (S)
  Call the currently-dead `groups.initForProject(workspaceId)` on workspace open; groups now actually persist per workspace (localStorage in the WebView is fine for v1).
  **Verify:** vitest for keying; manual — groups survive restart, don't bleed across workspaces.
  **Depends:** 9.

### Phase 5 — Hardening, cleanup, retirement

- [ ] **Task 13: View parity QA sweep** (M)
  Walk the spec's parity list view-by-view against a real mid-sized scan; log defects, fix S-sized ones inline. Extra attention to the four giant D3 files (`group-coupling.vue`, `spring.vue`, `ClusteringDiagram.vue`, `ChordDiagram.vue`).
  **Verify:** completed checklist appended to this plan.

- [ ] **Task 14: Dependency & dead-code purge** (S)
  Remove sql.js + `public/sql-wasm.wasm` + `workers/`, `pages/load-data/`, redaxios, google-charts, duplicate lucide packages (keep `lucide-vue-next` if used), dead `composables/useAsyncQuery.ts` (or adopt it in Task 8 — decide there).
  **Verify:** `npm run build` + full manual smoke still green.

- [ ] **Task 15: CI + packaging** (M)
  GitHub Actions: `go test`, `npm test`, `wails build` (macOS). Replaces the Pages/GCS deploy workflows. Windows/Linux builds = stretch.
  **Verify:** green pipeline on a PR.

- [ ] **Task 16: Retire app.archstats.io** (S)
  Delete `terraform/`, `.github/workflows/nuxtjs.yml`, `url.yaml`, `dist` symlink from the repo. Live infra teardown (`terraform destroy`, DNS) executed separately with per-action confirmation, per spec boundary.
  **Verify:** repo contains no deploy surface; infra teardown checklist confirmed by human.

### Checkpoint: Complete
- [ ] All spec Success Criteria (1–7) pass; demo: fresh machine profile → create workspace → scan → explore → restart → history intact.

## Dependency graph

```
T1 (Wails+engine spike) ──┬──────────────► T6 (Vite scaffold) ──► T8 (routing) ──► T9 ──► T10, T11, T12
T2 (engine hardening) ────┤                      ▲                                   │
T3 (registry) ──► T4 (scan svc) ──► T5 (query) ──┘ (T7 data swap between 5→8)        ▼
                                                                        T13 ► T14 ► T15 ► T16
```
T1 ∥ T2 ∥ T3 can run in parallel. T16 is independent after the decision and can happen any time.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| CGO under Wails fails to build (tree-sitter + sqlite) | High | Task 1 is the very first thing; architecture revisited if it fails |
| Walker `log.Fatal`/panics kill the app | High | Task 2 upstream fix, before any real scans ship |
| Scans not cancellable (no context support) | Med | v1: async + disable re-scan; upstream context support deferred to v2 |
| Regressions hidden in 1000+-line D3 views | Med | Port untouched; dedicated parity sweep (T13) |
| Catch-all file routes break param handling | Med | Non-repeatable `(.*)` syntax + audit of consumers in T8 |
| Release build depends on unmerged archstats fixes | Med | `go.work` for dev only; T2 merged upstream before T15 tags a release |
| Whole file corpus held in memory during scan | Low | Accept for v1 (mid-size repos per spec SC-6); document limit |

## Plan-gate decisions (2026-08-10, approved by Ryan)

1. **Upstream archstats changes approved** — Task 2 (error returns replacing `log.Fatal`/goroutine panics) lands on archstats main before any desktop release.
2. **Dev-time module wiring: `go.work`** referencing `../archstats`, not committed (added to `.gitignore`). CI/release builds use the published module version.
3. **Task 11 (tabs/panes) deferred to v2** — v1 is sidebar + single view area.
