<template>
  <section v-if="rows.length" :class="sectionClass">
    <ExhibitFrame :exhibit="table" header-class="mb-2">
      <template #aside>{{ asideText }}</template>
      <div class="overflow-hidden rounded-lg hairline">
        <table class="ui-table">
          <thead>
            <tr>
              <th>{{ t('metrics.complexFunctions.function') }}</th>
              <th v-if="component">{{ t('metrics.complexFunctions.file') }}</th>
              <th class="w-[90px] text-right">{{ t('metrics.complexFunctions.cognitive') }}</th>
              <th class="w-[80px] text-right">{{ t('metrics.complexFunctions.lines') }}</th>
              <th class="w-[80px] text-right">{{ t('metrics.complexFunctions.nesting') }}</th>
              <th class="w-[90px] text-right">{{ t('metrics.complexFunctions.params') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="`${r.file}:${r.begin_line}`">
              <td class="max-w-0 truncate font-mono text-sm">
                <router-link :to="sourceLink(r)" class="text-neutral-900 underline-offset-2 hover:underline" :title="nameOf(r)">{{ nameOf(r) }}</router-link>
              </td>
              <td v-if="component" class="max-w-0 truncate font-mono text-sm">
                <router-link :to="filePath(r.file)" class="text-neutral-700 underline-offset-2 hover:underline" :title="r.file">{{ basename(r.file) }}</router-link>
              </td>
              <td class="is-num text-right text-red-700">{{ fmtInt(r.cognitive) }}</td>
              <td class="is-num text-right">{{ fmtInt(r.lines) }}</td>
              <td class="is-num text-right">{{ fmtInt(r.nesting) }}</td>
              <td class="is-num text-right">{{ fmtInt(r.params) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </ExhibitFrame>
    <p class="mt-2 max-w-[76ch] text-sm text-neutral-500">{{ t('metrics.complexFunctions.whatCognitiveMeans') }}</p>
  </section>
</template>

<script setup lang="ts">
// The functions behind a file's or a component's complex-code deduction:
// those over SonarSource's cognitive-complexity line of 15, worst first,
// each opening the source at its lines. Snapshots before revision 11 have no
// functions table and show nothing.
import { computed } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { useTable } from "~/features/export/useExportables"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { filePath } from "~/features/navigation/routes"
import { fmtInt } from "~/features/metrics/healthBreakdown"
import { sqlLiteral } from "~/shared/sql"
import { t } from "~/shared/i18n"

const props = withDefaults(defineProps<{
  /** One file's complex functions, every one of them. */
  file?: string
  /** A component's most complex functions, across its files. */
  component?: string
  limit?: number
  sectionClass?: string
}>(), { file: undefined, component: undefined, limit: 25, sectionClass: "mt-5" })

interface FunctionRow { file: string; name: string; begin_line: number; end_line: number; lines: number; cognitive: number; nesting: number; params: number }

const COMPLEX = 15
const store = useDataStore()

const scope = computed(() => props.file !== undefined ? `file = ${sqlLiteral(props.file)}` : props.component !== undefined ? `component = ${sqlLiteral(props.component)}` : null)

const { data } = useAsyncQuery<{ rows: FunctionRow[]; total: number }>(
  async () => {
    if (!scope.value || !store.hasColumn("functions", "cognitive")) return { rows: [], total: 0 }
    const [rows, count] = await Promise.all([
      store.query<FunctionRow>(`SELECT file, name, begin_line, end_line, lines, cognitive, nesting, params FROM functions WHERE ${scope.value} AND cognitive > ${COMPLEX} ORDER BY cognitive DESC, lines DESC LIMIT ${props.limit}`),
      store.query<{ n: number }>(`SELECT count(*) AS n FROM functions WHERE ${scope.value} AND cognitive > ${COMPLEX}`),
    ])
    return { rows, total: Number(count[0]?.n ?? rows.length) }
  },
  [scope, () => store.datasetKey],
  { initial: { rows: [], total: 0 } },
)

const rows = computed(() => data.value?.rows ?? [])
const total = computed(() => data.value?.total ?? 0)

const asideText = computed(() => total.value > rows.value.length
  ? t("metrics.complexFunctions.shownOfOver", { shown: fmtInt(rows.value.length), total: fmtInt(total.value), threshold: COMPLEX })
  : t("metrics.complexFunctions.over", { total: fmtInt(total.value), threshold: COMPLEX }))

const table = useTable({
  title: props.component !== undefined ? t("metrics.complexFunctions.mostComplexFunctions") : t("metrics.complexFunctions.complexFunctions"),
  rows: () => rows.value.map(r => ({ function: r.name, file: r.file, begin_line: r.begin_line, end_line: r.end_line, cognitive: r.cognitive, lines: r.lines, nesting: r.nesting, params: r.params })),
  columns: () => ["function", "file", "begin_line", "end_line", "cognitive", "lines", "nesting", "params"].map(id => ({ id, label: id.replace(/_/g, " ") })),
  notes: () => [["cognitive", t("metrics.complexFunctions.whatCognitiveMeans")]],
})

function nameOf(r: FunctionRow): string {
  return r.name || t("metrics.complexFunctions.anonymous", { line: r.begin_line })
}
function sourceLink(r: FunctionRow): string {
  return `${filePath(r.file, "source")}#L${r.begin_line}-L${r.end_line}`
}
function basename(p: string): string {
  return p.split("/").pop() || p
}
</script>
