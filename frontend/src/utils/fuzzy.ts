// Subsequence matching for Go to anything: "ordsvcimpl" finds
// OrderServiceImpl.java. Characters must appear in order; matches in the last
// path segment, at word starts and in runs score higher, so the name a person
// remembers beats a long path that happens to contain the letters.

export interface Scored<T> { item: T; score: number }

const isBoundary = (prev: string, ch: string) =>
    prev === "" || /[\/\\._\-\s:]/.test(prev) || (prev === prev.toLowerCase() && ch !== ch.toLowerCase())

/**
 * A score for `query` in `text`, or null when it does not match. `tail` is
 * where the last segment starts; by default after the last slash, so a file's
 * name counts and its extension does not end the segment.
 *
 * Several alignments are tried and the best kept: letters matched from the
 * right land in the name at the end of a path, from the left in a name read
 * forwards, and an exact run wherever the query appears whole.
 */
export function fuzzyScore(query: string, text: string, tail = text.lastIndexOf("/")): number | null {
    const q = query.toLowerCase().replace(/\s+/g, "")
    if (!q) return 0
    const lower = text.toLowerCase()
    const rtl: number[] = new Array(q.length)
    let qi = q.length - 1
    for (let i = text.length - 1; i >= 0 && qi >= 0; i--) if (lower[i] === q[qi]) rtl[qi--] = i
    if (qi >= 0) return null
    const ltr: number[] = new Array(q.length)
    qi = 0
    for (let i = 0; i < text.length && qi < q.length; i++) if (lower[i] === q[qi]) ltr[qi++] = i
    let best = Math.max(alignmentScore(text, rtl, tail), alignmentScore(text, ltr, tail))
    for (let from = lower.indexOf(q), n = 0; from >= 0 && n < 4; from = lower.indexOf(q, from + 1), n++) {
        best = Math.max(best, alignmentScore(text, Array.from(q, (_, k) => from + k), tail))
    }
    if (lower.endsWith(q) || lower.includes(`/${q}`)) best += 5
    return best - text.length * 0.02
}

function alignmentScore(text: string, at: number[], tail: number): number {
    let score = 0, run = 0, pieces = 1
    for (let k = 0; k < at.length; k++) {
        const i = at[k]
        let s = 1
        const boundary = isBoundary(i > 0 ? text[i - 1] : "", text[i])
        if (boundary) s += 3
        if (k > 0 && at[k - 1] === i - 1) { run++; s += run * 2 } else if (k > 0) { run = 0; pieces++; if (!boundary) s -= 2 }
        if (i > tail) s += 2
        score += s
    }
    if (at[0] === 0) score += 3
    // Letters spread thin read as a coincidence, not a name.
    return score - (pieces - 1) * 1.5 - Math.min(15, (at[at.length - 1] - at[0] + 1 - at.length) * 0.15)
}

export function fuzzyRank<T>(query: string, items: T[], text: (t: T) => string, limit = 50, tail?: (t: T) => number): Array<Scored<T>> {
    const out: Array<Scored<T>> = []
    for (const item of items) {
        const s = fuzzyScore(query, text(item), tail?.(item))
        if (s !== null) out.push({ item, score: s })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
