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

    const [units, markers, javaImports] = await Promise.all([
        query("SELECT id, kind, name, component, owner, file FROM units") as Promise<UnitRow[]>,
        hasView("unit_markers")
            ? query("SELECT unit, source, key, value FROM unit_markers") as Promise<MarkerRow[]>
            : Promise.resolve([] as MarkerRow[]),
        loadJavaImports(query, hasView),
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
                // Raw import strings, which only Java keeps unresolved. Every
                // other pack resolves an import to the component it names, so
                // the framework profiles that detect by import prefix only
                // fire on Java — everywhere else detection falls through to
                // the structural profile, which reads what the code does.
                imports: javaImports.get(file) ?? new Set<string>(),
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

/** The last segment of an id, for a unit the engine gave no name. */
function shortId(id: string): string {
    const afterHash = id.split("#").pop() ?? id
    return afterHash.split(".").pop() || afterHash
}

// Java keeps its imports as their own snippet type, unresolved, because the
// framework profiles detect by package prefix: `org.springframework.web` says
// what a codebase is built on far more reliably than any one annotation.
async function loadJavaImports(query: Query, hasView: (view: string) => boolean): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>()
    if (!hasView("snippets")) return out
    const rows = await query(
        "SELECT DISTINCT file, content FROM snippets WHERE snippet_type = 'java__import__declaration'",
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
