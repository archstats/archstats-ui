#!/usr/bin/env bash
# Claude Code PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit), wired in
# .claude/settings.json. Refuses hand edits to files a tool writes:
#   frontend/wailsjs/**   the Wails bindings, generated from the Go services
#   frontend/dist/**      the built frontend
#   frontend/typecheck-baseline.json   the vue-tsc ratchet, recorded by its script
set -uo pipefail

command -v jq >/dev/null || exit 0
file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
[[ -n "$file" ]] || exit 0
root="$(cd "$(dirname "$0")/../.." && pwd)"
rel="${file#"$root"/}"

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

case "$rel" in
  frontend/wailsjs/*)
    deny "frontend/wailsjs is generated from the Go services. Change the Go method or struct (with json tags) in app/, then regenerate: wails generate module (scripts/verify-harness.sh does it and fails if the bindings were stale)." ;;
  frontend/dist/*)
    deny "frontend/dist is build output (npm run generate, run by wails build). Change the source in frontend/src instead; never build while wails dev is running (CLAUDE.md)." ;;
  frontend/typecheck-baseline.json)
    deny "typecheck-baseline.json is recorded by cd frontend && npm run typecheck -- --update. Fix the type errors; record a higher baseline only if the user agreed to it." ;;
esac
exit 0
