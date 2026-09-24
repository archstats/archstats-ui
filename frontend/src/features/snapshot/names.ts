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
