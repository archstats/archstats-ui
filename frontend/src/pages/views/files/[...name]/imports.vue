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
      <EmptyState v-else-if="incoming.length === 0" title="Not imported" :text="`No other file in the snapshot imports ${fileBasename}.`" icon="arrow-left"/>
      <div v-else class="min-h-0 grow overflow-y-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th>File</th>
              <th class="w-[70px] text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in incoming" :key="row.source">
              <td class="max-w-0">
                <router-link :to="`/views/files/${row.source}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="row.source">{{ row.source }}</router-link>
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
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useFileRoute } from "~/composables/useFileRoute"
import { formatNumber } from "~/utils/format"
import { sqlIn, sqlLikeLiteral } from "~/utils/sql"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const store = useDataStore()
const { filePath, escapedPath, fileBasename } = useFileRoute()

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

const baseNoExt = computed(() => stripExtension(fileBasename.value))

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

// Incoming: match the ways this file can be named (its basename without
// extension, its Java class) exactly or as a dotted/slashed suffix.
interface IncomingRow { source: string; count: number }
const { data: incoming, loading: incomingLoading, error: incomingError } = useAsyncQuery<IncomingRow[]>(
  async () => {
    if (!filePath.value || !store.hasView("snippets")) return []
    const base = baseNoExt.value
    if (!base) return []
    const exact = [base, filePath.value]
    if (index.value.ownClass) exact.push(index.value.ownClass)
    const predicate = [
      `content IN ${sqlIn(exact)}`,
      `content LIKE ${sqlLikeLiteral(`.${base}`, "suffix")}`,
      `content LIKE ${sqlLikeLiteral(`/${base}`, "suffix")}`,
    ].join(" OR ")
    return store.query<IncomingRow>(
      `SELECT file AS source, count(*) AS count FROM snippets WHERE snippet_type LIKE '%import%' AND file != ${escapedPath.value} AND (${predicate}) GROUP BY file ORDER BY count DESC, file ASC`,
    )
  },
  [escapedPath, () => index.value.ownClass],
  { initial: [] },
)
</script>
