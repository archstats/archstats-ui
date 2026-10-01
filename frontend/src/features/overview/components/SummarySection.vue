
<template>
  <section>
    <!-- Page header: what this is, which snapshot. -->
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900">{{ t('overview.summarySection.overview') }}</h1>
      <span class="font-mono text-sm text-neutral-500">{{ workspaceName }}<template v-if="snapshotLabel">{{ ' ' + t('overview.summarySection.snapshot', { snapshotLabel }) }}</template></span>
      <span v-if="isJavaProject" class="ui-tag">{{ t('overview.summarySection.java') }}</span>
      <span v-if="isSpringProject" class="ui-tag">{{ t('overview.summarySection.spring') }}</span>
      <span v-if="isJpaProject" class="ui-tag">{{ t('overview.summarySection.jpa') }}</span>
    </div>
    <!-- Which code this is: the commit it read, how old that commit was, what was uncommitted. -->
    <div v-if="identity || shallowClone" class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span v-if="identity" class="font-mono" :title="store.snapshotInfo?.git_head_commit">{{ identity }}</span>
      <span v-if="shallowClone" class="ui-tag" :title="t('overview.summarySection.repositoryWasClonedDepth')">{{ t('overview.summarySection.shallowClone') }}</span>
      <router-link to="/views/snapshot" class="text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">{{ t('overview.summarySection.aboutSnapshot') }}</router-link>
    </div>

    <!-- Stats strip: one hairline frame, six readings. -->
    <dl class="mt-5 grid grid-cols-3 overflow-hidden rounded-lg hairline lg:grid-cols-6">
      <div v-for="(stat, i) in strip" :key="stat.label" class="flex flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i % 3 !== 0, 'lg:hairline-l': i !== 0, 'hairline-t lg:border-t-0': i >= 3 }">
        <dt class="ui-label">{{ stat.label }}</dt>
        <dd class="text-[22px] font-medium leading-7 tabular text-neutral-900">{{ stat.value }}</dd>
        <dd v-if="stat.sub" class="text-sm leading-4" :class="stat.warn ? 'text-amber-700' : 'text-neutral-500'">{{ stat.sub }}</dd>
      </div>
    </dl>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <!-- Structure -->
      <div class="ui-panel p-4">
        <h2 class="ui-panel-title">{{ t('overview.summarySection.structure') }}</h2>
        <dl class="mt-3 flex flex-col gap-3">
          <!-- System shape: how entangled the code is, as numbers a report can defend. No grade. -->
          <div v-if="shape.length" class="ui-kv pb-3 hairline-b">
            <template v-for="row in shape" :key="row.id">
              <dt><MetricHint :id="row.id">{{ row.label }}</MetricHint></dt>
              <dd class="!whitespace-normal">
                <router-link v-if="row.to" :to="row.to" class="underline-offset-2 hover:underline" :title="row.inputs">{{ row.value }}</router-link>
                <span v-else :title="row.inputs">{{ row.value }}</span>
              </dd>
            </template>
          </div>
          <div v-if="abstractionRatio !== null">
            <div class="flex items-baseline justify-between">
              <dt class="text-base text-neutral-600">{{ t('overview.summarySection.abstractTypes') }}</dt>
              <dd class="font-mono text-sm tabular-nums text-neutral-900">{{ fixed(abstractionRatio, 1) }}%</dd>
            </div>
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div class="h-full rounded-full bg-neutral-500 transition-[width]" :style="{ width: abstractionRatio + '%' }"></div>
            </div>
            <p class="mt-1 text-sm leading-4 text-neutral-500">{{ t('overview.summarySection.shareAbstractTypesAmong') }}</p>
          </div>
          <div class="ui-kv">
            <template v-if="getVal('complexity__indentation__avg') !== null">
              <dt>{{ t('overview.summarySection.averageIndentation') }}</dt><dd>{{ fixed(getVal('complexity__indentation__avg'), 2) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__imports') !== null">
              <dt>{{ t('overview.summarySection.componentImports') }}</dt><dd>{{ formatVal(getVal('modularity__component__imports')) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__declarations') !== null">
              <dt :title="t('overview.summarySection.packageNamespaceStatementsOne')">{{ t('overview.summarySection.packageDeclarations') }}</dt><dd>{{ formatVal(getVal('modularity__component__declarations')) }}</dd>
            </template>
            <template v-if="componentDependencies !== null">
              <dt><MetricHint id="app__cross_component_edges">{{ t('overview.summarySection.componentDependencies') }}</MetricHint></dt><dd>{{ formatVal(componentDependencies) }}</dd>
            </template>
            <template v-if="evidenceText">
              <dt :title="t('overview.summarySection.howDependenciesWereFound')">{{ t('overview.summarySection.dependencyEvidence') }}</dt>
              <dd class="!whitespace-normal"><router-link to="/views/snapshot#dependencies" class="underline-offset-2 hover:underline">{{ evidenceText }}</router-link></dd>
            </template>
            <template v-if="getVal('connection_count') !== null">
              <dt :title="t('overview.summarySection.individualImportsCrossOne')">{{ t('overview.summarySection.crossComponentImports') }}</dt><dd>{{ formatVal(getVal('connection_count')) }}</dd>
            </template>
            <template v-if="avgFilesPerComponent">
              <dt>{{ t('overview.summarySection.filesPerComponent') }}</dt><dd>{{ fixed(avgFilesPerComponent, 1) }}</dd>
            </template>
            <template v-if="avgLinesPerFile">
              <dt>{{ t('overview.summarySection.linesPerFile') }}</dt><dd>{{ fixed(avgLinesPerFile, 0) }}</dd>
            </template>
          </div>
          <div v-if="isJavaProject && javaStats.length > 0" class="pt-3 hairline-t">
            <span class="ui-label">{{ t('overview.summarySection.java') }}</span>
            <div class="ui-kv mt-1.5">
              <template v-for="stat in javaStats" :key="stat.key">
                <dt>{{ stat.label }}</dt><dd>{{ formatVal(stat.value) }}</dd>
              </template>
            </div>
          </div>
        </dl>
      </div>

      <!-- Activity -->
      <div class="ui-panel p-4">
        <h2 class="ui-panel-title">{{ t('overview.summarySection.activity') }}</h2>
        <div v-if="hasGitChurn" class="mt-3">
          <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div class="h-full bg-green-500" :style="{ width: additionsPercent + '%' }" :title="t('overview.summarySection.additions', { value: additionsPercent.toFixed(1) })"></div>
            <div class="h-full bg-red-500" :style="{ width: deletionsPercent + '%' }" :title="t('overview.summarySection.deletions', { value: deletionsPercent.toFixed(1) })"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between font-mono text-sm tabular-nums">
            <span class="text-green-700">{{ t('overview.summarySection.added', { value: formatVal(getVal('git__additions__total')) }) }}</span>
            <span class="text-red-700">{{ t('overview.summarySection.removed', { value: formatVal(getVal('git__deletions__total')) }) }}</span>
          </div>
        </div>
        <div class="mt-3 overflow-x-auto">
          <slot name="activity"></slot>
        </div>
      </div>
    </div>

    <!-- Everything else the engine measured. -->
    <details v-if="extraStats.length > 0" class="group/details mt-4 rounded-lg hairline">
      <summary class="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-base font-medium text-neutral-800 hover:bg-neutral-50">
        <I18nT k="overview.summarySection.moreMetrics"><template #icon><Icon icon="chevron-right" :size="14" class="text-neutral-400 transition-transform group-open/details:rotate-90"/></template><template #extraStatsLength><span class="ui-tag">{{ extraStats.length }}</span></template></I18nT>
      </summary>
      <dl class="ui-kv gap-y-1.5 px-4 pb-4 pt-2 hairline-t sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:gap-x-6">
        <template v-for="stat in extraStats" :key="stat.key">
          <dt><MetricHint :id="stat.key">{{ stat.label }}</MetricHint></dt>
          <dd>{{ formatStatValue(stat.value) }}</dd>
        </template>
      </dl>
    </details>
  </section>
</template>
<script setup lang="ts">
import { fixed } from "~/shared/format"
import MetricHint from "~/features/snapshot/components/MetricHint.vue"
import { ReadingsOf } from "wailsjs/go/app/ChangesService"
import { computed, ref, watch } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import Icon from "~/shared/ui/Icon.vue"
import { useJavaMetrics } from "~/features/java/useJavaMetrics"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { formatScanTime } from "~/shared/time"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useAuthorsStore } from "~/features/git/authors.store"
import { IN_SNAPSHOT, NOT_BOT_SQL, canonicalAuthorSql } from "~/features/git/authors"
import { t, intlLocale } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

const store = useDataStore()
const workspaces = useWorkspacesStore()
const { isJavaProject, isSpringProject, isJpaProject } = useJavaMetrics()

const workspaceName = computed(() => workspaces.active?.name ?? "")
const identity = computed(() => {
  const info: any = store.snapshotInfo ?? {}
  if (!info.git_head_commit) return ""
  const parts = [`${info.git_branch || "HEAD"} @ ${info.git_head_commit.slice(0, 7)}`]
  const scan: any = workspaces.openScan
  if (info.git_head_time && scan?.startedAt) {
    const days = Math.round((new Date(scan.startedAt).getTime() - new Date(info.git_head_time).getTime()) / 86400000)
    parts.push(days <= 0 ? t("overview.summarySection.committedDayScan") : t("overview.summarySection.committedBeforeScan", { days: t("common.count.day", { count: days }) }))
  }
  const dirty = Number(info.git_dirty_files ?? 0)
  if (dirty > 0) parts.push(t("overview.summarySection.uncommitted", { dirty, files: t("common.noun.file", { count: dirty }) }))
  return parts.join(" · ")
})
const snapshotLabel = computed(() => {
  const scan = workspaces.openScan
  return scan ? formatScanTime(scan.startedAt) : ""
})

// The six readings in the strip. Missing values read as a dash, never as zero.
const strip = computed(() => {
  const n = (key: string) => (getVal(key) === null ? "—" : formatVal(getVal(key)))
  return [
    { label: t("overview.summarySection.components"), value: n("component_count"), sub: "", warn: false },
    { label: t("overview.summarySection.files"), value: n("complexity__files"), sub: "", warn: false },
    { label: t("overview.summarySection.lines"), value: n("complexity__lines"), sub: "", warn: false },
    { label: t("overview.summarySection.directories"), value: n("directory_count"), sub: "", warn: false },
    // A shallow clone's history stops at the depth it was cloned with: gin
    // read one commit by one contributor, with nothing to say so.
    { label: t("overview.summarySection.commits"), value: people.value ? formatVal(people.value.commits) : n("git__commits__total"), sub: shallowClone.value ? t("overview.summarySection.shallowCloneHistoryCut") : t("overview.summarySection.filesSnapshot"), warn: shallowClone.value },
    // A mean, said as one: "103 commits each" read as every contributor's number.
    { label: t("overview.summarySection.contributors"), value: people.value ? formatVal(people.value.authors) : n("git__authors__total"), sub: shallowClone.value ? t("overview.summarySection.fetchedHistoryOnly") : commitsPerAuthor.value ? t("overview.summarySection.thoseFilesCommitsAverage", { value: commitsPerAuthor.value.toFixed(0) }) : t("overview.summarySection.filesSnapshot"), warn: shallowClone.value },
  ]
})

const summary = ref<Record<string, any>>({})

/** Whether any scanned repository is a shallow clone. */
const shallowClone = ref(false)
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    shallowClone.value = false
    if (!hasData || !store.hasView("git_repos")) return
    try {
      const rows = await store.query<{ n: number }>("SELECT count(*) AS n FROM git_repos WHERE git__shallow_clone = 1")
      shallowClone.value = Number(rows[0]?.n ?? 0) > 0
    } catch {
      // Snapshots taken before the column existed say nothing either way.
    }
  },
  { immediate: true },
)

// Distinct component pairs where one imports the other, runtime imports only:
// the number people mean by "dependencies". The summary's connection_count is
// every individual import crossing a component boundary -- 10,370 for
// Broadleaf, whose components have 2,603 dependencies.
// ── System shape ────────────────────────────────────────────────────
// The app's readings of this snapshot, computed once per scan in Go (the
// same numbers Over time draws).
const { data: readings } = useAsyncQuery<Record<string, number | null>>(
  async () => {
    const id = workspaces.openScanId
    if (!id) return {}
    try { return ((await ReadingsOf(id)) ?? {}) as any } catch { return {} }
  },
  [() => workspaces.openScanId],
  { initial: {} },
)
const shape = computed(() => {
  const r = readings.value
  const num = (k: string) => (r[k] === null || r[k] === undefined ? null : Number(r[k]))
  const n = num("app__components"), pairs = num("app__reachable_pairs"), pc = num("app__propagation_cost")
  const inTangles = num("app__components_in_tangles"), linesShare = num("app__lines_in_tangles_share")
  const largest = num("app__largest_tangle"), levels = num("app__dependency_levels")
  const pct = (v: number) => `${(v * 100).toLocaleString(intlLocale, { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`
  const f = (v: number) => v.toLocaleString(intlLocale)
  const rows: Array<{ id: string; label: string; value: string; inputs: string; to?: string }> = []
  if (pc !== null) rows.push({ id: "app__propagation_cost", label: t("overview.summarySection.propagationCost"), value: pct(pc), inputs: pairs !== null && n ? t("overview.summarySection.reachablePairs", { pairs: f(pairs), n: f(n), n2: f(n) }) : "", to: "/views/connections?rep=matrix&order=levels&level=components" })
  if (inTangles !== null && n) rows.push({ id: "app__components_in_tangles", label: t("overview.summarySection.componentsTangles"), value: `${f(inTangles)} of ${f(n)} (${pct(inTangles / n)})`, inputs: t("overview.summarySection.componentsStronglyConnectedGroup"), to: "/views/components/cycles" })
  if (linesShare !== null) rows.push({ id: "app__lines_in_tangles_share", label: t("overview.summarySection.linesTangles"), value: pct(linesShare), inputs: t("overview.summarySection.linesTangledComponentsOver"), to: "/views/components/cycles" })
  if (largest !== null) rows.push({ id: "app__largest_tangle", label: t("overview.summarySection.largestTangle"), value: largest ? `${f(largest)} components` : "none", inputs: "", to: largest ? "/views/components/cycles" : undefined })
  if (levels !== null) rows.push({ id: "app__dependency_levels", label: t("overview.summarySection.dependencyLevels"), value: f(levels), inputs: t("overview.summarySection.longestImportChainOnce"), to: "/views/connections?rep=matrix&order=levels&level=components" })
  return rows
})

const componentDependencies = ref<number | null>(null)
// How far to trust the coupling numbers: said only when something other than
// plain imports is in play (Java, C#, PHP and Go are all imports).
const evidence = ref<{ total: number; dynamicOnly: number; typeOnly: number; unresolved: number } | null>(null)
const evidenceText = computed(() => {
  const e = evidence.value
  if (!e) return ""
  const parts: string[] = []
  if (e.dynamicOnly) parts.push(t("overview.summarySection.onlyRuntimeLookup", { dynamicOnly: formatVal(e.dynamicOnly), total: formatVal(e.total) }))
  if (e.unresolved) parts.push(t("overview.summarySection.unresolved", { unresolved: formatVal(e.unresolved), lookups: t("common.noun.lookup", { count: e.unresolved }) }))
  if (e.typeOnly) parts.push(t("overview.summarySection.typesOnlyLeftOut", { typeOnly: formatVal(e.typeOnly) }))
  return parts.join(" · ")
})
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    componentDependencies.value = null
    if (!hasData || !store.hasView("component_connections_direct")) return
    try {
      const cols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('component_connections_direct')")
      const runtimeOnly = cols.some(c => c.name === "kind") ? t("overview.summarySection.kindTypeOnly") : ""
      const rows = await store.query<{ n: number }>(
        `SELECT count(*) AS n FROM (SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE "from" != "to" ${runtimeOnly})`,
      )
      componentDependencies.value = Number(rows[0]?.n ?? 0)
      evidence.value = null
      if (runtimeOnly) {
        const [pairs] = await store.query<{ total: number; dynamic_only: number; type_only: number }>(`
          WITH p AS (
            SELECT "from", "to", max(kind = 'import') AS s, max(kind = 'dynamic') AS d, max(kind = 'type_only') AS t
            FROM component_connections_direct WHERE "from" != "to" GROUP BY 1, 2)
          SELECT sum(s = 1 OR d = 1) AS total, sum(d = 1 AND s = 0) AS dynamic_only, sum(t = 1 AND s = 0 AND d = 0) AS type_only FROM p`)
        const unresolved = store.hasView("unresolved_edges") ? Number((await store.query<{ n: number }>("SELECT count(*) AS n FROM unresolved_edges"))[0]?.n ?? 0) : 0
        evidence.value = { total: Number(pairs?.total ?? 0), dynamicOnly: Number(pairs?.dynamic_only ?? 0), typeOnly: Number(pairs?.type_only ?? 0), unresolved }
      }
    } catch {
      componentDependencies.value = null
    }
  },
  { immediate: true },
)
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    if (!hasData) {
      summary.value = {}
      return
    }
    try {
      const rows = await store.getView<any>("summary")
      summary.value = rows.reduce((acc: any, item: any) => {
        acc[item.name] = item.value
        return acc
      }, {})
    } catch {
      summary.value = {}
    }
  },
  { immediate: true }
)

// Safe parsing helper
const getVal = (key: string): number | null => {
  const val = summary.value[key]
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  return isNaN(num) ? null : num
}

// Derived Metrics
const avgFilesPerComponent = computed(() => {
  const files = getVal('complexity__files')
  const comps = getVal('component_count')
  return files && comps ? files / comps : null
})

const avgLinesPerFile = computed(() => {
  const lines = getVal('complexity__lines')
  const files = getVal('complexity__files')
  return lines && files ? lines / files : null
})

// Commits and contributors counted the way Authors and Activity count them:
// commits to files in the snapshot, merged names as one person, bots left out
// unless shown. The engine's totals count bots and split names, so the strip
// read one number here and another a click away.
const authorsStore = useAuthorsStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })
const { data: people } = useAsyncQuery<{ commits: number; authors: number } | null>(
  async () => {
    if (!store.hasView("git_commits")) return null
    const rows = await store.query<{ commits: number; authors: number }>(
      `SELECT count(DISTINCT commit_hash) AS commits, count(DISTINCT ${canonicalAuthorSql(authorsStore.aliases)}) AS authors
       FROM git_commits WHERE ${IN_SNAPSHOT}${authorsStore.showBots ? "" : ` AND ${NOT_BOT_SQL}`}`)
    return rows[0] ?? null
  },
  [() => store.datasetKey, () => authorsStore.aliases, () => authorsStore.showBots],
  { initial: null },
)

const commitsPerAuthor = computed(() => {
  const commits = people.value?.commits ?? getVal('git__commits__total')
  const authors = people.value?.authors ?? getVal('git__authors__total')
  return commits && authors ? commits / authors : null
})

// Git additions vs deletions
const hasGitChurn = computed(() => {
  return getVal('git__additions__total') !== null && getVal('git__deletions__total') !== null
})

const additionsPercent = computed(() => {
  const adds = getVal('git__additions__total') || 0
  const dels = getVal('git__deletions__total') || 0
  const total = adds + dels
  if (total === 0) return 50
  return (adds / total) * 100
})

const deletionsPercent = computed(() => {
  return 100 - additionsPercent.value
})

// Java counts from the summary table; only the keys the scan produced show.
const javaKeys = [
  { key: "java__class__declarations", label: t("overview.summarySection.classes") },
  { key: "java__method_declarations", label: t("overview.summarySection.methods") },
  { key: "java__field__declarations", label: t("overview.summarySection.fields") },
  { key: "java__spring__beans", label: t("overview.summarySection.springBeans") },
  { key: "java__jpa__entities", label: t("overview.summarySection.jpaEntities") },
]
const javaStats = computed(() =>
  javaKeys
    .map(k => ({ ...k, value: getVal(k.key) }))
    .filter((s): s is { key: string; label: string; value: number } => s.value !== null),
)

// Abstraction Ratio
const abstractionRatio = computed(() => {
  const abs = getVal('modularity__types__abstract')
  const total = getVal('modularity__types__total')
  if (abs === null || !total) return null
  return (abs / total) * 100
})

// Extra metrics discovery filtering
const mainDashboardKeys = new Set([
  'component_count',
  'complexity__files',
  'complexity__lines',
  'directory_count',
  'connection_count',
  'git__commits__total',
  'git__authors__total',
  'git__additions__total',
  'git__deletions__total',
  'git__age_in_days',
  'complexity__indentation__avg',
  'modularity__types__abstract',
  'modularity__types__total',
  'modularity__component__declarations',
  'modularity__component__imports',
  'version',
  ...javaKeys.map(k => k.key),
])

const extraStats = computed(() => {
  const extra = []
  for (const [key, val] of Object.entries(summary.value)) {
    // Numbers only: a single class name stamped on the whole codebase by an
    // older engine read as a metric of it.
    if (!mainDashboardKeys.has(key) && val !== null && val !== undefined && val !== '' && !Number.isNaN(Number(val))) {
      extra.push({
        key,
        label: store.statNiceName(key) || key,
        value: val
      })
    }
  }
  return extra.sort((a, b) => a.label.localeCompare(b.label))
})

// Formatting helpers
function formatVal(val: any): string {
  if (val == null || val === "") return ""
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString(intlLocale)
  return fixed(n, 2)
}

function formatStatValue(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString(intlLocale)
  return fixed(n, 1)
}
</script>

