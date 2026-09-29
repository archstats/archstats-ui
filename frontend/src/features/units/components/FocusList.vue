<template>
  <!-- The lit modules, ranked, for when nothing is picked yet. Pointing at a
       row finds it on the map; a click opens it in this panel. -->
  <aside class="flex h-full flex-col bg-ground">
    <header class="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
      <h2 class="ui-section-title">{{ modules.length.toLocaleString() }} {{ modules.length === 1 ? 'module' : 'modules' }}</h2>
      <label class="ml-auto flex items-center gap-1.5 text-xs text-neutral-500">
        <span>by</span>
        <select v-model="by" class="ui-input ui-input-sm" aria-label="Sort the modules by">
          <option v-for="c in COLUMNS" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </label>
    </header>
    <p class="shrink-0 px-4 pb-2 text-xs leading-4 text-neutral-500">
      Click one to inspect it. Hold ⌘ to collect it into a group instead. Red marks a cycle.
    </p>
    <ul class="min-h-0 flex-1 overflow-y-auto pb-2" @mouseleave="$emit('point', null)">
      <li v-for="m in rows.slice(0, limit)" :key="m.path">
        <button type="button"
                class="flex h-7 w-full items-center gap-2 px-4 text-left transition-colors duration-100"
                :class="trayPaths.includes(m.path) ? 'bg-accent-50' : 'hover:bg-neutral-200/60'"
                :title="m.path"
                @mouseenter="$emit('point', m.path)"
                @click="$emit('select', m.path, $event.metaKey || $event.ctrlKey || $event.shiftKey)">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full"
                :class="trayPaths.includes(m.path) ? 'bg-accent-500' : laneDotClass(laneColor(m.lane))"/>
          <span class="min-w-0 truncate font-mono text-xs text-neutral-900">{{ m.name }}</span>
          <Icon v-if="m.inCycle.length" icon="recycle" :size="11" class="shrink-0 text-red-500"/>
          <span class="ml-auto min-w-0 shrink truncate font-mono text-[11px] text-neutral-500">{{ dirTail(m.dir) }}</span>
          <span class="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-700">{{ value(m) }}</span>
        </button>
      </li>
    </ul>
    <button v-if="rows.length > limit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 mb-3 shrink-0 self-start"
            @click="limit += 200">Show more · {{ (rows.length - limit).toLocaleString() }} left</button>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { laneDotClass, type LaneColor } from "~/features/frameworks/frameworkProfiles"
import { dirTail, type ModuleNode } from "~/features/units/moduleGraph"

type Sort = "fanIn" | "fanOut" | "holds"

const props = defineProps<{
  modules: ModuleNode[]
  trayPaths: string[]
  /** The order the region's note promises. */
  initialSort: { by: Sort | "name"; descending: boolean }
  laneColor: (lane: string) => LaneColor
}>()
defineEmits<{
  (e: "select", path: string, additive: boolean): void
  (e: "point", path: string | null): void
}>()

const COLUMNS: Array<{ id: Sort; label: string }> = [
  { id: "fanIn", label: "imported by" },
  { id: "fanOut", label: "imports" },
  { id: "holds", label: "holds" },
]

const by = ref<Sort>(props.initialSort.by === "name" ? "fanIn" : props.initialSort.by)
const descending = ref(props.initialSort.descending)
watch(() => props.initialSort, (s) => { by.value = s.by === "name" ? "fanIn" : s.by; descending.value = s.descending })
watch(by, () => { descending.value = by.value === props.initialSort.by ? props.initialSort.descending : true })

const value = (m: ModuleNode) => (by.value === "holds" ? m.declared.length : m[by.value])
const rows = computed(() => [...props.modules].sort((a, b) =>
  (descending.value ? value(b) - value(a) : value(a) - value(b)) || a.name.localeCompare(b.name)))

const limit = ref(200)
watch(() => props.modules, () => { limit.value = 200 })
</script>
