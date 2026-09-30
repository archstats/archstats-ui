// An answer laid out: prose, and the exhibits it shows. The model places an
// exhibit with an embed line of its own, `![caption](exhibit:E3)`; an exhibit
// it cites without placing goes after the paragraph that first cites it. What
// lights up in a figure is what the prose beside it cites. The text is kept
// exactly as written; this is only how it is shown.

export type AnswerBlock =
    | { type: "prose"; text: string }
    | { type: "exhibit"; id: string; caption: string; cites: string[] }

export interface Layout {
    blocks: AnswerBlock[]
    /** Exhibits neither placed nor cited: offered below the answer, not drawn. */
    unplaced: string[]
}

/** The most figures drawn inside one answer; more are cited, not drawn. */
export const MAX_PLACED = 3

const EMBED = /^\s*!\[([^\]\n]*)\]\(exhibit:(E\d+)\)\s*$/
const CITE = /\bE(\d+)(?:\.(\d+))?\b/g

/** Paragraphs, with fenced code kept whole. */
function paragraphs(text: string): string[] {
    const out: string[] = []
    let cur: string[] = []
    let fenced = false
    for (const line of text.split("\n")) {
        if (/^\s*```/.test(line)) fenced = !fenced
        if (!fenced && !line.trim()) { if (cur.length) out.push(cur.join("\n")); cur = []; continue }
        cur.push(line)
    }
    if (cur.length) out.push(cur.join("\n"))
    return out
}

/** Every citation in a piece of prose: exhibit ids and fact ids as written. */
export function citesIn(text: string): string[] {
    return [...text.matchAll(CITE)].map(m => (m[2] ? `E${m[1]}.${m[2]}` : `E${m[1]}`))
}

const exhibitOf = (cite: string) => cite.split(".")[0]

export function layoutAnswer(answer: string, exhibitIds: ReadonlySet<string>, o: { streaming?: boolean } = {}): Layout {
    let paras = paragraphs(answer)
    // A paragraph still being written is not a place to put a figure yet.
    let settled = o.streaming && !answer.endsWith("\n\n") ? paras.length - 1 : paras.length
    // While it streams, a half-written embed line is not shown as text.
    if (o.streaming && paras.length) {
        const last = paras[paras.length - 1].split("\n")
        if (/^\s*!\[/.test(last[last.length - 1]) && !EMBED.test(last[last.length - 1])) {
            last.pop()
            paras = [...paras.slice(0, -1), ...(last.length ? [last.join("\n")] : [])]
            settled = Math.min(settled, paras.length)
        }
    }

    // Pass 1: explicit embeds, and the prose between them.
    type Item = { kind: "prose"; text: string } | { kind: "embed"; id: string; caption: string }
    const items: Item[] = []
    const explicit = new Set<string>()
    for (const p of paras) {
        const lines = p.split("\n")
        let prose: string[] = []
        for (const line of lines) {
            const m = line.match(EMBED)
            if (!m) { prose.push(line); continue }
            if (prose.length) { items.push({ kind: "prose", text: prose.join("\n") }); prose = [] }
            // An embed of an id no tool returned shows nothing.
            if (exhibitIds.has(m[2]) && !explicit.has(m[2]) && explicit.size < MAX_PLACED) { explicit.add(m[2]); items.push({ kind: "embed", id: m[2], caption: m[1].trim() }) }
        }
        if (prose.length) items.push({ kind: "prose", text: prose.join("\n") })
    }

    // Pass 2: cited exhibits nobody placed go after the paragraph that first cites them.
    const placed = new Set(explicit)
    const blocks: AnswerBlock[] = []
    let paraIndex = 0
    for (const [i, it] of items.entries()) {
        if (it.kind === "embed") {
            const near = [items[i - 1], items[i + 1]].filter((x): x is Extract<Item, { kind: "prose" }> => x?.kind === "prose")
            blocks.push({ type: "exhibit", id: it.id, caption: it.caption, cites: near.flatMap(x => citesIn(x.text)).filter(c => exhibitOf(c) === it.id) })
            continue
        }
        const last = blocks[blocks.length - 1]
        if (last?.type === "prose") last.text += `\n\n${it.text}`
        else blocks.push({ type: "prose", text: it.text })
        paraIndex++
        if (paraIndex > settled) continue
        const cites = citesIn(it.text)
        for (const id of [...new Set(cites.map(exhibitOf))]) {
            if (placed.has(id) || !exhibitIds.has(id) || placed.size >= MAX_PLACED) continue
            placed.add(id)
            blocks.push({ type: "exhibit", id, caption: "", cites: cites.filter(c => exhibitOf(c) === id) })
        }
    }

    const cited = new Set(citesIn(answer).map(exhibitOf))
    return { blocks, unplaced: [...exhibitIds].filter(id => !placed.has(id) && !cited.has(id)) }
}
