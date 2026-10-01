<template>
  <LoadingState v-if="loading" :text="t('pages.componentsInside.readingFiles')"/>
  <EmptyState v-else-if="error" :title="t('pages.componentsInside.couldNotReadFiles')" :text="error" icon="alert"/>
  <EmptyState v-else-if="files.length === 0" :title="t('pages.componentsInside.noFilesComponent')" :text="t('pages.componentsInside.snapshotRecordsNoFiles', { name })" icon="file-text"/>
  <div v-else class="flex min-h-0 grow flex-col overflow-hidden">
    <div v-if="hasJava" class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" :aria-label="t('pages.componentsInside.whatShow')">
        <button v-for="v in views" :key="v.value" type="button" :aria-pressed="view === v.value" @click="view = v.value">{{ v.label }}</button>
      </div>
      <span class="ui-toolbar-meta ml-auto">{{ view === "wiring" ? t('pages.componentsInside.howComponentSOwn') : t('pages.componentsInside.everyFileComponent') }}</span>
    </div>

    <!-- Wiring: the classes inside the component, and the rules they break. -->
    <div v-if="view === 'wiring'" class="min-h-0 grow overflow-y-auto px-4 py-5">
      <ComponentWiring :key="name" :name="name"/>
    </div>

    <div v-else class="flex min-h-0 grow overflow-hidden">
    <!-- Left: every file, ordered by whichever reading is being followed. -->
    <div class="flex w-[360px] shrink-0 flex-col bg-surface hairline-r">
      <div class="flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
        <input v-model="search" type="search" class="ui-input ui-input-sm min-w-0 grow" :placeholder="t('pages.componentsInside.searchFiles')" :aria-label="t('pages.componentsInside.searchFiles')"/>
        <SingleSelect v-if="roleFilterOptions.length > 1" v-model="roleFilter" :options="roleFilterOptions" :placeholder="t('pages.componentsInside.allRoles')"/>
        <router-link v-if="folder" :to="xrayPath(folder)" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" :title="t('pages.componentsInside.xRayEveryFile', { folder })">{{ t('pages.componentsInside.xRay') }}</router-link>
      </div>
      <div class="flex h-8 shrink-0 items-center gap-1 px-3 hairline-b">
        <span class="ui-label">{{ t('pages.componentsInside.sort') }}</span>
        <div class="ui-segmented ml-auto" role="group" :aria-label="t('pages.componentsInside.sortFiles')">
          <button v-for="s in sorts" :key="s.id" type="button" :aria-pressed="sortBy === s.id" :disabled="!s.available" @click="sortBy = s.id">{{ s.label }}</button>
        </div>
      </div>
      <div class="min-h-0 grow overflow-y-auto">
        <EmptyState v-if="visibleFiles.length === 0" :title="t('pages.componentsInside.noFilesMatch')" :text="t('pages.componentsInside.text0FilesMatch', { filesLength: files.length })"/>
        <button
          v-for="file in visibleFiles"
          v-else
          :key="file.name"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-neutral-50"
          :class="{ 'bg-accent-50': file.name === selected }"
          :title="file.name"
          @click="selected = file.name"
        >
          <span class="min-w-0 grow">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="min-w-0 truncate font-mono text-sm text-neutral-900">{{ basename(file.name) }}</span>
              <span v-for="role in file.roles" :key="role" class="ui-tag shrink-0">{{ role }}</span>
            </span>
            <span v-if="dirname(file.name)" class="block truncate text-xs text-neutral-400">{{ dirname(file.name) }}</span>
          </span>
          <span class="shrink-0 font-mono text-xs tabular-nums" :class="sortBy === 'health' ? levelTextClass(healthLevel(file.health)) : 'text-neutral-500'" :title="activeSort.unit">{{ sortValue(file) }}</span>
        </button>
      </div>
    </div>

    <!-- Right: the selected file, its readings, and its source. -->
    <div class="flex min-w-0 grow flex-col overflow-hidden">
      <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
        <span v-if="selectedFile" class="ui-toolbar-meta flex min-w-0 items-center gap-1.5">
          <span>{{ t('pages.componentsInside.lines') }} <span class="font-mono text-neutral-800">{{ formatNumber(selectedFile.lines) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span>{{ t('pages.componentsInside.commits') }} <span class="font-mono text-neutral-800">{{ formatNumber(selectedFile.commits) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span>{{ t('pages.componentsInside.authors') }} <span class="font-mono text-neutral-800">{{ formatNumber(selectedFile.authors) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span class="flex items-center gap-1.5" :title="selectedFile.deductions ?? undefined">
{{ t('pages.componentsInside.health') }} <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(selectedFile.health))"></span>
            <span class="font-mono" :class="levelTextClass(healthLevel(selectedFile.health))">{{ formatHealth(selectedFile.health) }}</span>
          </span>
        </span>
        <router-link v-if="selected" :to="`/views/files/${selected}`" class="ui-btn ui-btn-sm ml-auto">
          <Icon icon="file-code" :size="13" class="text-neutral-500"/><span>{{ t('pages.componentsInside.openFile') }}</span>
        </router-link>
      </div>
      <div class="min-h-0 grow overflow-hidden">
        <FileCodeViewer v-if="selected" :key="selected" :file-path="selected"/>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { xrayPath } from "~/features/navigation/routes"
import { useRoute } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useComponentJava } from "~/features/java/useComponentJava"
import { healthLevel, levelDotClass, levelTextClass, formatHealth } from "~/features/metrics/useHealth"
import { sqlLiteral } from "~/shared/sql"
import { formatNumber } from "~/shared/format"
import FileCodeViewer from "~/features/files/components/FileCodeViewer.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import SingleSelect from "~/shared/ui/SingleSelect.vue"
import ComponentWiring from "~/features/java/components/ComponentWiring.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t, intlLocale } from "~/shared/i18n"

type RawFile = Record<string, any> & { name: string }

interface InsideFile {
  name: string
  lines: number
  commits: number
  authors: number
  health: number | null
  hotspot: number | null
  roles: string[]
  /** "10 − 3 (size) − 0.5 (deepest nesting) − 0 (average nesting)", on revision 2 snapshots. */
  deductions: string | null
}

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

const { data: rawFiles, loading, error } = useAsyncQuery<RawFile[]>(
  () => store.query<RawFile>(`SELECT * FROM files WHERE component = ${sqlLiteral(name.value)} ORDER BY name`),
  [name],
  { initial: [] },
)

// The folder the component's files share, for the X-ray.
const folder = computed(() => {
  const dirs = rawFiles.value.map(f => String(f.name).split("/").slice(0, -1))
  if (!dirs.length) return ""
  const common: string[] = []
  for (let i = 0; i < dirs[0].length; i++) { const seg = dirs[0][i]; if (dirs.every(d => d[i] === seg)) common.push(seg); else break }
  return common.join("/")
})

// Java roles come from the same reading the wiring uses; on any other project
// the composable simply returns nothing and the role column disappears.
const { classes, hasJava } = useComponentJava(name)

// Wiring is about the classes inside this component, which makes it an Inside
// question rather than a Connections one.
const views = [
  { value: "files" as const, label: t("pages.componentsInside.files") },
  { value: "wiring" as const, label: t("pages.componentsInside.wiring") },
]
const view = ref<"files" | "wiring">("files")
watch(name, () => { view.value = "files" })
const rolesByFile = computed(() => new Map(classes.value.map(c => [c.file, c.roles])))

function metric(file: RawFile, key: string): number {
  const v = file[key] ?? file[store.statName(key)]
  return Number(v) || 0
}

function optional(file: RawFile, key: string): number | null {
  const v = file[key] ?? file[store.statName(key)]
  return v === null || v === undefined || v === "" ? null : Number(v)
}

const files = computed<InsideFile[]>(() => rawFiles.value.map(f => ({
  name: f.name,
  lines: metric(f, "complexity__lines"),
  commits: metric(f, "git__commits__total"),
  authors: metric(f, "git__authors__total"),
  health: optional(f, "codesmells__code_health"),
  hotspot: optional(f, "codesmells__hotspot_score"),
  roles: rolesByFile.value.get(f.name) ?? [],
  deductions: deductionsOf(f),
})))

function deductionsOf(f: RawFile): string | null {
  const size = optional(f, "codesmells__health__deduction__size")
  const max = optional(f, "codesmells__health__deduction__max_nesting")
  const avg = optional(f, "codesmells__health__deduction__avg_nesting")
  if (size === null || max === null || avg === null) return null
  const n = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
  return t("pages.componentsInside.text10SizeDeepestNesting", { size: n(size), max: n(max), avg: n(avg) })
}

const has = (pick: (f: InsideFile) => number | null) => computed(() => files.value.some(f => pick(f) !== null && pick(f) !== 0))
const hasHealth = has(f => f.health)
const hasHotspot = has(f => f.hotspot)
const hasCommits = has(f => f.commits)

type SortId = "name" | "lines" | "health" | "hotspot" | "commits"
const sortBy = ref<SortId>("lines")

const sorts = computed(() => [
  { id: "name" as const, label: t("pages.componentsInside.name"), unit: "lines", available: true },
  { id: "lines" as const, label: t("pages.componentsInside.lines"), unit: "lines", available: true },
  { id: "health" as const, label: t("pages.componentsInside.health"), unit: "health", available: hasHealth.value },
  { id: "hotspot" as const, label: t("pages.componentsInside.hotspot"), unit: "hotspot", available: hasHotspot.value },
  { id: "commits" as const, label: t("pages.componentsInside.commits"), unit: "commits", available: hasCommits.value },
])

const activeSort = computed(() => sorts.value.find(s => s.id === sortBy.value) ?? sorts.value[1])

watch(sorts, list => {
  if (!list.find(s => s.id === sortBy.value)?.available) sortBy.value = "lines"
})

function sortValue(file: InsideFile): string {
  switch (sortBy.value) {
    case "health": return formatHealth(file.health)
    case "hotspot": return file.hotspot === null ? "—" : formatNumber(file.hotspot, 0)
    case "commits": return formatNumber(file.commits)
    default: return formatNumber(file.lines)
  }
}

const ALL_ROLES = t("pages.componentsInside.allRoles")
const roleFilter = ref<string>(ALL_ROLES)
const roleFilterOptions = computed(() => {
  const present = new Set<string>()
  for (const f of files.value) for (const r of f.roles) present.add(r)
  return present.size > 0 ? [ALL_ROLES, ...Array.from(present).sort()] : []
})

const search = ref("")
const selected = ref<string | null>(null)

const visibleFiles = computed(() => {
  let rows = files.value
  if (roleFilter.value !== ALL_ROLES) rows = rows.filter(f => f.roles.includes(roleFilter.value))
  const q = search.value.trim().toLowerCase()
  if (q) rows = rows.filter(f => f.name.toLowerCase().includes(q))
  return [...rows].sort((a, b) => {
    switch (sortBy.value) {
      // Worst health first: the reason to sort by health at all.
      case "health": return (a.health ?? 99) - (b.health ?? 99) || a.name.localeCompare(b.name)
      case "hotspot": return (b.hotspot ?? -1) - (a.hotspot ?? -1) || a.name.localeCompare(b.name)
      case "commits": return b.commits - a.commits || a.name.localeCompare(b.name)
      case "lines": return b.lines - a.lines || a.name.localeCompare(b.name)
      default: return a.name.localeCompare(b.name)
    }
  })
})

const selectedFile = computed(() => files.value.find(f => f.name === selected.value) ?? null)

// Selection follows the component: reset on change, then pick the first row.
watch(name, () => {
  selected.value = null
  search.value = ""
  roleFilter.value = ALL_ROLES
})
watch(visibleFiles, rows => {
  if (!rows.some(f => f.name === selected.value)) selected.value = rows[0]?.name ?? null
}, { immediate: true })

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}
function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
