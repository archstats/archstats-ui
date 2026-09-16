# Spec: Archstats Desktop

## Objective

Rebuild archstats-ui as a **desktop application** that embeds the archstats analysis engine directly, replacing the "run CLI → export .db → drag into webapp" workflow with an integrated, IDE-like experience.

**Who it's for:** developers and architects who want to explore the architecture of their codebases repeatedly over time, not as a one-off drag-and-drop analysis.

**User stories:**

1. As a user, I can create a **workspace** pointing at a folder on my machine, and give it a name. (One folder per workspace in v1 — archstats core already handles multiple repos living under one folder, so multi-repo analysis works today by pointing at a parent folder.)
2. As a user, I can **scan** a workspace and the result is stored automatically.
3. As a user, I can browse **all the views the webapp has today** (matrix, chord, clustering, hotspots, cycles, plotter, git views, file views, per-component views) against any stored scan.
4. As a user, my workspaces and **full scan history** persist across app restarts; I can select an older scan and see its data.
5. As a user, I can re-scan a workspace at any time and delete scans I no longer need.
6. As a user, I work in an **IDE-like shell**: a sidebar (workspaces, scans, view navigation), tabbed views, and resizable panes — not a single-page wizard.

**Success looks like:** opening the app, pointing it at a source folder, hitting "Scan", and exploring coupling/hotspot/cycle views — then coming back a week later, re-scanning, and flipping between the two snapshots.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | **Wails v2** (Go) | archstats is Go — the engine is imported as a **Go library**, not spawned as a subprocess. No bundled CLI binary. (v3 evaluated in Open Questions.) |
| Analysis engine | `github.com/archstats/archstats` (core + extensions) | Direct package import; scan orchestration lives in the desktop backend. |
| Frontend | **Nuxt 3 in SPA mode** (Vue 3 + TypeScript) | **Revised 2026-08-10 (Ryan's call):** Nuxt is retained — `ssr: false`, hash routing, `srcDir: 'src'`, static output via `nuxt generate` into `frontend/dist` (gated by `NUXT_DIST_OUTPUT` so `nuxt dev` never wipes the embedded dir). File-based routing, layouts (default = has-data shell), global middleware, auto-imports all Nuxt-native. Desktop-specific config: devtools off (webview bridge errors) and `emitRouteChunkError: false` (auto-reload would wipe in-memory state). |
| State | Pinia | Retained. `stores/data.ts` keeps its shape; its query transport changes (see below). |
| Visualization | D3 (+ d3-force), gridjs, splitpanes, Tailwind | All retained as-is. These are the crown jewels being ported. |
| SQLite | `mattn/go-sqlite3` in the Go backend | **Replaces sql.js/WASM + Web Worker.** The frontend sends SQL over Wails bindings; Go executes against the stored scan DB and returns rows. `utils/db.ts`'s `DbWorker` abstraction survives with a Wails-backed implementation. |
| App storage | Registry DB + per-scan snapshot DBs (see Storage Model) | |

### Storage Model

App data lives in the platform config dir (`os.UserConfigDir()` → e.g. `~/Library/Application Support/archstats/` on macOS):

```
archstats/
  app.db                      → registry: workspaces (name + folder path),
                                scans (metadata), app settings
  scans/<workspace-id>/<scan-id>.db
                              → one full archstats SQLite export per scan
                                (same schema the CLI exports today — the existing
                                 .db contract is preserved)
```

- A **scan is immutable** once complete; re-scanning creates a new snapshot.
- Full history is kept; deletion is manual (retention policies are a later feature).
- The per-scan DB schema stays identical to `archstats export sqlite` output, so all existing frontend queries port unchanged.
- One folder per workspace in v1. Multi-repo setups are handled by archstats core itself (point the workspace at a parent folder). If true multi-root workspaces are ever needed, the registry schema (`workspaces.folder_path`) is the only thing that changes.

## Commands

Once the repo is restructured (see Project Structure):

```
Dev:            wails dev                      # hot-reloading desktop app
Build:          wails build                    # production binary (current platform)
Frontend tests: cd frontend && npm test        # vitest
Backend tests:  go test ./...
Frontend lint:  cd frontend && npm run lint
Go checks:      go vet ./...
```

## Project Structure

The archstats-ui repo evolves in place:

```
main.go              → Wails entry point
app/                 → Go backend
  workspace/         → workspace CRUD, registry (app.db)
  scan/              → scan orchestration (invokes archstats engine), snapshot storage
  query/             → SQL query service over scan DBs (frontend's data source)
frontend/            → the Vue app (moved from repo root, de-Nuxtified)
  src/
    pages/           → routed views (ported from Nuxt pages/, now vue-router)
    components/      → visualization widgets + ui primitives (ported as-is)
    stores/          → Pinia (data.ts retargeted at Wails bindings)
    utils/           → pure logic + existing vitest tests (ported as-is)
    shell/           → NEW: IDE chrome — sidebar, tabs, workspace switcher
specs/               → this spec, future specs
tasks/               → plan.md, todo.md (Phase 2/3 artifacts)
```

Removed in the transition: `workers/db.worker.ts` (sql.js worker), `pages/load-data/` (drag-and-drop flow), Nuxt config/middleware/layouts (replaced by vue-router guards and shell components), and the entire webapp deployment surface — `terraform/`, the GitHub Pages / GCS deploy workflows. **app.archstats.io is being retired** (decided 2026-08-10); tearing down the live infrastructure (GCS bucket, load balancer, DNS) is a tracked task in the plan.

## Code Style

Follow the conventions already in both codebases.

**Vue (existing archstats-ui style):**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useDataStore } from "~/stores/data";

const store = useDataStore();
const componentCount = computed(() => store.components.length);
</script>

<template>
  <UiCard>
    <span class="text-sm text-gray-500">{{ componentCount }} components</span>
  </UiCard>
</template>
```

**Go (existing archstats style):** standard gofmt, table-driven tests with testify, errors wrapped with context, zerolog for logging. Bound Wails services are small structs with explicit method receivers — no globals.

Conventions: TypeScript throughout the frontend; Tailwind utility classes over custom CSS; pure logic goes in `utils/` with colocated `.test.ts`; D3 code stays inside dedicated visualization components.

## Testing Strategy

- **Frontend (vitest):** existing `utils/*.test.ts` suites port unchanged and must stay green. New pure logic (scan-history selection, workspace state) gets colocated vitest tests.
- **Backend (go test):** unit tests for workspace registry, scan orchestration, and the query service. One integration test: create workspace → scan a small fixture repo (2 folders) → assert snapshot DB exists and known queries return rows.
- **Manual/e2e:** a documented smoke checklist per milestone (create workspace, scan, open each view family, restart app, verify persistence). Automated desktop e2e is out of scope for v1.
- Coverage expectation: no hard threshold; every bug fix lands with a regression test.

## Boundaries

- **Always:**
  - Run `npm test` (frontend) and `go test ./...` (backend) before committing.
  - Keep the per-scan DB schema compatible with `archstats export sqlite` output (documented in archstats' `DESCRIPTION.md`).
  - Keep `utils/` logic pure and tested.
- **Ask first:**
  - Any change to the **archstats repo** itself.
  - Adding dependencies beyond the stack listed above.
  - Schema changes to the `app.db` registry once it exists.
  - Running `terraform destroy` / touching live GCP infrastructure (the retirement decision is made, but each destructive infra action gets confirmed at execution time).
- **Never:**
  - Commit binaries, `.db` files, or `node_modules`.
  - Delete existing vitest suites to make a port "pass".
  - Store anything outside the designated app-data directory.

## Success Criteria

1. `wails build` produces a runnable app on macOS (primary target; Windows/Linux builds are stretch goals for v1).
2. User can create a workspace pointing at a folder, scan it, and the scan completes — including a folder containing multiple repos.
3. Workspaces and scans **survive an app restart**; selecting a past scan shows that scan's data.
4. **View parity:** every view family from the webapp renders correctly against a stored scan — Walker, Matrix, Chord, Clustering, Hotspots, Cycles, Plotter, Git (coupling/churn/timeline/authors), Files, per-component views (incl. Java views).
5. No sql.js/WASM in the runtime path; all queries served by the Go backend.
6. Scanning a mid-sized repo (~5k files) completes without freezing the UI (scan runs async with progress indication).
7. Existing ported vitest suites pass; new backend tests pass in CI.

## Open Questions

1. **Wails v2 vs v3:** v2 is stable; v3 (alpha at spec time) has a nicer multi-window/bindings model. Verify v3 maturity before committing — default is v2.
2. **Scan comparison/diff views** (leveraging stored history): explicitly **out of scope for v1**, but the storage model must not preclude it — hence immutable snapshots.
3. **Workspace-level config:** which archstats extensions/languages to enable per workspace — v1 ships a sensible default (auto-detect languages) with a config UI later?

## Resolved Decisions

- **2026-08-10 — Nuxt retained (reversal):** the original plan dropped Nuxt for plain Vite + vue-router; after the port was working, Ryan chose to keep Nuxt (SPA mode) for its file-based routing and conventions. The Vite scaffold and hand-written router were replaced by restored Nuxt config; the Go backend, WailsDb data layer, and all page-level fixes carried over unchanged.

- **2026-08-10 — Single-folder workspaces:** archstats core already handles multiple repos under one folder, so v1 workspaces are one folder each. No upstream multi-root work needed.
- **2026-08-10 — app.archstats.io retired:** the webapp deployment (terraform/, Pages/GCS workflows) is removed as part of this project; live infra teardown is confirmed per-action at execution time.
