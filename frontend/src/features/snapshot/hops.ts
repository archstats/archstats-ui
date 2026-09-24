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
