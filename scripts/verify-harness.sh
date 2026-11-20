#!/usr/bin/env bash
# The definition of done for a change to archstats-ui (AGENTS.md). Runs, in
# order, stopping at the first failure:
#
#   1. go.mod: no replace directive to a local path (../archstats). Go runs
#      with GOWORK=off, so everything below builds against the engine version
#      go.mod pins, which is what ships;
#   2. the Wails bindings: regenerated from the Go services, and the check
#      fails if frontend/wailsjs moved (it was stale; keep the new files);
#   3. the snapshot read contract: app/contract scans testdata/sample-repo
#      with the app's own scan service and runs every Go reader against it,
#      writing the snapshot to testdata/archstats-fixture.db for step 6;
#   4. go vet and go test ./... (including the IPC json-tag check);
#   5. golangci-lint (.golangci.yml): the depguard package boundaries;
#   6. the frontend: vitest (module rules, the snapshot contract over the
#      fixture, unit tests), vue-tsc against its per-file baseline, i18n.
#
#   scripts/verify-harness.sh
#   ALLOW_LOCAL_REPLACE=1 scripts/verify-harness.sh   # cross-repo work: build
#       against ../archstats through go.work or a local replace. Never the
#       state a task ends in (.agents/skills/cross-repo-feature).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nverify-harness: %s\n' "$*" >&2; exit 1; }

step "go.mod: no local replace"
# Replace lines, in a replace block or on their own, whose target is a path.
local_replace="$(awk '
  /^replace[ \t]*\(/ { block = 1; next }
  block && /^\)/      { block = 0; next }
  (block || /^replace[ \t]/) && /=>[ \t]*(\.|\/|~|[A-Za-z]:\\)/ { print FILENAME ":" FNR ": " $0 }
' go.mod)"
if [[ "${ALLOW_LOCAL_REPLACE:-}" == "1" ]]; then
  [[ -n "$local_replace" ]] && printf 'allowed for this run (ALLOW_LOCAL_REPLACE=1):\n%s\n' "$local_replace"
  [[ -f go.work ]] && echo "go.work is in use: Go builds against $(sed -n 's/^[[:space:]]*\(\.\.\/[^[:space:]]*\)$/\1/p' go.work | tr '\n' ' ')"
else
  if [[ -n "$local_replace" ]]; then
    fail "go.mod replaces a module with a local path:
$local_replace
Remove it and pin a published engine version (go get github.com/archstats/archstats@<tag>),
or set ALLOW_LOCAL_REPLACE=1 while you work across both repositories."
  fi
  export GOWORK=off
  echo "ok; building against github.com/archstats/archstats $(go list -m -f '{{.Version}}' github.com/archstats/archstats) (go.mod's pin, GOWORK=off)"
fi

# main.go embeds all:frontend/dist, which needs one file to match before the
# frontend is built (CI does the same).
mkdir -p frontend/dist
[[ -n "$(ls -A frontend/dist)" ]] || touch frontend/dist/.gitkeep

step "Wails bindings are generated from the Go services"
if command -v wails >/dev/null; then
  digest() { find frontend/wailsjs -type f | LC_ALL=C sort | xargs shasum | shasum; }
  before="$(digest)"
  # On Linux, WAILS_TAGS=webkit2_41 builds against WebKitGTK 4.1, as CI does.
  wails generate module ${WAILS_TAGS:+-tags "$WAILS_TAGS"} >/dev/null
  if [[ "$(digest)" != "$before" ]]; then
    git status --short -- frontend/wailsjs
    fail "frontend/wailsjs was stale and has been regenerated from the Go services. Keep the regenerated files (never edit them by hand) and run this again."
  fi
  echo "ok; frontend/wailsjs matches the Go services"
else
  echo "skipped: the wails CLI is not installed (go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0)"
fi

fixture="$root/testdata/archstats-fixture.db"
step "snapshot read contract (app/contract) -> testdata/archstats-fixture.db"
rm -f "$fixture"
ARCHSTATS_FIXTURE_DB="$fixture" go test -count=1 ./app/contract
[[ -f "$fixture" ]] || fail "app/contract did not write $fixture (is git installed?)"

step "go vet ./... && go test ./..."
go vet ./...
go test ./...

step "golangci-lint run ./..."
if command -v golangci-lint >/dev/null; then
  golangci-lint run ./...
else
  echo "skipped: golangci-lint is not installed (v2: https://golangci-lint.run/welcome/install/)"
fi

step "frontend: vitest (module rules, snapshot contract, unit tests)"
cd frontend
[[ -d node_modules ]] || fail "frontend/node_modules is missing: cd frontend && npm ci"
ARCHSTATS_FIXTURE_DB="$fixture" npm test --silent

step "frontend: vue-tsc against typecheck-baseline.json"
npm run --silent typecheck

step "frontend: i18n"
npm run --silent i18n:check

step "verify-harness: all checks passed"
