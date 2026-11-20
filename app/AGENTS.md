# app/: the Go host

The Wails side of the app. It reaches the engine in one place, records workspaces and scans in its own registry (`app/store`, SQLite), reads snapshots, and exposes all of it to the frontend as bound services. Read the root `AGENTS.md` first.

## Packages

| Package | Owns | May not |
| --- | --- | --- |
| `app/scan` | Running the engine: `extensionsFor` -> `core.New(...).Analyze()` -> `RenderView` per view -> `sqlite.SaveToDB` (`app/scan/worker.go`), in a child process, one scan per workspace | read snapshots for the UI (`app/query`, `app/changes`, `app/trends`) |
| `app/query`, `app/changes`, `app/trends`, `app/snapshot` | Reading snapshots: the frontend's SQL, Compare, readings, identity | import engine Go types, `app/scan`, or Wails |
| `app/store` | The app's registry: workspaces, scans, notes, reports | |
| `app` | Bound services: thin, guarded wrappers the frontend calls | |

depguard in `.golangci.yml` holds the "may not" column. Engine packages that run analysis (`cmd/`, `extensions/`, `engine`, `core/plugin`) are imported by `app/scan` only.

## Scans

- `extensionsFor` builds fresh extension instances for every scan, with the CLI's defaults, and discovers optional ones from the tree (`app/scan/scan.go`). Never reuse an instance across scans: the git extension caches per-run state.
- Analysis options, extension choice and anything about *what* is measured belong to the engine. If a scan needs a new option, add it to the engine's `plugin` settings first.

## Reading snapshots

- Name tables and columns where the engine names them, and keep them in one place per reader: `changes.MovedMetrics` (`app/changes/changes.go`) and the constants at the top of `app/trends/readings.go` are the pattern. Don't scatter literals through function bodies.
- Every table or column a Go reader names goes in `readsFrom` in `app/contract/contract_test.go`. A reader that degrades quietly when a name is missing is how drift hides. The contract makes it fail loudly on the pinned engine.
- Snapshots from older analysis revisions are real input. Guard optional tables and columns (`hasTable`/`hasColumn` in `app/trends/readings.go`, `hasTable` in `app/snapshot/identity.go`), and say "unknown" rather than guessing (`app/snapshot/identity.go`).
- Open snapshots read-only (`mode=ro`). The registry (`app/store`) is the only database the app writes.

## Bound services (the IPC boundary)

- A bound method starts with `defer safe.Guard("Service.Method", &callErr)` and returns `(T, error)` (`app/services.go`, `app/import.go`). A panic becomes an error the frontend can show, not a dead app.
- Every exported field of a struct that crosses the boundary has a `json:"camelCase"` tag (`SnapshotInfo` in `app/import.go`). `app/ipc_test.go` checks it, all the way down every bound method's arguments and results.
- Return an empty slice, never nil: `[]T{}` or `make([]T, 0)`. A nil slice arrives as `null` and the frontend's `.length` throws. See `FindResult{Files: []FileHits{}}` in `app/query/find.go`.
- A new service goes in `main.go`'s `Bind` list and in `bound` in `app/ipc_test.go`. Then regenerate the bindings (`wails generate module`) and keep the files it writes.

## Tests

- Scans in tests use a fresh git repo with pinned author, dates and config (see `gitEnv` in `app/contract/contract_test.go`).
- `go test ./...` runs everything here. The contract in `app/contract` takes a few seconds and needs `git`.
