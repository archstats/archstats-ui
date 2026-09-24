// CODEOWNERS, read the way GitHub and GitLab read it: gitignore-style
// patterns, the last matching line wins, `[Section]` headers (GitLab) with
// optional default owners. A file with no matching line is unowned, which is
// a finding of its own.

/** Where the file is looked for, in the order GitHub uses; the first found is the one read. */
export const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS", ".gitlab/CODEOWNERS"]

export interface OwnerRule {
    line: number
    pattern: string
    owners: string[]
    section: string | null
    re: RegExp
}

export interface Codeowners {
    rules: OwnerRule[]
    /** Lines that could not be read, with why. */
    errors: Array<{ line: number; text: string; why: string }>
}

export function parseCodeowners(text: string): Codeowners {
    const rules: OwnerRule[] = []
    const errors: Codeowners["errors"] = []
    let section: string | null = null
    let sectionOwners: string[] = []
    text.split(/\r?\n/).forEach((raw, i) => {
        const line = i + 1
        const body = stripComment(raw).trim()
        if (!body) return
        const head = /^\^?\[([^\]]+)\](?:\[\d+\])?\s*(.*)$/.exec(body)
        if (head) {
            section = head[1].trim()
            sectionOwners = head[2].split(/\s+/).filter(Boolean)
            return
        }
        const tokens = splitTokens(body)
        const pattern = tokens.shift()!
        const owners = tokens.length ? tokens : sectionOwners
        try {
            rules.push({ line, pattern, owners, section, re: patternToRegExp(pattern) })
        } catch (e: any) {
            errors.push({ line, text: raw, why: String(e?.message ?? e) })
        }
    })
    return { rules, errors }
}

/** A "#" starts a comment unless escaped ("\#file"). */
function stripComment(line: string): string {
    let out = ""
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\" && line[i + 1] === "#") { out += "#"; i++; continue }
        if (line[i] === "#") break
        out += line[i]
    }
    return out
}

/** Whitespace-separated, with "\ " kept inside a pattern. */
function splitTokens(body: string): string[] {
    const out: string[] = []
    let cur = ""
    for (let i = 0; i < body.length; i++) {
        const c = body[i]
        if (c === "\\" && body[i + 1] === " ") { cur += " "; i++; continue }
        if (/\s/.test(c)) { if (cur) out.push(cur); cur = ""; continue }
        cur += c
    }
    if (cur) out.push(cur)
    return out
}

/**
 * A pattern as a RegExp over repository paths (no leading slash).
 *
 * - A leading "/" or a "/" in the middle anchors the pattern at the root; a
 *   pattern without one matches at any depth.
 * - "*" stays inside a segment, "**" crosses them, "?" is one character.
 * - A match on a directory owns everything under it, except for a pattern
 *   whose last segment is a bare "*": GitHub's `docs/*` owns docs/a.md and
 *   not docs/deep/b.md.
 */
export function patternToRegExp(pattern: string): RegExp {
    let p = pattern
    let anchored = p.startsWith("/")
    if (anchored) p = p.slice(1)
    if (p.endsWith("/")) p = p.slice(0, -1)
    if (!p) return /^.*$/
    if (p.includes("/")) anchored = true
    const lastIsStar = p === "*" ? false : p.split("/").pop() === "*"
    let re = ""
    for (let i = 0; i < p.length; i++) {
        const c = p[i]
        if (c === "*" && p[i + 1] === "*") {
            const slashAfter = p[i + 2] === "/"
            re += slashAfter ? "(?:.*/)?" : ".*"
            i += slashAfter ? 2 : 1
        } else if (c === "*") re += "[^/]*"
        else if (c === "?") re += "[^/]"
        else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }
    const prefix = anchored ? "^" : "^(?:.*/)?"
    return new RegExp(`${prefix}${re}${lastIsStar ? "$" : "(?:/.*)?$"}`)
}

/** The rule that owns a path: the last one that matches. */
export function ownerOf(co: Codeowners, path: string): OwnerRule | null {
    for (let i = co.rules.length - 1; i >= 0; i--) if (co.rules[i].re.test(path)) return co.rules[i]
    return null
}

export interface OwnerSet {
    /** The owners, sorted and joined: one group per distinct set. */
    key: string
    owners: string[]
    files: string[]
    /** The lines that assigned files to this set. */
    lines: number[]
}

/** Files grouped by the owners of the rule that wins for each; unowned files apart. */
export function ownerSets(co: Codeowners, files: string[]): { sets: OwnerSet[]; unowned: string[] } {
    const sets = new Map<string, OwnerSet>()
    const unowned: string[] = []
    for (const f of files) {
        const rule = ownerOf(co, f)
        // A rule with no owners un-owns what it matches: GitHub's way of carving out an exception.
        if (!rule || !rule.owners.length) { unowned.push(f); continue }
        const owners = [...rule.owners].sort()
        const key = owners.join(" ")
        let s = sets.get(key)
        if (!s) { s = { key, owners, files: [], lines: [] }; sets.set(key, s) }
        s.files.push(f)
        if (!s.lines.includes(rule.line)) s.lines.push(rule.line)
    }
    return { sets: [...sets.values()].sort((a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key)), unowned }
}
