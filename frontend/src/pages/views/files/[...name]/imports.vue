<template>
  <div class="flex min-h-0 grow overflow-hidden">
    <!-- Outgoing: what this file imports. -->
    <section class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex h-9 shrink-0 items-center gap-2 px-4 hairline-b">
        <h2 class="ui-section-title">Imports</h2>
        <span class="font-mono text-xs text-neutral-400">{{ formatNumber(outgoing.length) }}</span>
      </div>
      <LoadingState v-if="outgoingLoading" text="Reading imports…"/>
      <EmptyState v-else-if="outgoingError" title="Could not read imports" :text="outgoingError" icon="alert"/>
      <EmptyState v-else-if="outgoing.length === 0" title="No imports" text="The snapshot recorded no import statements in this file." icon="arrow-up-right"/>
      <div v-else class="min-h-0 grow overflow-y-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th>Target</th>
              <th class="w-[70px] text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in outgoing" :key="row.target">
              <td class="max-w-0">
                <router-link v-if="row.to" :to="row.to" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="row.to">{{ row.target }}</router-link>
                <span v-else class="block truncate font-mono text-sm text-neutral-600" :title="row.target">{{ row.target }}</span>
              </td>
              <td class="is-num text-right">{{ formatNumber(row.count) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Incoming: which files import this one. -->
    <section class="flex min-w-0 flex-1 flex-col overflow-hidden hairline-l">
      <div class="flex h-9 shrink-0 items-center gap-2 px-4 hairline-b">
        <h2 class="ui-section-title">Imported by</h2>
        <span class="font-mono text-xs text-neutral-400">{{ formatNumber(incoming.length) }}</span>
      </div>
      <LoadingState v-if="incomingLoading" text="Reading references…"/>
      <EmptyState v-else-if="incomingError" title="Could not read references" :text="incomingError" icon="alert"/>
      <EmptyState v-else-if="!hasResolvedEdges" title="Not recorded" text="This snapshot predates the engine's resolved references, so which files use this one is not known. A new scan records them." icon="arrow-left">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="workspaces.isScanning" @click="workspaces.startScan()">{{ workspaces.isScanning ? "Scanning…" : "Scan again" }}</button>
      </EmptyState>
      <EmptyState v-else-if="incoming.length === 0" title="Not imported" :text="`No other file in the snapshot uses anything declared in ${fileBasename}.`" icon="arrow-left"/>
      <div v-else class="min-h-0 grow overflow-y-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th>File</th>
              <th class="w-[90px] text-right" title="References from that file to what this one declares">References</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in incoming" :key="row.source">
              <td class="max-w-0">
                <router-link :to="`/views/files/${row.source}`" class="flex min-w-0 items-baseline gap-2 font-mono text-sm hover:underline" :title="row.source">
                  <span class="shrink-0 text-neutral-800">{{ splitPath(row.source).name }}</span>
                  <span class="truncate text-neutral-500">{{ splitPath(row.source).dir }}</span>
                </router-link>
              </td>
              <td class="is-num text-right">{{ formatNumber(row.count) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useWorkspacesStore } from "~/stores/workspaces"
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useFileRoute } from "~/composables/useFileRoute"
import { formatNumber } from "~/utils/format"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const store = useDataStore()
const workspaces = useWorkspacesStore()
const { filePath, escapedPath, fileBasename } = useFileRoute()

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}


// One pass over the files table: every path, keyed by basename without
// extension, plus the Java class names when the engine recorded them.
interface FileIndex { byBasename: Map<string, string[]>; byClass: Map<string, string>; byPath: Set<string>; ownClass: string | null }
const { data: index } = useAsyncQuery<FileIndex>(
  async () => {
    const cols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('files')")
    const hasClass = cols.some(c => c.name === "java_full_class")
    const rows = await store.query<{ name: string; java_full_class?: string | null }>(
      hasClass ? "SELECT name, java_full_class FROM files" : "SELECT name FROM files",
    )
    const byBasename = new Map<string, string[]>()
    const byClass = new Map<string, string>()
    const byPath = new Set<string>()
    let ownClass: string | null = null
    for (const r of rows) {
      byPath.add(r.name)
      const base = stripExtension(r.name.split("/").pop() || r.name)
      byBasename.set(base, [...(byBasename.get(base) ?? []), r.name])
      if (r.java_full_class) byClass.set(r.java_full_class, r.name)
      if (r.name === filePath.value && r.java_full_class) ownClass = r.java_full_class
    }
    return { byBasename, byClass, byPath, ownClass }
  },
  [filePath],
  { initial: { byBasename: new Map(), byClass: new Map(), byPath: new Set(), ownClass: null } },
)

// Resolve an import string to a file in the snapshot: exact path, exact
// Java class, then a unique basename match on the last segment.
function resolveTarget(target: string): string | null {
  const idx = index.value
  if (idx.byPath.has(target)) return target
  const cls = idx.byClass.get(target)
  if (cls) return cls
  const last = target.split(/[./\\]/).filter(Boolean).pop()
  if (!last || last === "*") return null
  const candidates = idx.byBasename.get(last)
  return candidates && candidates.length === 1 ? candidates[0] : null
}

interface OutgoingRow { target: string; count: number }
const { data: outgoingRaw, loading: outgoingLoading, error: outgoingError } = useAsyncQuery<OutgoingRow[]>(
  async () => {
    if (!filePath.value || !store.hasView("snippets")) return []
    // One row per import statement. Every language records its imports as
    // modularity__import__raw; the other import snippet types are the same
    // statement again (the class, the package, the component it resolved
    // to), so reading all of them listed Order.java's 19 imports as 35
    // targets with counts summing to 61. The broad match is kept only for a
    // file whose language never recorded the raw form.
    const raw = await store.query<OutgoingRow>(
      `SELECT content AS target, count(*) AS count FROM snippets WHERE file = ${escapedPath.value} AND snippet_type = 'modularity__import__raw' GROUP BY content ORDER BY count DESC, content ASC`,
    )
    if (raw.length > 0) return raw
    return store.query<OutgoingRow>(
      `SELECT content AS target, count(*) AS count FROM snippets WHERE file = ${escapedPath.value} AND snippet_type LIKE '%import%' GROUP BY content ORDER BY count DESC, content ASC`,
    )
  },
  [escapedPath],
  { initial: [] },
)

const outgoing = computed(() => outgoingRaw.value.map(r => {
  const resolved = resolveTarget(r.target)
  return { ...r, to: resolved ? `/views/files/${resolved}` : null }
}))

// Incoming: the files whose declarations the engine resolved to something
// declared here. Matching import text instead -- anything ending in ".Order"
// or "/Order" -- counted 22 importers of a different Order class among
// Order.java's 194, and missed every TypeScript import of a directory's
// index. A snapshot without the unit graph gets no answer rather than a guess.
interface IncomingRow { source: string; count: number }
const hasResolvedEdges = computed(() => store.hasView("unit_connections"))
const { data: incoming, loading: incomingLoading, error: incomingError } = useAsyncQuery<IncomingRow[]>(
  async () => {
    if (!filePath.value || !hasResolvedEdges.value) return []
    return store.query<IncomingRow>(
      `SELECT from_file AS source, count(*) AS count FROM unit_connections WHERE to_file = ${escapedPath.value} AND from_file IS NOT NULL AND from_file != ${escapedPath.value} GROUP BY from_file ORDER BY count DESC, from_file ASC`,
    )
  },
  [escapedPath, hasResolvedEdges],
  { initial: [] },
)

/** The file's name first, then where it lives, so a truncated row still says which file it is. */
function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/")
  return i < 0 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i) }
}
</script>
