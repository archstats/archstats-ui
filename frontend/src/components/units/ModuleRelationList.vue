<template>
  <!-- One side of a module's neighbourhood. A list rather than a canvas:
       at one hop the names are the information, and a force layout of nine
       nodes is theatre. -->
  <section>
    <h3 class="flex items-baseline gap-2 px-4 pb-1 pt-3">
      <span class="ui-section-title">{{ label }}</span>
      <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ modules.length }}</span>
    </h3>

    <p v-if="!modules.length" class="px-4 pb-2 text-xs leading-4 text-neutral-500">{{ empty }}</p>

    <ul v-else>
      <li v-for="m in modules" :key="m.path">
        <button type="button"
                class="flex w-full items-center gap-2 px-4 text-left hover:bg-neutral-100"
                style="height:24px"
                @click="$emit('select', m.path)">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="laneDotClass(laneColor(m.lane))"/>
          <span class="truncate font-mono text-xs text-neutral-800" :title="m.path">{{ m.name }}</span>
          <span class="ml-auto min-w-0 shrink truncate font-mono text-[11px] text-neutral-500"
                :title="m.dir">{{ dirTail(m.dir, 2) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import { dirTail, type ModuleNode } from "~/utils/moduleGraph"

defineProps<{
  label: string
  modules: ModuleNode[]
  empty: string
  laneColor: (lane: string) => LaneColor
}>()
defineEmits<{ (e: "select", path: string): void }>()
</script>
