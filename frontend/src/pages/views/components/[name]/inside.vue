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
      <!-- Left: the files as a tree under the folder they share, or ranked. -->
      <FileNavigator v-model:selected="selected" v-model:role="role" :files="navFiles" :rankings="rankings" :roles="roleOptions" @open="openFile">
        <template #root-actions>
          <router-link v-if="folder" :to="xrayPath(folder)" class="ui-btn ui-btn-sm ui-btn-quiet h-5 shrink-0 px-1.5 text-xs" :title="t('pages.componentsInside.xRayEveryFile', { folder })">{{ t('pages.componentsInside.xRay') }}</router-link>
        </template>
        <template #below>
          <FileNeighbours :file="selected" :component="name" @select="selected = $event"/>
        </template>
      </FileNavigator>

      <!-- Middle: the selected file; right: its symbols. -->
      <div class="flex min-w-0 grow overflow-hidden">
        <div class="min-w-0 grow overflow-hidden">
          <FileCodeViewer
            v-if="selected"
            :key="selected"
            v-model:symbols-open="symbolsOpen"
            :file-path="selected"
            :root="folder"
            :annotations="annotations"
            :symbols="symbols"
            @scope="scope = $event"
          >
            <template #tags>
              <span v-if="selectedFile?.roles.length" class="ui-tag shrink-0">{{ selectedFile.roles.join(" · ") }}</span>
            </template>
            <template #meta>
              <span v-if="selectedFile" class="ui-toolbar-meta flex items-center gap-1.5">
                <span class="flex items-center gap-1.5" :title="selectedFile.deductions ?? undefined">
                  {{ t('pages.componentsInside.health') }} <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(selectedFile.health))"></span>
                  <span class="font-mono" :class="levelTextClass(healthLevel(selectedFile.health))">{{ formatHealth(selectedFile.health) }}</span>
                </span>
              </span>
            </template>
            <template #actions>
              <router-link :to="filePath(selected)" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :title="t('pages.componentsInside.openFile')" :aria-label="t('pages.componentsInside.openFile')">
                <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/>
              </router-link>
            </template>
          </FileCodeViewer>
        </div>
        <SymbolsPane v-if="selected && symbolsOpen && symbols && symbols.length" :symbols="symbols" :active="scope" @jump="jump"/>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { xrayPath, filePath } from "~/features/navigation/routes"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useComponentJava } from "~/features/java/useComponentJava"
import { healthLevel, levelDotClass, levelTextClass, formatHealth } from "~/features/metrics/useHealth"
import { sqlLiteral } from "~/shared/sql"
import { formatNumber } from "~/shared/format"
import FileCodeViewer from "~/features/files/components/FileCodeViewer.vue"
import FileNavigator, { type NavRanking } from "~/features/files/components/FileNavigator.vue"
import SymbolsPane from "~/features/files/components/SymbolsPane.vue"
import FileNeighbours from "~/features/files/components/FileNeighbours.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import ComponentWiring from "~/features/java/components/ComponentWiring.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { deductionSummary } from "~/features/metrics/healthBreakdown"
import { useComplexityAnnotations, useFileSymbols, type FileSymbol } from "~/features/files/complexityAnnotations"

type RawFile = Record<string, any> & { name: string }

interface InsideFile {
  name: string
  test: boolean
  lines: number
  commits: number
  authors: number
  health: number | null
  hotspot: number | null
  roles: string[]
  /** "10 − 2 (complex code) − 1.5 (coupling) − 2 (size)": the stored deductions, whichever formula scored them. */
  deductions: string | null
}

const route = useRoute()
const router = useRouter()
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
  test: f.role === "test",
  lines: metric(f, "complexity__lines"),
  commits: metric(f, "git__commits__total"),
  authors: metric(f, "git__authors__total"),
  health: optional(f, "codesmells__code_health"),
  hotspot: optional(f, "codesmells__hotspot_score"),
  roles: rolesByFile.value.get(f.name) ?? [],
  deductions: deductionSummary(f),
})))

const has = (pick: (f: InsideFile) => number | null) => computed(() => files.value.some(f => pick(f) !== null && pick(f) !== 0))
const hasHealth = has(f => f.health)
const hasHotspot = has(f => f.hotspot)
const hasCommits = has(f => f.commits)

// Ranked: worst or most first, by whichever reading the snapshot has.
const rankings = computed<NavRanking<InsideFile>[]>(() => [
  ...(hasHealth.value ? [{ id: "health", label: t("pages.componentsInside.health"), format: (f: InsideFile) => formatHealth(f.health), compare: (a: InsideFile, b: InsideFile) => (a.health ?? 99) - (b.health ?? 99) }] : []),
  ...(hasHotspot.value ? [{ id: "hotspot", label: t("pages.componentsInside.hotspot"), format: (f: InsideFile) => (f.hotspot === null ? "—" : formatNumber(f.hotspot, 0)), compare: (a: InsideFile, b: InsideFile) => (b.hotspot ?? -1) - (a.hotspot ?? -1) }] : []),
  { id: "lines", label: t("pages.componentsInside.lines"), format: (f: InsideFile) => formatNumber(f.lines), compare: (a: InsideFile, b: InsideFile) => b.lines - a.lines },
  ...(hasCommits.value ? [{ id: "commits", label: t("pages.componentsInside.commits"), format: (f: InsideFile) => formatNumber(f.commits), compare: (a: InsideFile, b: InsideFile) => b.commits - a.commits }] : []),
])

// Java roles narrow the files; null shows every file.
const role = ref<string | null>(null)
const roleOptions = computed(() => {
  const present = new Set<string>()
  for (const f of files.value) for (const r of f.roles) present.add(r)
  return Array.from(present).sort()
})

const navFiles = computed(() => role.value ? files.value.filter(f => f.roles.includes(role.value!)) : files.value)

const selected = ref<string | null>(null)
const annotations = useComplexityAnnotations(computed(() => selected.value ?? ""))
const symbols = useFileSymbols(computed(() => selected.value ?? ""))
const scope = ref<FileSymbol | null>(null)

const SYMBOLS_KEY = "archstats.symbolsOpen"
const symbolsOpen = ref(true)
try { symbolsOpen.value = localStorage.getItem(SYMBOLS_KEY) !== "0" } catch { /* open by default */ }
watch(symbolsOpen, open => { try { localStorage.setItem(SYMBOLS_KEY, open ? "1" : "0") } catch { /* a preference */ } })

function jump(symbol: FileSymbol) {
  router.replace({ path: route.path, query: route.query, hash: `#L${symbol.begin}-L${symbol.end}` })
}
function openFile(name: string) {
  router.push(filePath(name))
}

const selectedFile = computed(() => files.value.find(f => f.name === selected.value) ?? null)

// Selection follows the component: reset on change, then land on the least
// healthy file, the one most worth reading (the largest when nothing is scored).
watch(name, () => {
  selected.value = null
  role.value = null
})
// A neighbour opened from another component arrives as ?file=.
const asked = computed(() => (typeof route.query.file === "string" ? route.query.file : null))
watch([asked, files], ([file]) => {
  if (file && files.value.some(f => f.name === file || f.name === `./${file}`)) selected.value = files.value.find(f => f.name === file || f.name === `./${file}`)!.name
}, { immediate: true })
watch(navFiles, rows => {
  if (rows.some(f => f.name === selected.value)) return
  const first = [...rows].sort((a, b) => (a.health ?? 99) - (b.health ?? 99) || b.lines - a.lines)[0]
  selected.value = first?.name ?? null
}, { immediate: true })
// A line selected in one file means nothing in the next.
watch(selected, (now, before) => {
  if (before && now !== before && route.hash) router.replace({ path: route.path, query: route.query, hash: "" })
})

</script>
