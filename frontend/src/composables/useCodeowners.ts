import { computed } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useAuthorsStore } from "~/stores/authors"
import { useDataStore } from "~/stores/data"
import { CODEOWNERS_PATHS, ownerSets, parseCodeowners } from "~/utils/codeowners"
import { sqlLiteral } from "~/utils/sql"
import type { Suggestion } from "~/utils/suggest"

// The repository's own answer to "who owns what": its CODEOWNERS file, read
// from the snapshot's kept sources, turned into one proposed group per owner
// set. Owners are handles, so they go through the pseudonyms like any name.

export function useCodeowners() {
    const data = useDataStore()
    const authors = useAuthorsStore()

    const { data: found, loading } = useAsyncQuery<{ path: string; text: string } | null>(async () => {
        if (!data.hasView("file_contents")) return null
        const rows = await data.query<{ file: string; content: string }>(
            `SELECT file, content FROM file_contents WHERE file IN (${CODEOWNERS_PATHS.map(sqlLiteral).join(", ")})`)
        for (const p of CODEOWNERS_PATHS) {
            const r = rows.find(x => x.file === p)
            if (r) return { path: p, text: String(r.content ?? "") }
        }
        return null
    }, [() => data.datasetKey], { initial: null })

    const parsed = computed(() => (found.value ? parseCodeowners(found.value.text) : null))
    const files = computed(() => data._fileComponents.map(f => f.name))
    const owned = computed(() => (parsed.value ? ownerSets(parsed.value, files.value) : null))
    /** A file whose only rule is `*`: every file in one group, which is worth saying. */
    const singleRule = computed(() => !!parsed.value && parsed.value.rules.length === 1 && parsed.value.rules[0].pattern.replace(/^\//, "") === "*")

    const ownersLabel = (owners: string[]) => owners.map(o => authors.displayText(o)).join(", ")
    const lookedIn = `looked in ${CODEOWNERS_PATHS.map(p => p.replace(/CODEOWNERS$/, "") || "the root").join(", ")}`

    /** One suggestion per owner set, made of files: a component two teams share is divided between them. */
    const suggestions = computed<Suggestion[]>(() => {
        if (!owned.value || !parsed.value) return []
        const compOf = data.fileComponentIndex
        const filesOf = data.componentFilesIndex
        return owned.value.sets.map((s, i) => {
            const byComp = new Map<string, string[]>()
            for (const f of s.files) { const c = compOf.get(f); if (c) byComp.set(c, [...(byComp.get(c) ?? []), f]) }
            const parts = [...byComp].map(([component, fs]) => ({ component, files: fs, total: filesOf.get(component)?.length ?? fs.length }))
            const rules = s.lines.map(l => parsed.value!.rules.find(r => r.line === l)!).filter(Boolean)
            return {
                key: `owners-${i}`,
                name: ownersLabel(s.owners),
                parts,
                components: parts.filter(p => p.files.length * 2 >= p.total).map(p => p.component),
                reasons: rules.map(r => ({ signal: "path" as any, text: `${found.value!.path} line ${r.line}: ${r.pattern}`, share: 1 })),
                units: s.files.length,
                split: parts.filter(p => p.files.length < p.total).length,
            }
        })
    })

    const reason = computed(() => {
        if (loading.value) return "Reading…"
        if (!data.hasView("file_contents")) return "This snapshot kept no source, so there is no CODEOWNERS to read."
        if (!found.value) return `No CODEOWNERS in this snapshot (${lookedIn}).`
        if (!parsed.value?.rules.length) return `${found.value.path} has no rules.`
        return null
    })

    return { found, parsed, owned, singleRule, suggestions, reason, ownersLabel, lookedIn }
}
