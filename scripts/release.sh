#!/usr/bin/env bash
# release.sh vX.Y.Z [--engine vA.B.C] [--push]: cut an Archstats Desktop release.
#
# With --engine it first pins that engine tag (go get, tidy, vet and test with
# GOWORK=off, as CI builds) and commits the pin. It then checks that main is
# clean, pushed, green in CI and pins the engine by a tag, never a commit;
# moves the Unreleased notes in CHANGELOG.md under the new version with the
# engine, its analysis revision and the commit list; commits that, and makes a
# signed tag. With --push it pushes main and the tag; the release workflow
# builds and verifies every platform and opens a draft release whose notes are
# that CHANGELOG section. Publish the draft by hand.
#
# Release the engine first (archstats' scripts/release.sh): the pin needs its tag.
set -euo pipefail

repo="archstats/archstats-ui"
engine_module="github.com/archstats/archstats"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
export GOWORK=off

fail() { echo "release: $*" >&2; exit 1; }
semver='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'

version="${1:-}"
shift || true
engine="" push=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --engine) engine="${2:-}"; shift 2 ;;
    --push) push=true; shift ;;
    *) fail "unknown option $1" ;;
  esac
done
[[ "$version" =~ $semver ]] || fail "usage: scripts/release.sh vX.Y.Z [--engine vA.B.C] [--push]"
[[ -z "$engine" || "$engine" =~ $semver ]] || fail "--engine takes a tag such as v0.12.0"

[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fail "not on main"
git diff --quiet && git diff --cached --quiet || fail "main has uncommitted changes to tracked files"
git fetch -q origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "main is not the same as origin/main: push or pull first"
git rev-parse -q --verify "refs/tags/$version" >/dev/null && fail "$version is already tagged"

previous="$(git describe --tags --abbrev=0 --match 'v*' HEAD)"
[[ "$(printf '%s\n%s\n' "$previous" "$version" | sort -V | tail -1)" == "$version" ]] || fail "$version does not come after $previous"

if [[ -n "$engine" ]]; then
  echo "Pinning engine $engine…"
  GOPROXY=direct go get "$engine_module@$engine"
  go mod tidy
  mkdir -p frontend/dist && touch frontend/dist/.gitkeep
  go vet ./...
  go test ./...
  git add go.mod go.sum
  git commit -q -m "build(deps): archstats engine $engine"
  echo "Pinned and committed. Push main, wait for CI, then run this again without --engine."
  $push && git push origin main
  exit 0
fi

pinned="$(go list -m -f '{{.Version}}' "$engine_module")"
[[ "$pinned" =~ $semver && ! "$pinned" =~ -[0-9]{14}-[0-9a-f]{12}$ ]] \
  || fail "go.mod pins the engine at $pinned, a commit and not a tag: release the engine, then run with --engine"

sha="$(git rev-parse HEAD)"
ci="$(gh run list --repo "$repo" --workflow ci.yml --commit "$sha" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"')"
case "$ci" in
  "completed success") ;;
  "") fail "CI has not run on ${sha:0:7}" ;;
  "completed "*) fail "CI on ${sha:0:7} ended ${ci#completed }" ;;
  *) fail "CI on ${sha:0:7} is still running" ;;
esac

# The analysis revision of the pinned engine, and of the one the last release pinned.
revision_of() {
  local dir
  dir="$(go mod download -json "$engine_module@$1" | sed -n 's/^[[:space:]]*"Dir": "\(.*\)",$/\1/p')"
  sed -n 's/^const AnalysisRevision = \([0-9][0-9]*\).*/\1/p' "$dir/core/revision.go" 2>/dev/null | grep . || echo 0
}
was="$(scripts/changelog.sh engine "$previous")"
r1="$(revision_of "$pinned")"
r0="$(revision_of "$was")"
engine_line="Engine $pinned, analysis revision $r1."
[[ "$r0" != "$r1" ]] && engine_line="Engine $pinned, analysis revision $r1 (was $r0): snapshots taken before this release offer Scan again."

grep -q '^## Unreleased' CHANGELOG.md || fail "CHANGELOG.md has no Unreleased section"
highlights="$(awk '/^## Unreleased/ { f = 1; next } /^## / { f = 0 } f' CHANGELOG.md | sed -e '/./,$!d')"
commits="$(scripts/changelog.sh commits "$previous" HEAD)"

section="## $version ($(date +%F))"$'\n\n'
[[ -n "$highlights" ]] && section+="$highlights"$'\n\n'
section+="$engine_line"$'\n\n'
section+="${commits:-Maintenance only.}"

{
  awk '/^## Unreleased/ { exit } { print }' CHANGELOG.md
  printf '## Unreleased\n\n%s\n\n' "$section"
  awk '/^## Unreleased/ { f = 1; next } f && /^## / { p = 1 } p' CHANGELOG.md
} | cat -s > CHANGELOG.md.new
mv CHANGELOG.md.new CHANGELOG.md

echo "------ $version"
scripts/changelog.sh section "$version"
echo "------"

git add CHANGELOG.md
git commit -q -m "chore(release): $version"
git tag -s "$version" -m "Archstats Desktop $version"
echo "Tagged $version on $(git rev-parse --short HEAD)."

if $push; then
  git push origin main "refs/tags/$version"
  echo "Pushed. The draft release appears at https://github.com/$repo/releases once the workflow finishes."
else
  echo "Push with: git push origin main refs/tags/$version"
fi
