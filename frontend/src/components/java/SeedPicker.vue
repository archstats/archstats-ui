<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/20 pt-[10vh]" @click.self="close" @keydown="onKey">
      <div class="ui-popover flex w-[640px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden" style="max-height: 72vh" role="dialog" aria-modal="true" aria-label="Choose classes to start from">
        <!-- Search -->
        <label class="relative flex items-center hairline-b">
          <Icon icon="search" :size="14" class="pointer-events-none absolute left-3 text-neutral-400"/>
          <input
            ref="inputEl"
            v-model="query"
            type="search"
            class="h-11 w-full bg-transparent pl-9 pr-24 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
            placeholder="Type a class, package or component…"
            aria-label="Search classes"
          />
          <span class="absolute right-3 font-mono text-xs text-neutral-400">{{ selected.size ? `${selected.size} picked` : 'Esc to close' }}</span>
        </label>

        <div class="flex min-h-0 flex-1">
          <!-- Lane and component filters -->
          <aside class="flex w-44 shrink-0 flex-col gap-3 overflow-y-auto bg-ground p-3 hairline-r">
            <div class="flex flex-col gap-0.5">
              <span class="ui-label mb-1">Lane</span>
              <button type="button" class="ui-menu-item h-7 text-sm" :class="{ 'is-active': laneFilter === null }" @click="laneFilter = null">
                <span class="flex-1">All</span><span class="font-mono text-xs text-neutral-400">{{ classes.length }}</span>
              </button>
              <button v-for="lane in lanes" :key="lane.id" type="button" class="ui-menu-item h-7 text-sm" :class="{ 'is-active': laneFilter === lane.id }" @click="laneFilter = laneFilter === lane.id ? null : lane.id">
                <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(lane.color)"></span>
                <span class="min-w-0 flex-1 truncate">{{ lane.label }}</span>
                <span class="font-mono text-xs text-neutral-400">{{ laneCounts.get(lane.id) ?? 0 }}</span>
              </button>
            </div>
            <div v-if="components.length > 1" class="flex flex-col gap-1">
              <span class="ui-label">Component</span>
              <select v-model="componentFilter" class="ui-input ui-input-sm w-full" aria-label="Component">
                <option :value="null">All components</option>
                <option v-for="c in components" :key="c" :value="c">{{ shortComponent(c) }}</option>
              </select>
            </div>
          </aside>

          <!-- Results, or suggested starting points when the search is empty -->
          <div ref="listEl" class="min-h-0 flex-1 overflow-y-auto py-1">
            <template v-if="!query.trim() && laneFilter === null && componentFilter === null">
              <div v-for="section in suggestions" :key="section.title" class="pb-1">
                <div class="ui-menu-title flex items-center gap-2">{{ section.title }} <span class="font-normal normal-case tracking-normal text-neutral-400">{{ section.hint }}</span></div>
                <button
                  v-for="c in section.items"
                  :key="section.title + c.id"
                  type="button"
                  class="row flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-neutral-50"
                  :class="{ 'is-cursor': cursorId === c.id }"
                  :data-id="c.id"
                  @click="toggle(c.id)"
                  @mouseenter="cursorId = c.id"
                >
                  <Checkbox :model-value="selected.has(c.id)" class="pointer-events-none"/>
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(laneOf(c.lane).color)"></span>
                  <span class="min-w-0 truncate font-mono text-sm text-neutral-900">{{ c.name }}</span>
                  <span class="min-w-0 flex-1 truncate text-xs text-neutral-400">{{ packageOf(c.id) }}</span>
                  <span class="font-mono text-xs text-neutral-400" :title="`${c.degree} connections`">{{ c.degree }}</span>
                </button>
              </div>
            </template>
            <template v-else>
              <p v-if="results.length === 0" class="px-3 py-4 text-sm text-neutral-500">No class matches.</p>
              <button
                v-for="c in results"
                :key="c.id"
                type="button"
                class="row flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-neutral-50"
                :class="{ 'is-cursor': cursorId === c.id }"
                :data-id="c.id"
                @click="toggle(c.id)"
                @mouseenter="cursorId = c.id"
              >
                <Checkbox :model-value="selected.has(c.id)" class="pointer-events-none"/>
                <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(laneOf(c.lane).color)"></span>
                <span class="min-w-0 truncate font-mono text-sm text-neutral-900">{{ c.name }}</span>
                <span class="min-w-0 flex-1 truncate text-xs text-neutral-400">{{ packageOf(c.id) }}</span>
                <span class="font-mono text-xs text-neutral-400" :title="`${c.degree} connections`">{{ c.degree }}</span>
              </button>
              <p v-if="results.length >= LIMIT" class="px-3 py-2 text-xs text-neutral-400">Showing the first {{ LIMIT }}. Narrow the search to see the rest.</p>
            </template>
          </div>
        </div>

        <!-- Footer: what is picked, and go -->
        <div class="flex items-center gap-2 px-3 py-2 hairline-t">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <span v-if="selected.size === 0" class="text-sm text-neutral-500">Pick one or more classes. Space toggles, Enter starts.</span>
            <span v-for="id in [...selected].slice(0, 6)" :key="'pick-' + id" class="ui-chip is-active max-w-[180px]">
              <span class="truncate font-mono">{{ nameOf(id) }}</span>
              <button type="button" class="-mr-1 flex h-4 w-4 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200" :aria-label="`Remove ${nameOf(id)}`" @click="toggle(id)"><Icon icon="x" :size="11"/></button>
            </span>
            <span v-if="selected.size > 6" class="text-xs text-neutral-500">+{{ selected.size - 6 }} more</span>
          </div>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="selected.size === 0" @click="start">Start exploring</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import Checkbox from "~/components/ui/common/Checkbox.vue"
import { type FrameworkProfile, type LaneDef, laneDotClass, laneOf as laneOfProfile } from "~/utils/javaFrameworks"

// The seed picker: a palette for choosing the classes an exploration starts
// from. Empty search shows good starting points (entry points, hubs, recent
// seeds); typing searches names, packages and components; lanes and
// components filter; Space picks, Enter starts.

export interface SeedClass { id: string; name: string; component: string; lane: string; degree: number }

const props = defineProps<{
  open: boolean
  classes: SeedClass[]
  profile: FrameworkProfile
  recent: string[]
}>()

const emit = defineEmits<{
  (e: "update:open", open: boolean): void
  (e: "start", ids: string[]): void
}>()

const LIMIT = 200
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const query = ref("")
const laneFilter = ref<string | null>(null)
const componentFilter = ref<string | null>(null)
const selected = ref(new Set<string>())
const cursorId = ref<string | null>(null)

const lanes = computed<LaneDef[]>(() => props.profile.lanes)
const laneOf = (id: string) => laneOfProfile(props.profile, id)
const byId = computed(() => new Map(props.classes.map(c => [c.id, c])))
const laneCounts = computed(() => { const m = new Map<string, number>(); for (const c of props.classes) m.set(c.lane, (m.get(c.lane) ?? 0) + 1); return m })
const components = computed(() => [...new Set(props.classes.map(c => c.component).filter(Boolean))].sort())

function packageOf(id: string): string { const i = id.lastIndexOf("."); return i > 0 ? id.slice(0, i) : "" }
function nameOf(id: string): string { return byId.value.get(id)?.name ?? id }
function shortComponent(c: string): string { const parts = c.split("."); return parts.length > 3 ? "…" + parts.slice(-3).join(".") : c }

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out: SeedClass[] = []
  for (const c of props.classes) {
    if (laneFilter.value && c.lane !== laneFilter.value) continue
    if (componentFilter.value && c.component !== componentFilter.value) continue
    if (q && !c.id.toLowerCase().includes(q) && !c.component.toLowerCase().includes(q)) continue
    out.push(c)
    if (out.length >= LIMIT) break
  }
  // Names that start with the query first, then by degree.
  return out.sort((a, b) => {
    const sa = q && a.name.toLowerCase().startsWith(q) ? 0 : 1
    const sb = q && b.name.toLowerCase().startsWith(q) ? 0 : 1
    return sa - sb || b.degree - a.degree || a.name.localeCompare(b.name)
  })
})

const suggestions = computed(() => {
  const sections: Array<{ title: string; hint: string; items: SeedClass[] }> = []
  const recent = props.recent.map(id => byId.value.get(id)).filter((c): c is SeedClass => !!c).slice(0, 6)
  if (recent.length) sections.push({ title: "Recent seeds", hint: "where you started before", items: recent })
  const entryLane = lanes.value[0]
  const entries = props.classes.filter(c => c.lane === entryLane.id).sort((a, b) => b.degree - a.degree).slice(0, 8)
  if (entries.length) sections.push({ title: entryLane.label, hint: "where work starts", items: entries })
  const hubs = [...props.classes].sort((a, b) => b.degree - a.degree).filter(c => c.lane !== entryLane.id).slice(0, 8)
  if (hubs.length) sections.push({ title: "Most connected", hint: "the centre of the codebase", items: hubs })
  return sections
})

const visibleIds = computed(() => {
  if (!query.value.trim() && laneFilter.value === null && componentFilter.value === null) return suggestions.value.flatMap(s => s.items.map(i => i.id))
  return results.value.map(r => r.id)
})

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selected.value = next
  cursorId.value = id
}
function move(delta: number) {
  const ids = visibleIds.value
  if (!ids.length) return
  const i = cursorId.value ? ids.indexOf(cursorId.value) : -1
  cursorId.value = ids[Math.max(0, Math.min(ids.length - 1, i + delta))]
  nextTick(() => listEl.value?.querySelector<HTMLElement>(`[data-id="${CSS.escape(cursorId.value!)}"]`)?.scrollIntoView({ block: "nearest" }))
}
// One handler on the dialog: the keys work whether focus is in the search
// field or on a row the mouse just clicked. Class names never contain spaces,
// so Space always picks.
function onKey(event: KeyboardEvent) {
  switch (event.key) {
    case "Escape": event.preventDefault(); event.stopPropagation(); close(); break
    case "ArrowDown": event.preventDefault(); move(1); break
    case "ArrowUp": event.preventDefault(); move(-1); break
    case "Enter": event.preventDefault(); onEnter(); break
    case " ": if (cursorId.value) { event.preventDefault(); toggle(cursorId.value) } break
  }
}
function onEnter() {
  if (selected.value.size) { start(); return }
  if (cursorId.value) { toggle(cursorId.value); start(); return }
  if (visibleIds.value.length) { toggle(visibleIds.value[0]); start() }
}
function start() {
  if (!selected.value.size) return
  emit("start", [...selected.value])
  close()
}
function close() { emit("update:open", false) }

watch(() => props.open, async (open) => {
  if (!open) return
  query.value = ""
  laneFilter.value = null
  componentFilter.value = null
  selected.value = new Set()
  cursorId.value = null
  await nextTick()
  inputEl.value?.focus()
})
watch([query, laneFilter, componentFilter], () => { cursorId.value = visibleIds.value[0] ?? null })
</script>

<style scoped>
.row.is-cursor {
  background: rgb(var(--c-neutral-100));
}
</style>
