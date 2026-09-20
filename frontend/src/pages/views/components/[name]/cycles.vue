<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" aria-label="Sort cycles">
        <button v-for="s in sorts" :key="s.id" type="button" :aria-pressed="sortBy === s.id" @click="sortBy = s.id">{{ s.label }}</button>
      </div>
      <span class="ui-toolbar-meta ml-auto">Cycles <span class="font-mono text-neutral-800">{{ formatNumber(cycles.length) }}</span></span>
      <router-link :to="`/views/components/cycles?component=${encodeURIComponent(name)}`" class="ui-btn ui-btn-sm">
        <Icon icon="route" :size="13" class="text-neutral-500"/><span>Open in Cycles</span>
      </router-link>
    </div>

    <EmptyState v-if="cycles.length === 0" title="Not part of any cycle" :text="`${name} does not appear in any dependency cycle in the snapshot.`" icon="route"/>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <table class="ui-table">
        <thead>
          <tr>
            <th class="w-[48px]">#</th>
            <th>Path</th>
            <th class="w-[64px] text-right">Size</th>
            <th class="w-[120px] text-right">Shared commits</th>
            <th class="w-[90px] text-right">Severity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cycle in cycles" :key="cycle.id">
            <td class="is-num">{{ cycle.id }}</td>
            <td class="max-w-0">
              <span class="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                <template v-for="(node, i) in cycle.nodes" :key="`${cycle.id}-${i}`">
                  <Icon v-if="i !== 0" icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
                  <router-link
                    :to="`/views/components/${node}`"
                    class="font-mono text-sm hover:underline"
                    :class="node === name ? 'font-medium text-neutral-900' : 'text-neutral-700'"
                    :title="node"
                  >{{ store.getComponentName(node) }}</router-link>
                </template>
              </span>
            </td>
            <td class="is-num text-right">{{ formatNumber(cycle.size) }}</td>
            <td class="is-num text-right">{{ formatNumber(cycle.sharedCommits) }}</td>
            <td class="is-num text-right">{{ formatNumber(cycle.severity) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { formatNumber } from "~/utils/format"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"

interface CycleRow {
  id: number
  cycleText: string
  path: string[]
  nodes: string[]
  size: number
  sharedCommits: number
  severity: number
}

type SortKey = "severity" | "size" | "sharedCommits"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

const sorts: { id: SortKey; label: string }[] = [
  { id: "severity", label: "Severity" },
  { id: "size", label: "Size" },
  { id: "sharedCommits", label: "Shared commits" },
]
const sortBy = ref<SortKey>("severity")

const cycles = computed<CycleRow[]>(() => {
  const list = (store.allCyclesExpanded as CycleRow[]).filter(c => c.nodes.includes(name.value))
  return [...list].sort((a, b) => {
    if (sortBy.value === "size") return b.size - a.size || b.severity - a.severity
    if (sortBy.value === "sharedCommits") return b.sharedCommits - a.sharedCommits || b.severity - a.severity
    return b.severity - a.severity
  })
})
</script>
