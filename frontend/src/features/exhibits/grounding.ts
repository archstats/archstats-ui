// Whether prose says what its cited facts say, sentence by sentence, without
// a model. Our sources are measurements, so most claims can be checked
// exactly: every number a sentence states must be in the facts it cites (or
// follow from two of them), and every thing it names must be one those facts
// are about. The chat marks each citation with the verdict; a report's prose
// can be checked against its cells the same way.

import type { Fact } from "./types"

export type Verdict = "verified" | "cited" | "partial" | "unsupported" | "uncited"

export interface Claim {
    sentence: string
    cites: string[]
    verdict: Verdict
    /** What did not match, in words: "12 is in none of the cited facts". */
    reasons: string[]
}

export interface Grounding {
    claims: Claim[]
    counts: Record<Verdict, number>
}

const NUMBER = /(?<![\w.#&-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%?)(?![\w])/g
const CITE = /\bE(\d+)(?:\.(\d+))?\b/g

/** Sentences and list items, with code, embeds and headings left out. */
export function sentencesOf(text: string): string[] {
    return blocksOf(text).flat()
}

/**
 * Sentences grouped by block: a paragraph, or a list with the sentence that
 * introduces it. A sentence without a citation of its own is checked against
 * its block's citations (a list's items rest on the source named in its lead-in).
 */
function blocksOf(text: string): string[][] {
    const clean = text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/^\s*!\[[^\]]*\]\(exhibit:E\d+\)\s*$/gm, " ")
        .replace(/^\s*#{1,6}\s.*$/gm, " ")
    const blocks: string[][] = []
    let cur: string[] = []
    let inList = false
    for (const line of clean.split("\n")) {
        const isItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
        const item = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim()
        if (!item) { if (cur.length && !inList) { blocks.push(cur); cur = [] } continue }
        if (/^\|?\s*-{3,}/.test(item)) continue
        // A list stays with the paragraph just before it; a paragraph after a list starts a new block.
        if (!isItem && inList) { blocks.push(cur); cur = []; inList = false }
        if (isItem) inList = true
        // A sentence ends at . ! ? followed by a space and a capital, or at the line's end; citations stay with their sentence.
        for (const x of item.split(/(?<=[.!?](?:\s*\[[^\]]+\])*)\s+(?=[A-Z*`"(])/)) if (x.trim()) cur.push(x.trim())
    }
    if (cur.length) blocks.push(cur)
    return blocks
}

function numbersIn(sentence: string): Array<{ value: number; text: string; percent: boolean }> {
    const text = sentence
        // A scale is not a claim: "9.09 out of 10", "6/10", "from 1.0 to 10.0".
        .replace(/\b(?:out of|of a possible)\s+\d+(?:\.\d+)?/gi, " ").replace(/\/\s*10(?:\.0)?\b/g, " ").replace(/\bfrom \d+(?:\.\d+)? to \d+(?:\.\d+)?/gi, " ")
        .replace(/`[^`]*`/g, " ")
        .replace(/\[[^\]]*\bE\d+[^\]]*\]/g, " ")
        .replace(/\bE\d+(?:\.\d+)?\b/g, " ")
        .replace(/\b(19|20)\d\d-\d\d(-\d\d)?\b/g, " ")
    const out: Array<{ value: number; text: string; percent: boolean }> = []
    for (const m of text.matchAll(NUMBER)) {
        const value = Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`)
        // Small whole numbers are words ("two floors", "step 1"), not measurements.
        if (!m[2] && !m[3] && value <= 3) continue
        out.push({ value, text: m[0], percent: m[3] === "%" })
    }
    return out
}

/** Every number a fact holds: its values, and the numbers written in its text. */
function valuesOf(facts: Fact[]): number[] {
    const out: number[] = []
    for (const f of facts) {
        out.push(...Object.values(f.values))
        for (const m of f.text.matchAll(NUMBER)) out.push(Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`))
    }
    return out.filter(Number.isFinite)
}

function matches(v: number, percent: boolean, known: number[]): boolean {
    for (const k of known) {
        if (Math.abs(k - v) < 1e-9 || Math.round(k) === v || Math.abs(Math.round(k * 10) / 10 - v) < 1e-9 || Math.abs(Math.round(k * 100) / 100 - v) < 1e-9) return true
    }
    // A share or a difference of two cited numbers ("38% of its commits", "12 more than").
    for (const a of known) for (const b of known) {
        if (a === b || !b) continue
        if (Math.abs((100 * a) / b - v) < 0.6) return true
        if (!percent && (Math.abs(a - b - v) < 0.01 || Math.abs(a + b - v) < 0.01 || Math.abs(a / b - v) < 0.06)) return true
    }
    return false
}

/** Things named in a sentence: any entity of any fact, by full name or by its last segment when that is unique. */
function namesIn(sentence: string, entities: string[]): string[] {
    const s = sentence.toLowerCase()
    const tails = new Map<string, string[]>()
    for (const e of entities) {
        const t = e.split(/[./\\]|::/).filter(Boolean).pop()?.toLowerCase()
        if (t && t.length > 3) tails.set(t, [...(tails.get(t) ?? []), e])
    }
    const out = new Set<string>()
    for (const e of entities) if (e.length > 3 && s.includes(e.toLowerCase())) out.add(e)
    for (const [t, es] of tails) if (es.length === 1 && !out.has(es[0]) && new RegExp(`(?<![\\w./-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`).test(s)) out.add(es[0])
    return [...out]
}

/**
 * The verdict for every sentence of a text, against the facts of the
 * exhibits it can cite. `E3` cites all of exhibit E3's facts; `E3.4` one.
 */
export function checkGrounding(text: string, facts: Fact[], opts: { given?: string } = {}): Grounding {
    // Numbers the question itself states ("more than 5 dependents") need no fact.
    const given = opts.given ? numbersIn(opts.given).map(x => x.value) : []
    const byId = new Map(facts.map(f => [f.id, f]))
    const allEntities = [...new Set(facts.flatMap(f => f.entities))]
    const claims: Claim[] = []
    const citesOf = (x: string) => [...x.matchAll(CITE)].map(m => (m[2] ? `E${m[1]}.${m[2]}` : `E${m[1]}`))
    const expand = (cs: string[]) => cs.flatMap(c => (c.includes(".") ? (byId.has(c) ? [byId.get(c)!] : []) : facts.filter(f => f.id.startsWith(`${c}.`))))
    /** Every fact the answer cites anywhere: a later sentence may restate one of its numbers. */
    const answerCited = expand([...new Set(citesOf(text))])
    for (const block of blocksOf(text)) {
        const blockCites = [...new Set(block.flatMap(citesOf))]
        for (const sentence of block) {
            const own = citesOf(sentence)
            const inherited = !own.length && blockCites.length
            const cites = own.length ? own : blockCites
            const cited = cites.flatMap(c => (c.includes(".") ? (byId.has(c) ? [byId.get(c)!] : []) : facts.filter(f => f.id.startsWith(`${c}.`))))
            // Names are checked against the cited facts and what their exhibit states as a whole (its totals and notes: a tangle's members).
            const exhibits = new Set(cited.map(f => f.id.split(".")[0]))
            const context = facts.filter(f => exhibits.has(f.id.split(".")[0]) && (f.kind === "total" || f.kind === "note"))
            const nums = numbersIn(sentence)
            const names = namesIn(sentence, allEntities)
            const reasons: string[] = []
            let verdict: Verdict
            if (!cites.length) {
                // A sentence with no number and no citation is interpretation or connective prose: nothing to check.
                if (!nums.length || nums.every(x => given.includes(x.value))) continue
                // A number the answer already cited elsewhere is a restatement, not a new claim.
                const restated = valuesOf(answerCited)
                if (nums.every(x => matches(x.value, x.percent, restated))) { claims.push({ sentence, cites: [], verdict: "cited", reasons: ["restates a number cited earlier in the answer"] }); continue }
                verdict = "uncited"
                reasons.push(`states ${nums.map(x => x.text).join(", ")} without citing a fact`)
            } else {
                const known = valuesOf(cited)
                const loose = nums.filter(x => !given.includes(x.value) && !matches(x.value, x.percent, known))
                const about = [...cited, ...context]
                const citedEntities = new Set(about.flatMap(f => f.entities).map(e => e.toLowerCase()))
                const citedText = about.map(f => f.text.toLowerCase()).join(" ")
                const strangers = names.filter(e => !citedEntities.has(e.toLowerCase()) && !citedText.includes(e.toLowerCase()))
                for (const x of loose) reasons.push(`${x.text} is in none of the ${inherited ? "facts its paragraph cites" : "cited facts"}`)
                for (const e of strangers) reasons.push(`the cited facts are not about ${e}`)
                // Nothing of its own to check against the paragraph's citation: fine, and not claimed as verified either.
                if (inherited && !nums.length && !names.length) continue
                verdict = loose.length ? "unsupported" : strangers.length ? "partial" : nums.length || names.length ? "verified" : "cited"
            }
            claims.push({ sentence, cites: own, verdict, reasons })
        }
    }
    const counts: Record<Verdict, number> = { verified: 0, cited: 0, partial: 0, unsupported: 0, uncited: 0 }
    for (const c of claims) counts[c.verdict]++
    return { claims, counts }
}

/**
 * Citations put right without a model. A sentence whose numbers are all in
 * exactly one fact, and whose names that fact is about, cites that fact: a
 * wrong citation (off by one, another figure) is replaced, a missing one
 * added. Anything less certain is left for the check to flag.
 */
export function recite(text: string, facts: Fact[], opts: { given?: string } = {}): { text: string; fixed: number } {
    const g = checkGrounding(text, facts, opts)
    const entities = [...new Set(facts.flatMap(f => f.entities))]
    let out = text
    let fixed = 0
    for (const c of g.claims) {
        if (c.verdict !== "unsupported" && c.verdict !== "partial" && c.verdict !== "uncited") continue
        const nums = numbersIn(c.sentence)
        if (!nums.length) continue
        const names = namesIn(c.sentence, entities).map(n => n.toLowerCase())
        const holds = facts.filter(f => {
            const known = valuesOf([f])
            const about = new Set(f.entities.map(e => e.toLowerCase()))
            return nums.every(x => known.some(k => Math.abs(k - x.value) < 1e-9 || Math.round(k) === x.value || Math.abs(Math.round(k * 100) / 100 - x.value) < 1e-9))
                && names.every(n => about.has(n) || f.text.toLowerCase().includes(n))
        })
        if (holds.length !== 1) continue
        const id = holds[0].id
        const groups = c.sentence.match(/\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g) ?? []
        let next: string
        if (groups.length === 1) next = c.sentence.replace(groups[0], `[${id}]`)
        else if (!groups.length) next = c.sentence.replace(/([.!?:;]?)\s*$/, ` [${id}]$1`)
        else continue
        if (next !== c.sentence && out.includes(c.sentence)) { out = out.replace(c.sentence, next); fixed++ }
    }
    return { text: out, fixed }
}
