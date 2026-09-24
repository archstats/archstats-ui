<template>
  <!-- One module and what it imports, as a list rather than a table.
       The table it replaced stretched two short names across two thousand
       pixels and pinned a column of identical 1s to the far edge, and it
       carried two row grammars at once: a single-target source put its
       target in the right-hand column while a grouped source put the same
       thing indented on the left. Every source now reads the same way. -->
  <div class="flex h-full min-w-0 flex-col">
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onScroll">
      <div class="mx-3 max-w-[860px]" :style="{ height: rows.length * ROW + 'px', position: 'relative' }">
        <div :style="{ transform: `translateY(${offsetTop}px)` }">
          <template v-for="row in windowed">
            <!-- A knot is one relationship between two modules, so it stays
                 one row with both counts on it. -->
            <div v-if="row.kind === 'pair'" :key="row.from + '>' + row.to"
                 class="flex items-center gap-2 rounded px-2 hairline-t"
                 :class="tint(row.from, row.to)" :style="{ height: ROW + 'px' }">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left"
                      @click="$emit('select', row.from)">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="laneDotClass(laneColor(laneOf(row.from)))"/>
                <span class="truncate font-mono text-xs text-neutral-900" :title="row.from">{{ nameOf(row.from) }}</span>
                <span class="min-w-0 shrink truncate font-mono text-[11px] text-neutral-500">{{ tailOf(row.from) }}</span>
              </button>
              <Icon icon="recycle" :size="12" class="shrink-0 text-red-500"
                    :title="`${row.weight} references one way, ${row.back} back`"/>
              <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left"
                      @click="$emit('select', row.to)">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="laneDotClass(laneColor(laneOf(row.to)))"/>
                <span class="truncate font-mono text-xs text-neutral-900" :title="row.to">{{ nameOf(row.to) }}</span>
                <span class="min-w-0 shrink truncate font-mono text-[11px] text-neutral-500">{{ tailOf(row.to) }}</span>
              </button>
            </div>

            <!-- The importing module. A hairline above it binds the block
                 below without drawing a box around it. -->
            <button v-else-if="row.kind === 'source'" :key="'s' + row.path" type="button"
                    class="flex w-full items-center gap-2 rounded px-2 text-left hairline-t"
                    :class="tint(row.path)" :style="{ height: ROW + 'px' }"
                    @click="$emit('select', row.path)">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="laneDotClass(laneColor(laneOf(row.path)))"/>
              <span class="truncate font-mono text-xs text-neutral-900" :title="row.path">{{ nameOf(row.path) }}</span>
              <span class="min-w-0 shrink truncate font-mono text-[11px] text-neutral-500">{{ tailOf(row.path) }}</span>
              <Icon v-if="row.cycles > 0" icon="recycle" :size="11" class="shrink-0 text-red-500"
                    :title="`${row.cycles} of these import it back`"/>
              <span class="ml-auto shrink-0 text-[11px] text-neutral-500">
                imports {{ row.count }}
              </span>
            </button>

            <!-- What it imports, indented under it. Always here, never in a
                 far-right column, whether the source has one or twenty. -->
            <div v-else :key="'t' + row.parent + '>' + row.path"
                 class="flex items-center gap-2 rounded pl-7 pr-2"
                 :class="tint(row.path)" :style="{ height: ROW + 'px' }">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left"
                      @click="$emit('select', row.path)">
                <span class="h-1 w-1 shrink-0 rounded-full" :class="laneDotClass(laneColor(laneOf(row.path)))"/>
                <span class="truncate font-mono text-xs text-neutral-700 hover:text-neutral-900"
                      :title="row.path">{{ nameOf(row.path) }}</span>
                <span class="min-w-0 shrink truncate font-mono text-[11px] text-neutral-500">{{ tailOf(row.path) }}</span>
              </button>
              <span v-if="row.back > 0" class="flex shrink-0 items-center gap-1 text-[11px] text-red-500"
                    :title="`${nameOf(row.path)} imports ${nameOf(row.parent)} back`">
                <Icon icon="recycle" :size="11"/>
                <span>imports it back</span>
              </span>
              <!-- A count of one is what nearly every row says; printing it
                   everywhere made a column of noise out of the exceptions. -->
              <span v-if="row.weight > 1" class="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500"
                    :title="`${row.weight} separate references`">×{{ row.weight }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import { dirTail, type ModuleNode } from "~/utils/moduleGraph"
import type { Reference } from "~/utils/findings"

const props = defineProps<{
  references: Reference[]
  byPath: Map<string, ModuleNode>
  selectedPath: string | null
  /** Rows are pairs that import one another, not a one-way dependency. */
  mutual: boolean
  laneColor: (lane: string) => LaneColor
}>()
defineEmits<{ (e: "select", path: string): void }>()

const ROW = 26
const OVERSCAN = 10

function nameOf(path: string) { return props.byPath.get(path)?.name ?? path }
function tailOf(path: string) { return dirTail(props.byPath.get(path)?.dir ?? "", 3) }
function laneOf(path: string) { return props.byPath.get(path)?.lane ?? "" }

function tint(...paths: string[]): string {
  return paths.includes(props.selectedPath ?? "") ? "bg-accent-50" : "hover:bg-neutral-50"
}

type Row =
  | { kind: "pair"; from: string; to: string; weight: number; back: number }
  | { kind: "source"; path: string; count: number; cycles: number }
  | { kind: "target"; path: string; parent: string; weight: number; back: number }

/**
 * Group order follows first appearance, so whichever sort the region applied
 * survives -- a flow region puts the traffic against the grain first, and
 * regrouping must not quietly undo that.
 */
const rows = computed<Row[]>(() => {
  if (props.mutual) {
    return props.references.map((r) => ({
      kind: "pair" as const, from: r.from, to: r.to, weight: r.weight, back: r.back ?? 0,
    }))
  }
  const groups = new Map<string, Reference[]>()
  for (const r of props.references) {
    const list = groups.get(r.from)
    if (list) list.push(r)
    else groups.set(r.from, [r])
  }
  const out: Row[] = []
  for (const [path, list] of groups) {
    out.push({
      kind: "source", path, count: list.length,
      cycles: list.filter((r) => (r.back ?? 0) > 0).length,
    })
    for (const r of list) {
      out.push({ kind: "target", path: r.to, parent: path, weight: r.weight, back: r.back ?? 0 })
    }
  }
  return out
})

// A one-way layer can be 1,674 references, so only the visible slice is drawn.
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)

function onScroll() {
  const el = scroller.value
  if (el) scrollTop.value = el.scrollTop
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const el = scroller.value
  if (!el) return
  viewportHeight.value = el.clientHeight
  observer = new ResizeObserver(([entry]) => { viewportHeight.value = entry.contentRect.height })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

watch(() => props.references, () => {
  scrollTop.value = 0
  if (scroller.value) scroller.value.scrollTop = 0
})

const firstIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW) - OVERSCAN))
const offsetTop = computed(() => firstIndex.value * ROW)
const windowed = computed(() => {
  const count = Math.ceil(viewportHeight.value / ROW) + OVERSCAN * 2
  return rows.value.slice(firstIndex.value, firstIndex.value + count)
})
</script>
