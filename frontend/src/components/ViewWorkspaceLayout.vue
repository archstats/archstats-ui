<template>
  <div class="flex h-full min-h-0 w-full flex-col bg-surface">
    <!-- Tool-window toolbar, one fixed order for every view:
         title and counts · scope chip | switches … search · actions · Configure · inspector toggle.
         The row is a window drag region; its controls opt out. -->
    <header ref="headerEl" class="ui-toolbar drag-region gap-3">
      <div ref="leftEl" class="flex shrink-0 items-center gap-3">
        <h2 class="ui-toolbar-title flex shrink-0 items-center gap-2">
          <slot name="title">{{ title }}</slot>
        </h2>
        <span v-if="badgeText" class="ui-tag shrink-0">{{ badgeText }}</span>
        <span v-show="level < 2" ref="metaEl" class="ui-toolbar-meta flex shrink-0 items-center gap-1.5">
          <span v-if="nodesCount !== undefined">{{ statsLabels.nodes || 'Nodes' }} <span class="text-neutral-800">{{ nodesCount }}</span></span>
          <span v-if="nodesCount !== undefined && connectionsCount !== undefined" class="text-neutral-300">·</span>
          <span v-if="connectionsCount !== undefined">{{ statsLabels.connections || 'Connections' }} <span class="text-neutral-800">{{ connectionsCount }}</span></span>
          <slot name="stats"></slot>
        </span>
        <!-- The query is scope, not a view setting, so it lives beside the
             scope chips rather than among the switches — which fold into
             Configure on a narrow window, and folded away the one control
             the architect had just started using. -->
        <QueryBar v-if="queryable" :keep-into="keepInto" class="shrink-0"/>
        <ScopeBar/>
      </div>

      <template v-if="hasSwitches && !narrow">
        <span class="ui-toolbar-sep shrink-0" aria-hidden="true"></span>
        <div ref="switchesEl" class="flex min-w-0 items-center gap-2 overflow-hidden">
          <slot name="switches"></slot>
        </div>
      </template>

      <div ref="rightEl" class="ml-auto flex shrink-0 items-center gap-2">
        <label v-if="searchQuery !== undefined" ref="searchEl" class="relative flex items-center">
          <Icon icon="search" :size="13" class="pointer-events-none absolute left-2 text-neutral-400"/>
          <input
            :value="searchQuery"
            @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            type="search"
            :placeholder="level >= 1 ? '' : searchPlaceholder"
            :aria-label="searchPlaceholder"
            :title="searchPlaceholder"
            class="ui-input ui-input-sm pl-7 pr-6 transition-[width] duration-150"
            :class="level >= 1 && !searchQuery ? 'w-8 focus:w-44' : hasSwitches ? 'w-48' : 'w-56'"
          />
          <button v-if="searchQuery" type="button" class="absolute right-1.5 text-neutral-400 hover:text-neutral-700" aria-label="Clear search" @click="$emit('update:searchQuery', '')">
            <Icon icon="x" :size="12"/>
          </button>
        </label>

        <slot name="actions"></slot>

        <div v-if="showConfig || (hasSwitches && narrow)" class="relative">
          <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="showConfigPopover" @click="showConfigPopover = !showConfigPopover">
            <Icon icon="settings" :size="13" class="text-neutral-500"/>
            <span>Configure</span>
          </button>
          <div v-if="showConfigPopover" class="fixed inset-0 z-40 cursor-default" @click="showConfigPopover = false"></div>
          <div v-if="showConfigPopover" class="ui-popover absolute right-0 z-50 mt-1 flex w-72 flex-col gap-3 p-3 animate-in md:w-80">
            <div class="flex items-center justify-between pb-2 hairline-b">
              <span class="text-base font-semibold text-neutral-900">Configuration</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Close" @click="showConfigPopover = false"><Icon icon="x" :size="13"/></button>
            </div>
            <!-- Narrow windows fold the toolbar switches in here so the row never wraps. -->
            <div v-if="hasSwitches && narrow" class="flex flex-wrap items-center gap-2" :class="{ 'pb-3 hairline-b': showConfig }">
              <slot name="switches"></slot>
            </div>
            <slot name="config-popover" :close="() => showConfigPopover = false"></slot>
          </div>
        </div>

        <button
          v-if="tabs && tabs.length > 0"
          type="button"
          class="ui-btn ui-btn-sm ui-btn-icon"
          :class="{ 'bg-neutral-100': isSidebarOpen }"
          :aria-pressed="isSidebarOpen"
          :title="isSidebarOpen ? 'Hide panel' : 'Show panel'"
          @click="$emit('update:isSidebarOpen', !isSidebarOpen)"
        >
          <Icon :icon="isSidebarOpen ? 'panel-right-close' : 'panel-right'" :size="14" class="text-neutral-600"/>
        </button>
      </div>
    </header>

    <!-- Workspace: visualizer left, inspector right. -->
    <div class="relative flex min-h-0 grow overflow-hidden">
      <div class="relative flex min-w-0 grow flex-col overflow-hidden">
        <slot name="visualizer"></slot>
        <slot name="visualizer-overlays"></slot>
      </div>

      <aside
        v-if="tabs && tabs.length > 0"
        class="relative flex h-full shrink-0 flex-col overflow-hidden bg-ground hairline-l"
        :class="dragging ? '' : 'transition-[width]'"
        :style="{ width: isSidebarOpen ? inspectorWidth + 'px' : '0px', minWidth: isSidebarOpen ? inspectorWidth + 'px' : '0px' }"
      >
        <PaneHandle
          v-if="isSidebarOpen"
          side="left"
          label="Resize inspector"
          :model-value="inspectorWidth"
          :min="INSPECTOR.min"
          :max="INSPECTOR.max"
          @update:model-value="panes.setInspector"
          @reset="panes.setInspector(null)"
          @drag-start="dragging = true"
          @drag-end="dragging = false"
        />
        <div v-if="tabs.length > 1" class="flex h-9 shrink-0 items-stretch gap-3 px-3 hairline-b" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            class="-mb-px border-b-2 px-0.5 text-sm font-medium transition-colors"
            :class="activeTab === tab.id ? 'border-accent-500 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'"
            @click="$emit('update:activeTab', tab.id)"
          >
            {{ cleanLabel(tab.label) }}
          </button>
        </div>

        <div class="flex grow flex-col gap-4 overflow-y-auto p-4">
          <div v-for="tab in tabs" :key="'body-' + tab.id" v-show="activeTab === tab.id" class="flex flex-col gap-4">
            <slot :name="`tab-${tab.id}`"></slot>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import Icon from "~/components/ui/common/Icon.vue";
import QueryBar from "~/components/groups/QueryBar.vue";
import ScopeBar from "~/components/shell/ScopeBar.vue";
import PaneHandle from "~/components/shell/PaneHandle.vue";
import { INSPECTOR, usePanesStore } from "~/stores/panes";

const props = withDefaults(defineProps<{
  /**
   * Whether this view answers a query. On by default: the query narrows the
   * scope, and every view that filters by scope already answers one. A view
   * that shows a single component or a chart of the whole repo turns it off.
   */
  queryable?: boolean
  /** Where a kept finding goes: a lens the architect is asked to pick, or the
   *  draft this view is already building. */
  keepInto?: "lens" | "draft"
  title?: string
  badgeText?: string
  nodesCount?: number
  connectionsCount?: number
  statsLabels?: { nodes?: string; connections?: string }
  searchQuery?: string
  searchPlaceholder?: string
  isSidebarOpen?: boolean
  activeTab?: string
  tabs?: Array<{ id: string; label: string }>
  showConfig?: boolean
  /** The view's suggested inspector width; the user's dragged width wins once set. */
  sidebarWidth?: string
}>(), { queryable: true,
  keepInto: 'lens',
  title: '',
  badgeText: '',
  statsLabels: () => ({ nodes: 'Nodes', connections: 'Connections' }),
  searchQuery: undefined,
  searchPlaceholder: 'Search components',
  isSidebarOpen: true,
  activeTab: '',
  tabs: () => [],
  showConfig: false,
  sidebarWidth: `${INSPECTOR.default}px`
})

defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'update:isSidebarOpen', val: boolean): void
  (e: 'update:activeTab', val: string): void
}>()

const slots = useSlots()
const hasSwitches = computed(() => !!slots.switches)
const showConfigPopover = ref(false)

const panes = usePanesStore()
const dragging = ref(false)
const inspectorWidth = computed(() => {
  const suggested = parseInt(props.sidebarWidth, 10) || INSPECTOR.default
  return panes.inspectorWidth ?? Math.min(INSPECTOR.max, Math.max(INSPECTOR.min, suggested))
})

// The row never wraps. When it cannot hold everything it gives ground in
// order: the search shrinks to an icon, then the counts hide, then the
// switches fold into Configure. Natural widths are remembered from the last
// time each part was shown so the row can grow back.
const level = ref(0)
const narrow = computed(() => level.value >= 3)
const headerEl = ref<HTMLElement | null>(null)
const leftEl = ref<HTMLElement | null>(null)
const metaEl = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
const switchesEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLElement | null>(null)
const natural = { switches: 0, meta: 0, search: 0 }
let observer: ResizeObserver | null = null

function measure() {
  if (!headerEl.value || !leftEl.value || !rightEl.value) return
  if (switchesEl.value && level.value < 3) natural.switches = Math.max(natural.switches, switchesEl.value.scrollWidth + 28)
  if (metaEl.value && level.value < 2) natural.meta = Math.max(natural.meta, metaEl.value.offsetWidth + 12)
  if (searchEl.value && level.value < 1) natural.search = Math.max(natural.search, searchEl.value.offsetWidth)
  const leftFixed = leftEl.value.offsetWidth - (level.value < 2 ? natural.meta - 12 : 0)
  const rightFixed = rightEl.value.offsetWidth - (searchEl.value ? searchEl.value.offsetWidth : 0) - (level.value >= 3 && !props.showConfig ? 104 : 0)
  const room = headerEl.value.clientWidth - 36 - leftFixed - rightFixed
  const need = (lvl: number) =>
    (lvl >= 1 ? (searchEl.value ? 36 : 0) : natural.search) +
    (lvl >= 2 ? 0 : natural.meta) +
    (hasSwitches.value ? (lvl >= 3 ? (props.showConfig ? 0 : 104) : natural.switches) : 0)
  let next = 0
  while (next < 3 && need(next) > room) next++
  if (next !== level.value) level.value = next
}
onMounted(() => {
  panes.load()
  observer = new ResizeObserver(() => measure())
  if (headerEl.value) observer.observe(headerEl.value)
  nextTick(measure)
})
watch([hasSwitches, () => props.nodesCount, () => props.connectionsCount, () => props.searchQuery], () => nextTick(measure))
onBeforeUnmount(() => observer?.disconnect())

// Tab labels arrive with decorative glyphs from older views; the frame shows words only.
function cleanLabel(label: string): string {
  return label.replace(/[\p{Extended_Pictographic}️]/gu, '').trim()
}
</script>
