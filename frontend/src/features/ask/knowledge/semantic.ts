// Finding what a question means, not only the words it uses: "what breaks
// if I touch billing" should find blast radius though it shares no word with
// it. Keyword overlap and a local embedding model (nomic-embed-text through
// Ollama) are blended; without the model, keywords alone still work.

import { words } from "./capabilities"

export type Embed = (texts: string[]) => Promise<number[][]>

const cache = new Map<string, number[]>()

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return na && nb ? dot / Math.sqrt(na * nb) : 0
}

async function vectors(texts: string[], embed: Embed): Promise<number[][]> {
    const missing = texts.filter(t => !cache.has(t))
    if (missing.length) {
        const out = await embed(missing.map(t => `search_document: ${t}`))
        missing.forEach((t, i) => { if (out[i]) cache.set(t, out[i]) })
    }
    return texts.map(t => cache.get(t) ?? [])
}

export interface Scored<T> { item: T; score: number; keyword: number; semantic: number }

/**
 * Items for a question, best first. Keyword overlap (weighted by how rare a
 * word is) and cosine similarity are each scaled to 0–1 and averaged; an item
 * needs some sign of either to be returned.
 */
export async function hybridSearch<T>(question: string, items: T[], textOf: (t: T) => string, opts: { embed?: Embed; limit?: number } = {}): Promise<Array<Scored<T>>> {
    const q = new Set(words(question))
    const bags = items.map(t => new Set(words(textOf(t))))
    const df = new Map<string, number>()
    for (const b of bags) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1)
    const kw = bags.map(b => { let s = 0; for (const w of q) if (b.has(w)) s += Math.log(1 + items.length / (df.get(w) ?? 1)); return s })
    const kwMax = Math.max(1e-9, ...kw)
    let sem = items.map(() => 0)
    if (opts.embed) {
        try {
            const [qv] = await opts.embed([`search_query: ${question}`])
            const iv = await vectors(items.map(textOf), opts.embed)
            sem = iv.map(v => (v.length ? cosine(qv, v) : 0))
        } catch { /* no embedding model: keywords alone */ }
    }
    // Cosine of unrelated texts sits around 0.3–0.5 with nomic; spread the useful band.
    const semScaled = sem.map(s => Math.max(0, (s - 0.45) / 0.35))
    return items
        .map((item, i) => ({ item, keyword: kw[i] / kwMax, semantic: semScaled[i], score: (kw[i] / kwMax) * 0.5 + Math.min(1, semScaled[i]) * 0.5 }))
        .filter(x => x.keyword > 0 || x.semantic > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit ?? 3)
}
