# Release Pipeline Assessment — archstats (CLI) + archstats-ui (desktop)

Date: 2026-09-16. Scope: what exists, what's broken, what a verifiable macOS/Windows/Linux pipeline needs, and the options.

## 1. Current state — critical findings

### archstats (CLI) — a release pipeline exists, and it is rotting

`ci.yml` (vet/build/test on ubuntu/windows/macos) is fine. `release.yml` → `build.yml` (triggered on GitHub Release "published") has real defects:

| # | Finding | Impact |
|---|---|---|
| A1 | `build.yml` pins `setup-go` to **1.21**; `go.mod` says `go 1.23.0`; `ci.yml` uses 1.23 | Only works because `GOTOOLCHAIN=auto` silently downloads 1.23 at build time. Drift, slow, unpinned. |
| A2 | `actions/checkout@v3.5.3`, `actions/setup-go@v4.0.1` (Node 16 era) vs `@v4` in ci.yml | Deprecated runtimes; will break or already warn. |
| A3 | linux/arm64 leg installs **both** `gcc-multilib` and `gcc-aarch64-linux-gnu` | These conflict in apt on Ubuntu — that leg very likely fails. |
| A4 | Checksums are **MD5**, one file per artifact | Not a trust signal; should be SHA-256 in a single `checksums.txt`. |
| A5 | Windows/Linux built by **cross-compiling CGO from Ubuntu via mingw** | Works for tree-sitter + sqlite3 in practice, but nothing verifies the produced binaries run. |
| A6 | No smoke test of the packaged binary anywhere | A green release can still ship a binary that crashes on `archstats view`. |
| A7 | macOS CLI binaries unsigned/un-notarized; no universal binary | Browser-downloaded binaries get Gatekeeper-blocked on modern macOS. (`go install` users unaffected.) |
| A8 | Trigger is manual GitHub Release creation; no tag-driven automation, no changelog | Fine, but every release is a hand-assembled artifact set. |
| A9 | **The hardening changes (7 files) are uncommitted**; last tag is `v0.1.5` | The desktop app cannot build in CI until these land in a tagged `v0.1.6`. |

### archstats-ui (desktop) — no pipeline, plus hard blockers

| # | Finding | Impact |
|---|---|---|
| B1 | **PROVEN:** `GOWORK=off go build ./...` fails (`walker.GetAllFiles returns 1 value`) | CI cannot build. Hard ordering dependency: archstats `v0.1.6` must be tagged first, then `go.mod` bumped. `go.work` is a dev-only crutch. |
| B2 | **191 uncommitted changes** — the entire desktop app exists only in a working tree | No pipeline can be verified until this is committed and pushed. |
| B3 | `"generate": "NUXT_DIST_OUTPUT=1 nuxt generate"` uses POSIX env syntax | **Breaks on Windows runners.** Needs `cross-env` (one devDep) since `wails build` invokes this script on every OS. |
| B4 | Stale webapp workflows `nuxtjs.yml` + `terraform.yml` still present | They will run on push to `main` and deploy/destroy the retired site. Must be deleted (T16) before the first push. |
| B5 | vitest: 2 known pre-existing failures (`path.test.ts`, `component.test.ts`) | Any test gate is red until fixed. (Task chip already exists.) |
| B6 | `wails.json` `frontend:install` is `npm install` | Non-reproducible in CI; should be `npm ci` (lockfile is restored). |
| B7 | No version stamping in the desktop app | Builds are indistinguishable; needs `-ldflags "-X main.version=..."` from the git tag + `wails.json` `info.productVersion`. |
| B8 | Go `1.25.4` in `go.mod` (from the dev machine) | Fine, but CI must use `go-version-file: go.mod`, not a hardcoded version. |

What is already right: `os.UserConfigDir()` is cross-platform (AppData / XDG / Application Support); the `frontend/dist/.gitkeep` trick keeps `go test` working on a fresh clone before any frontend build; the engine's e2e Go tests (`app/scan`, `app/query`) exercise the CGO path and can run natively on all three OSes.

## 2. Platform requirements (non-negotiable facts)

**Wails apps cannot be meaningfully cross-compiled.** Linux needs native webkit2gtk headers, macOS needs Xcode, Windows-from-elsewhere needs a mingw CGO toolchain and produces unverifiable output. → **One native runner per OS.**

| Platform | Runner | Toolchain | Build | Package | Signing |
|---|---|---|---|---|---|
| macOS | `macos-14`/`15` (arm64) | Xcode CLT (preinstalled) | `wails build -platform darwin/universal -clean` | `.dmg` (hdiutil/create-dmg) or notarized `.zip` | Developer ID Application cert + `xcrun notarytool` + `stapler`. Requires Apple Developer Program ($99/yr). |
| Windows | `windows-latest` | MinGW-w64 gcc (preinstalled on GH runners), `choco install nsis` | `wails build -platform windows/amd64 -nsis` | NSIS installer `.exe` + portable `.exe` | Optional. Without it SmartScreen warns. Cheapest real option: Azure Trusted Signing (~$10/mo); or an OV/EV cert. |
| Linux | `ubuntu-22.04` (webkit2gtk-4.0) **or** `ubuntu-latest` + `-tags webkit2_41` | `apt: libgtk-3-dev libwebkit2gtk-4.0-dev` (or `-4.1-dev`) | `wails build -platform linux/amd64` (+ `ubuntu-24.04-arm` for arm64) | `tar.gz` minimum; `.deb`/`.rpm` via **nfpm**; AppImage optional | None needed. |
| Frontend (all) | — | Node 20/22, `npm ci` | runs inside `wails build` via `frontend:build` | — | — |

WebView2 on Windows: `wails.json` default (`"webview2": "download"`) prompts users on the rare machine without the runtime — acceptable; `"embed"` adds ~150MB if you want zero-prompt.

## 3. Options

### Option A — Hand-rolled GitHub Actions matrix (recommended)
Three native build jobs + one release job, mirroring the pattern the CLI repo already uses (but done right). Full control, no third-party build logic, easiest to debug and to extend with smoke tests and signing.

### Option B — `dAppServer/wails-build-action`
Community action that wraps exactly this (incl. macOS sign/notarize hooks and NSIS). Fastest start; costs: a third-party dependency owning your build logic, opaque failures, its own Wails/Go/Node pinning conventions. Reasonable if you want a working pipeline this afternoon and accept the trade.

### Option C — goreleaser
Superb for the **CLI repo**: one config yields cross-compiles, SHA-256 checksums, changelog, GitHub Release, Homebrew tap, Scoop, deb/rpm. Two honest caveats: (1) **not applicable to the Wails GUI** (no native toolkits); (2) CGO is goreleaser's weak spot — multi-OS CGO builds need the same mingw/cross-gcc setup you have today, or its per-OS split/merge mode which is a Pro feature. Verdict: worth adopting for archstats *later* for the distribution niceties (brew/scoop); not a prerequisite.

**Recommendation:** A for the desktop app; fix-in-place (A) for the CLI now, goreleaser as a later upgrade.

## 4. Verification design (the part you asked for)

The pipeline is only "verifiable" if every stage produces something you can inspect before it reaches users:

1. **On every PR / push:** build on all three OSes, run `go test ./...` natively on each (this is what actually exercises tree-sitter + sqlite CGO on Windows/Linux — the real risk), run `npm test`, upload **unsigned** artifacts. You download and run them on a real Mac; Windows/Linux via VM or a friend — or trust the native test pass.
2. **CLI smoke test in CI:** after building `archstats`, run it against `e2eTest/repo` on each OS (`archstats view files -f ...` and `export sqlite`). Cheap, catches "binary links but crashes".
3. **Desktop smoke test:** GUI can't run headless. Linux can `xvfb-run` the binary for a few seconds to prove it starts (optional). Otherwise the native `go test` of scan+query is the substantive check.
4. **Release = tag push `v*` → build signed artifacts → create a DRAFT GitHub Release** with `checksums.txt`. You inspect/download/run, then click Publish. The draft is the human gate.
5. **Version stamping:** derive from the tag; inject via ldflags; show it in the app (About/title) and `archstats --version`, so a downloaded artifact self-identifies.
6. **Reproducibility:** `npm ci`, `go-version-file`, pinned action majors, cached Go/npm.

## 5. Sequencing (dependency-ordered)

1. **archstats:** fix `build.yml` (A1–A4, add CLI smoke test A6), commit the hardening, push, cut **`v0.1.6`** via the fixed workflow — verify all 7 artifacts appear and the smoke test passes.
2. **archstats-ui:** delete `nuxtjs.yml`/`terraform.yml` (+ `terraform destroy` — confirmed per action), bump `go.mod` to `v0.1.6` (drop `go.work` reliance), add `cross-env`, switch to `npm ci`, fix the 2 vitest tests, commit the whole desktop app, push.
3. Add **CI workflow** (3-OS build + native tests + unsigned artifacts). Verify green on a PR.
4. Add **release workflow** (tag → draft release, unsigned). Cut `v0.1.0` of the desktop app, verify on a Mac.
5. Add **macOS signing + notarization** (needs your Apple Developer cert + App Store Connect API key as repo secrets). Re-cut, verify Gatekeeper opens it cleanly.
6. Optional: Windows signing, nfpm deb/rpm, AppImage, goreleaser for the CLI, Homebrew tap.

## 6. Decisions (2026-09-16, Ryan)

- **Apple Developer Program:** not yet — will get one. → Pipeline ships **unsigned macOS builds first**; Developer ID signing + notarization is a follow-up step once the account exists (secrets: `.p12` cert + password, App Store Connect API key).
- **Windows signing:** **skip for v0.1.** Unsigned NSIS installer + portable `.exe`; SmartScreen warning accepted for now.
- **Linux formats:** **tar.gz + .deb/.rpm via nfpm.**
- **Repo visibility:** both repos are **public** (verified via `gh`) → Actions minutes free, macOS runners included.
- **Versioning:** desktop app gets its own `v0.x` tag line in archstats-ui, independent of the CLI's tags. (Proposed; not yet confirmed.)
- **Infra teardown timing:** still open — the GCS bucket + load balancer for app.archstats.io exist and cost money until `terraform destroy` runs (confirmed per action).
- **Status:** Ryan reviewing this doc before step 1 (archstats `build.yml` fix + `v0.1.6`) begins.
