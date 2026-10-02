<template>
  <div class="min-h-0 grow overflow-y-auto">
    <div class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <EmptyState v-if="!rows.length" :title="t('pages.filesFunctions.noFunctions')" :text="t('pages.filesFunctions.noFunctionsText')" icon="braces"/>
      <template v-else>
        <p class="max-w-[76ch] text-base text-neutral-700">{{ lede }}</p>
        <ExhibitFrame :exhibit="table" class="mt-4" header-class="mb-2">
          <template #aside>{{ t('pages.filesFunctions.sortedBy', { column: columns.find(c => c.key === sort.key)?.label }) }}</template>
          <div class="overflow-hidden rounded-lg hairline">
            <table class="ui-table">
              <thead>
                <tr>
                  <th v-for="c in columns" :key="c.key" class="cursor-pointer select-none whitespace-nowrap hover:text-neutral-900" :class="c.num ? 'w-[92px] text-right' : ''" @click="sortBy(c.key)">
                    <span class="inline-flex items-center gap-1">{{ c.label }}<Icon v-if="sort.key === c.key" :icon="sort.asc ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in sorted" :key="r.begin_line">
                  <td class="max-w-0 truncate font-mono text-sm">
                    <router-link :to="`${filePath(r.file, 'source')}#L${r.begin_line}-L${r.end_line}`" class="text-neutral-900 underline-offset-2 hover:underline" :title="nameOf(r)">{{ nameOf(r) }}</router-link>
                    <span v-if="r.cognitive > COMPLEX" class="ui-tag ml-2 text-red-700">{{ t('pages.filesFunctions.complex') }}</span>
                  </td>
                  <td class="is-num text-right">{{ fmtInt(r.begin_line) }}</td>
                  <td class="is-num text-right" :class="r.cognitive > COMPLEX ? 'text-red-700' : ''">{{ fmtInt(r.cognitive) }}</td>
                  <td class="is-num text-right">{{ fmtInt(r.lines) }}</td>
                  <td class="is-num text-right">{{ fmtInt(r.nesting) }}</td>
                  <td class="is-num text-right">{{ fmtInt(r.params) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ExhibitFrame>
        <p class="mt-2 max-w-[76ch] text-sm text-neutral-500">{{ t('metrics.complexFunctions.whatCognitiveMeans') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Every function of the file, as the engine measured it: how hard each is to
// follow, how long, how deep, how many parameters. Complex ones (cognitive
// complexity over 15) are flagged; long but simple ones are not, because
// edits to them were no more often bug fixes than edits to short ones.
import { computed, reactive } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { useTable } from "~/features/export/useExportables"
import { useFileRoute } from "~/features/files/useFileRoute"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { filePath } from "~/features/navigation/routes"
import { fmtInt } from "~/features/metrics/healthBreakdown"
import { sqlLiteral } from "~/shared/sql"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

interface FunctionRow { file: string; name: string; begin_line: number; end_line: number; lines: number; cognitive: number; nesting: number; params: number }
type SortKey = "name" | "begin_line" | "cognitive" | "lines" | "nesting" | "params"

const COMPLEX = 15
const store = useDataStore()
const { filePath: path } = useFileRoute()

const { data } = useAsyncQuery<FunctionRow[]>(
  async () => {
    if (!path.value || !store.hasColumn("functions", "cognitive")) return []
    return store.query<FunctionRow>(`SELECT file, name, begin_line, end_line, lines, cognitive, nesting, params FROM functions WHERE file = ${sqlLiteral(path.value)} ORDER BY begin_line`)
  },
  [path, () => store.datasetKey],
  { initial: [] },
)
const rows = computed(() => data.value ?? [])

const columns: Array<{ key: SortKey; label: string; num: boolean }> = [
  { key: "name", label: t("pages.filesFunctions.function"), num: false },
  { key: "begin_line", label: t("pages.filesFunctions.line"), num: true },
  { key: "cognitive", label: t("metrics.complexFunctions.cognitive"), num: true },
  { key: "lines", label: t("metrics.complexFunctions.lines"), num: true },
  { key: "nesting", label: t("metrics.complexFunctions.nesting"), num: true },
  { key: "params", label: t("metrics.complexFunctions.params"), num: true },
]
const sort = reactive<{ key: SortKey; asc: boolean }>({ key: "cognitive", asc: false })
function sortBy(key: SortKey) {
  if (sort.key === key) sort.asc = !sort.asc
  else Object.assign(sort, { key, asc: key === "name" || key === "begin_line" })
}
const sorted = computed(() => [...rows.value].sort((a, b) => {
  const d = sort.key === "name" ? nameOf(a).localeCompare(nameOf(b)) : (a[sort.key] as number) - (b[sort.key] as number)
  return (sort.asc ? d : -d) || a.begin_line - b.begin_line
}))

const complexCount = computed(() => rows.value.filter(r => r.cognitive > COMPLEX).length)
const lede = computed(() => complexCount.value
  ? t("pages.filesFunctions.ledeComplex", { count: rows.value.length, functions: fmtInt(rows.value.length), complex: fmtInt(complexCount.value), threshold: COMPLEX })
  : t("pages.filesFunctions.ledeSimple", { count: rows.value.length, functions: fmtInt(rows.value.length), threshold: COMPLEX }))

const table = useTable({
  title: t("pages.filesFunctions.functions"),
  rows: () => sorted.value.map(r => ({ function: r.name, begin_line: r.begin_line, end_line: r.end_line, cognitive: r.cognitive, lines: r.lines, nesting: r.nesting, params: r.params })),
  columns: () => ["function", "begin_line", "end_line", "cognitive", "lines", "nesting", "params"].map(id => ({ id, label: id.replace(/_/g, " ") })),
  notes: () => [["cognitive", t("metrics.complexFunctions.whatCognitiveMeans")]],
})

function nameOf(r: FunctionRow): string {
  return r.name || t("metrics.complexFunctions.anonymous", { line: r.begin_line })
}
</script>
