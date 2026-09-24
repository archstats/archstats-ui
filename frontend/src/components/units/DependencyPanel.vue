<template>
  <!-- One cell of the grid, opened.
       The grid says CustCallerDaoImpl uses ErrorResponse; the question that
       follows is always which code does it, and that is the one thing the
       matrix cannot draw. It is in the snapshot, so it belongs here. -->
  <aside class="flex h-full flex-col bg-ground">
    <header class="shrink-0 hairline-b px-4 py-3">
      <p class="ui-label">Dependency</p>

      <button type="button" class="mt-1.5 flex w-full min-w-0 items-center gap-2 text-left"
              @click="$emit('select', from.path)">
        <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(laneColor(from.lane))"/>
        <span class="truncate font-mono text-sm font-medium text-neutral-900 hover:underline"
              :title="from.path">{{ from.name }}</span>
      </button>
      <p class="truncate pl-4 font-mono text-[11px] text-neutral-500" :title="from.dir">{{ dirTail(from.dir, 3) }}</p>

      <p class="my-1 flex items-center gap-1.5 pl-0.5 text-sm text-neutral-500">
        <Icon icon="chevron-down" :size="12"/>
        <span>imports</span>
        <span v-if="cycle" class="flex items-center gap-1 text-red-500">
          <Icon icon="recycle" :size="11"/>
          <span>and is imported back</span>
        </span>
      </p>

      <button type="button" class="flex w-full min-w-0 items-center gap-2 text-left"
              @click="$emit('select', to.path)">
        <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(laneColor(to.lane))"/>
        <span class="truncate font-mono text-sm font-medium text-neutral-900 hover:underline"
              :title="to.path">{{ to.name }}</span>
      </button>
      <p class="truncate pl-4 font-mono text-[11px] text-neutral-500" :title="to.dir">{{ dirTail(to.dir, 3) }}</p>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <section>
        <h3 class="flex items-baseline gap-2 px-4 pb-1 pt-3">
          <span class="ui-section-title">What creates it</span>
          <span v-if="informative" class="font-mono text-[11px] tabular-nums text-neutral-400">{{ via.length }}</span>
        </h3>

        <!-- Where a module declares one thing -- every Java file, and any
             language with a type-per-file rule -- the declarations are the
             modules and listing them repeats the header back. -->
        <p v-if="!informative" class="px-4 pb-2 text-xs leading-4 text-neutral-500">
          {{ from.name }} is the only thing this module declares, so the dependency is the type
          itself:
          <span class="text-neutral-700">{{ via.length }}</span>
          {{ via.length === 1 ? 'reference' : 'references' }} to {{ to.name }}.
        </p>

        <template v-else>
          <p class="px-4 pb-2 text-xs leading-4 text-neutral-500">
            The declarations in {{ from.name }} that reach into {{ to.name }}. Remove these and the
            dependency is gone.
          </p>
          <ul>
            <li v-for="(v, i) in via" :key="i"
                class="flex items-center gap-2 px-4" style="height:24px">
              <span class="truncate font-mono text-xs text-neutral-800" :title="v.from">{{ shortUnit(v.from) }}</span>
              <Icon icon="arrow-right" :size="11" class="shrink-0 text-neutral-400"/>
              <span class="truncate font-mono text-xs text-neutral-600" :title="v.to">{{ shortUnit(v.to) }}</span>
            </li>
          </ul>
        </template>
      </section>

      <div class="flex flex-wrap gap-2 px-4 py-3">
        <router-link :to="`/views/files/${from.path}`" class="ui-btn ui-btn-sm">
          <Icon icon="file-code" :size="12"/><span>Open {{ from.name }}</span>
        </router-link>
        <router-link :to="`/views/files/${to.path}`" class="ui-btn ui-btn-sm">
          <Icon icon="file-code" :size="12"/><span>Open {{ to.name }}</span>
        </router-link>
        <OpenInEditor :file="from.path"/>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import OpenInEditor from "~/components/ui/OpenInEditor.vue"
import { computed } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import { dirTail, type ModuleNode } from "~/utils/moduleGraph"

const props = defineProps<{
  from: ModuleNode
  to: ModuleNode
  via: Array<{ from: string; to: string }>
  cycle: boolean
  laneColor: (lane: string) => LaneColor
}>()
defineEmits<{ (e: "select", path: string): void }>()

/** Whether naming the declarations says more than the module names already do. */
const informative = computed(() => props.via.some((v) =>
  shortUnit(v.from) !== props.from.name || shortUnit(v.to) !== props.to.name))

/** A unit id is qualified; the tail is what the source actually calls it. */
function shortUnit(id: string): string {
  const tail = id.split("#").pop() ?? id
  return tail.split(".").pop() || tail
}
</script>
