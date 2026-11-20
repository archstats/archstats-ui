#!/usr/bin/env bash
# Claude Code Stop hook, wired in .claude/settings.json. Before an agent says
# it is done with a change to the app, run the definition of done,
# scripts/verify-harness.sh (AGENTS.md), and send it back to work when it
# fails. A tree that already passed is not checked again: the hook remembers
# the hash of the diff it last passed, in the git directory.
set -uo pipefail

command -v jq >/dev/null || exit 0
input="$(cat)"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root"

changed="$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null \
  | grep -E '\.go$|^go\.(mod|sum)$|^\.golangci\.yml$|^testdata/sample-repo/|^frontend/(src/|wailsjs/|package(-lock)?\.json$|tsconfig\.json$|nuxt\.config\.ts$|typecheck-baseline\.json$)' )"
[[ -n "$changed" ]] || exit 0

state="$(git rev-parse --git-dir)/archstats-ui-stop-hook.ok"
hash="$( { git diff HEAD; git ls-files --others --exclude-standard -z | xargs -0 cat 2>/dev/null; } | shasum | cut -c1-40)"
[[ -f "$state" && "$(cat "$state")" == "$hash" ]] && exit 0

out="$(scripts/verify-harness.sh 2>&1)"
if [[ $? -eq 0 ]]; then
  echo "$hash" > "$state"
  exit 0
fi

# Asked once already and still failing: let the agent stop and report it,
# rather than loop.
if [[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]]; then
  exit 0
fi
reason="$(printf '%s\n' "$out" | grep -v '^{' | grep -E -- '^==> |^verify-harness: |--- FAIL|_test\.go:[0-9]+|\.go:[0-9]+:[0-9]+: |FAIL|Error|error TS|errors, baseline|^\+ ' | head -40)"
jq -n --arg r "scripts/verify-harness.sh failed. Fix it, or say plainly which checks still fail and why:
$reason" '{decision: "block", reason: $r}'
exit 0
