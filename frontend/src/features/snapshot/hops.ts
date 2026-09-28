// How many hops a stored dependency path takes, read from the path itself.
//
// The engine's path lengths counted the components on the path rather than
// the steps between them, so a direct dependency read 2 and the component
// page said "Furthest reach 8 hops" beside the seven-hop path it listed.
// Current engines store hops. Counting the arrows is right for both, so no
// view needs to know which engine made the snapshot.
export function hopsOf(path: string | null | undefined, fallback?: number | string | null): number {
  if (path) return path.split(" -> ").length - 1
  return Number(fallback) || 0
}

/**
 * The route between two components, walked from next_hop (analysis revision
 * 4 on): the row for (from, to) names the first step, the row for (that
 * step, to) the next, and so on to `to`. `towards` maps each component to
 * its next hop towards `to`. Empty when `from` does not reach `to`.
 */
export function walkNextHops(towards: Map<string, string>, from: string, to: string): string[] {
  const steps = [from]
  for (let at = from; at !== to;) {
    const next = towards.get(at)
    // Every step lands one hop closer, so a repeat means rows from two scans.
    if (!next || steps.includes(next)) return []
    steps.push(next)
    at = next
  }
  return steps.length > 1 ? steps : []
}
