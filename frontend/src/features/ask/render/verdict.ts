// An answer's verdict on itself, read before its claims: how many of them the
// cited facts bear out, and what did not. One line, a level a reader takes in
// at a glance, and the sentences to check.

import type { Grounding } from "~/features/exhibits/grounding"

export type VerdictLevel = "good" | "warn" | "bad" | "none"

export interface AnswerVerdict {
    level: VerdictLevel
    /** "All 15 claims check out", "9 of 20 claims check out". */
    headline: string
    /** What failed, most serious first: "1 unsupported", "8 uncited", "1 citation to nothing". */
    problems: string[]
    /** Sentences to check before using the answer, with why. */
    flagged: Array<{ sentence: string; verdict: string; reasons: string[] }>
}

const CITES = /\[((?:E\d+(?:\.\d+)?)(?:\s*,\s*E\d+(?:\.\d+)?)*)\]/g

/** Citations the answer writes that point at nothing in the conversation. */
export function brokenCitations(answer: string, ids: Set<string>): string[] {
    const out = new Set<string>()
    for (const m of answer.matchAll(CITES)) for (const id of m[1].split(/\s*,\s*/)) if (!ids.has(id)) out.add(id)
    return [...out]
}

/** Sentences a report or a write-up must not carry as findings. */
export function untrusted(g: Grounding | null | undefined): Array<{ sentence: string; verdict: string; reasons: string[] }> {
    return (g?.claims ?? []).filter(c => c.verdict === "unsupported" || c.verdict === "uncited")
}

/** The answer with the sentences its facts do not bear out taken out: what a writer may build on. */
export function trustedText(answer: string, g: Grounding | null | undefined): string {
    let out = answer
    for (const c of untrusted(g)) out = out.replace(c.sentence, "")
    return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

/** A failed check in the reader's words, not the checker's. */
export function checkWords(c: { id: string; detail: string }): string {
    switch (c.id) {
        case "gave-up": return "Said it could not answer without looking it up"
        case "menu": return "Offered a menu instead of answering"
        case "uncited": return /ids no tool returned: (.*)/.exec(c.detail)?.[1] ? `Cites ${/ids no tool returned: (.*)/.exec(c.detail)![1]}, which Ask never showed` : /Made-up markers/.test(c.detail) ? "Cites sources that do not exist" : "States numbers without citing where they come from"
        case "invented": return c.detail.replace(/^Names no tool returned: /, "Names nothing it looked up: ")
        case "verdict": return c.detail.replace(/^Verdict word/, "Judges instead of showing:")
        default: return c.detail
    }
}

export function answerVerdict(g: Grounding | null | undefined, opts: { broken?: string[]; failedChecks?: string[]; wrongTopic?: string } = {}): AnswerVerdict {
    const claims = g?.claims ?? []
    const c = g?.counts ?? { verified: 0, cited: 0, partial: 0, unsupported: 0, uncited: 0 }
    const broken = opts.broken ?? []
    const failedChecks = opts.failedChecks ?? []
    const ok = c.verified + c.cited
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`
    const problems = [
        opts.wrongTopic,
        broken.length && `${plural(broken.length, "citation")} to nothing (${broken.join(", ")})`,
        c.unsupported && `${c.unsupported} unsupported`,
        c.uncited && `${c.uncited} uncited`,
        c.partial && `${c.partial} partly supported`,
        ...failedChecks,
    ].filter((x): x is string => !!x)
    const flagged = claims.filter(x => x.verdict !== "verified" && x.verdict !== "cited")
        .sort((a, b) => rank(b.verdict) - rank(a.verdict))
        .map(x => ({ sentence: x.sentence, verdict: x.verdict, reasons: x.reasons }))
    if (!claims.length && !problems.length) return { level: "none", headline: "", problems, flagged }
    const level: VerdictLevel = c.unsupported || broken.length || opts.wrongTopic ? "bad" : c.uncited || c.partial || failedChecks.length ? "warn" : "good"
    const headline = !claims.length
        ? "No number or name here rests on a fact Ask looked up"
        : opts.wrongTopic && !c.unsupported && !broken.length
            ? "The numbers are right, but they answer a different question"
            : level === "good"
                ? ok === 1 ? "Its one claim checks out against its facts" : `All ${ok} claims check out against their facts`
                : `${ok} of ${plural(claims.length, "claim")} check out against their facts`
    return { level, headline, problems, flagged }
}

function rank(v: string): number {
    return v === "unsupported" ? 3 : v === "uncited" ? 2 : v === "partial" ? 1 : 0
}
