// What an architect finds their way by, read from a snapshot: where the
// outside world gets in, what the code stores and who touches it, what
// implements what and where it is wired, what the team wrote down, and the
// units the rest of the code leans on. The engine reads the facts (analysis
// revision 13); the exhibits here put them in words. Shared helpers.

import type { Snapshot } from "~/features/snapshot/snapshot"
import type { Absent } from "~/features/exhibits/types"
import { sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

/** The revision that first wrote the navigation tables. */
export const NAVIGATION_REVISION = 13

/**
 * Absent when the snapshot lacks a table (or a column of it): written before
 * the engine read it, so scanning again is the fix, said plainly.
 */
export function needs(snap: Snapshot, table: string, column?: string): Absent | null {
    const cols = snap.columns[table]
    if (cols && (!column || cols.includes(column))) return null
    return { absent: t("landmarks.common.olderSnapshot", { revision: Number(snap.info.analysis_revision ?? 0), needed: NAVIGATION_REVISION }) }
}

export const esc = sq

/** "OrderController" from "com.acme.web.OrderController", "shop/views#BasketView", "src/x.ts#Foo.bar". */
export function unitName(id: string): string {
    const hash = id.lastIndexOf("#")
    if (hash >= 0) return id.slice(hash + 1)
    const dot = id.lastIndexOf(".")
    const slash = id.lastIndexOf("\\")
    return id.slice(Math.max(dot, slash) + 1) || id
}

/** file:line, or the file when the line is unknown. */
export const at = (file: string, line?: number | null) => (line ? `${file}:${line}` : file)

/** A list said in words, cut at max with "and N more". */
export function listOf(items: string[], max = 4): string {
    if (items.length <= max) return items.join(", ")
    return t("landmarks.common.andMore", { list: items.slice(0, max).join(", "), count: items.length - max })
}

/** Components under a name: the component itself and those whose name continues it. */
export function within(names: string[], of: string): string[] {
    return names.filter(n => n === of || n.startsWith(`${of}.`) || n.startsWith(`${of}/`) || n.startsWith(`${of}\\`) || n.startsWith(`${of}::`))
}

/** SQL for "this component or any under it". */
export const underSql = (column: string, of: string) => `(${column} = ${esc(of)} OR ${column} LIKE ${esc(`${of}.%`)} OR ${column} LIKE ${esc(`${of}/%`)})`

/** Unit rows rolled up to the unit that owns them: a method counts for its class. */
export function rollUp(owners: Map<string, string>): (id: string) => string {
    const memo = new Map<string, string>()
    return (id: string) => {
        const hit = memo.get(id)
        if (hit) return hit
        let cur = id
        for (let i = 0; i < 12; i++) {
            const o = owners.get(cur)
            // Stop at a unit that belongs to nothing, or to something that is not a unit.
            if (!o || o === cur || !owners.has(o)) break
            cur = o
        }
        memo.set(id, cur)
        return cur
    }
}

/** A production file: tests, generated and vendored code are not what the system does. */
export const isProduction = (snap: Snapshot, file: string) => {
    const role = snap.fileRole(file)
    return role !== "test" && role !== "generated" && role !== "third_party"
}

const productionCache = new WeakMap<Snapshot, Set<string>>()

/**
 * Components that are mostly production code: a test suite is a large,
 * highly connected part of a codebase, and left in it becomes the biggest
 * area, the strongest rule and the loudest surprise, none of which describe
 * the system.
 */
export function productionComponents(snap: Snapshot): Set<string> {
    const hit = productionCache.get(snap)
    if (hit) return hit
    const counts = new Map<string, { all: number; test: number }>()
    for (const [file, comp] of snap.fileComponent()) {
        const c = counts.get(comp) ?? { all: 0, test: 0 }
        c.all++
        if (!isProduction(snap, file)) c.test++
        counts.set(comp, c)
    }
    const out = new Set<string>()
    for (const c of snap.components()) {
        const name = String(c.name)
        const k = counts.get(name)
        if (!k || k.test / k.all < 0.5) out.add(name)
    }
    productionCache.set(snap, out)
    return out
}
