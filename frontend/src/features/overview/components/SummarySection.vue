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
    <div v-if="identity || facts.shallow" class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span v-if="identity" class="font-mono" :title="store.snapshotInfo?.git_head_commit">{{ identity }}</span>
      <span v-if="facts.shallow" class="ui-tag" :title="t('overview.summarySection.repositoryWasClonedDepth')">{{ t('overview.summarySection.shallowClone') }}</span>
      <router-link to="/views/snapshot" class="text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">{{ t('overview.summarySection.aboutSnapshot') }}</router-link>
    </div>

    <!-- Stats strip: one hairline frame, six readings. -->
    <dl class="mt-6 grid grid-cols-3 overflow-hidden rounded-lg hairline lg:grid-cols-6">
      <div v-for="(stat, i) in strip" :key="stat.label" class="flex flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i % 3 !== 0, 'lg:hairline-l': i !== 0, 'hairline-t lg:border-t-0': i >= 3 }">
        <dt class="ui-label">{{ stat.label }}</dt>
        <dd class="text-[22px] font-medium leading-7 tabular text-neutral-900" :class="stat.ink">{{ stat.value }}</dd>
        <dd v-if="stat.sub" class="text-sm leading-4" :class="stat.warn ? 'text-amber-700' : 'text-neutral-500'">{{ stat.sub }}</dd>
      </div>
    </dl>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <!-- Code: what it is written in and how it hangs together. -->
      <div class="ui-panel p-5">
        <h2 class="ui-panel-title">{{ t('overview.summarySection.code') }}</h2>

        <div v-if="languages.length" class="mt-3">
          <div class="flex items-baseline">
            <h3 class="ui-section-title">{{ t('overview.summarySection.languages') }}</h3>
            <router-link to="/views/snapshot" class="ml-auto text-sm text-neutral-500 hover:text-neutral-900">{{ t('overview.summarySection.composition') }}</router-link>
          </div>
          <div class="mt-3 flex h-1.5 w-full gap-0.5">
            <div v-for="(l, i) in languages" :key="l.language || 'other'" class="h-full rounded-full" :class="languageInk(i, l)" :style="{ width: l.share * 100 + '%' }" :title="languageName(l)"></div>
          </div>
          <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-1.5">
            <template v-for="(l, i) in languages" :key="l.language || 'other'">
              <span class="h-2 w-2 self-center rounded-full" :class="languageInk(i, l)"></span>
              <dt class="truncate text-sm text-neutral-800">{{ languageName(l) }}</dt>
              <dd class="text-right text-sm tabular-nums text-neutral-500">{{ t('common.count.line', { count: l.lines }) }}</dd>
              <dd class="w-12 text-right text-sm font-medium tabular-nums text-neutral-900">{{ pct(l.share) }}</dd>
            </template>
          </dl>
          <p class="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-neutral-500">
            <span v-for="r in roles" :key="r.role" :class="{ 'text-amber-700': r.warn }">{{ r.label }} <span class="tabular-nums text-neutral-700">{{ pct(r.share) }}</span></span>
          </p>
        </div>

        <div v-if="tiles.length" class="mt-6 pt-5 hairline-t">
          <h3 class="ui-section-title">{{ t('overview.summarySection.structure') }}</h3>
          <!-- How entangled the code is, as numbers a report can defend. No grade. -->
          <ul class="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <li v-for="tile in tiles" :key="tile.id" class="min-w-0">
              <component :is="tile.to ? RouterLink : 'div'" :to="tile.to" class="group block" :title="tile.inputs">
                <span class="block truncate text-sm text-neutral-500"><MetricHint :id="tile.id">{{ tile.label }}</MetricHint></span>
                <span class="mt-0.5 block text-xl font-medium leading-7 tabular-nums text-neutral-900" :class="{ 'group-hover:underline group-hover:decoration-neutral-300 group-hover:underline-offset-4': tile.to }">{{ tile.value }}</span>
                <span class="block truncate text-sm text-neutral-500">{{ tile.sub }}</span>
              </component>
            </li>
          </ul>
          <p v-if="evidenceText" class="mt-2 text-sm text-neutral-500" :title="t('overview.summarySection.howDependenciesWereFound')">
            {{ t('overview.summarySection.dependencyEvidence') }}:
            <router-link to="/views/snapshot#dependencies" class="underline-offset-2 hover:text-neutral-900 hover:underline">{{ evidenceText }}</router-link>
          </p>
        </div>

        <div v-if="isJavaProject && javaStats.length > 0" class="mt-6 pt-5 hairline-t">
          <h3 class="ui-section-title">{{ t('overview.summarySection.java') }}</h3>
          <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            <div v-for="stat in javaStats" :key="stat.key" class="flex items-baseline gap-2">
              <dt class="truncate text-sm text-neutral-500">{{ stat.label }}</dt>
              <dd class="ml-auto text-sm tabular-nums text-neutral-900">{{ formatVal(stat.value) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Activity: when the history runs, who is still on it, and its shape. -->
      <div class="ui-panel flex flex-col p-5">
        <h2 class="ui-panel-title">{{ t('overview.summarySection.activity') }}</h2>
        <dl v-if="facts.history.first" class="mt-4 grid grid-cols-3 gap-4">
          <div v-for="fact in historyFacts" :key="fact.label" class="min-w-0">
            <dt class="ui-label">{{ fact.label }}</dt>
            <dd class="mt-0.5 truncate text-base font-medium text-neutral-900">{{ fact.value }}</dd>
            <dd class="text-sm leading-4" :class="fact.warn ? 'text-amber-700' : 'text-neutral-500'">{{ fact.sub }}</dd>
          </div>
        </dl>
        <div class="mt-5 min-w-0 flex-1">
          <slot name="activity"></slot>
        </div>
      </div>
    </div>

    <HealthPanel :facts="facts"/>
    <InterestPanel :facts="facts"/>

    <slot name="findings"></slot>

  </section>
</template>
<script setup lang="ts">
import { fixed } from "~/shared/format"
import MetricHint from "~/features/snapshot/components/MetricHint.vue"
import { computed, ref, watch } from "vue"
import { RouterLink } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useJavaMetrics } from "~/features/java/useJavaMetrics"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { formatDate, formatScanTime } from "~/shared/time"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useAuthorsStore } from "~/features/git/authors.store"
import { IN_SNAPSHOT, NOT_BOT_SQL, canonicalAuthorSql } from "~/features/git/authors"
import { formatHealth, healthLevel, levelTextClass } from "~/features/metrics/useHealth"
import { ROLE_LABELS, languageLabel, type FileRole } from "~/features/snapshot/languages"
import { healthReading, languageShares, pct, roleLines, type OverviewFacts } from "~/features/overview/findings"
import HealthPanel from "./HealthPanel.vue"
import InterestPanel from "./InterestPanel.vue"
import { t, intlLocale } from "~/shared/i18n"

const props = defineProps<{ facts: OverviewFacts; recentAuthors: number }>()

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

// ── Code ────────────────────────────────────────────────────────────────
const languages = computed(() => languageShares(props.facts.files))
const LANGUAGE_INK = ["bg-blue-500", "bg-violet-400", "bg-blue-300", "bg-violet-200"]
const languageInk = (i: number, l: { language: string }) => (l.language ? LANGUAGE_INK[i] ?? "bg-neutral-300" : "bg-neutral-300")
const languageName = (l: { language: string; other?: number }) => (l.language ? languageLabel(l.language) : t("overview.summarySection.otherLanguages", { count: l.other ?? 0 }))

// Production, tests and the rest, by lines. Tests always show: none is a fact.
const roles = computed(() => {
  const lines = roleLines(props.facts.files)
  const total = Object.values(lines).reduce((s, v) => s + v, 0)
  if (!total) return []
  const order: FileRole[] = ["production", "test", "generated", "third_party", "non_code"]
  return order
    .filter(r => r === "production" || r === "test" || lines[r] > 0)
    .map(r => ({ role: r, label: ROLE_LABELS[r], share: lines[r] / total, warn: r === "test" && lines.production > 2000 && lines.test / total < 0.02 }))
})

const health = computed(() => healthReading(props.facts.files))

// ── Activity ────────────────────────────────────────────────────────────
const historyFacts = computed(() => {
  const h = props.facts.history
  if (!h.first || !h.last) return []
  const month = (d: string) => new Date(d).toLocaleDateString(intlLocale, { month: "short", year: "numeric" })
  const years = (new Date(h.last).getTime() - new Date(h.first).getTime()) / (365.25 * 86400000)
  const gap = h.scan ? Math.round((new Date(h.scan).getTime() - new Date(h.last).getTime()) / 86400000) : 0
  const gapText = gap <= 1 ? t("overview.summarySection.lastCommitDayOfScan")
    : t("overview.summarySection.lastCommitBefore", { span: gap >= 60 ? t("common.count.month", { count: Math.round(gap / 30.4) }) : t("common.count.day", { count: gap }) })
  return [
    { label: t("overview.summarySection.history"), value: `${month(h.first)} – ${month(h.last)}`, sub: t("overview.summarySection.years", { years: years.toLocaleString(intlLocale, { maximumFractionDigits: 1 }) }), warn: false },
    { label: t("overview.summarySection.lastCommit"), value: formatDate(h.last), sub: gapText, warn: gap >= 180 },
    { label: t("overview.summarySection.activeLately"), value: t("common.count.person", { count: props.recentAuthors }), sub: t("overview.summarySection.activeLatelySub"), warn: false },
  ]
})

// The six readings in the strip. Missing values read as a dash, never as zero.
const strip = computed(() => {
  const n = (key: string) => (getVal(key) === null ? "—" : formatVal(getVal(key)))
  const h = health.value.mean, w = health.value.worked
  return [
    { label: t("overview.summarySection.components"), value: n("component_count"), sub: "", warn: false, ink: "" },
    { label: t("overview.summarySection.files"), value: n("complexity__files"), sub: "", warn: false, ink: "" },
    { label: t("overview.summarySection.lines"), value: n("complexity__lines"), sub: "", warn: false, ink: "" },
    // Two readings: all code, and the code that changes (each line counted per commit).
    { label: t("overview.summarySection.codeHealth"), value: formatHealth(h), sub: h === null ? "" : w === null ? t("overview.summarySection.healthOutOf") : t("overview.summarySection.healthWorked", { worked: formatHealth(w) }), warn: false, ink: levelTextClass(healthLevel(h)) },
    // A shallow clone's history stops at the depth it was cloned with: gin
    // read one commit by one contributor, with nothing to say so.
    { label: t("overview.summarySection.commits"), value: people.value ? formatVal(people.value.commits) : n("git__commits__total"), sub: props.facts.shallow ? t("overview.summarySection.shallowCloneHistoryCut") : t("overview.summarySection.filesSnapshot"), warn: props.facts.shallow, ink: "" },
    // A mean, said as one: "103 commits each" read as every contributor's number.
    { label: t("overview.summarySection.contributors"), value: people.value ? formatVal(people.value.authors) : n("git__authors__total"), sub: props.facts.shallow ? t("overview.summarySection.fetchedHistoryOnly") : commitsPerAuthor.value ? t("overview.summarySection.thoseFilesCommitsAverage", { value: commitsPerAuthor.value.toFixed(0) }) : t("overview.summarySection.filesSnapshot"), warn: props.facts.shallow, ink: "" },
  ]
})

const summary = ref<Record<string, any>>({})

const componentDependencies = ref<number | null>(null)

// ── System shape ────────────────────────────────────────────────────
// The app's readings of this snapshot, computed once per scan in Go (the
// same numbers Over time draws), one tile each.
const tiles = computed(() => {
  const r = props.facts.readings
  const num = (k: string) => (r[k] === null || r[k] === undefined ? null : Number(r[k]))
  const n = num("app__components"), pairs = num("app__reachable_pairs"), pc = num("app__propagation_cost")
  const inTangles = num("app__components_in_tangles"), linesShare = num("app__lines_in_tangles_share")
  const largest = num("app__largest_tangle"), levels = num("app__dependency_levels")
  const f = (v: number) => v.toLocaleString(intlLocale)
  const cycles = "/views/components/cycles", matrix = "/views/connections?rep=matrix&order=levels&level=components"
  const out: Array<{ id: string; label: string; value: string; sub: string; inputs: string; to?: string }> = []
  if (pc !== null) out.push({ id: "app__propagation_cost", label: t("overview.summarySection.propagationCost"), value: pct(pc), sub: t("overview.summarySection.propagationSub"), inputs: pairs !== null && n ? t("overview.summarySection.reachablePairs", { pairs: f(pairs), n: f(n), n2: f(n) }) : "", to: matrix })
  if (linesShare !== null) out.push({ id: "app__lines_in_tangles_share", label: t("overview.summarySection.linesTangles"), value: pct(linesShare), sub: t("overview.summarySection.ofAllLines"), inputs: t("overview.summarySection.linesTangledComponentsOver"), to: cycles })
  if (inTangles !== null && n) out.push({ id: "app__components_in_tangles", label: t("overview.summarySection.componentsTangles"), value: f(inTangles), sub: t("overview.summarySection.ofComponents", { n: f(n), share: pct(inTangles / n) }), inputs: t("overview.summarySection.componentsStronglyConnectedGroup"), to: cycles })
  if (largest !== null) out.push({ id: "app__largest_tangle", label: t("overview.summarySection.largestTangle"), value: f(largest), sub: t("common.noun.component", { count: largest }), inputs: "", to: largest ? cycles : undefined })
  if (levels !== null) out.push({ id: "app__dependency_levels", label: t("overview.summarySection.dependencyLevels"), value: f(levels), sub: t("overview.summarySection.levelsSub"), inputs: t("overview.summarySection.longestImportChainOnce"), to: matrix })
  if (componentDependencies.value !== null) out.push({ id: "app__cross_component_edges", label: t("overview.summarySection.componentDependencies"), value: f(componentDependencies.value), sub: t("overview.summarySection.dependenciesSub"), inputs: "", to: "/views/connections" })
  return out
})

// Distinct component pairs where one imports the other, runtime imports only:
// the number people mean by "dependencies". The summary's connection_count is
// every individual import crossing a component boundary -- 10,370 for
// Broadleaf, whose components have 2,603 dependencies.
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

// Commits and contributors counted the way Authors and Activity count them:
// commits to files in the snapshot, merged names as one person, bots left out
// unless shown. The engine's totals count bots and split names, so the strip
// read one number here and another a click away.
const authorsStore = useAuthorsStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })
const { data: people } = useAsyncQuery<{ commits: number; authors: number } | null>(
  async (signal) => {
    if (!store.hasView("git_commits")) return null
    const rows = await store.query<{ commits: number; authors: number }>(
      `SELECT count(DISTINCT commit_hash) AS commits, count(DISTINCT ${canonicalAuthorSql(authorsStore.aliases)}) AS authors
       FROM git_commits WHERE ${IN_SNAPSHOT}${authorsStore.showBots ? "" : ` AND ${NOT_BOT_SQL}`}`, { signal })
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

// Java counts from the summary table; only the keys the scan produced show.
const javaKeys = [
  { key: "java__class__declarations", label: t("overview.summarySection.classes") },
  { key: "java__method_declarations", label: t("overview.summarySection.methods") },
  { key: "java__field__declarations", label: t("overview.summarySection.fields") },
  { key: "java__spring__beans", label: t("overview.summarySection.springBeans") },
  { key: "java__spring__request_mappings__total", label: t("overview.summarySection.endpoints") },
  { key: "java__jpa__entities", label: t("overview.summarySection.jpaEntities") },
]
const javaStats = computed(() =>
  javaKeys
    .map(k => ({ ...k, value: getVal(k.key) }))
    .filter((s): s is { key: string; label: string; value: number } => s.value !== null),
)

// Formatting helpers
function formatVal(val: any): string {
  if (val == null || val === "") return ""
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString(intlLocale)
  return fixed(n, 2)
}
</script>
