// Build modules: the units the build declares (a pom.xml, a package.json, a
// Django app), read from the snapshot's modules table. A file belongs to the
// module whose directory is the longest prefix of its path, so two modules
// that share a name stay two modules, and a module nested in another keeps
// its own files.

export interface BuildModule {
    name: string
    kind: string
    directory: string
    manifest: string
    /** Names of the modules it declares a dependency on. */
    dependsOn: string[]
}

export function parseModules(rows: Array<{ name: string; kind: string; directory: string; manifest: string; depends_on: string | null }>): BuildModule[] {
    return rows.map(r => ({
        name: String(r.name),
        kind: String(r.kind ?? ""),
        directory: String(r.directory ?? "").replace(/^\.\/?/, "").replace(/\/$/, ""),
        manifest: String(r.manifest ?? ""),
        dependsOn: String(r.depends_on ?? "").split(",").map(x => x.trim()).filter(Boolean),
    }))
}

/** Files by module, keyed by directory (module identity); files under no module are left out. */
export function assignFiles(modules: BuildModule[], files: string[]): Map<string, string[]> {
    const dirs = [...modules].sort((a, b) => b.directory.length - a.directory.length)
    const out = new Map<string, string[]>(modules.map(m => [m.directory, []]))
    for (const f of files) {
        const m = dirs.find(d => d.directory === "" || f === d.directory || f.startsWith(`${d.directory}/`))
        if (m) out.get(m.directory)!.push(f)
    }
    return out
}

/** A module that exists to be tested against, not shipped: under a test or fixture directory. */
export function isFixture(m: BuildModule): boolean {
    return /(^|\/)(tests?|test_?data|fixtures?|_site|examples?|samples?|testing)(\/|$)/i.test(m.directory)
}

/** The ecosystems, most modules first: "13 maven", "38 django · 2 node". */
export function ecosystems(modules: BuildModule[]): Array<{ kind: string; count: number }> {
    const by = new Map<string, number>()
    for (const m of modules) by.set(m.kind || "other", (by.get(m.kind || "other") ?? 0) + 1)
    return [...by].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}

/**
 * How `from` reaches `to` through declared dependencies, when it does not
 * declare `to` itself: the modules in between, or null when it cannot.
 */
export function declaredVia(from: string, to: string, deps: Map<string, string[]>): string[] | null {
    const prev = new Map<string, string>()
    const queue = [from]
    const seen = new Set([from])
    while (queue.length) {
        const cur = queue.shift()!
        for (const next of deps.get(cur) ?? []) {
            if (seen.has(next)) continue
            seen.add(next)
            prev.set(next, cur)
            if (next === to) {
                const path: string[] = []
                for (let x = prev.get(to)!; x !== from; x = prev.get(x)!) path.unshift(x)
                return path
            }
            queue.push(next)
        }
    }
    return null
}
