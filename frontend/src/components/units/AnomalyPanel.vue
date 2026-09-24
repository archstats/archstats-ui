<template>
  <!-- One anomaly, opened. The claim at the top, then every dependency it
       was read off, both ends clickable. A warning you cannot open is a
       label; this is the part that makes it a finding. -->
  <aside class="flex h-full flex-col bg-ground">
    <header class="shrink-0 hairline-b px-4 py-3">
      <p class="ui-label">{{ kindLabel }}</p>
      <h2 class="mt-1 flex items-start gap-2 text-base leading-5 text-neutral-900">
        <span v-if="anomaly.tone === 'warn'" class="mt-0.5 shrink-0 text-red-500" aria-hidden="true">
          <Icon icon="alert" :size="14"/>
        </span>
        <span class="min-w-0">{{ anomaly.headline }}</span>
      </h2>
      <p class="mt-1 text-sm leading-5 text-neutral-500">{{ anomaly.detail }}</p>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <h3 class="flex items-baseline gap-2 px-4 pb-1 pt-3">
        <span class="ui-section-title">{{ anomaly.kind === 'cycle' ? 'The pairs' : 'The dependencies' }}</span>
        <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ anomaly.references.length }}</span>
      </h3>

      <ul>
        <li v-for="(r, i) in anomaly.references" :key="i"
            class="flex items-center gap-2 px-4" style="height:28px">
          <button type="button" class="min-w-0 flex-1 truncate text-left font-mono text-xs text-neutral-800 hover:text-neutral-900 hover:underline"
                  :title="r.from" @click="$emit('select', r.from)">{{ nameOf(r.from) }}</button>
          <Icon :icon="anomaly.kind === 'cycle' ? 'recycle' : 'arrow-right'" :size="12"
                class="shrink-0" :class="anomaly.kind === 'cycle' ? 'text-red-500' : 'text-neutral-400'"/>
          <button type="button" class="min-w-0 flex-1 truncate text-left font-mono text-xs text-neutral-800 hover:text-neutral-900 hover:underline"
                  :title="r.to" @click="$emit('select', r.to)">{{ nameOf(r.to) }}</button>
          <button type="button"
                  class="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-neutral-600 hover:text-neutral-900"
                  :title="`Inspect the ${r.weight} ${r.weight === 1 ? 'reference' : 'references'} behind this`"
                  @click="$emit('inspectPair', r.from, r.to)">{{ r.weight }}</button>
        </li>
      </ul>

      <p class="px-4 pb-4 pt-2 text-xs leading-4 text-neutral-500">
        Click a name to inspect that module, or the count to see the declarations that create
        the dependency.
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import type { Anomaly } from "~/utils/relationship"

const props = defineProps<{ anomaly: Anomaly; nameOf: (path: string) => string }>()
defineEmits<{
  (e: "select", path: string): void
  (e: "inspectPair", from: string, to: string): void
}>()

const kindLabel = computed(() => ({
  cycle: "Cycle",
  "against-grain": "Against the grain",
  bottleneck: "Single point of failure",
  wide: "Reaching too widely",
}[props.anomaly.kind] ?? "Anomaly"))
</script>
