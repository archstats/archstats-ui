# frontend/: the UI

A Nuxt 3 SPA (Vue 3, TypeScript, Pinia, Tailwind on token ramps, D3), served inside Wails. The layout and module rules are in `frontend/src/README.md`. Read it and the root `AGENTS.md` first. `CLAUDE.md` has the dev-server rules, `npm run check` and captures.

## Where state and work live

- **Vue and Pinia hold ephemeral UI state:** selections, open panes, filters, layout, camera and zoom, the scope the user typed. A feature's store is `src/features/<feature>/*.store.ts`. The open snapshot and its query helpers are `frontend/src/features/snapshot/data.store.ts` and `frontend/src/features/snapshot/useAsyncQuery.ts`.
- **Go and the snapshot hold domain facts.** Metrics, edges, units, cycles and git history come from the engine through SQL against the snapshot. Shaping them for a picture (grouping, sorting, picking what to draw) is the frontend's job. Deriving a new architectural fact is not: if a view needs a metric the snapshot doesn't have, stop and follow the root `AGENTS.md` escape hatch.
- Readings that are plain arithmetic over snapshot tables live in one place each: `frontend/src/features/snapshot/derivedMetrics.ts`. Go-side readings are in `app/trends/readings.go`, under the same ids.

## Calling Go

- `wailsjs/` is the generated IPC seam. A component never imports it. It asks a store, composable or module in its feature, or in `src/platform/`, and that `.ts` file calls Go.
  - Pattern: `frontend/src/features/notes/notes.store.ts`, faked in its test with `vi.mock("wailsjs/...")` in `frontend/src/features/notes/notes.store.test.ts`.
  - Snapshot queries go through `frontend/src/platform/db.ts`.
- `src/architecture.test.ts` fails on a new `.vue` file that imports `wailsjs/`. 21 older files are listed there. When you change one, move its call into the feature's `.ts` and delete it from the list.
- Never edit `wailsjs/`: change the Go service and regenerate (root `AGENTS.md`).

## SQL against the snapshot

- Build literals with `sqlLiteral`/`sqlIn`/`sqlLikeLiteral` (`frontend/src/shared/sql.ts`), never string concatenation of user input.
- Use the engine's table and column names as they are. `frontend/src/features/snapshot/schema.contract.test.ts` checks every engine table and `domain__metric` column named in `src/` against a real snapshot from the pinned engine.
  - A new name it rejects is a typo or drift. Fix the read, or change the engine first.
  - Never add the name to its known-absent lists to get through.
  - A CTE is recognised by `name AS (` in the same file.
- Older snapshots lack newer tables. Check `tables.has(...)` or the columns before reading an optional one, as `frontend/src/features/reports/readings.ts` does.

## Checks

- `npm test`: vitest, with the module rules (`src/architecture.test.ts`) and, when `ARCHSTATS_FIXTURE_DB` is set, the snapshot contract.
- `npm run typecheck`: `vue-tsc` against `typecheck-baseline.json`. No file may gain errors. Lower a file's count by fixing it, then record it with `npm run typecheck -- --update`.
- `npm run i18n:check`: no text a person reads left in code (`frontend/src/locales/README.md`).
- All three run in `scripts/verify-harness.sh`.
