// Which commits count as fix work: a pattern over the subject line that the
// architect can see, test and change. Never called "bugs" -- a message that
// says "fix" is a message that says "fix", and the near-misses are shown so
// the pattern can be checked, not trusted.

import { useStateStore } from "~/stores/state"

export const DEFAULT_FIX_PATTERN = String.raw`\b(fix(es|ed)?|bug(fix)?|hotfix|revert)\b`
const STATE_KEY = "git.fixPattern"

export type Compiled = { re: RegExp; error: null } | { re: null; error: string }

/** Case-insensitive, as people write "Fix", "FIX" and "fix". */
export function compileFixPattern(source: string): Compiled {
    if (!source.trim()) return { re: null, error: "An empty pattern matches every commit." }
    try {
        const re = new RegExp(source, "i")
        if (re.test("")) return { re: null, error: "The pattern matches an empty subject, so it matches every commit." }
        return { re, error: null }
    } catch (e: any) {
        return { re: null, error: String(e?.message ?? e).replace(/^Invalid regular expression: \/.*\/[a-z]*: /, "") }
    }
}

export function subjectOf(message: string | null | undefined): string {
    return (message ?? "").split("\n")[0].trim()
}

export function matchesFix(re: RegExp, message: string | null | undefined): boolean {
    return re.test(subjectOf(message))
}

/** Subjects that hold a stem the pattern is about but do not match it: "Fixture", "debug", "prefix". */
export function nearMisses(re: RegExp, messages: Array<string | null | undefined>, limit = 5): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const m of messages) {
        const s = subjectOf(m)
        if (!s || seen.has(s) || re.test(s) || !/fix|bug|revert/i.test(s)) continue
        seen.add(s)
        out.push(s)
        if (out.length >= limit) break
    }
    return out
}

/** The workspace's pattern (source), and the last valid one compiled. */
export function fixPatternSource(): string {
    return useStateStore().get<string>(STATE_KEY, DEFAULT_FIX_PATTERN) || DEFAULT_FIX_PATTERN
}

export function setFixPattern(source: string) {
    useStateStore().set(STATE_KEY, source === DEFAULT_FIX_PATTERN ? null : source)
}

export function fixPattern(): RegExp {
    const c = compileFixPattern(fixPatternSource())
    return c.re ?? new RegExp(DEFAULT_FIX_PATTERN, "i")
}
