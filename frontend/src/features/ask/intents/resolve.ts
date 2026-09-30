// A name as the person typed it, to the thing it means: exactly one, or the
// candidates to choose from. An intent never guesses between two components
// that both end in "core".

import type { Snapshot } from "~/features/snapshot/snapshot"

export type Resolved = { kind: "component" | "file"; name: string; also: string[] } | { ambiguous: string[] } | { none: true }

const looksLikeFile = (x: string) => /\/|\.[a-z0-9]{1,6}$/i.test(x.trim())

function tiers(names: string[], asked: string): string[][] {
    const q = asked.trim().replace(/^["'`]|["'`]$/g, "")
    const lower = q.toLowerCase()
    const exact = names.filter(x => x === q)
    const anyCase = names.filter(x => x.toLowerCase() === lower)
    const tail = names.filter(x => { const l = x.toLowerCase(); return [".", "/", "::", "\\"].some(sep => l.endsWith(`${sep}${lower}`)) })
    // A part of a name, where a part starts: "ask" finds features/ask and ask.store, never tasks/acceptance.
    const esc = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const part = names.filter(x => new RegExp(`(?:^|[./\\\\:_-])${esc}`).test(x.toLowerCase())).sort((a, b) => a.length - b.length)
    return [exact, anyCase, tail, part]
}

export function resolveName(snap: Snapshot, asked: string, prefer: "component" | "file" | "any" = "any"): Resolved {
    const comps = snap.components().map(c => String(c.name)).filter(x => x !== ".")
    const files = [...snap.fileComponent().keys()]
    const order: Array<["component" | "file", string[][]]> = (prefer === "file" || (prefer === "any" && looksLikeFile(asked)) ? [["file", files], ["component", comps]] as const : [["component", comps], ["file", files]] as const)
        .map(([kind, names]) => [kind, tiers(names, asked)])
    // Tier by tier across both kinds: an exact component name beats a file that merely contains it.
    for (let i = 0; i < 4; i++) {
        for (const [kind, t] of order) {
            const hits = t[i]
            if (!hits.length) continue
            // Exact and any-case hits are the one meant. Two equal tails are a real choice.
            if (i === 2 && hits.length > 1) return { ambiguous: hits.slice(0, 6) }
            return { kind, name: hits[0], also: i === 3 ? hits.slice(1, 5) : [] }
        }
    }
    return { none: true }
}

/**
 * A component whose name also heads others ("common" and common.util,
 * common.web…) is two things: the one component, and the area of all of
 * them. Said to the model, so an answer about the area never rests on the
 * one component's figures.
 */
export function areaNote(snap: Snapshot, name: string): string | null {
    const lower = name.toLowerCase()
    const under = snap.components().map(c => String(c.name)).filter(x => { const l = x.toLowerCase(); return l !== lower && [".", "/", "::", "\\"].some(sep => l.startsWith(lower + sep)) })
    if (under.length < 2) return null
    return `Note: ${name} is one component, and also the start of ${under.length} others (${under.slice(0, 3).join(", ")}…), an area. These figures are about the one component. If the person means the area (a floor of the stack), answer from structure with of: "${name}", and say which one you mean.`
}

/** What an intent says when a name does not resolve to one thing. */
export function unresolved(asked: string, r: Resolved): string | null {
    if ("ambiguous" in r) return `"${asked}" could be any of: ${r.ambiguous.join(", ")}. Ask the person which one they mean (ask_user), or use the full name.`
    if ("none" in r) return `Nothing is named "${asked}": no component or file matches. Try search with part of the name.`
    return null
}
