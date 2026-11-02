# Archstats Desktop

A desktop app for macOS, Windows and Linux that shows a codebase's architecture: its components and modules, the dependencies and cycles between them, how they changed in git, how healthy they are, and how the workspace is built and shipped. Add a folder or clone a repository, and the app scans it with the [Archstats engine](https://github.com/archstats/archstats) and draws the snapshot. Your code stays on your machine.

- **Download:** [latest release](https://github.com/archstats/archstats-ui/releases/latest). The builds are not signed yet; [Install](https://archstats.github.io/archstats/install/) says how to open them the first time.
- **Guide:** [Getting started](https://archstats.github.io/archstats/desktop/), also under Help → Archstats Documentation in the app.
- **What changed:** [CHANGELOG.md](CHANGELOG.md), also under Help → What's New.
- **Bugs:** [issues](https://github.com/archstats/archstats-ui/issues). Settings → About → Show the log opens the log to attach.

## Build from source

You need Go (the version in [go.mod](go.mod)), Node 22, the [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation) (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0`), and on Linux `libgtk-3-dev` and `libwebkit2gtk-4.1-dev`.

```shell
wails build                       # macOS and Windows
wails build -tags webkit2_41      # Linux
```

`wails build` writes the app to build/bin. `archstats-desktop --selfcheck` scans a generated fixture through the embedded engine and exits non-zero when anything fails.

## Develop

```shell
wails dev
```

This runs the Nuxt dev server on :3000 behind the Wails window, with hot reload. [CLAUDE.md](CLAUDE.md) has the rules for working on the frontend while it runs, [DESCRIPTION.md](DESCRIPTION.md) maps the code, [frontend/src/README.md](frontend/src/README.md) lists the features, [DESIGN.md](DESIGN.md) is the design contract and [PRODUCT.md](PRODUCT.md) the product context.

Tests:

```shell
go test ./...                                    # the Go side
cd frontend && npm test && npm run i18n:check    # the frontend and its messages
```

A local `go.work` that points at a checkout of the engine lets you work on both at once. CI builds without it, against the engine version in `go.mod`.

## Release

1. Under **Unreleased** in [CHANGELOG.md](CHANGELOG.md), write what a user would notice as changes land. The app shows these notes after an update, so write them for the person using it.
2. Release the engine first if the app needs a newer one, then pin it: `scripts/release.sh vX.Y.Z --engine vA.B.C`. That commits the pin; push it and wait for CI.
3. With main pushed and green, run `scripts/release.sh vX.Y.Z`. It refuses an engine pinned by commit, moves the notes under the version with the engine and its analysis revision, commits, and makes a signed tag. `--push` pushes them.
4. The tag builds every platform, installs and self-checks each package on its own OS, and opens a draft release with those notes. Download one, check it, and publish the draft. Once it is published, running copies of the app offer it as an update.

The pipeline and its open items (signing) are described in [tasks/release-pipeline.md](tasks/release-pipeline.md).
