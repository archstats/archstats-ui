// Abstractness is abstract types over all types, and it only measures
// something where a language lets code declare a type abstract: interfaces
// and abstract classes in Java, Kotlin, C#, PHP and TypeScript, interfaces in
// Go. Python, plain JavaScript and Ruby abstract by convention -- duck typing,
// a base class nobody instantiates -- and declare nothing the scan can count,
// so their abstractness reads 0.00 whatever the design is. Distance from the
// main sequence and the zones inherit that zero.

const IMPLICIT: Record<string, string> = {
  py: "Python",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  rb: "Ruby",
}

const EXPLICIT = new Set(["java", "kt", "kts", "cs", "php", "ts", "tsx", "mts", "cts", "go"])

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase()
}

/**
 * The language a component is written in, when that language declares no
 * abstract types; null when it does, or when its files name no language
 * either way. The plurality of its files decides, so one Python script in a
 * Java component leaves the Java reading standing.
 */
export function implicitAbstractionLanguage(files: Iterable<string>): string | null {
  const counts = new Map<string, number>()
  for (const f of files) {
    const ext = extensionOf(f)
    const lang = IMPLICIT[ext] ?? (EXPLICIT.has(ext) ? "explicit" : null)
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best: string | null = null
  let most = 0
  for (const [lang, n] of counts) if (n > most) { most = n; best = lang }
  return best === "explicit" ? null : best
}
