// How a codebase writes its names. Component and unit names are
// identifiers, and each ecosystem joins their segments with its own
// delimiter: a dot in Java and Python, a slash where names follow
// directories, a backslash in PHP, "::" in Rust and C++.

export const SEPARATORS = ["::", "\\", "/", "."]

/** The delimiter that appears most across a set of names; a dot when none do. */
export function detectSeparator(ids: Iterable<string>): string {
  const seen = new Map<string, number>(SEPARATORS.map(s => [s, 0]))
  for (const id of ids) {
    for (const sep of SEPARATORS) {
      const n = id.split(sep).length - 1
      // A "::" also reads as two colons to nothing else, so only "." and "/"
      // ever compete on the same character, and they never co-occur.
      if (n) seen.set(sep, seen.get(sep)! + n)
    }
  }
  let best = "."
  let top = 0
  for (const sep of SEPARATORS) {
    const n = seen.get(sep)!
    if (n > top) { top = n; best = sep }
  }
  return best
}

/** Candidates for a name typed loosely: exact, any case, a tail, then a part. Shortest first. */
export function candidates(names: string[], asked: string): string[] {
    const q = String(asked ?? "").trim().replace(/^["'`]|["'`]$/g, "")
    if (!q) return []
    if (names.includes(q)) return [q]
    const lower = q.toLowerCase()
    const exact = names.filter(n => n.toLowerCase() === lower)
    if (exact.length) return exact
    const tail = names.filter(n => { const l = n.toLowerCase(); return l.endsWith(`.${lower}`) || l.endsWith(`/${lower}`) || l.endsWith(`::${lower}`) || l.endsWith(`\\${lower}`) })
    if (tail.length) return tail.sort((a, b) => a.length - b.length)
    return names.filter(n => n.toLowerCase().includes(lower)).sort((a, b) => a.length - b.length)
}

/** The names' shared prefix (`org.broadleafcommerce.`), so roots read as the project's own. */
export function commonPrefix(names: string[], sep: string): string {
    if (!names.length) return ""
    const parts = names.map(x => x.split(sep))
    const out: string[] = []
    for (let i = 0; ; i++) {
        const p = parts[0][i]
        if (p === undefined || parts.some(ps => ps[i] !== p || ps.length <= i + 1)) break
        out.push(p)
    }
    return out.length ? out.join(sep) + sep : ""
}

/** How component names are divided: `/` for paths, `::`, `\\`, else `.`. */
export function separatorOf(names: string[]): string {
    return names.some(x => x.includes("/")) && !names.some(x => x.includes(".") && !x.includes("/")) ? "/" : names.some(x => x.includes("::")) ? "::" : names.some(x => x.includes("\\")) ? "\\" : "."
}

/** Short names for prose and figures: the tail after the project's shared prefix. */
export function shortName(name: string): string {
    const parts = name.split(/(?<=[./\\])|(?<=::)/)
    if (parts.length <= 2) return name
    return parts.slice(-2).join("")
}

/**
 * What a name means as a scope: one component, or an area, the components
 * whose names continue it ("src/domains" → src/domains/seo, src/domains/follows…).
 * An exact component wins; a name many components start with is an area, never
 * quietly narrowed to the shortest of them.
 */
export function resolveScope(names: string[], asked: string): { kind: "component"; name: string } | { kind: "area"; name: string; members: string[] } | null {
    const q = String(asked ?? "").trim().replace(/[/.\\:]+$/, "")
    if (!q) return null
    const exact = names.find(n => n === q) ?? names.find(n => n.toLowerCase() === q.toLowerCase())
    if (exact) return { kind: "component", name: exact }
    const lower = q.toLowerCase()
    const under = names.filter(n => { const l = n.toLowerCase(); return [".", "/", "::", "\\"].some(sep => l.startsWith(lower + sep)) })
    if (under.length > 1) return { kind: "area", name: q, members: under }
    const c = candidates(names, q)[0]
    return c ? { kind: "component", name: c } : null
}
