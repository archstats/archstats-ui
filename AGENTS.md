# Archstats Desktop (archstats-ui)

The desktop app: a Wails v2 host in Go (`main.go`, `app/`) around a Nuxt 3 SPA in `frontend/` (Vue 3, TypeScript, Pinia, D3). It embeds the Archstats engine (`github.com/archstats/archstats`, sibling checkout `../archstats`) as a Go module, runs scans through it, and explores the SQLite snapshot each scan writes.

Folder guides: `app/AGENTS.md` (Go host) and `frontend/AGENTS.md` (UI). Claude-specific workflow (dev server, captures, token budget): `CLAUDE.md`. Product and design: `PRODUCT.md`, `DESIGN.md`.

## The split: the engine computes, the app shows

- **All analysis lives in the engine repo.** Parsing source, resolving imports and edges, mining git, every metric and its maths, CI/CD and navigation facts: `../archstats`. The app picks the extensions, runs a scan and reads the snapshot. It does not compute architecture.
- **The app owns presentation and the user's own slicing.** Layout, picture policy, groups and lenses, reports, Ask, and readings that are arithmetic over snapshot tables (counts, medians, shares; `app/trends/readings.go`) belong here.
- **The snapshot is the interface.** The app reads it by table and column name (`complexity__lines`, `component_connections_direct`). Those names are the engine's public contract (`../archstats/e2eTest/testdata/snapshot_schema.golden`) and are checked here by the read contract (below).

## Escape hatch: stop before computing a metric here

If a feature needs a new metric, AST fact, edge, resolution rule or snapshot column, **stop**. Do not compute it in TypeScript, in a SQL view over raw snippets, or in Go glue under `app/scan`. Write down the engine change it needs (the table, the columns, what fills them, which revision bump), and do that first in `../archstats`. Then follow `.agents/skills/cross-repo-feature/SKILL.md`. If you are unsure whether something is analysis or presentation, ask.

## Generated files: never edit by hand

- `frontend/wailsjs/**` is generated from the bound Go services. Change the Go method or struct in `app/` (json tags on every field), then run `wails generate module`. `scripts/verify-harness.sh` regenerates the bindings and fails if they were stale.
- `frontend/dist/**` is build output. Never run `nuxi build`/`npm run generate` while `wails dev` runs (`CLAUDE.md`).
- `frontend/typecheck-baseline.json` is written by `npm run typecheck -- --update`.

The agent hook `scripts/agent/before-edit.sh` refuses hand edits to all three.

## go.mod pins the engine; no local replace

- `go.mod` pins a published engine version. That version is what ships and what the harness tests (it runs Go with `GOWORK=off`).
- Cross-repo work builds against `../archstats` through the gitignored `go.work` (`use ( . ../archstats )`), or briefly a `replace` with `ALLOW_LOCAL_REPLACE=1`. A `replace` to a local path is never left in `go.mod` when a task ends: the harness fails on one.
- When the app needs a newer engine: tag or push the engine first, then `go get github.com/archstats/archstats@<version>` here.

## Checks that hold the rules

- `app/contract`: the snapshot read contract. It scans `testdata/sample-repo` with the app's own scan service on the pinned engine, checks every table and column the Go readers name, and runs every snapshot reader the frontend calls.
- `frontend/src/features/snapshot/schema.contract.test.ts`: every engine table and metric column named in frontend source exists in that snapshot, or is a known legacy name. It runs when `ARCHSTATS_FIXTURE_DB` is set, as the harness does.
- `app/ipc_test.go`: every struct crossing the IPC boundary has json tags, and the list of bound services matches `main.go`.
- `.golangci.yml`: depguard boundaries. Engine analysis runs only in `app/scan`; snapshot readers never import engine Go types, `app/scan` or Wails; Wails stays in `main` and package `app`.
- `frontend/src/architecture.test.ts`: the frontend module rules, plus no new `.vue` file that calls `wailsjs/` itself.
- `frontend/scripts/typecheck.mjs`: `vue-tsc` with a per-file ratchet. No file may gain type errors.

## Definition of done

Run `./scripts/verify-harness.sh` and report its result. It runs:
1. the `go.mod` replace check;
2. binding regeneration;
3. the snapshot contract;
4. `go vet` and `go test ./...`;
5. golangci-lint;
6. vitest, the typecheck ratchet and `i18n:check`.

Zero failures, or say plainly which check fails and why. The Claude Stop hook (`scripts/agent/before-stop.sh`) runs it for you when Go or frontend files changed.

Also: a change a user would notice gets a line under **Unreleased** in `CHANGELOG.md`, written for the person using the app. No commits or pushes unless asked. Never add AI attribution anywhere.
