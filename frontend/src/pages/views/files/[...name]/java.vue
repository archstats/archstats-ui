<template>
  <LoadingState v-if="loading" text="Reading Java declarations…"/>
  <EmptyState v-else-if="error" title="Could not read Java declarations" :text="error" icon="alert"/>
  <EmptyState v-else-if="!hasJava" title="No Java classes in this file" :text="`The snapshot records no Java declarations in ${fileBasename}.`" icon="braces"/>
  <div v-else class="min-h-0 grow overflow-y-auto">
    <div class="max-w-[1040px] px-6 py-5">
      <!-- Declarations: what the file declares. -->
      <section>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="ui-section-title">Declarations</h2>
          <span v-for="role in roles" :key="role" class="ui-tag">{{ role }}</span>
        </div>
        <dl class="mt-3 flex overflow-hidden rounded-lg hairline">
          <div v-for="(stat, i) in declarationStats" :key="stat.label" class="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i > 0 }">
            <dt class="ui-label truncate">{{ stat.label }}</dt>
            <dd class="text-[22px] font-medium leading-7 tabular text-neutral-900">{{ formatNumber(stat.value) }}</dd>
          </div>
        </dl>
      </section>

      <!-- Neighbourhood: who imports this class, and what it imports. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 class="ui-section-title">Neighbourhood</h2>
          <ul class="flex items-center gap-3 text-xs text-neutral-500" aria-label="Legend">
            <li v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="roleDotClass(item.role)"></span>{{ item.label }}
            </li>
          </ul>
          <span class="ml-auto text-xs text-neutral-500">Imported by on the left, imports on the right</span>
        </div>
        <div class="mt-3 overflow-hidden rounded-lg hairline">
          <EmptyState v-if="incoming.length === 0 && outgoing.length === 0" class="h-[320px]" title="No recorded connections" :text="connectionsText" icon="waypoints"/>
          <ClassNeighbourhoodGraph v-else :centre="centre" :incoming="incoming" :outgoing="outgoing" @open="openFile"/>
        </div>
      </section>

      <!-- Outgoing: classes this file imports. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex items-center gap-2">
          <h2 class="ui-section-title">Outgoing</h2>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(outgoing.length) }}</span>
        </div>
        <div class="mt-3 max-h-[400px] overflow-y-auto rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th>Class</th>
                <th class="w-[120px]">Role</th>
                <th>Component</th>
                <th class="w-[100px] text-right">References</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="outgoing.length === 0">
                <td colspan="4" class="text-neutral-500">Imports no class recorded in the snapshot</td>
              </tr>
              <tr v-for="n in outgoing" :key="n.id">
                <td class="max-w-0">
                  <router-link v-if="n.file" :to="`/views/files/${n.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="n.file">{{ n.label }}</router-link>
                  <span v-else class="block truncate font-mono text-sm text-neutral-600" :title="n.id">{{ n.label }}</span>
                </td>
                <td><span v-if="n.role" class="ui-tag">{{ n.role }}</span><span v-else class="text-neutral-400">—</span></td>
                <td class="max-w-0">
                  <router-link v-if="n.component" :to="`/views/components/${n.component}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="n.component">{{ store.getComponentName(n.component) || n.component }}</router-link>
                  <span v-else class="text-neutral-400">—</span>
                </td>
                <td class="is-num text-right">{{ formatNumber(n.references) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Incoming: classes that import this file. -->
      <section class="mt-6 pt-5 hairline-t">
        <div class="flex items-center gap-2">
          <h2 class="ui-section-title">Incoming</h2>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(incoming.length) }}</span>
        </div>
        <div class="mt-3 max-h-[400px] overflow-y-auto rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th>Class</th>
                <th class="w-[120px]">Role</th>
                <th>Component</th>
                <th class="w-[100px] text-right">References</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="incoming.length === 0">
                <td colspan="4" class="text-neutral-500">No class in the snapshot imports {{ centre.label }}</td>
              </tr>
              <tr v-for="n in incoming" :key="n.id">
                <td class="max-w-0">
                  <router-link v-if="n.file" :to="`/views/files/${n.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="n.file">{{ n.label }}</router-link>
                  <span v-else class="block truncate font-mono text-sm text-neutral-600" :title="n.id">{{ n.label }}</span>
                </td>
                <td><span v-if="n.role" class="ui-tag">{{ n.role }}</span><span v-else class="text-neutral-400">—</span></td>
                <td class="max-w-0">
                  <router-link v-if="n.component" :to="`/views/components/${n.component}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="n.component">{{ store.getComponentName(n.component) || n.component }}</router-link>
                  <span v-else class="text-neutral-400">—</span>
                </td>
                <td class="is-num text-right">{{ formatNumber(n.references) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Structural flags: layering rules this file breaks. -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useFileRoute } from "~/composables/useFileRoute"
import { sqlIn, sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import {
  IMPORT_SNIPPET_TYPE, ROLE_SNIPPET_TYPES, ROLE_SNIPPET_TYPE_LIST,
  addRoleFromSnippet, classLabel, isBean, primaryRole, roleDotClass, simpleClassName, sortedRoles, structuralFlags,
  type FlagEdge, type JavaRole,
} from "~/utils/java"
import ClassNeighbourhoodGraph, { type NeighbourNode } from "~/components/java/ClassNeighbourhoodGraph.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const router = useRouter()
const store = useDataStore()
const { filePath, escapedPath, fileBasename } = useFileRoute()

type FileRow = Record<string, any> & { name: string }
interface SnippetRow { file: string; snippet_type: string; content: string }
interface ConnectionRow { from: string; to: string; file: string; reference_count: number; to_file: string | null }
interface Loaded { row: FileRow | null; snippets: SnippetRow[]; connections: ConnectionRow[]; classMap: Map<string, string>; hasConnectionsView: boolean }

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const ANNOTATION_TYPES = ROLE_SNIPPET_TYPE_LIST.filter(t => t.startsWith("java__spring__") || t.startsWith("java__jpa__"))

// Three queries per file: its row, its Java snippets (plus every role
// annotation in the project, so neighbours carry a role), and the class
// connections touching its class. Without the connections view, one
// class-to-file map resolves the file's own imports instead.
const { data, loading, error } = useAsyncQuery<Loaded>(
  async () => {
    const empty: Loaded = { row: null, snippets: [], connections: [], classMap: new Map(), hasConnectionsView: false }
    if (!filePath.value) return empty
    const rows = await store.query<FileRow>(`SELECT * FROM files WHERE name = ${escapedPath.value} LIMIT 1`)
    const row = rows[0] ?? null
    if (!row) return empty

    const snippets = store.hasView("snippets")
      ? await store.query<SnippetRow>(`
          SELECT file, snippet_type, content FROM snippets
          WHERE (file = ${escapedPath.value} AND snippet_type LIKE 'java__%')
             OR snippet_type IN ${sqlIn(ANNOTATION_TYPES)}`)
      : []

    const hasFullClass = "java_full_class" in row
    const fullClass = hasFullClass && typeof row.java_full_class === "string" ? row.java_full_class : ""
    const hasConnectionsView = !!fullClass && store.hasView("java_class_connections_direct")
    if (hasConnectionsView) {
      const lit = sqlLiteral(fullClass)
      const connections = await store.query<ConnectionRow>(`
        SELECT c."from", c."to", c.file, c.reference_count, f.name AS to_file
        FROM java_class_connections_direct c
        LEFT JOIN files f ON f.java_full_class = c."to"
        WHERE c."from" = ${lit} OR c."to" = ${lit}`)
      return { row, snippets, connections, classMap: new Map(), hasConnectionsView }
    }
    const classMap = new Map<string, string>()
    if (hasFullClass) {
      const files = await store.query<{ name: string; java_full_class: string }>(
        "SELECT name, java_full_class FROM files WHERE java_full_class IS NOT NULL AND java_full_class != ''",
      )
      for (const f of files) classMap.set(f.java_full_class, f.name)
    }
    return { row, snippets, connections: [], classMap, hasConnectionsView }
  },
  [escapedPath],
  { initial: { row: null, snippets: [], connections: [], classMap: new Map(), hasConnectionsView: false } },
)

const row = computed(() => data.value.row)
const ownSnippets = computed(() => data.value.snippets.filter(s => s.file === filePath.value))
const fullClass = computed(() => (typeof row.value?.java_full_class === "string" && row.value.java_full_class) || null)

function countType(type: string): number {
  return ownSnippets.value.filter(s => s.snippet_type === type).length
}

const counts = computed(() => ({
  classes: num(row.value?.java__class__declarations) || countType("java__class__declaration"),
  methods: num(row.value?.java__method_declarations) || countType("java__method__declaration"),
  fields: num(row.value?.java__field__declarations) || countType("java__field__declaration"),
  imports: countType(IMPORT_SNIPPET_TYPE),
}))

const hasJava = computed(() => counts.value.classes > 0 || counts.value.methods > 0 || ownSnippets.value.length > 0)

const declarationStats = computed(() => {
  const c = counts.value
  const r = row.value ?? {}
  const list = [
    { label: "Classes", value: c.classes },
    { label: "Methods", value: c.methods },
    { label: "Fields", value: c.fields },
    { label: "Imports", value: c.imports },
    { label: "GET", value: num(r.java__spring__request_mappings__get) },
    { label: "POST", value: num(r.java__spring__request_mappings__post) },
    { label: "PUT", value: num(r.java__spring__request_mappings__put) },
    { label: "DELETE", value: num(r.java__spring__request_mappings__delete) },
    { label: "PATCH", value: num(r.java__spring__request_mappings__patch) },
  ]
  return list.filter(s => s.value > 0)
})

// Roles per file, for this file and for every annotated class in the project.
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
function rolesOf(file: string | null): Set<JavaRole> {
  return (file && rolesByFile.value.get(file)) || new Set()
}

const ownRoles = computed(() => rolesOf(filePath.value))
const roles = computed(() => sortedRoles(ownRoles.value))

const centre = computed(() => ({
  id: fullClass.value ?? filePath.value,
  label: fullClass.value ? simpleClassName(fullClass.value) : classLabel(filePath.value),
  role: primaryRole(ownRoles.value),
  file: filePath.value,
}))

// Neighbours aggregated per file. The connections view gives both
// directions; the fallback resolves only this file's own imports.
function neighbour(id: string, file: string | null, references: number): NeighbourNode {
  return {
    id,
    label: simpleClassName(id),
    role: primaryRole(rolesOf(file)),
    file: file ?? "",
    component: file ? (store.fileComponentIndex.get(file) ?? "") : "",
    references,
  }
}

function aggregate(entries: Array<{ id: string; file: string | null; references: number }>): NeighbourNode[] {
  const byKey = new Map<string, { id: string; file: string | null; references: number }>()
  for (const e of entries) {
    const key = e.file ?? e.id
    const existing = byKey.get(key)
    if (existing) existing.references += e.references
    else byKey.set(key, { ...e })
  }
  return Array.from(byKey.values()).map(e => neighbour(e.id, e.file, e.references))
    .sort((a, b) => b.references - a.references || a.label.localeCompare(b.label))
}

const outgoing = computed<NeighbourNode[]>(() => {
  if (data.value.hasConnectionsView) {
    const me = fullClass.value
    return aggregate(data.value.connections.filter(c => c.from === me && c.to !== me).map(c => ({ id: c.to, file: c.to_file, references: num(c.reference_count) || 1 })))
  }
  return aggregate(ownSnippets.value
    .filter(s => s.snippet_type === IMPORT_SNIPPET_TYPE)
    .map(s => ({ id: s.content, file: data.value.classMap.get(s.content) ?? null, references: 1 }))
    .filter(e => e.file !== null && e.file !== filePath.value))
})

const incoming = computed<NeighbourNode[]>(() => {
  if (!data.value.hasConnectionsView) return []
  const me = fullClass.value
  return aggregate(data.value.connections.filter(c => c.to === me && c.from !== me).map(c => ({ id: c.from, file: c.file, references: num(c.reference_count) || 1 })))
})

const connectionsText = computed(() => {
  if (!fullClass.value) return "The snapshot did not record a class name for this file, so imports cannot be traced."
  if (!data.value.hasConnectionsView) return "The snapshot has no Java class connections view; only imports resolved by class name would appear here."
  return `No other class in the snapshot imports ${centre.value.label}, and it imports no class in the snapshot.`
})

// Structural flags: rules checked on this file's imports, plus its own
// field count when it is a bean.
const flags = computed(() => {
  const from = { label: centre.value.label, file: filePath.value, roles: ownRoles.value }
  const edges: FlagEdge[] = outgoing.value
    .filter(n => n.file)
    .map(n => ({ from, to: { label: n.label, file: n.file, roles: rolesOf(n.file) }, references: n.references }))
  const beans = isBean(ownRoles.value) ? [{ label: centre.value.label, file: filePath.value, roles: ownRoles.value, fields: counts.value.fields }] : []
  return structuralFlags(edges, beans)
})

const legend: Array<{ role: JavaRole | null; label: string }> = [
  { role: "Controller", label: "Controller" }, { role: "Service", label: "Service" }, { role: "Repository", label: "Repository" }, { role: "Entity", label: "Entity" }, { role: null, label: "Other" },
]

function openFile(file: string) {
  if (file) router.push(`/views/files/${file}`)
}
</script>
