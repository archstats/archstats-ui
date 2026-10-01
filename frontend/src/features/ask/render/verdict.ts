// An answer's verdict on itself, read before its claims: how many of them the
// cited facts bear out, and what did not. One line, a level a reader takes in
// at a glance, and the sentences to check.

import type { Grounding } from "~/features/exhibits/grounding"
import { t } from "~/shared/i18n"

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

/** The verdict words, explained where they appear. */
export const VERDICT_WORDS: Record<string, string> = {
    verified: t("ask.verdict.verifiedNumbersNamesFacts"),
    cited: t("ask.verdict.citedCitesFactsStates"),
    partial: t("ask.verdict.partlySupportedNumbersCited"),
    unsupported: t("ask.verdict.unsupportedStatesNumberFacts"),
    uncited: t("ask.verdict.uncitedStatesNumberWithout"),
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

/**
 * The answer with the sentences its facts do not bear out taken out: what a
 * writer may build on. What leaned on a sentence goes with it: a following
 * sentence that opens with "This" or "They" (it points at nothing now), a list
 * item left empty, and a lead-in ending in a colon whose list is gone.
 */
export function trustedText(answer: string, g: Grounding | null | undefined): string {
    let out = answer
    for (const c of untrusted(g)) {
        const i = out.indexOf(c.sentence)
        if (i < 0) continue
        let end = i + c.sentence.length
        const next = /^[ \t]*((?:This|That|These|Those|They|It|Its|Their|He|She)\b[^.!?\n]*[.!?](?:[ \t]*\[[^\]]*\])?)/.exec(out.slice(end))
        if (next) end += next[0].length
        out = out.slice(0, i) + out.slice(end)
    }
    out = out.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]*$/gm, "")
    // A lead-in whose list is gone: "The key risks:" followed by nothing but a blank line or another paragraph.
    const lines = out.split("\n")
    for (let k = 0; k < lines.length; k++) {
        if (!/:\s*$/.test(lines[k]) || /^\s*(?:[-*+]|\d+[.)])\s/.test(lines[k])) continue
        const rest = lines.slice(k + 1).find(l => l.trim())
        if (!rest || !/^\s*(?:[-*+]|\d+[.)])\s|^\s*\|/.test(rest)) lines[k] = ""
    }
    return lines.join("\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Whether an answer is shown without its unbacked sentences: when some of it
 * checks out and some does not. An answer none of whose claims check out is
 * shown whole, marked, so nothing reads as if it were all there was.
 */
export function foldsUnbacked(g: Grounding | null | undefined): boolean {
    const c = g?.counts
    return !!c && c.unsupported + c.uncited > 0 && c.verified + c.cited > 0
}

/** A failed check in the reader's words, not the checker's. */
export function checkWords(c: { id: string; detail: string }): string {
    switch (c.id) {
        case "gave-up": return t("ask.verdict.saidCouldNotAnswer")
        case "menu": return t("ask.verdict.offeredMenuInsteadAnswering")
        case "uncited": return /ids no tool returned: (.*)/.exec(c.detail)?.[1] ? t("ask.verdict.citesWhichAskNever", { value: /ids no tool returned: (.*)/.exec(c.detail)![1] }) : /Made-up markers/.test(c.detail) ? t("ask.verdict.citesSourcesDoNot") : t("ask.verdict.statesNumbersWithoutCiting")
        case "invented": return c.detail.replace(/^Names no tool returned: /, "Names nothing it looked up: ")
        case "verdict": return c.detail.replace(/^Verdict word/, "Judges instead of showing:")
        case "unfinished": return t("ask.verdict.stopsBeforeConclusion")
        default: return c.detail
    }
}

export function answerVerdict(g: Grounding | null | undefined, opts: { broken?: string[]; failedChecks?: string[]; wrongTopic?: string; folded?: boolean } = {}): AnswerVerdict {
    const claims = g?.claims ?? []
    const c = g?.counts ?? { verified: 0, cited: 0, partial: 0, unsupported: 0, uncited: 0 }
    const broken = opts.broken ?? []
    const failedChecks = opts.failedChecks ?? []
    const ok = c.verified + c.cited
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`
    const problems = [
        opts.wrongTopic,
        broken.length && t("ask.verdict.nothing", { citations: t("common.count.citation", { count: broken.length }), value: broken.join(", ") }),
        c.unsupported && t("ask.verdict.unsupported", { unsupported: c.unsupported }),
        c.uncited && t("ask.verdict.uncited", { uncited: c.uncited }),
        c.partial && t("ask.verdict.partlySupported", { partial: c.partial }),
        ...failedChecks,
    ].filter((x): x is string => !!x)
    const flagged = claims.filter(x => x.verdict !== "verified" && x.verdict !== "cited")
        .sort((a, b) => rank(b.verdict) - rank(a.verdict))
        .map(x => ({ sentence: x.sentence, verdict: x.verdict, reasons: x.reasons }))
    if (!claims.length && !problems.length) return { level: "none", headline: "", problems, flagged }
    // Shown without what its facts did not back: the answer on screen is checked; what was left out is listed.
    if (opts.folded) {
        const left = c.unsupported + c.uncited
        const shown = claims.length - left
        const rest = [opts.wrongTopic, broken.length && t("ask.verdict.nothing", { citations: t("common.count.citation", { count: broken.length }), value: broken.join(", ") }), c.partial && t("ask.verdict.partlySupported", { partial: c.partial }), ...failedChecks].filter((x): x is string => !!x)
        return {
            level: opts.wrongTopic || broken.length ? "bad" : "warn",
            headline: opts.wrongTopic ? t("ask.verdict.numbersRightButThey") : shown === ok ? t("ask.verdict.allClaimsShownCheck", { ok }) : t("ask.verdict.shownCheckOutAgainst", { ok, claims: t("common.count.claim", { count: shown }) }),
            problems: [t("ask.verdict.leftOutNotBacked", { statements: t("common.count.statement", { count: left }), their: t("common.noun.its", { count: left }) }), ...rest],
            flagged,
        }
    }
    const level: VerdictLevel = c.unsupported || broken.length || opts.wrongTopic ? "bad" : c.uncited || c.partial || failedChecks.length ? "warn" : "good"
    const headline = !claims.length
        ? t("ask.verdict.noNumberNameHere")
        : opts.wrongTopic && !c.unsupported && !broken.length
            ? t("ask.verdict.numbersRightButThey")
            : level === "good"
                ? ok === 1 ? t("ask.verdict.oneClaimChecksOut") : t("ask.verdict.allClaimsCheckOut", { ok })
                : t("ask.verdict.checkOutAgainstTheir", { ok, claims: t("common.count.claim", { count: claims.length }) })
    return { level, headline, problems, flagged }
}

function rank(v: string): number {
    return v === "unsupported" ? 3 : v === "uncited" ? 2 : v === "partial" ? 1 : 0
}
