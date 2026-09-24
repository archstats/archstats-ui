<template>
  <!-- The bottom of the descent: one module. What imports it, what it
       imports, and -- the thing a unit graph could never show -- what it
       actually declares inside itself. -->
  <aside class="flex h-full flex-col bg-ground">
    <template v-if="module">
      <header class="shrink-0 hairline-b px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full" :class="laneDotClass(laneColor(module.lane))"/>
          <h2 class="truncate font-mono text-sm font-medium text-neutral-900" :title="module.path">{{ module.name }}</h2>
          <button type="button" class="ui-btn ui-btn-sm ml-auto shrink-0"
                  :aria-pressed="inTray"
                  :title="inTray ? 'Remove from the group tray' : 'Collect into the group tray'"
                  @click="$emit('toggleTray', module.path)">
            <Icon :icon="inTray ? 'check' : 'plus'" :size="12"/>
            <span>{{ inTray ? 'Collected' : 'Collect' }}</span>
          </button>
        </div>

        <div class="mt-1 flex items-center gap-1">
          <router-link :to="`/views/files/${module.path}`" class="block min-w-0 truncate font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline" :title="module.path">{{ module.path }}</router-link>
          <OpenInEditor :file="module.path" class="-my-1"/>
        </div>

        <dl class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div><dt class="ui-label">Lane</dt><dd class="text-xs text-neutral-700">{{ laneLabel(module.lane) }}</dd></div>
          <div v-if="module.component"><dt class="ui-label">Component</dt><dd class="truncate text-xs text-neutral-700">{{ module.component }}</dd></div>
          <div v-if="module.declared.length > 1"><dt class="ui-label">Holds</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ module.declared.length }}</dd></div>
          <div><dt class="ui-label">Imported by</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ usedBy.length }}</dd></div>
          <div><dt class="ui-label">Imports</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ uses.length }}</dd></div>
        </dl>

        <!-- The question an architect actually arrives with. One hop is what
             this module touches; the reach is what a change to it can break,
             and in any real codebase those differ by an order of magnitude. -->
        <p v-if="reach && reach.count > 0" class="mt-2.5 text-sm leading-4 text-neutral-600">
          Changing this can reach
          <span class="font-mono tabular-nums text-neutral-900">{{ reach.count.toLocaleString() }}</span>
          {{ reach.count === 1 ? 'module' : 'modules' }}, up to {{ reach.hops }}
          {{ reach.hops === 1 ? 'hop' : 'hops' }} away.
        </p>
        <p v-else-if="reach" class="mt-2.5 text-sm leading-4 text-neutral-600">
          Nothing depends on this, directly or at any distance.
        </p>

        <p v-if="module.inCycle.length" class="mt-2 flex items-start gap-1.5 text-sm leading-4 text-red-500">
          <span class="mt-px shrink-0"><Icon icon="recycle" :size="12"/></span>
          <span>
            Imports <template v-for="(other, i) in module.inCycle" :key="other"><template v-if="i"> and </template><button
              type="button" class="underline underline-offset-2 hover:text-neutral-900"
              :title="other" @click="$emit('select', other)">{{ nameOf(other) }}</button></template>,
            which {{ module.inCycle.length === 1 ? 'imports' : 'import' }} this back. Neither can be moved alone.
          </span>
        </p>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <section v-if="module.declared.length > 1">
          <h3 class="flex items-baseline gap-2 px-4 pb-1 pt-3">
            <span class="ui-section-title">Declares</span>
            <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ module.declared.length }}</span>
          </h3>
          <p class="px-4 pb-2 text-xs leading-4 text-neutral-500">
            What lives inside this file. The ones nothing imports are its private working parts.
          </p>
          <ul>
            <li v-for="u in module.declared" :key="u.id"
                class="flex items-center gap-2 px-4" style="height:24px">
              <span class="ui-tag shrink-0">{{ u.kind }}</span>
              <span class="truncate font-mono text-xs text-neutral-800" :title="u.id">{{ u.name }}</span>
              <span class="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
                    :class="u.fanIn > 0 ? 'text-neutral-600' : 'text-neutral-500'"
                    :title="`${u.fanIn} references from outside this module`">{{ u.fanIn }}</span>
            </li>
          </ul>
        </section>

        <ModuleRelationList label="Imported by" :modules="usedBy" :lane-color="laneColor"
                            empty="Nothing imports this. It is an entry point, a test, config, or dead."
                            @select="$emit('select', $event)"/>
        <ModuleRelationList label="Imports" :modules="uses" :lane-color="laneColor"
                            empty="Depends on nothing inside this codebase."
                            @select="$emit('select', $event)"/>
      </div>
    </template>

    <div v-else class="flex h-full items-center justify-center px-6 text-center">
      <p class="max-w-[30ch] text-sm leading-5 text-neutral-500">
        Pick a module to see what imports it, what it imports, and what it declares.
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import OpenInEditor from "~/components/ui/OpenInEditor.vue"
import { computed } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import ModuleRelationList from "~/components/units/ModuleRelationList.vue"
import { laneDotClass, type LaneColor } from "~/utils/javaFrameworks"
import type { ModuleNode } from "~/utils/moduleGraph"
import type { Reach } from "~/utils/graph"

const props = defineProps<{
  module: ModuleNode | null
  uses: ModuleNode[]
  usedBy: ModuleNode[]
  reach: Reach | null
  trayPaths: string[]
  laneColor: (lane: string) => LaneColor
  laneLabel: (lane: string) => string
}>()
defineEmits<{ (e: "select", path: string): void; (e: "toggleTray", path: string): void }>()

const inTray = computed(() => !!props.module && props.trayPaths.includes(props.module.path))

function nameOf(path: string) {
  const base = path.split("/").pop() ?? path
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(0, dot) : base
}
</script>
