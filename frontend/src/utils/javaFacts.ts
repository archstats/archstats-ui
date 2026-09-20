// Loads what the Java views know about every class: its file and component
// plus the facts the framework profiles read (annotations, supertypes,
// imports, legacy Spring/JPA markers, main methods, record and interface
// declarations, field and method counts). Shared by the Classes view and the
// group suggester so both classify a class the same way.

import { EMPTY_FACTS, type ClassFacts } from "~/utils/javaFrameworks"
import { sqlLiteral } from "~/utils/sql"

export interface RawClass {
  id: string
  name: string
  file: string
  component: string
  facts: ClassFacts
}

export type Query = (sql: string) => Promise<any[]>

export const LEGACY_TYPES = ["java__spring__controller", "java__spring__service", "java__spring__repository", "java__spring__component", "java__spring__configuration", "java__spring__bean", "java__jpa__entity"]
export const FACT_TYPES = ["java__class__annotation", "java__class__extends", "java__class__implements", "java__import__declaration", "java__record__declaration", "java__interface__declaration"]

export function shortName(fullClass: string): string {
  const parts = fullClass.split(".")
  return parts[parts.length - 1] || fullClass
}

/** Where the user's framework choice for a workspace is remembered. */
export function frameworkStorageKey(workspaceId: string | null | undefined, datasetKey: string | null | undefined): string {
  return `archstats.java.framework.${workspaceId ?? datasetKey ?? "default"}`
}

export function rememberedFramework(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export async function loadRawClasses(query: Query, hasView: (view: string) => boolean): Promise<Map<string, RawClass>> {
  const map = new Map<string, RawClass>()
  if (!hasView("files")) return map
  const rows: Array<{ name: string; component: string | null; java_class: string | null; java_full_class: string }> = await query(
    "SELECT name, component, java_class, java_full_class FROM files WHERE java_full_class IS NOT NULL AND java_full_class != ''",
  )
  type Facts = { annotations: Set<string>; supertypes: Set<string>; legacy: Set<string>; imports: Set<string>; methods: Set<string>; fields: number; methodCount: number; isRecord: boolean; isInterface: boolean }
  const facts = new Map<string, Facts>()
  const factsFor = (file: string) => {
    let f = facts.get(file)
    if (!f) { f = { annotations: new Set(), supertypes: new Set(), legacy: new Set(), imports: new Set(), methods: new Set(), fields: 0, methodCount: 0, isRecord: false, isInterface: false }; facts.set(file, f) }
    return f
  }
  if (hasView("snippets")) {
    const types = [...LEGACY_TYPES, ...FACT_TYPES].map((t) => sqlLiteral(t)).join(", ")
    const [snippets, mains, counts] = await Promise.all([
      query(`SELECT DISTINCT file, snippet_type, content FROM snippets WHERE snippet_type IN (${types})`) as Promise<Array<{ file: string; snippet_type: string; content: string | null }>>,
      query("SELECT DISTINCT file FROM snippets WHERE snippet_type = 'java__method__declaration' AND content = 'main'") as Promise<Array<{ file: string }>>,
      query("SELECT file, snippet_type, count(*) AS n FROM snippets WHERE snippet_type IN ('java__field__declaration', 'java__method__declaration') GROUP BY file, snippet_type") as Promise<Array<{ file: string; snippet_type: string; n: number }>>,
    ])
    for (const sn of snippets) {
      const f = factsFor(sn.file)
      const c = sn.content?.trim() ?? ""
      switch (sn.snippet_type) {
        case "java__class__annotation": if (c) f.annotations.add(c); break
        case "java__class__extends": case "java__class__implements": if (c) f.supertypes.add(c); break
        case "java__import__declaration": if (c) f.imports.add(c); break
        case "java__record__declaration": f.isRecord = true; break
        case "java__interface__declaration": f.isInterface = true; break
        default: f.legacy.add(sn.snippet_type)
      }
    }
    for (const m of mains) factsFor(m.file).methods.add("main")
    for (const c of counts) { const f = factsFor(c.file); if (c.snippet_type === "java__field__declaration") f.fields = Number(c.n) || 0; else f.methodCount = Number(c.n) || 0 }
  }
  for (const r of rows) {
    const name = r.java_class || shortName(r.java_full_class)
    const f = facts.get(r.name)
    map.set(r.java_full_class, { id: r.java_full_class, name, file: r.name, component: r.component || "", facts: { ...EMPTY_FACTS, ...(f ?? {}), name } })
  }
  return map
}
