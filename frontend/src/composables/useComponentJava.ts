import { computed, ref, watch, type Ref } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlIn, sqlLiteral } from "~/utils/sql"
import {
    IMPORT_SNIPPET_TYPE, ROLE_SNIPPET_TYPES, ROLE_SNIPPET_TYPE_LIST,
    addRoleFromSnippet, classLabel, isBean, primaryRole, simpleClassName, sortedRoles, structuralFlags,
    type FlagEdge, type JavaRole,
} from "~/utils/java"
import type { WiringEdge, WiringNode } from "~/components/java/ComponentWiringGraph.vue"

// The Java reading of one component: which classes it holds, what role each
// plays, which imports run between them, and which of those break a layering
// rule. Lifted out of the old Java tab so Inside can read it twice off one
// query: role tags on the file list, and the wiring graph beside it.

export type FileRow = Record<string, any> & { name: string }
interface SnippetRow { file: string; snippet_type: string; content: string }
interface ConnectionRow { from: string; to: string; file: string; reference_count: number; to_file: string | null }
interface Loaded { files: FileRow[]; snippets: SnippetRow[]; connections: ConnectionRow[]; hasConnectionsView: boolean }

export interface ClassRow {
    file: string
    label: string
    fullClass: string | null
    roles: JavaRole[]
    roleSet: Set<JavaRole>
    classes: number
    methods: number
    fields: number
    health: number | null
}

function num(v: unknown): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

// The annotation types that name a Spring or JPA role. These are read for the
// whole project so a class outside the component still carries a role.
const ANNOTATION_TYPES = ROLE_SNIPPET_TYPE_LIST.filter(t => t.startsWith("java__spring__") || t.startsWith("java__jpa__"))

const EMPTY: Loaded = { files: [], snippets: [], connections: [], hasConnectionsView: false }

export function useComponentJava(name: Ref<string>) {
    const store = useDataStore()

    const { data, loading, error } = useAsyncQuery<Loaded>(
        async () => {
            if (!name.value) return EMPTY
            const lit = sqlLiteral(name.value)
            const all = await store.query<FileRow>(`SELECT * FROM files WHERE component = ${lit} ORDER BY name`)
            const files = all.filter(f => /\.java$/i.test(f.name) || num(f.java__class__declarations) > 0)
            if (files.length === 0) return { ...EMPTY, files }

            const fileNames = files.map(f => f.name)
            const snippets = store.hasView("snippets")
                ? await store.query<SnippetRow>(`
                    SELECT file, snippet_type, content FROM snippets
                    WHERE snippet_type IN ${sqlIn(ANNOTATION_TYPES)}
                       OR (file IN ${sqlIn(fileNames)} AND snippet_type IN ${sqlIn([...ROLE_SNIPPET_TYPE_LIST, IMPORT_SNIPPET_TYPE])})`)
                : []

            const hasFullClass = files.some(f => "java_full_class" in f)
            const classNames = files.map(f => f.java_full_class).filter((c): c is string => typeof c === "string" && c.length > 0)
            const hasConnectionsView = hasFullClass && classNames.length > 0 && store.hasView("java_class_connections_direct")
            const connections = hasConnectionsView
                ? await store.query<ConnectionRow>(`
                    SELECT c."from", c."to", c.file, c.reference_count, f.name AS to_file
                    FROM java_class_connections_direct c
                    LEFT JOIN files f ON f.java_full_class = c."to"
                    WHERE c."from" IN ${sqlIn(classNames)} OR c."to" IN ${sqlIn(classNames)}`)
                : []
            return { files, snippets, connections, hasConnectionsView }
        },
        [name],
        { initial: EMPTY },
    )

    // Roles per file, for every file the snippets mention.
    const rolesByFile = computed(() => {
        const m = new Map<string, Set<JavaRole>>()
        for (const s of data.value.snippets) {
            if (!ROLE_SNIPPET_TYPES[s.snippet_type]) continue
            let set = m.get(s.file)
            if (!set) { set = new Set(); m.set(s.file, set) }
            addRoleFromSnippet(set, s.snippet_type)
        }
        return m
    })

    function rolesOf(file: string): Set<JavaRole> {
        return rolesByFile.value.get(file) ?? new Set()
    }

    const classes = computed<ClassRow[]>(() => data.value.files.map(f => {
        const roleSet = rolesOf(f.name)
        const fullClass = typeof f.java_full_class === "string" && f.java_full_class ? f.java_full_class : null
        const healthRaw = f.codesmells__code_health ?? f[store.statName("codesmells__code_health")]
        return {
            file: f.name,
            label: fullClass ? simpleClassName(fullClass) : classLabel(f.name),
            fullClass,
            roles: sortedRoles(roleSet),
            roleSet,
            classes: num(f.java__class__declarations),
            methods: num(f.java__method_declarations),
            fields: num(f.java__field__declarations),
            health: healthRaw === null || healthRaw === undefined || healthRaw === "" ? null : Number(healthRaw),
        }
    }))

    const classByFile = computed(() => new Map(classes.value.map(c => [c.file, c])))
    const fileByClass = computed(() => {
        const m = new Map<string, string>()
        for (const c of classes.value) if (c.fullClass) m.set(c.fullClass, c.file)
        return m
    })

    /** Role counts for the component, each shown only when above zero. */
    const roleStats = computed(() => {
        const rows = classes.value
        const count = (role: JavaRole) => rows.filter(r => r.roleSet.has(role)).length
        const sumClasses = rows.reduce((a, r) => a + r.classes, 0)
        return [
            { label: "Classes", value: sumClasses || rows.length },
            { label: "Methods", value: rows.reduce((a, r) => a + r.methods, 0) },
            { label: "Fields", value: rows.reduce((a, r) => a + r.fields, 0) },
            { label: "Spring beans", value: rows.filter(r => isBean(r.roleSet)).length },
            { label: "Controllers", value: count("Controller") },
            { label: "Services", value: count("Service") },
            { label: "Repositories", value: count("Repository") },
            { label: "JPA entities", value: count("Entity") },
        ].filter(s => s.value > 0)
    })

    // Every recorded import edge between files, aggregated per file pair. The
    // connections view resolves imports to classes; without it, the
    // component's own import snippets resolve against its own classes.
    interface FileEdge { fromFile: string; toFile: string; references: number }
    const edges = computed<FileEdge[]>(() => {
        const agg = new Map<string, FileEdge>()
        const add = (fromFile: string, toFile: string, references: number) => {
            if (fromFile === toFile) return
            const key = `${fromFile} ${toFile}`
            const e = agg.get(key)
            if (e) e.references += references
            else agg.set(key, { fromFile, toFile, references })
        }
        if (data.value.hasConnectionsView) {
            for (const c of data.value.connections) {
                const toFile = c.to_file ?? fileByClass.value.get(c.to)
                if (!toFile) continue
                add(c.file, toFile, num(c.reference_count) || 1)
            }
        } else {
            for (const s of data.value.snippets) {
                if (s.snippet_type !== IMPORT_SNIPPET_TYPE) continue
                const toFile = fileByClass.value.get(s.content)
                if (toFile) add(s.file, toFile, 1)
            }
        }
        return Array.from(agg.values())
    })

    const isInternal = (file: string) => classByFile.value.has(file)

    // Structural flags: rules checked on every import leaving a class in this
    // component, plus the field count of every bean here.
    const flags = computed(() => {
        const end = (file: string) => {
            const row = classByFile.value.get(file)
            return { label: row ? row.label : classLabel(file), file, roles: row ? row.roleSet : rolesOf(file) }
        }
        const flagEdges: FlagEdge[] = edges.value
            .filter(e => isInternal(e.fromFile))
            .map(e => ({ from: end(e.fromFile), to: end(e.toFile), references: e.references }))
        const beans = classes.value.filter(c => isBean(c.roleSet)).map(c => ({ label: c.label, file: c.file, roles: c.roleSet, fields: c.fields }))
        return structuralFlags(flagEdges, beans)
    })

    // Wiring graph: beans and entities inside the component, the internal
    // classes they touch, and (on request) the classes outside it.
    const includeExternal = ref(false)
    const wiring = computed<{ nodes: WiringNode[]; edges: WiringEdge[] }>(() => {
        const nodes = new Map<string, WiringNode>()
        const nodeFor = (file: string): WiringNode => {
            const row = classByFile.value.get(file)
            const external = !row
            const roles = row ? row.roleSet : rolesOf(file)
            return {
                id: file,
                label: row ? row.label : classLabel(file),
                role: primaryRole(roles),
                external,
                file,
                component: external ? (store.fileComponentIndex.get(file) ?? "") : name.value,
            }
        }
        for (const c of classes.value) {
            if (isBean(c.roleSet) || c.roleSet.has("Entity")) nodes.set(c.file, nodeFor(c.file))
        }
        if (nodes.size === 0) return { nodes: [], edges: [] }
        const seeds = new Set(nodes.keys())
        const out: WiringEdge[] = []
        for (const e of edges.value) {
            const fromSeed = seeds.has(e.fromFile), toSeed = seeds.has(e.toFile)
            if (!fromSeed && !toSeed) continue
            const other = fromSeed ? e.toFile : e.fromFile
            if (!nodes.has(other)) {
                if (isInternal(other) || includeExternal.value) nodes.set(other, nodeFor(other))
                else continue
            }
            out.push({ source: e.fromFile, target: e.toFile, references: e.references, external: !isInternal(e.fromFile) || !isInternal(e.toFile) })
        }
        return { nodes: Array.from(nodes.values()), edges: out }
    })

    const hasJava = computed(() => data.value.files.length > 0)

    const selected = ref<string | null>(null)
    const nodeById = computed(() => new Map(wiring.value.nodes.map(n => [n.id, n])))
    const selectedNode = computed(() => (selected.value ? nodeById.value.get(selected.value) ?? null : null))

    watch(name, () => { selected.value = null })
    // Open on the busiest class rather than the alphabetically first: landing
    // on one with no edges dims the whole graph to make its point.
    watch(wiring, w => {
        if (selected.value && w.nodes.some(n => n.id === selected.value)) return
        const degree = new Map<string, number>()
        for (const e of w.edges) {
            degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
            degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
        }
        const internal = w.nodes.filter(n => !n.external)
        const busiest = internal.reduce<WiringNode | null>(
            (best, n) => (best === null || (degree.get(n.id) ?? 0) > (degree.get(best.id) ?? 0) ? n : best), null)
        selected.value = busiest?.id ?? null
    }, { immediate: true })

    function neighbours(direction: "out" | "in"): WiringNode[] {
        const me = selected.value
        if (!me) return []
        return wiring.value.edges
            .filter(e => (direction === "out" ? e.source : e.target) === me)
            .map(e => nodeById.value.get(direction === "out" ? e.target : e.source))
            .filter((n): n is WiringNode => !!n)
            .sort((a, b) => Number(a.external) - Number(b.external) || a.label.localeCompare(b.label))
    }
    const selectedOut = computed(() => neighbours("out"))
    const selectedIn = computed(() => neighbours("in"))

    return {
        loading, error, hasJava, classes, roleStats, flags, wiring, includeExternal,
        selected, selectedNode, selectedOut, selectedIn,
    }
}
