---
name: cross-repo-feature
description: Builds a feature that spans the Archstats engine (../archstats) and the desktop app (archstats-ui). Use when the app needs a new metric, fact, edge, table or column from the snapshot, or when an engine change moves the snapshot the app reads.
---

# Cross-repo feature: engine first, then the app

The engine writes the snapshot and the app reads it by name. A feature that needs something new crosses that line once, in this order. Never invert it by computing the fact in the app "for now".

## 1. Engine (`../archstats`)

1. Read `../archstats/AGENTS.md`. State the packages you will touch and which invariants move: snapshot schema, analysis revision, boundaries, determinism.
2. Implement the fact in the extension that owns it, with file and line provenance.
3. Scan output changed: bump `core.AnalysisRevision` and say why in `core/revision.go`.
4. Regenerate the goldens and review their diffs:
   - `UPDATE_GOLDEN=1 go test ./e2eTest -run 'TestSnapshotSchema|TestScanDigest'`
   - describe a new table in `DESCRIPTION.md`;
   - add a CHANGELOG line that names "revision N" and the archstats-ui impact.
5. Run `../archstats/scripts/verify-harness.sh` until it passes.

## 2. Wire the local engine in (temporary)

- Preferred: the gitignored `go.work` in archstats-ui, `use ( . ../archstats )`. Plain `go build`, `go test` and `wails dev` then use your engine checkout.
- `scripts/verify-harness.sh` runs with `GOWORK=off` (the pinned engine) unless `ALLOW_LOCAL_REPLACE=1` is set. Use `ALLOW_LOCAL_REPLACE=1 ./scripts/verify-harness.sh` while the engine change is unpublished.
- Only if `go.work` won't do: `go mod edit -replace github.com/archstats/archstats=../archstats`, which also needs `ALLOW_LOCAL_REPLACE=1`. Note it down so you remove it in step 4.

## 3. App (`archstats-ui`)

1. **Go readers.** Read the new table or column where its package already names snapshot columns (`app/AGENTS.md`), and add it to `readsFrom` in `app/contract/contract_test.go`. If `testdata/sample-repo` does not light the new fact up, add the smallest code that does.
2. **Bindings.** A new or changed bound method or struct gets json tags on every field and returns `[]T{}`, not nil. Then run `wails generate module` and keep the regenerated `frontend/wailsjs/`.
3. **Frontend.** Query the new column through the feature's store or module, never from a `.vue` file. Guard it for snapshots from older revisions. `schema.contract.test.ts` checks the name against the fixture.
4. **Changelog.** Add a line under **Unreleased** in `CHANGELOG.md`, written for the person using the app.

Then run `ALLOW_LOCAL_REPLACE=1 ./scripts/verify-harness.sh` until it passes.

## 4. Before the final commit

1. Ask the user to commit, tag (or push) the engine: `../archstats/scripts/release.sh`, or a pushed commit for a pseudo-version.
2. Pin it in the app: `GOWORK=off go get github.com/archstats/archstats@<tag-or-commit> && GOWORK=off go mod tidy`.
3. Remove any `replace` you added. `go.work` may stay: it is gitignored.
4. Run `./scripts/verify-harness.sh` without `ALLOW_LOCAL_REPLACE`. It must pass on the pinned engine, which is what ships.
5. Report both repos' harness results. Commit or push only when the user asks.
