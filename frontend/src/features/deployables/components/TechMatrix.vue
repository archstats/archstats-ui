<template>
  <!-- What each deployable runs on, as a grid: a row per deployable, a column
       per runtime, framework and base image, the versions of one family side
       by side so drift reads as two neighbouring columns. -->
  <div class="min-h-0 grow overflow-auto">
    <p v-if="!rows.length" class="px-4 py-6 text-sm text-neutral-500">No deployable here declares a runtime, a framework or a base image.</p>
    <table v-else class="border-separate border-spacing-0 text-sm" @mouseleave="hoverCol = null">
      <thead>
        <tr>
          <th class="sticky left-0 top-0 z-30 h-7 min-w-[240px] bg-surface"></th>
          <th v-for="g in groups" :key="g.title" :colspan="g.columns.length" class="sticky top-0 z-20 h-7 bg-surface px-1 text-left align-bottom hairline-l">
            <span class="ui-section-title">{{ g.title }}</span>
          </th>
        </tr>
        <tr>
          <th class="sticky left-0 top-7 z-30 h-[132px] bg-surface px-4 pb-2 text-left align-bottom text-xs font-medium text-neutral-500 hairline-b">Deployable</th>
          <th
            v-for="c in columns" :key="c.key"
            class="sticky top-7 z-20 h-[132px] w-[26px] min-w-[26px] bg-surface px-0 pb-2 align-bottom hairline-b"
            :class="[c.first ? 'hairline-l' : '', hoverCol === c.key ? 'bg-neutral-50' : '']"
            :title="`${c.value}: ${c.count} of ${rows.length}`"
            @mouseenter="hoverCol = c.key"
          >
            <span class="mx-auto block max-h-[118px] truncate text-left font-mono text-[11px] font-normal [writing-mode:vertical-rl] rotate-180" :class="c.drift ? 'text-neutral-900' : 'text-neutral-600'">{{ c.label }}</span>
          </th>
          <th class="sticky top-7 z-20 bg-surface px-3 pb-2 text-right align-bottom text-xs font-medium text-neutral-500 hairline-b hairline-l" title="Direct dependencies its manifests declare">Libraries</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.deployable" class="group cursor-default" @click="emit('select', r.deployable)">
          <td
            class="sticky left-0 z-10 h-7 max-w-[240px] truncate px-4 font-mono text-xs"
            :class="selected === r.deployable ? 'bg-accent-50 text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'bg-surface text-neutral-800 group-hover:bg-neutral-50'"
            :title="r.deployable"
          >{{ r.deployable }}</td>
          <td
            v-for="c in columns" :key="c.key"
            class="h-7 text-center"
            :class="[c.first ? 'hairline-l' : '', hoverCol === c.key || selected === r.deployable ? 'bg-neutral-50' : 'group-hover:bg-neutral-50']"
            @mouseenter="hoverCol = c.key"
          >
            <span v-if="r.has.has(c.key)" class="mx-auto block h-2 w-2 rounded-full" :class="c.drift ? 'bg-neutral-900' : 'bg-neutral-500'" :title="`${r.deployable}: ${c.value}`"/>
          </td>
          <td class="h-7 px-3 text-right font-mono text-xs text-neutral-600 hairline-l" :class="selected === r.deployable ? 'bg-neutral-50' : 'group-hover:bg-neutral-50'">{{ r.libraries || "—" }}</td>
        </tr>
      </tbody>
    </table>

    <div class="flex flex-wrap gap-x-12 gap-y-4 px-4 py-5">
      <p v-if="bare" class="max-w-[48ch] text-xs text-neutral-500">{{ bare }} deployables declare none of these and are left out of the grid. Maven and Gradle resolve most versions over the network; a committed CycloneDX file is read as is.</p>
      <div v-if="shared.length" class="min-w-[320px]">
        <h4 class="ui-section-title">Modules carried by several</h4>
        <ul class="mt-1 flex flex-col">
          <li v-for="s in shared.slice(0, 12)" :key="s.module" class="flex h-7 items-center gap-3 text-sm" :title="s.deployables.join(', ')">
            <span class="min-w-0 max-w-[260px] truncate font-mono text-xs text-neutral-800">{{ s.module }}</span>
            <span class="relative ml-auto h-1 w-24 shrink-0 overflow-hidden rounded-full bg-neutral-100"><span class="absolute inset-y-0 left-0 rounded-full bg-neutral-500" :style="{ width: Math.round((s.deployables.length / Math.max(1, total)) * 100) + '%' }"/></span>
            <span class="w-14 shrink-0 text-right font-mono text-[11px] text-neutral-600">{{ s.deployables.length }} of {{ total }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { sharedModules, technology, type DeployableModel } from "../deployables"

const props = defineProps<{ model: DeployableModel; selected: string | null; filter: (id: string) => boolean }>()
const emit = defineEmits<{ (e: "select", id: string): void }>()

const hoverCol = ref<string | null>(null)
const tech = computed(() => technology(props.model).filter(t => props.filter(t.deployable)))
const total = computed(() => props.model.deployables.length)

type Col = { key: string; group: string; value: string; label: string; family: string; count: number; first: boolean; drift: boolean }
const family = (v: string) => v.split(/[\s:@]/)[0]
// A base image reads by its last path segment: mcr.microsoft.com/dotnet/aspnet:10.0 → aspnet:10.0.
const shortImage = (v: string) => v.slice(v.lastIndexOf("/") + 1)

const groups = computed(() => {
  const defs = [
    { title: "Runtime", values: (t: typeof tech.value[number]) => (t.runtime ? [t.runtime] : []), label: (v: string) => v },
    { title: "Framework", values: (t: typeof tech.value[number]) => t.frameworks, label: (v: string) => v },
    { title: "Base image", values: (t: typeof tech.value[number]) => (t.baseImage ? [t.baseImage] : []), label: shortImage },
  ]
  return defs.map(d => {
    const counts = new Map<string, number>()
    for (const t of tech.value) for (const v of d.values(t)) counts.set(v, (counts.get(v) ?? 0) + 1)
    const famTotal = new Map<string, number>()
    const famSize = new Map<string, number>()
    for (const [v, n] of counts) { famTotal.set(family(v), (famTotal.get(family(v)) ?? 0) + n); famSize.set(family(v), (famSize.get(family(v)) ?? 0) + 1) }
    const values = [...counts.keys()].sort((a, b) => famTotal.get(family(b))! - famTotal.get(family(a))! || family(a).localeCompare(family(b)) || counts.get(b)! - counts.get(a)! || a.localeCompare(b))
    const columns: Col[] = values.map((v, i) => ({
      key: `${d.title}|${v}`, group: d.title, value: v, label: d.label(v), family: family(v), count: counts.get(v)!, first: i === 0,
      // Two versions of one family in use: the drift the grid exists to show.
      drift: (famSize.get(family(v)) ?? 0) > 1,
    }))
    return { title: d.title, columns, values: d.values }
  }).filter(g => g.columns.length)
})
const columns = computed(() => groups.value.flatMap(g => g.columns))

const rows = computed(() => tech.value
  .map(t => ({ deployable: t.deployable, libraries: t.libraries, has: new Set(groups.value.flatMap(g => g.values(t).map(v => `${g.title}|${v}`))) }))
  .filter(r => r.has.size)
  .sort((a, b) => {
    const first = (r: typeof a) => columns.value.findIndex(c => r.has.has(c.key))
    return first(a) - first(b) || a.deployable.localeCompare(b.deployable)
  }))
const bare = computed(() => tech.value.length - rows.value.length)
const shared = computed(() => sharedModules(props.model).filter(s => s.deployables.length > 1))
</script>
