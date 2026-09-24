
<template>
  <section>
    <!-- Page header: what this is, which snapshot. -->
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
      <span class="font-mono text-sm text-neutral-500">{{ workspaceName }}<template v-if="snapshotLabel"> · snapshot {{ snapshotLabel }}</template></span>
      <span v-if="isJavaProject" class="ui-tag">Java</span>
      <span v-if="isSpringProject" class="ui-tag">Spring</span>
      <span v-if="isJpaProject" class="ui-tag">JPA</span>
    </div>
    <!-- Which code this is: the commit it read, how old that commit was, what was uncommitted. -->
    <div v-if="identity || shallowClone" class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span v-if="identity" class="font-mono" :title="store.snapshotInfo?.git_head_commit">{{ identity }}</span>
      <span v-if="shallowClone" class="ui-tag" title="The repository was cloned with --depth, so its history stops where the clone did: commit counts, contributors and ages cover only that">shallow clone</span>
      <router-link to="/views/snapshot" class="text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">About this snapshot</router-link>
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
        <h2 class="ui-panel-title">Structure</h2>
        <dl class="mt-3 flex flex-col gap-3">
          <div v-if="abstractionRatio !== null">
            <div class="flex items-baseline justify-between">
              <dt class="text-base text-neutral-600">Abstract types</dt>
              <dd class="font-mono text-sm tabular-nums text-neutral-900">{{ abstractionRatio.toFixed(1) }}%</dd>
            </div>
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div class="h-full rounded-full bg-neutral-500 transition-[width]" :style="{ width: abstractionRatio + '%' }"></div>
            </div>
            <p class="mt-1 text-sm leading-4 text-neutral-500">Share of abstract types among all declared types.</p>
          </div>
          <div class="ui-kv">
            <template v-if="getVal('complexity__indentation__avg') !== null">
              <dt>Average indentation</dt><dd>{{ getVal('complexity__indentation__avg')?.toFixed(2) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__imports') !== null">
              <dt>Component imports</dt><dd>{{ formatVal(getVal('modularity__component__imports')) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__declarations') !== null">
              <dt title="package and namespace statements, one per file that has one">Package declarations</dt><dd>{{ formatVal(getVal('modularity__component__declarations')) }}</dd>
            </template>
            <template v-if="componentDependencies !== null">
              <dt><MetricHint id="app__cross_component_edges">Component dependencies</MetricHint></dt><dd>{{ formatVal(componentDependencies) }}</dd>
            </template>
            <template v-if="evidenceText">
              <dt title="How the dependencies were found: an import names its target; a runtime lookup names it in a string; a type-only import is erased by the compiler and left out of coupling">Dependency evidence</dt>
              <dd class="!whitespace-normal"><router-link to="/views/snapshot#dependencies" class="underline-offset-2 hover:underline">{{ evidenceText }}</router-link></dd>
            </template>
            <template v-if="getVal('connection_count') !== null">
              <dt title="individual imports that cross from one component into another">Cross-component imports</dt><dd>{{ formatVal(getVal('connection_count')) }}</dd>
            </template>
            <template v-if="avgFilesPerComponent">
              <dt>Files per component</dt><dd>{{ avgFilesPerComponent.toFixed(1) }}</dd>
            </template>
            <template v-if="avgLinesPerFile">
              <dt>Lines per file</dt><dd>{{ avgLinesPerFile.toFixed(0) }}</dd>
            </template>
          </div>
          <div v-if="isJavaProject && javaStats.length > 0" class="pt-3 hairline-t">
            <span class="ui-label">Java</span>
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
        <h2 class="ui-panel-title">Activity</h2>
        <div v-if="hasGitChurn" class="mt-3">
          <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div class="h-full bg-green-500" :style="{ width: additionsPercent + '%' }" :title="`Additions ${additionsPercent.toFixed(1)}%`"></div>
            <div class="h-full bg-red-500" :style="{ width: deletionsPercent + '%' }" :title="`Deletions ${deletionsPercent.toFixed(1)}%`"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between font-mono text-sm tabular-nums">
            <span class="text-green-700">+{{ formatVal(getVal('git__additions__total')) }} added</span>
            <span class="text-red-700">−{{ formatVal(getVal('git__deletions__total')) }} removed</span>
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
        <Icon icon="chevron-right" :size="14" class="text-neutral-400 transition-transform group-open/details:rotate-90"/>
        More metrics
        <span class="ui-tag">{{ extraStats.length }}</span>
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
import MetricHint from "~/components/ui/common/MetricHint.vue"
import { computed, ref, watch } from "vue"
import { useDataStore } from "~/stores/data"
import Icon from "~/components/ui/common/Icon.vue"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import { useWorkspacesStore } from "~/stores/workspaces"
import { formatScanTime } from "~/utils/time"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useAuthorsStore } from "~/stores/authors"
import { IN_SNAPSHOT, NOT_BOT_SQL, canonicalAuthorSql } from "~/utils/authors"

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
    parts.push(days <= 0 ? "committed the day of the scan" : `committed ${days.toLocaleString("en-US")} day${days === 1 ? "" : "s"} before the scan`)
  }
  const dirty = Number(info.git_dirty_files ?? 0)
  if (dirty > 0) parts.push(`${dirty} uncommitted file${dirty === 1 ? "" : "s"}`)
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
    { label: "Components", value: n("component_count"), sub: "", warn: false },
    { label: "Files", value: n("complexity__files"), sub: "", warn: false },
    { label: "Lines", value: n("complexity__lines"), sub: "", warn: false },
    { label: "Directories", value: n("directory_count"), sub: "", warn: false },
    // A shallow clone's history stops at the depth it was cloned with: gin
    // read one commit by one contributor, with nothing to say so.
    { label: "Commits", value: people.value ? formatVal(people.value.commits) : n("git__commits__total"), sub: shallowClone.value ? "shallow clone: history is cut short" : "to files in the snapshot", warn: shallowClone.value },
    // A mean, said as one: "103 commits each" read as every contributor's number.
    { label: "Contributors", value: people.value ? formatVal(people.value.authors) : n("git__authors__total"), sub: shallowClone.value ? "in the fetched history only" : commitsPerAuthor.value ? `to those files, ${commitsPerAuthor.value.toFixed(0)} commits on average` : "to files in the snapshot", warn: shallowClone.value },
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
const componentDependencies = ref<number | null>(null)
// How far to trust the coupling numbers: said only when something other than
// plain imports is in play (Java, C#, PHP and Go are all imports).
const evidence = ref<{ total: number; dynamicOnly: number; typeOnly: number; unresolved: number } | null>(null)
const evidenceText = computed(() => {
  const e = evidence.value
  if (!e) return ""
  const parts: string[] = []
  if (e.dynamicOnly) parts.push(`${formatVal(e.dynamicOnly)} of ${formatVal(e.total)} only by runtime lookup`)
  if (e.unresolved) parts.push(`${formatVal(e.unresolved)} lookup${e.unresolved === 1 ? "" : "s"} unresolved`)
  if (e.typeOnly) parts.push(`${formatVal(e.typeOnly)} types only, left out of coupling`)
  return parts.join(" · ")
})
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    componentDependencies.value = null
    if (!hasData || !store.hasView("component_connections_direct")) return
    try {
      const cols = await store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('component_connections_direct')")
      const runtimeOnly = cols.some(c => c.name === "kind") ? `AND kind != 'type_only'` : ""
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
  { key: "java__class__declarations", label: "Classes" },
  { key: "java__method_declarations", label: "Methods" },
  { key: "java__field__declarations", label: "Fields" },
  { key: "java__spring__beans", label: "Spring beans" },
  { key: "java__jpa__entities", label: "JPA entities" },
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
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function formatStatValue(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(1)
}
</script>

