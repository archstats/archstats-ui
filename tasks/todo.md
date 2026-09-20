# Archstats Desktop — Task Checklist

> **Revision 2026-08-10:** Nuxt retained by Ryan's decision (see spec Resolved Decisions). T6/T8's Vite/router artifacts were replaced by restored Nuxt SPA config (`ssr:false`, hashMode, srcDir src/, generate→dist gated by NUXT_DIST_OUTPUT, devtools off, emitRouteChunkError off, default layout + global middleware). Everything else (Go backend, WailsDb layer, async-query fixes) unchanged. Full chain re-verified: npm test 20/22 (2 known pre-existing), nuxt generate, wails build, live smoke incl. previously-broken views (churn/timeline/plotter/walker/treemap/authors).

Plan: [`tasks/plan.md`](plan.md) · Spec: [`specs/desktop-app.md`](../specs/desktop-app.md)

## Phase 0 — De-risk spike
- [x] T1: Wails v2 skeleton + engine embed proof (analyze fixture → .db from a bound method; `wails build` works on macOS) ✅ 2026-08-10
- [x] Checkpoint 0: CGO/tree-sitter/sqlite confirmed under Wails ✅ built in 24s, .db verified with sqlite3 CLI

## Phase 1 — Engine hardening (../archstats)
- [x] T2: walker `log.Fatal` → errors; ignore-file + tree-sitter goroutine panics → recovered errors; tests with unreadable-dir fixture ✅ 2026-08-10 (uncommitted in ../archstats, pending Ryan's commit)

## Phase 2 — Backend foundation
- [x] T3: `app.db` registry + workspace CRUD service (+ tests) ✅ 2026-08-10 — `app/store/` + Wails-bound `WorkspaceService`, 6 tests green
- [x] T4: scan service — auto-detect extensions, fresh extensions per run, async scan, snapshot to `scans/<ws>/<scan>.db`, Wails events (+ integration test) ✅ 2026-08-10
- [x] T5: query service — read-only SQL over selected snapshot (+ tests incl. PRAGMA/sqlite_master) ✅ 2026-08-10
- [x] Checkpoint A: create → scan → query e2e; registry survives restart; `go test ./...` green ✅ 2026-08-10 — TestScanEndToEnd covers the full chain; all services Wails-bound; app builds

## Phase 3 — Frontend port
- [x] T6: move to `frontend/`, Vite + TS5 + Tailwind + unplugin auto-imports + vitest script ✅ 2026-08-10 — note: 2 of 17 vitest cases were already failing pre-port (verified against old tree; spun off as separate task); baseline 15/17 preserved. Dropped dead vue2-only lucide/lucide-vue packages.
- [x] T7: `WailsDb` replaces `DbWorker`; `openScan(scanId)` replaces `setViews(bytes)`; db handle stays non-reactive ✅ 2026-08-10 — 5 store tests w/ mocked bindings
- [x] T8: vue-router table for 48 pages (nested + catch-all `:name(.*)`), guard replaces middleware, layout wrapper, NuxtLink→RouterLink, definePageMeta/useSeoMeta removal, plugins ported ✅ 2026-08-10 — done by hand after 2 agent stalls; includes interim `/open` scan-picker page; hasData now derives from reactive `_openScanId` (module-scoped handle was fragile under dev HMR)
- [x] Checkpoint B: core flow verified live under `wails dev` ✅ 2026-08-10 — create workspace → scan → open snapshot → dashboard/files table/file detail(+contents)/chord/clustering/cycles/hotspots/authors all render real data. KNOWN pre-existing breakage (revamp-era async-query-in-computed): churn, timeline, plotter, walker, treemap, git author pages, several [name]/java pages — sweep running as part of T13

## Phase 4 — IDE shell & workspace UX
- [x] T9: workspace sidebar + native folder picker + empty state (replaces load-data page) ✅ 2026-09-17 — switcher popover, `SelectFolder` binding, teaching first-run panel; interim `/open` page removed
- [x] T10: scan button + progress events + scan history + snapshot switching + delete scan ✅ 2026-09-17 — in-place progress readout, auto-open rule, inline confirms, interrupted scans marked failed at startup
- ~~T11: tabs + splitpanes shell~~ — deferred to v2 (plan-gate decision 2026-08-10)
- [x] T12: wire `groups.initForProject(workspaceId)` — groups persist per workspace ✅ 2026-09-17 — called from `workspaces.select()`

## Phase 5 — Hardening, cleanup, retirement
- [ ] T13: view-by-view parity QA sweep (checklist appended to plan)
- [ ] T14: purge sql.js/worker/load-data/redaxios/google-charts/dup lucide/dead composable
- [x] T15: CI + release pipeline ✅ 2026-09-16 — CI on ubuntu/windows/macos with `--selfcheck`; tag-driven release with per-package verification on every OS; draft `v0.1.0` produced (11 assets). Unsigned until Apple account exists. See tasks/release-pipeline.md
- [ ] T16: retire app.archstats.io — remove terraform/ + deploy workflows; live infra teardown confirmed per-action
- [ ] Checkpoint Complete: all spec success criteria 1–7 pass
