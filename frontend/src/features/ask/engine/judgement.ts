// Judgement words against rank. The claim check reads numbers and names, so
// "code health 3.67, which is relatively good" passes when 3.67 is right, even
// when it is the third lowest in the codebase. For the measures that have a
// better and a worse end, a sentence that calls a component's value good (or
// bad) must agree with where that value ranks among all components.

import type { Snapshot } from "~/features/snapshot/snapshot"

/** Measures with a better end: +1 when higher is better, -1 when higher is worse. */
const POLARITY: Record<string, { sign: 1 | -1; words: string; named: RegExp }> = {
    codesmells__code_health: { sign: 1, words: "code health", named: /health/i },
    codesmells__hotspot_score: { sign: -1, words: "hotspot score", named: /hotspot/i },
    codesmells__static_complexity_score: { sign: -1, words: "complexity", named: /complex/i },
    git__commits__total: { sign: -1, words: "churn", named: /churn|commits?\b|changed/i },
    modularity__distance_main_sequence: { sign: -1, words: "distance from the main sequence", named: /main sequence|distance/i },
}

const GOOD = /\b(?:good|healthy|fine|solid|clean|low[- ]risk|safe|strong|decent|acceptable|in good shape|not (?:a )?(?:concern|problem|risk))\b/i
const BAD = /\b(?:bad|poor|unhealthy|risky|high[- ]risk|weak|fragile|problematic|concerning|worrying)\b/i
const NUMBER = /(?<![\w.])(\d+(?:\.\d+)?)(?![\w])/g

export interface Misjudged { sentence: string; detail: string; fix: string }

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`

export function misjudged(answer: string, snap: Snapshot): Misjudged[] {
    const comps = snap.components().filter(c => c.name !== ".")
    const cols = Object.keys(POLARITY).filter(k => (snap.columns.components ?? []).includes(k))
    if (!cols.length || !comps.length) return []
    const tails = new Map<string, string[]>()
    for (const c of comps) {
        const t = String(c.name).split(/[./\\]|::/).filter(Boolean).pop()?.toLowerCase()
        if (t && t.length > 3) tails.set(t, [...(tails.get(t) ?? []), String(c.name)])
    }
    const out: Misjudged[] = []
    const text = answer.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1")
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const good = GOOD.test(sentence), bad = BAD.test(sentence)
        if (good === bad) continue
        const lower = sentence.toLowerCase()
        const named = new Set<string>()
        for (const c of comps) if (lower.includes(String(c.name).toLowerCase())) named.add(String(c.name))
        for (const [t, names] of tails) if (names.length === 1 && new RegExp(`(?<![\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(lower)) named.add(names[0])
        if (!named.size) continue
        // List numbering ("1.") and small counts are not measure values.
        const numbers = [...sentence.replace(/\[E[^\]]*\]/g, " ").replace(/^\s*\d+[.)]\s/, " ").matchAll(NUMBER)].map(m => Number(m[1])).filter(n => n > 3 || !Number.isInteger(n))
        for (const name of named) {
            const c = comps.find(x => x.name === name)!
            for (const col of cols) {
                // The sentence must be about this measure, not only hold a number equal to it.
                if (!POLARITY[col].named.test(sentence)) continue
                const v = Number(c[col])
                if (!Number.isFinite(v) || !numbers.some(n => Math.abs(n - v) < 0.006 || Math.abs(n - Math.round(v * 10) / 10) < 1e-9)) continue
                const { sign, words } = POLARITY[col]
                const all = comps.map(x => Number(x[col])).filter(x => Number.isFinite(x) && (col !== "codesmells__code_health" || x > 0))
                if (all.length < 10) continue
                const worse = all.filter(x => sign * x < sign * v).length
                const better = all.filter(x => sign * x > sign * v).length
                const share = worse / all.length
                if (good && share < 0.2) {
                    const rank = better + 1
                    out.push({ sentence, detail: `Calls ${name}'s ${words} (${v}) good; it is the ${ordinal(all.length - rank + 1)} worst of ${all.length}`, fix: `${name}'s ${words} is ${v}, the ${ordinal(all.length - rank + 1)} worst of ${all.length} components: say that, not that it is good.` })
                } else if (bad && share > 0.8) {
                    out.push({ sentence, detail: `Calls ${name}'s ${words} (${v}) bad; it is better than ${Math.round(share * 100)}% of components`, fix: `${name}'s ${words} is ${v}, better than ${Math.round(share * 100)}% of components: say that, not that it is bad.` })
                }
            }
        }
    }
    return out
}
