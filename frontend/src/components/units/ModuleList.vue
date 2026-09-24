<template>
  <!-- The middle of the descent: the modules of one region, sortable.
       Sorting is how the shape falls out -- by imported-by the load-bearing
       rise, by holds the crowded ones, by lane the distribution reads. -->
  <div class="flex h-full min-w-0 flex-col">
    <div class="grid w-full max-w-[1100px] shrink-0 items-center hairline-b px-3 text-neutral-500"
         :style="gridStyle" style="height:32px">
      <button v-for="col in columns" :key="col.id" type="button"
              class="ui-label flex h-full items-center gap-1 text-left hover:text-neutral-800"
              :class="{ 'justify-end': col.numeric, 'text-neutral-800': sortBy === col.id }"
              :aria-sort="sortBy === col.id ? (descending ? 'descending' : 'ascending') : 'none'"
              @click="sortOn(col.id)">
        <span>{{ col.label }}</span>
        <Icon v-if="sortBy === col.id" :icon="descending ? 'chevron-down' : 'chevron-up'" :size="12"/>
      </button>
    </div>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onScroll">
      <div :style="{ height: rows.length * ROW + 'px', position: 'relative' }">
        <div :style="{ transform: `translateY(${offsetTop}px)` }">
          <button
            v-for="m in windowed" :key="m.path" type="button"
            class="grid w-full max-w-[1100px] items-center px-3 text-left transition-colors duration-100"
            :class="rowClass(m)"
            :style="[gridStyle, { height: ROW + 'px' }]"
            @click="onRowClick(m.path, $event)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <span v-if="trayPaths.includes(m.path)" class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"/>
              <span v-else class="h-1.5 w-1.5 shrink-0 rounded-full" :class="laneDotClass(laneColor(m.lane))"/>
              <span class="truncate font-mono text-xs text-neutral-900" :title="m.path">{{ m.name }}</span>
              <!-- A cycle is invisible in any region built from traffic
                   between lanes, because every mutual pair measured sits
                   inside one lane. So it is marked on the module. -->
              <Icon v-if="m.inCycle.length" icon="recycle" :size="11" class="shrink-0 text-red-500"
                    :title="cycleTitle(m)"/>
            </span>
            <span class="truncate font-mono text-[11px] text-neutral-500" :title="m.dir">{{ dirTail(m.dir) || '—' }}</span>
            <span class="truncate text-[11px] text-neutral-500" :title="laneLabel(m.lane)">{{ laneLabel(m.lane) }}</span>
            <span v-if="showHolds" class="text-right font-mono text-xs tabular-nums"
                  :class="m.declared.length > 1 ? 'text-neutral-700' : 'text-neutral-500'">{{ m.declared.length }}</span>
            <span class="text-right font-mono text-xs tabular-nums"
                  :class="m.fanIn > 0 ? 'text-neutral-700' : 'text-neutral-500'">{{ m.fanIn }}</span>
            <span class="text-right font-mono text-xs tabular-nums"
                  :class="m.fanOut > 0 ? 'text-neutral-700' : 'text-neutral-500'">{{ m.fanOut }}</span>
          </button>
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

const props = defineProps<{
  modules: ModuleNode[]
  selectedPath: string | null
  trayPaths: string[]
  /** False for a codebase of one unit per file, where the column says nothing. */
  showHolds: boolean
  /**
   * The order a region promises in its note. "Sorted by what each one
   * declares" was drawn sorted by imported-by, with no column for what each
   * one declares.
   */
  initialSort?: { by: "fanIn" | "fanOut" | "holds" | "name"; descending: boolean }
  laneColor: (lane: string) => LaneColor
  laneLabel: (lane: string) => string
}>()
const emit = defineEmits<{ (e: "select", path: string): void; (e: "toggleTray", path: string): void }>()

const ROW = 28
// Rows drawn beyond the viewport, so a fast flick never shows a gap.
const OVERSCAN = 8

const columns = computed(() => [
  { id: "name", label: "Module", numeric: false },
  { id: "dir", label: "Directory", numeric: false },
  { id: "lane", label: "Lane", numeric: false },
  ...(props.showHolds ? [{ id: "holds", label: "Holds", numeric: true }] : []),
  { id: "fanIn", label: "Imported by", numeric: true },
  { id: "fanOut", label: "Imports", numeric: true },
])

const gridStyle = computed(() => ({
  gridTemplateColumns: props.showHolds
    ? "minmax(0,1.8fr) minmax(0,2.2fr) minmax(0,1fr) 60px 90px 70px"
    : "minmax(0,1.8fr) minmax(0,2.2fr) minmax(0,1fr) 90px 70px",
  columnGap: "12px",
}))

/** Click descends; cmd or ctrl click collects into the group tray, which is
 *  the same gesture every other view in the app uses. */
function onRowClick(path: string, event: MouseEvent) {
  if (event.metaKey || event.ctrlKey) emit("toggleTray", path)
  else emit("select", path)
}

function cycleTitle(m: ModuleNode): string {
  const names = m.inCycle.map((p) => p.split("/").pop()).join(", ")
  return `${m.name} and ${names} import each other`
}

function rowClass(m: ModuleNode): string {
  if (m.path === props.selectedPath) return "bg-accent-50 text-neutral-900"
  if (props.trayPaths.includes(m.path)) return "bg-neutral-100"
  return "hover:bg-neutral-50"
}

const sortBy = ref<string>(props.initialSort?.by ?? "fanIn")
const descending = ref(props.initialSort?.descending ?? true)
// A new region brings its own order; a click on a header after that is the
// reader's.
watch(() => props.initialSort, (sort) => {
  sortBy.value = sort?.by ?? "fanIn"
  descending.value = sort?.descending ?? true
})

function sortOn(id: string) {
  if (sortBy.value === id) descending.value = !descending.value
  else { sortBy.value = id; descending.value = id !== "name" && id !== "dir" && id !== "lane" }
}

const rows = computed(() => {
  const list = [...props.modules]
  const key = sortBy.value
  const dir = descending.value ? -1 : 1
  list.sort((a, b) => {
    if (key === "fanIn" || key === "fanOut" || key === "holds") {
      const av = key === "holds" ? a.declared.length : a[key]
      const bv = key === "holds" ? b.declared.length : b[key]
      // Ties broken by name, so the order never shuffles between renders.
      return (av - bv) * dir || a.name.localeCompare(b.name)
    }
    const av = String((a as any)[key] ?? ""), bv = String((b as any)[key] ?? "")
    return av.localeCompare(bv) * dir || a.name.localeCompare(b.name)
  })
  return list
})

// Only the visible slice is in the DOM. django-oscar holds 676 modules and
// LibreChat 1,217; a Java repo holds 5,438.
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)

function onScroll() {
  const el = scroller.value
  if (el) scrollTop.value = el.scrollTop
}

// Measured rather than assumed: a window the user never scrolls would
// otherwise render whatever the initial guess was and leave a tall viewport
// blank below it.
let observer: ResizeObserver | null = null
onMounted(() => {
  const el = scroller.value
  if (!el) return
  viewportHeight.value = el.clientHeight
  observer = new ResizeObserver(([entry]) => { viewportHeight.value = entry.contentRect.height })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

watch(() => props.modules, () => {
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
