// The hygiene flags, grouped by rule. A rule is a fact the files state that
// people read as a risk; the page says which fact, and in one sentence why it
// matters. There is no severity and no total: the reader decides what counts.

import type { CicdModel, Flag } from "./cicd"

/** Rules in the order the page lists them: images first, then pipelines. */
export const RULES = [
  "base_unpinned_tag", "runs_as_root", "secret_like_key", "add_remote_url", "copy_all_no_dockerignore", "base_no_digest",
  "token_literal", "pr_target_checkout_head", "curl_pipe_shell", "tls_verify_off", "docker_privileged", "ungated_prod_deploy",
  "handoff_unpinned", "library_unpinned", "remote_include_unpinned", "no_permissions_block", "push_latest_only",
] as const

export const DOCKERFILE_RULES = new Set(["base_unpinned_tag", "runs_as_root", "secret_like_key", "add_remote_url", "copy_all_no_dockerignore", "base_no_digest"])

/** The environment names the ungated-deploy rule counts as production, shown with the rule. */
export const PRODUCTION_NAMES = ["prod", "production", "prd", "live"]

export interface FlagGroup { rule: string; flags: Flag[]; files: number }

export function groupFlags(m: CicdModel, search = ""): FlagGroup[] {
  const q = search.trim().toLowerCase()
  const by = new Map<string, Flag[]>()
  for (const f of m.flags) {
    if (q && ![f.rule, f.subject, f.detail, f.file].some(s => s.toLowerCase().includes(q))) continue
    const list = by.get(f.rule)
    if (list) list.push(f)
    else by.set(f.rule, [f])
  }
  const order = (r: string) => {
    const i = (RULES as readonly string[]).indexOf(r)
    return i < 0 ? RULES.length : i
  }
  return [...by.entries()]
    .map(([rule, flags]) => ({ rule, flags: flags.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line), files: new Set(flags.map(f => f.file)).size }))
    .sort((a, b) => order(a.rule) - order(b.rule) || a.rule.localeCompare(b.rule))
}

/** The flags on one file, and on one line of it when a line is given. */
export function flagsAt(m: CicdModel, file: string, line?: number): Flag[] {
  return m.flags.filter(f => f.file === file && (line === undefined || f.line === line))
}
