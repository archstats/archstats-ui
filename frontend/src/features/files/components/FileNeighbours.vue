<template>
  <section class="flex min-h-0 shrink-0 flex-col hairline-t" :class="open ? 'max-h-[46%]' : ''" :aria-label="t('files.fileNeighbours.neighbours')">
    <button type="button" class="section-head" :aria-expanded="open" @click="open = !open">
      <Icon :icon="open ? 'chevron-down' : 'chevron-right'" :size="12" class="shrink-0 text-neutral-400"/>
      <span class="overline">{{ t('files.fileNeighbours.neighbours') }}</span>
      <span v-if="file" class="min-w-0 truncate font-mono text-xs text-neutral-400">{{ basename(file) }}</span>
    </button>
    <div v-if="open" class="min-h-0 overflow-y-auto pb-2">
      <p v-if="!neighbours" class="px-3 py-2 text-xs text-neutral-500">{{ file ? t('files.fileNeighbours.reading') : t('files.fileNeighbours.pickFile') }}</p>
      <template v-else>
        <div v-for="group in groups" :key="group.id" class="mt-1">
          <div class="group-head" :title="group.hint">
            <span>{{ group.label }}</span>
            <span class="font-mono text-neutral-400">{{ formatNumber(group.rows.length) }}</span>
          </div>
          <p v-if="!group.rows.length" class="px-3 pb-1 pl-8 text-xs text-neutral-400">{{ group.empty }}</p>
          <button
            v-for="n in group.shown"
            :key="group.id + n.file"
            type="button"
            class="neighbour-row"
            :title="t('files.fileNeighbours.rowTitle', { file: n.file, component: n.component || '—', weight: n.weight, unit: group.unit })"
            @click="visit(n)"
            @dblclick="router.push(filePath(n.file))"
          >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="n.health === null ? 'bg-neutral-300' : levelDotClass(healthLevel(n.health))"></span>
            <span class="min-w-0 grow truncate font-mono text-sm text-neutral-900">{{ basename(n.file) }}</span>
            <span v-if="n.component !== component" class="max-w-[96px] shrink-0 truncate font-mono text-xs text-neutral-400">{{ shortComponent(n.component) }}</span>
            <span class="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400">{{ n.weight }}</span>
          </button>
          <button v-if="group.rows.length > group.shown.length" type="button" class="more-row" @click="expanded.add(group.id)">
            {{ t('files.fileNeighbours.more', { count: group.rows.length - group.shown.length, more: formatNumber(group.rows.length - group.shown.length) }) }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
// The selected file's neighbours, under the files: what it uses, what uses
// it, what changes with it. A neighbour in this component is selected in
// place; one elsewhere opens that component with it selected. Double-click
// opens the file.
import { computed, reactive, ref, watch, type Ref, toRef } from "vue"
import { useRouter } from "vue-router"
import { useFileNeighbours, type Neighbour } from "~/features/files/fileNeighbours"
import { componentPath, filePath } from "~/features/navigation/routes"
import { healthLevel, levelDotClass } from "~/features/metrics/useHealth"
import { formatNumber } from "~/shared/format"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

const props = defineProps<{ file: string | null; component: string }>()
const emit = defineEmits<{ select: [file: string] }>()
const router = useRouter()

const OPEN_KEY = "archstats.fileNeighbours.open"
const open = ref(true)
try { open.value = localStorage.getItem(OPEN_KEY) !== "0" } catch { /* open by default */ }
watch(open, o => { try { localStorage.setItem(OPEN_KEY, o ? "1" : "0") } catch { /* a preference */ } })

const neighbours = useFileNeighbours(computed(() => props.file ?? "") as Ref<string>)
const FIRST = 6
const expanded = reactive(new Set<string>())
watch(toRef(props, "file"), () => expanded.clear())

const groups = computed(() => {
  const n = neighbours.value
  if (!n) return []
  const list = [
    { id: "uses", label: t("files.fileNeighbours.uses"), hint: t("files.fileNeighbours.usesHint"), empty: t("files.fileNeighbours.usesNothing"), unit: t("files.fileNeighbours.references"), rows: n.uses },
    { id: "usedBy", label: t("files.fileNeighbours.usedBy"), hint: t("files.fileNeighbours.usedByHint"), empty: t("files.fileNeighbours.usedByNothing"), unit: t("files.fileNeighbours.references"), rows: n.usedBy },
    ...(n.changesWith ? [{ id: "changesWith", label: t("files.fileNeighbours.changesWith"), hint: t("files.fileNeighbours.changesWithHint"), empty: t("files.fileNeighbours.changesWithNothing"), unit: t("files.fileNeighbours.sharedCommits"), rows: n.changesWith }] : []),
  ]
  return list.map(g => ({ ...g, shown: expanded.has(g.id) ? g.rows : g.rows.slice(0, FIRST) }))
})

function visit(n: Neighbour) {
  if (!n.component || n.component === props.component) emit("select", n.file)
  else router.push({ path: componentPath(n.component, "inside"), query: { file: n.file } })
}
function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1)
}
function shortComponent(c: string): string {
  const parts = c.split(/[./]/).filter(Boolean)
  return parts.slice(-1)[0] ?? c
}
</script>

<style scoped>
.section-head { display: flex; width: 100%; flex: none; align-items: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem; text-align: left; }
.section-head:hover { background: rgb(var(--c-neutral-100)); }
.overline { flex: none; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(var(--c-neutral-600)); }
.group-head { display: flex; align-items: center; justify-content: space-between; height: 1.5rem; padding: 0 0.75rem 0 2rem; font-size: 0.75rem; font-weight: 500; color: rgb(var(--c-neutral-600)); }
.neighbour-row { display: flex; width: 100%; align-items: center; gap: 0.5rem; height: 1.5rem; padding: 0 0.75rem 0 2rem; text-align: left; }
.neighbour-row:hover { background: rgb(var(--c-neutral-100)); }
.neighbour-row:focus-visible, .section-head:focus-visible, .more-row:focus-visible { outline: 2px solid rgb(var(--c-accent-500)); outline-offset: -2px; }
.more-row { display: block; width: 100%; height: 1.5rem; padding: 0 0.75rem 0 2.875rem; text-align: left; font-size: 0.75rem; color: rgb(var(--c-neutral-500)); }
.more-row:hover { color: rgb(var(--c-neutral-900)); }
</style>
