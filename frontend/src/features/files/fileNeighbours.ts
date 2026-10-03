// A file's neighbours: the files it uses, the files that use it (both from the
// resolved references between units), and the files that change with it
// (pairs that shared enough commits). The sidebar lists them under the files
// so a reader can walk the code the way it is wired, not only the way it is
// filed.

import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { sqlLiteral } from "~/shared/sql"

export interface Neighbour {
    file: string
    component: string
    health: number | null
    /** References for uses and used-by, shared commits for changes-with. */
    weight: number
}

export interface Neighbours {
    uses: Neighbour[]
    usedBy: Neighbour[]
    /** Null when the snapshot has no history. */
    changesWith: Neighbour[] | null
}

/** Root-level files are named "./pom.xml" in one table and "pom.xml" in another. */
export function samePath(path: string): string {
    return path.startsWith("./") ? path.slice(2) : path
}

export function useFileNeighbours(filePath: Ref<string>) {
    const store = useDataStore()
    const { data } = useAsyncQuery<Neighbours | null>(
        async () => {
            if (!filePath.value) return null
            const file = sqlLiteral(samePath(filePath.value))
            const hasRefs = store.hasColumn("unit_connections", "from_file")
            const hasHistory = store.hasColumn("git_file_shared_commits", "shared_commits")
            const [uses, usedBy, changes] = await Promise.all([
                hasRefs ? store.query<{ file: string; component: string; weight: number }>(
                    `SELECT to_file AS file, max(to_component) AS component, count(*) AS weight FROM unit_connections
                     WHERE from_file = ${file} AND to_file != '' AND to_file != from_file GROUP BY to_file ORDER BY weight DESC, to_file`) : [],
                hasRefs ? store.query<{ file: string; component: string; weight: number }>(
                    `SELECT from_file AS file, max(from_component) AS component, count(*) AS weight FROM unit_connections
                     WHERE to_file = ${file} AND from_file != '' AND to_file != from_file GROUP BY from_file ORDER BY weight DESC, from_file`) : [],
                hasHistory ? store.query<{ file: string; weight: number }>(
                    `SELECT CASE WHEN file_1 = ${file} THEN file_2 ELSE file_1 END AS file, shared_commits AS weight FROM git_file_shared_commits
                     WHERE file_1 = ${file} OR file_2 = ${file} ORDER BY weight DESC LIMIT 60`) : null,
            ])
            const names = [...new Set([...uses, ...usedBy, ...(changes ?? [])].map(n => samePath(n.file)))]
            const health = new Map<string, number | null>()
            if (names.length && store.hasColumn("files", "codesmells__code_health")) {
                const list = names.map(n => sqlLiteral(n)).join(", ")
                const dotted = names.map(n => sqlLiteral(`./${n}`)).join(", ")
                for (const r of await store.query<{ name: string; h: number | null }>(`SELECT name, codesmells__code_health AS h FROM files WHERE name IN (${list}) OR name IN (${dotted})`)) {
                    health.set(samePath(r.name), r.h === null ? null : Number(r.h))
                }
            }
            const shape = (rows: Array<{ file: string; component?: string; weight: number }>): Neighbour[] => rows.map(r => ({
                file: samePath(r.file),
                component: r.component || store.fileComponentIndex.get(r.file) || store.fileComponentIndex.get(`./${r.file}`) || "",
                health: health.get(samePath(r.file)) ?? null,
                weight: Number(r.weight) || 0,
            }))
            return { uses: shape(uses), usedBy: shape(usedBy), changesWith: changes ? shape(changes) : null }
        },
        [filePath, () => store.datasetKey],
        { initial: null },
    )
    return computed(() => data.value)
}
