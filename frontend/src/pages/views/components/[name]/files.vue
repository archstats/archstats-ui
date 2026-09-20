<template>
  <LoadingState v-if="loading" text="Reading files…"/>
  <EmptyState v-else-if="error" title="Could not read files" :text="error" icon="alert"/>
  <EmptyState v-else-if="files.length === 0" title="No files in this component" :text="`The snapshot records no files for ${name}.`" icon="file-text"/>
  <div v-else class="flex min-h-0 grow overflow-hidden">
    <!-- Left: file list. -->
    <div class="flex w-[340px] shrink-0 flex-col bg-surface hairline-r">
      <div class="flex h-10 shrink-0 items-center px-3 hairline-b">
        <input v-model="search" type="search" class="ui-input ui-input-sm w-full" placeholder="Search files" aria-label="Search files"/>
      </div>
      <div class="min-h-0 grow overflow-y-auto">
        <EmptyState v-if="filteredFiles.length === 0" title="No files match" :text="`0 of ${files.length} files match the search.`"/>
        <button
          v-for="file in filteredFiles"
          v-else
          :key="file.name"
          type="button"
          class="flex h-8 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-neutral-50"
          :class="{ 'bg-accent-50': file.name === selected }"
          :title="file.name"
          @click="selected = file.name"
        >
          <span class="min-w-0 grow truncate">
            <span class="font-mono text-sm text-neutral-900">{{ basename(file.name) }}</span>
            <span v-if="dirname(file.name)" class="ml-1.5 text-xs text-neutral-400">{{ dirname(file.name) }}</span>
          </span>
          <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(metric(file, 'complexity__lines')) }}</span>
        </button>
      </div>
    </div>

    <!-- Right: header row and the code viewer. -->
    <div class="flex min-w-0 grow flex-col overflow-hidden">
      <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
        <span v-if="selectedFile" class="ui-toolbar-meta flex min-w-0 items-center gap-1.5">
          <span>Lines <span class="font-mono text-neutral-800">{{ formatNumber(metric(selectedFile, 'complexity__lines')) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span>Commits <span class="font-mono text-neutral-800">{{ formatNumber(metric(selectedFile, 'git__commits__total')) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span>Authors <span class="font-mono text-neutral-800">{{ formatNumber(metric(selectedFile, 'git__authors__total')) }}</span></span>
          <span class="text-neutral-300">·</span>
          <span class="flex items-center gap-1.5">
            Health
            <span class="inline-block h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(health(selectedFile)))"></span>
            <span class="font-mono" :class="levelTextClass(healthLevel(health(selectedFile)))">{{ formatHealth(health(selectedFile)) }}</span>
          </span>
        </span>
        <router-link v-if="selected" :to="`/views/files/${selected}`" class="ui-btn ui-btn-sm ml-auto">
          <Icon icon="file-code" :size="13" class="text-neutral-500"/><span>Open file</span>
        </router-link>
      </div>
      <div class="min-h-0 grow overflow-hidden">
        <FileCodeViewer v-if="selected" :key="selected" :file-path="selected"/>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { healthLevel, levelDotClass, levelTextClass, formatHealth } from "~/composables/useHealth"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import FileCodeViewer from "~/components/files/FileCodeViewer.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Icon from "~/components/ui/common/Icon.vue"

type FileRow = Record<string, any> & { name: string }

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

const { data: files, loading, error } = useAsyncQuery<FileRow[]>(
  () => store.query<FileRow>(`SELECT * FROM files WHERE component = ${sqlLiteral(name.value)} ORDER BY name`),
  [name],
  { initial: [] },
)

const search = ref("")
const selected = ref<string | null>(null)

const filteredFiles = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return files.value
  return files.value.filter(f => f.name.toLowerCase().includes(q))
})

const selectedFile = computed(() => files.value.find(f => f.name === selected.value) ?? null)

// Selection follows the component: reset on change, then pick the first file.
watch(name, () => {
  selected.value = null
  search.value = ""
})
watch(files, (rows) => {
  if (!rows.some(f => f.name === selected.value)) selected.value = rows[0]?.name ?? null
})

function metric(file: FileRow, key: string): number {
  const v = file[key] ?? file[store.statName(key)]
  return Number(v) || 0
}

function health(file: FileRow): number | null {
  const v = file["codesmells__code_health"] ?? file[store.statName("codesmells__code_health")]
  return v === null || v === undefined || v === "" ? null : Number(v)
}

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
