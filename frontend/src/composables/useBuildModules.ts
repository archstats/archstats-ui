import { computed, ref } from "vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useDataStore } from "~/stores/data"
import { assignFiles, ecosystems, isFixture, parseModules, type BuildModule } from "~/utils/modules"
import type { Suggestion } from "~/utils/suggest"

// The build's own modules as a proposed lens: one file-grain group per module,
// test fixtures left out unless asked for.

export function useBuildModules() {
    const data = useDataStore()
    const { data: rows, loading } = useAsyncQuery<BuildModule[]>(
        async () => (data.hasView("modules")
            ? parseModules(await data.query("SELECT name, kind, directory, manifest, depends_on FROM modules"))
            : []),
        [() => data.datasetKey],
        { initial: [] },
    )
    const withFixtures = ref(false)
    const fixtures = computed(() => rows.value.filter(isFixture))
    const modules = computed(() => (withFixtures.value ? rows.value : rows.value.filter(m => !isFixture(m))))
    const filesByDir = computed(() => assignFiles(rows.value, data._fileComponents.map(f => f.name)))
    const kinds = computed(() => ecosystems(modules.value))
    const kindsText = computed(() => kinds.value.map(k => `${k.count} ${k.kind}`).join(" · "))

    /** Names that repeat get their directory, so the lens has one group per module. */
    const nameOf = (m: BuildModule) => (rows.value.filter(x => x.name === m.name).length > 1 ? `${m.name} (${m.directory || "root"})` : m.name)

    const suggestions = computed<Suggestion[]>(() => {
        const compOf = data.fileComponentIndex
        const filesOf = data.componentFilesIndex
        return modules.value.map((m, i) => {
            const files = filesByDir.value.get(m.directory) ?? []
            const byComp = new Map<string, string[]>()
            for (const f of files) { const c = compOf.get(f); if (c) byComp.set(c, [...(byComp.get(c) ?? []), f]) }
            const parts = [...byComp].map(([component, fs]) => ({ component, files: fs, total: filesOf.get(component)?.length ?? fs.length }))
            return {
                key: `module-${i}`,
                name: nameOf(m),
                parts,
                components: parts.filter(p => p.files.length * 2 >= p.total).map(p => p.component),
                reasons: [{ signal: "path" as any, text: `${m.kind} module declared by ${m.manifest || m.directory}`, share: 1 }],
                units: files.length,
                split: parts.filter(p => p.files.length < p.total).length,
            }
        }).filter(s => s.units > 0)
    })

    const reason = computed(() => {
        if (loading.value) return "Reading…"
        if (!data.hasView("modules")) return "This snapshot records no build modules; scan again to read the manifests."
        if (!rows.value.length) return "No build modules; observed structure only."
        if (modules.value.length === 1) return `Declares one module (${modules.value[0].name}), so there is nothing to divide.`
        return null
    })

    return { rows, modules, fixtures, withFixtures, kinds, kindsText, suggestions, reason, nameOf }
}
