<template>
  <LoadingState v-if="loading" text="Reading Java classes…"/>
  <EmptyState v-else-if="error" title="Could not read Java classes" :text="error" icon="alert"/>
  <EmptyState v-else-if="classes.length === 0" title="No Java classes in this component" :text="`The snapshot records no Java source files in ${name}.`" icon="braces"/>
  <div v-else class="min-h-0 grow overflow-y-auto">
    <div class="max-w-[1040px] px-6 py-5">
      <!-- Roles: what kinds of classes live here. -->
      <section>
        <h2 class="ui-section-title">Roles</h2>
        <dl class="mt-3 flex overflow-hidden rounded-lg hairline">
          <div v-for="(stat, i) in roleStats" :key="stat.label" class="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i > 0 }">
            <dt class="ui-label truncate">{{ stat.label }}</dt>
            <dd class="text-[22px] font-medium leading-7 tabular text-neutral-900">{{ formatNumber(stat.value) }}</dd>
          </div>
        </dl>
      </section>

      <!-- Structural flags: layering rules broken by recorded imports. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex items-center gap-2">
          <h2 class="ui-section-title">Structural flags</h2>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(flags.length) }}</span>
        </div>
        <div class="mt-3 overflow-hidden rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="w-[220px]">Rule</th>
                <th>From</th>
                <th>To</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="flags.length === 0">
                <td colspan="4" class="text-neutral-500">No violations found</td>
              </tr>
              <tr v-for="flag in flags" :key="flag.key">
                <td class="text-neutral-800">{{ flag.rule }}</td>
                <td class="max-w-0">
                  <router-link :to="`/views/files/${flag.from.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="flag.from.file">{{ flag.from.label }}</router-link>
                </td>
                <td class="max-w-0">
                  <router-link v-if="flag.to" :to="`/views/files/${flag.to.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="flag.to.file">{{ flag.to.label }}</router-link>
                  <span v-else class="text-neutral-400">—</span>
                </td>
                <td class="max-w-0 truncate text-neutral-600" :title="flag.detail">{{ flag.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Wiring: beans and entities and the imports between them. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 class="ui-section-title">Wiring</h2>
          <ul class="flex items-center gap-3 text-xs text-neutral-500" aria-label="Legend">
            <li v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="roleDotClass(item.role)"></span>{{ item.label }}
            </li>
            <li class="flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-1.5 rounded-full border border-dashed border-neutral-400"></span>External
            </li>
          </ul>
          <label class="ml-auto flex items-center gap-1.5 text-sm text-neutral-700">
            <input v-model="includeExternal" type="checkbox" class="h-3.5 w-3.5 accent-accent-500"/>
            Include external wiring
          </label>
        </div>
        <div class="mt-3 flex overflow-hidden rounded-lg hairline">
          <EmptyState v-if="wiring.nodes.length === 0" class="h-[380px]" title="No beans to wire" text="No Spring beans or JPA entities were found in this component." icon="waypoints"/>
          <ComponentWiringGraph v-else class="min-w-0 grow" :nodes="wiring.nodes" :edges="wiring.edges" :selected="selected" @select="selected = $event"/>
          <aside class="flex h-[380px] w-[280px] shrink-0 flex-col overflow-y-auto bg-ground hairline-l">
            <EmptyState v-if="!selectedNode" title="No bean selected" text="Click a node to see what it imports and what imports it." icon="focus"/>
            <template v-else>
              <div class="px-4 pt-4">
                <router-link :to="`/views/files/${selectedNode.file}`" class="block truncate font-mono text-sm font-medium text-neutral-900 hover:underline" :title="selectedNode.file">{{ selectedNode.label }}</router-link>
                <div class="mt-1 flex items-center gap-1.5">
                  <span class="inline-block h-1.5 w-1.5 rounded-full" :class="roleDotClass(selectedNode.role)"></span>
                  <span class="text-sm text-neutral-500">{{ selectedNode.role ?? "Class" }}</span>
                </div>
              </div>
              <div class="px-4 pt-4">
                <h3 class="ui-section-title">Imports <span class="font-mono normal-case tracking-normal text-neutral-400">{{ selectedOut.length }}</span></h3>
                <p v-if="selectedOut.length === 0" class="mt-2 text-sm text-neutral-500">Imports nothing in the graph.</p>
                <ul v-else class="mt-2 flex flex-col gap-1">
                  <li v-for="n in selectedOut" :key="n.id" class="flex min-w-0 items-center gap-2">
                    <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" :class="roleDotClass(n.role)"></span>
                    <router-link :to="`/views/files/${n.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="n.file">{{ n.label }}</router-link>
                    <span v-if="n.external" class="ui-tag ml-auto shrink-0" :title="n.component">{{ store.getComponentName(n.component) || n.component }}</span>
                  </li>
                </ul>
              </div>
              <div class="px-4 py-4">
                <h3 class="ui-section-title">Imported by <span class="font-mono normal-case tracking-normal text-neutral-400">{{ selectedIn.length }}</span></h3>
                <p v-if="selectedIn.length === 0" class="mt-2 text-sm text-neutral-500">Nothing in the graph imports it.</p>
                <ul v-else class="mt-2 flex flex-col gap-1">
                  <li v-for="n in selectedIn" :key="n.id" class="flex min-w-0 items-center gap-2">
                    <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" :class="roleDotClass(n.role)"></span>
                    <router-link :to="`/views/files/${n.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="n.file">{{ n.label }}</router-link>
                    <span v-if="n.external" class="ui-tag ml-auto shrink-0" :title="n.component">{{ store.getComponentName(n.component) || n.component }}</span>
                  </li>
                </ul>
              </div>
            </template>
          </aside>
        </div>
      </section>

      <!-- Classes: every Java source file in the component. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="ui-section-title">Classes</h2>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(filteredClasses.length) }}<template v-if="filteredClasses.length !== classes.length"> of {{ formatNumber(classes.length) }}</template></span>
          <div class="ml-auto flex items-center gap-2">
            <SingleSelect v-model="roleFilter" :options="roleFilterOptions" placeholder="All roles"/>
            <input v-model="search" type="search" class="ui-input w-[200px]" placeholder="Search classes" aria-label="Search classes"/>
          </div>
        </div>
        <div class="mt-3 max-h-[520px] overflow-y-auto rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th>Class</th>
                <th class="w-[200px]">Role</th>
                <th class="w-[90px] text-right">Methods</th>
                <th class="w-[90px] text-right">Fields</th>
                <th class="w-[90px] text-right">Health</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredClasses.length === 0">
                <td colspan="5" class="text-neutral-500">No classes match</td>
              </tr>
              <tr v-for="row in filteredClasses" :key="row.file">
                <td class="max-w-0">
                  <router-link :to="`/views/files/${row.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="row.file">{{ row.label }}<span class="ml-1.5 text-xs text-neutral-400">{{ dirname(row.file) }}</span></router-link>
                </td>
                <td>
                  <span class="flex items-center gap-1">
                    <span v-for="role in row.roles" :key="role" class="ui-tag">{{ role }}</span>
                    <span v-if="row.roles.length === 0" class="text-neutral-400">—</span>
                  </span>
                </td>
                <td class="is-num text-right">{{ formatNumber(row.methods) }}</td>
                <td class="is-num text-right">{{ formatNumber(row.fields) }}</td>
                <td class="is-num text-right">
                  <span class="inline-flex items-center gap-1.5">
                    <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(row.health))"></span>
                    <span :class="levelTextClass(healthLevel(row.health))">{{ formatHealth(row.health) }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { healthLevel, levelDotClass, levelTextClass, formatHealth } from "~/composables/useHealth"
import { sqlIn, sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import {
  IMPORT_SNIPPET_TYPE, ROLE_OPTIONS, ROLE_SNIPPET_TYPES, ROLE_SNIPPET_TYPE_LIST,
  addRoleFromSnippet, classLabel, isBean, primaryRole, roleDotClass, simpleClassName, sortedRoles, structuralFlags,
  type FlagEdge, type JavaRole,
} from "~/utils/java"
import ComponentWiringGraph, { type WiringEdge, type WiringNode } from "~/components/java/ComponentWiringGraph.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import SingleSelect from "~/components/ui/common/SingleSelect.vue"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

type FileRow = Record<string, any> & { name: string }
interface SnippetRow { file: string; snippet_type: string; content: string }
interface ConnectionRow { from: string; to: string; file: string; reference_count: number; to_file: string | null }
interface Loaded { files: FileRow[]; snippets: SnippetRow[]; connections: ConnectionRow[]; hasConnectionsView: boolean }

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// The annotation types that name a Spring or JPA role. These are read for
// the whole project so a class outside the component still carries a role.
const ANNOTATION_TYPES = ROLE_SNIPPET_TYPE_LIST.filter(t => t.startsWith("java__spring__") || t.startsWith("java__jpa__"))

// Three queries per component: its files, the Java snippets of those files
// (plus every role annotation in the project), and the class connections
// touching its classes. Everything else is derived in memory.
const { data, loading, error } = useAsyncQuery<Loaded>(
  async () => {
    const lit = sqlLiteral(name.value)
    const all = await store.query<FileRow>(`SELECT * FROM files WHERE component = ${lit} ORDER BY name`)
    const files = all.filter(f => /\.java$/i.test(f.name) || num(f.java__class__declarations) > 0)
    const empty: Loaded = { files, snippets: [], connections: [], hasConnectionsView: false }
    if (files.length === 0) return empty

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
  { initial: { files: [], snippets: [], connections: [], hasConnectionsView: false } },
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

interface ClassRow { file: string; label: string; fullClass: string | null; roles: JavaRole[]; roleSet: Set<JavaRole>; classes: number; methods: number; fields: number; health: number | null }

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

// Roles strip; a reading only appears when it is above zero.
const roleStats = computed(() => {
  const rows = classes.value
  const count = (role: JavaRole) => rows.filter(r => r.roleSet.has(role)).length
  const sumClasses = rows.reduce((a, r) => a + r.classes, 0)
  const list = [
    { label: "Classes", value: sumClasses || rows.length },
    { label: "Methods", value: rows.reduce((a, r) => a + r.methods, 0) },
    { label: "Fields", value: rows.reduce((a, r) => a + r.fields, 0) },
    { label: "Spring beans", value: rows.filter(r => isBean(r.roleSet)).length },
    { label: "Controllers", value: count("Controller") },
    { label: "Services", value: count("Service") },
    { label: "Repositories", value: count("Repository") },
    { label: "JPA entities", value: count("Entity") },
  ]
  return list.filter(s => s.value > 0)
})

// Every recorded import edge between files, aggregated per file pair. The
// connections view resolves imports to classes; without it, the component's
// own import snippets resolve against its own classes.
interface FileEdge { fromFile: string; toFile: string; references: number }
const edges = computed<FileEdge[]>(() => {
  const agg = new Map<string, FileEdge>()
  const add = (fromFile: string, toFile: string, references: number) => {
    if (fromFile === toFile) return
    const key = `${fromFile} ${toFile}`
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
const legend: Array<{ role: JavaRole | null; label: string }> = [
  { role: "Controller", label: "Controller" }, { role: "Service", label: "Service" }, { role: "Repository", label: "Repository" }, { role: "Entity", label: "Entity" }, { role: null, label: "Other" },
]

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

const selected = ref<string | null>(null)
const nodeById = computed(() => new Map(wiring.value.nodes.map(n => [n.id, n])))
const selectedNode = computed(() => (selected.value ? nodeById.value.get(selected.value) ?? null : null))

watch(name, () => { selected.value = null })
watch(wiring, w => {
  if (selected.value && w.nodes.some(n => n.id === selected.value)) return
  selected.value = w.nodes.find(n => !n.external)?.id ?? null
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

// Classes table: search and a role filter over loaded rows.
const ALL_ROLES = "All roles"
const roleFilter = ref<string>(ALL_ROLES)
const search = ref("")
const roleFilterOptions = computed(() => {
  const present = new Set<JavaRole>()
  for (const c of classes.value) for (const r of c.roles) present.add(r)
  return [ALL_ROLES, ...ROLE_OPTIONS.filter(r => present.has(r))]
})
watch(name, () => { roleFilter.value = ALL_ROLES; search.value = "" })

const filteredClasses = computed(() => {
  let rows = classes.value
  if (roleFilter.value !== ALL_ROLES) rows = rows.filter(r => r.roleSet.has(roleFilter.value as JavaRole))
  const q = search.value.trim().toLowerCase()
  if (q) rows = rows.filter(r => r.label.toLowerCase().includes(q) || r.file.toLowerCase().includes(q))
  return rows
})

function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
