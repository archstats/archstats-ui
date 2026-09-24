// Loading units, whatever language declared them.
//
// The Classes view was built when the only thing the engine could name was a
// Java type: one file, one public type, a `java_full_class` stat on the files
// table. That is a coincidence of Java, not a fact about code. nopCommerce
// declares 1,567 partial classes, gin is 1,327 functions to 204 types, and
// LibreChat is 3,241 to 294 — a view of classes shows fourteen things there.
//
// The engine now records units: a named thing carrying its kind, the files it
// is declared in, what it belongs to, and untyped markers. This turns those
// into the shape the view already reads, so one loader serves every language.

import { EMPTY_FACTS, type ClassFacts } from "~/utils/javaFrameworks"
import { loadRawClasses, type Query, type RawClass } from "~/utils/javaFacts"

/** A unit row, as the engine's `units` view gives it. */
interface UnitRow {
    id: string
    kind: string
    name: string
    component: string | null
    owner: string | null
    file: string | null
}

interface MarkerRow {
    unit: string
    source: string
    key: string
    value: string | null
}

export const KIND_TYPE = "type"
export const KIND_FUNCTION = "function"

/**
 * Every unit in the snapshot, keyed by id.
 *
 * Falls back to the Java-only path for snapshots taken before units existed,
 * which is every snapshot older than this. A view that went blank on an old
 * scan would look like a bug rather than an old scan.
 */
export async function loadUnits(query: Query, hasView: (view: string) => boolean): Promise<Map<string, RawClass>> {
    if (!hasView("units")) return loadRawClasses(query, hasView)

    const [units, markers, rawImports, uses] = await Promise.all([
        query("SELECT id, kind, name, component, owner, file FROM units") as Promise<UnitRow[]>,
        hasView("unit_markers")
            ? query("SELECT unit, source, key, value FROM unit_markers") as Promise<MarkerRow[]>
            : Promise.resolve([] as MarkerRow[]),
        loadRawImports(query, hasView),
        hasView("unit_uses")
            ? query("SELECT unit, module FROM unit_uses") as Promise<Array<{ unit: string; module: string }>>
            : Promise.resolve(null),
    ])
    if (units.length === 0) return loadRawClasses(query, hasView)

    const annotations = new Map<string, Set<string>>()
    const supertypes = new Map<string, Set<string>>()
    for (const m of markers) {
        const key = (m.key ?? "").trim()
        if (!key) continue
        // Source is kept rather than flattened: "filename:models" is a
        // weaker claim than "annotation:Entity", and the lane rules read
        // them differently.
        const into = m.source === "supertype" ? supertypes : annotations
        let set = into.get(m.unit)
        if (!set) { set = new Set(); into.set(m.unit, set) }
        set.add(key)
    }

    // How many things belong to each unit: a Go method's receiver, a class's
    // methods. The engine records the relationship on the owned unit.
    const memberCount = new Map<string, number>()
    for (const u of units) {
        if (!u.owner) continue
        memberCount.set(u.owner, (memberCount.get(u.owner) ?? 0) + 1)
    }

    // The modules each top-level unit uses, its members' included: a Go
    // store's methods are where it calls database/sql.
    const usedModules = new Map<string, Set<string>>()
    if (uses) {
        const ownerOf = new Map(units.map((u) => [u.id, u.owner]))
        for (const r of uses) {
            if (!r.unit || !r.module) continue
            let top = r.unit
            for (let hops = 0; ownerOf.get(top) && hops < 8; hops++) top = ownerOf.get(top)!
            let set = usedModules.get(top)
            if (!set) { set = new Set(); usedModules.set(top, set) }
            set.add(r.module)
        }
    }

    const out = new Map<string, RawClass>()
    for (const u of units) {
        // A method is reached through the type it belongs to; listing it
        // beside its owner would double every Go and TypeScript codebase.
        if (u.owner) continue

        const marks = annotations.get(u.id) ?? new Set<string>()
        const supers = supertypes.get(u.id) ?? new Set<string>()
        const file = u.file ?? ""
        out.set(u.id, {
            id: u.id,
            name: u.name || shortId(u.id),
            file,
            component: u.component || "",
            facts: {
                ...EMPTY_FACTS,
                name: u.name || shortId(u.id),
                annotations: marks,
                supertypes: supers,
                // What the file actually asked for, before the component
                // linker rewrote it. Every pack records these now, which is
                // what lets the framework profiles detect by import prefix
                // outside Java: `@nestjs/common`, `django`, `Illuminate\\`
                // say what a codebase is built on far more reliably than any
                // one decorator.
                imports: rawImports.get(file) ?? new Set<string>(),
                ...(uses ? { usedImports: importsUsed(rawImports.get(file), usedModules.get(u.id)) } : {}),
                methods: new Set<string>(),
                methodCount: memberCount.get(u.id) ?? 0,
                fields: 0,
                isInterface: supers.has("interface"),
                isRecord: false,
            } satisfies ClassFacts,
        })
    }
    return out
}

/**
 * The file's imports that name a module the unit uses. An import may be the
 * module itself (`database/sql`, `@nestjs/common`) or a name inside it
 * (`org.springframework.stereotype.Service` for the module
 * `org.springframework.stereotype`), and a wildcard import names the module
 * as its prefix.
 */
export function importsUsed(imports: ReadonlySet<string> | undefined, modules: ReadonlySet<string> | undefined): Set<string> {
    const out = new Set<string>()
    if (!imports || !modules || modules.size === 0) return out
    for (const imp of imports) {
        const bare = imp.replace(/\.\*$/, "")
        for (const m of modules) {
            // "." for Java and Kotlin, "/" for Go and TypeScript, "\\" for PHP.
            if (bare === m || [".", "/", "\\"].some((sep) => bare.startsWith(m + sep) || m.startsWith(bare + sep))) {
                out.add(imp)
                break
            }
        }
    }
    return out
}

/** The last segment of an id, for a unit the engine gave no name. */
function shortId(id: string): string {
    const afterHash = id.split("#").pop() ?? id
    return afterHash.split(".").pop() || afterHash
}

// The import as the source wrote it.
//
// The component linker rewrites imports in place to the component they
// resolve to, which is what makes a component graph and what destroys the
// evidence of what a file actually asked for. Every pack now records the
// original under its own name so it survives, which is what lets framework
// detection work outside Java: `@nestjs/common`, `django` and `Illuminate\`
// say what a codebase is built on far more reliably than any one decorator.
//
// Java's own snippet type is read as well, so a snapshot taken before the
// neutral name existed still detects Spring.
async function loadRawImports(query: Query, hasView: (view: string) => boolean): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>()
    if (!hasView("snippets")) return out
    const rows = await query(
        "SELECT DISTINCT file, content FROM snippets WHERE snippet_type IN ('modularity__import__raw', 'java__import__declaration')",
    ) as Array<{ file: string; content: string | null }>
    for (const r of rows) {
        const content = r.content?.trim()
        if (!content) continue
        let set = out.get(r.file)
        if (!set) { set = new Set(); out.set(r.file, set) }
        set.add(content)
    }
    return out
}
