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
        .replace(/\b(?:out of|of a possible)\s+(?:5|10|100)(?:\.0)?(?![\d,.]\d)/gi, " ").replace(/\/\s*10(?:\.0)?\b/g, " ").replace(/\bfrom \d+(?:\.\d+)? to \d+(?:\.\d+)?/gi, " ")
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

/**
 * Things named in a sentence: any entity of any fact, by full name or by its
 * last segment when that is unique. A name that is also a plain word ("admin",
 * "shipping", "authentication") counts only where the sentence writes it as a
 * name (in code or in bold), unless its figure is cited in the same answer.
 * Otherwise prose about "shipping" would be read as a claim about a component
 * called that from a figure three questions back.
 */
function namesIn(sentence: string, entities: string[], near: ReadonlySet<string> = new Set(entities)): string[] {
    const s = sentence.toLowerCase()
    const marked = [...sentence.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)].map(m => (m[1] ?? m[2]).toLowerCase()).join(" ")
    const plain = (x: string) => /^[a-z]+$/.test(x)
    // Words every answer uses: as a name they must always be written as one, near their figure or not.
    const generic = (x: string) => GENERIC.has(x.toLowerCase())
    const seen = (text: string, word: string) => new RegExp(`(?<![\\w./-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`).test(text)
    const tails = new Map<string, { raw: string; es: string[] }>()
    for (const e of entities) {
        const raw = e.split(/[./\\]|::/).filter(Boolean).pop() ?? ""
        const t = raw.toLowerCase()
        if (t.length > 3) tails.set(t, { raw, es: [...(tails.get(t)?.es ?? []), e] })
    }
    const out = new Set<string>()
    for (const e of entities) {
        if (e.length <= 3) continue
        if (plain(e) && (!near.has(e) || generic(e)) ? seen(marked, e.toLowerCase()) : plain(e) ? seen(s, e.toLowerCase()) : s.includes(e.toLowerCase())) out.add(e)
    }
    for (const [t, { raw, es }] of tails) {
        if (es.length !== 1 || out.has(es[0])) continue
        if (seen(plain(raw) && (!near.has(es[0]) || generic(raw)) ? marked : s, t)) out.add(es[0])
    }
    return [...out]
}

const GENERIC = new Set(["components", "component", "views", "view", "pages", "page", "files", "file", "types", "type", "index", "main", "src", "lib", "libs", "utils", "util", "helpers", "shared", "data", "test", "tests", "models", "model", "services", "service", "domain", "api", "config", "store", "stores", "features", "feature", "modules", "module", "packages", "package", "code", "source", "java", "resources", "assets", "scripts"])

/** What a number is called, around it: which way a dependency runs, production or all, fixes or all commits. */
const LABELS: Array<{ id: string; a: RegExp; b: RegExp; say: (x: string, fact: "a" | "b") => string }> = [
    { id: "direction", a: /depended on by|dependents?\b|used by|imported by|importers?|fan-in/i, b: /depends on|dependenc(?:y|ies)|\buses\b|\bimports\b|fan-out/i,
        say: (x, f) => (f === "a" ? `${x} is what depends on it, not what it depends on` : `${x} is what it depends on, not what depends on it`) },
    { id: "scope", a: /\bproduction\b/i, b: /\btotal\b|\bin all\b|\bincluding\b|\ball files\b|\boverall\b/i,
        say: (x, f) => (f === "a" ? `${x} counts production code, not the total` : `${x} is a total, not production code`) },
]

/** The label nearest a number in a text, on either side: "a", "b", or null when nothing near says. */
function labelNear(text: string, num: string, l: (typeof LABELS)[number]): "a" | "b" | null {
    const i = text.indexOf(num)
    if (i < 0) return null
    const before = text.slice(Math.max(0, i - 40), i)
    const after = text.slice(i + num.length, i + num.length + 40)
    let best: { side: "a" | "b"; d: number } | null = null
    for (const side of ["a", "b"] as const) {
        const re = new RegExp(l[side].source, "gi")
        for (const m of before.matchAll(re)) { const d = before.length - (m.index! + m[0].length); if (!best || d < best.d) best = { side, d } }
        for (const m of after.matchAll(re)) { const d = m.index!; if (!best || d < best.d) best = { side, d } }
    }
    return best?.side ?? null
}

/** Numbers a sentence puts under another label than the fact that holds them. */
function mislabelled(sentence: string, nums: Array<{ value: number; text: string }>, cited: Fact[]): string[] {
    const out: string[] = []
    const plainSentence = sentence.replace(/\[[^\]]*\]/g, " ")
    for (const x of nums) {
        const forms = [x.text, x.value.toLocaleString("en-US")]
        const fact = cited.find(f => forms.some(n => new RegExp(`(?<![\\d.,])${n.replace(/[.,]/g, "\\$&")}(?![\\d])`).test(f.text)))
        if (!fact) continue
        const num = forms.find(n => fact.text.includes(n))!
        for (const l of LABELS) {
            const inFact = labelNear(fact.text, num, l)
            const inSentence = labelNear(plainSentence, x.text, l)
            if (inFact && inSentence && inFact !== inSentence) out.push(l.say(x.text, inFact))
        }
        // "Fix work" is a claim about fixes: the fact must count fixes, not all commits.
        if (/\bfix(?:es|ed)?\b|\bbug\s*fix/i.test(plainSentence) && !/\bfix|\bbug/i.test(fact.text) && /commits?|changes?|churn/i.test(fact.text)) out.push(`${x.text} counts all commits, not fixes`)
    }
    return [...new Set(out)]
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
    const citedExhibits = new Set(citesOf(text).map(c => c.split(".")[0]))
    const near = new Set(facts.filter(f => citedExhibits.has(f.id.split(".")[0])).flatMap(f => f.entities))
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
            const names = namesIn(sentence, allEntities, near)
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
                const wrongLabel = loose.length ? [] : mislabelled(sentence, nums, cited)
                for (const r of wrongLabel) reasons.push(r)
                verdict = loose.length || wrongLabel.length ? "unsupported" : strangers.length ? "partial" : nums.length || names.length ? "verified" : "cited"
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
