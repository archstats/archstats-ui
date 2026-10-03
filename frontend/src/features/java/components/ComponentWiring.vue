<template>
  <!-- How the component's own classes are wired to each other, and which of
       those wires break a layering rule. Java only; silent everywhere else. -->
  <div v-if="hasJava && (flags.length > 0 || wiring.nodes.length > 0)" class="flex flex-col gap-5">
    <section v-if="wiring.nodes.length > 0">
      <ExhibitFrame :title="t('java.componentWiring.wiring')">
        <template #controls>
          <span v-if="crowded" class="text-xs text-neutral-400">{{ t('java.componentWiring.busiestClassesNamedHover') }}</span>
        </template>
        <template #aside>
          <label class="flex items-center gap-1.5 text-sm text-neutral-700">
            <input v-model="includeExternal" type="checkbox" class="ui-check"/>
            {{ t('java.componentWiring.includeExternalWiring') }}
          </label>
        </template>
        <!-- The graph takes the full column; what a selected node touches reads
             underneath it, where there is room for two lists side by side. -->
        <!-- A force graph with no edges is a constellation, not a reading. -->
        <EmptyState
          v-if="wiring.edges.length === 0"
          class="rounded-lg py-10 hairline"
          :title="t('java.componentWiring.noImportsBetweenThese')"
          :text="includeExternal
            ? t('java.componentWiring.snapshotRecordsNoImport', { nodesLength: wiring.nodes.length })
            : t('java.componentWiring.snapshotRecordsNoImport2')"
          icon="waypoints"
        />
        <div v-else class="overflow-hidden rounded-lg hairline">
          <ComponentWiringGraph class="w-full" :nodes="wiring.nodes" :edges="wiring.edges" :selected="selected" @select="selected = $event"/>
          <div class="bg-ground hairline-t">
            <EmptyState v-if="!selectedNode" class="py-6" :title="t('java.componentWiring.noBeanSelected')" :text="t('java.componentWiring.clickNodeSeeWhat')" icon="focus"/>
            <template v-else>
              <div class="flex items-center gap-2 px-4 py-3 hairline-b">
                <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" :class="roleDotClass(selectedNode.role)"></span>
                <router-link :to="`/views/files/${selectedNode.file}`" class="min-w-0 truncate font-mono text-sm font-medium text-neutral-900 hover:underline" :title="selectedNode.file">{{ selectedNode.label }}</router-link>
                <span class="ui-tag shrink-0">{{ roleName(selectedNode.role) }}</span>
              </div>
              <div class="grid gap-x-8 gap-y-4 px-4 py-4 sm:grid-cols-2">
                <div v-for="side in sides" :key="side.key" class="min-w-0">
                  <h4 class="ui-label">{{ side.title }} <span class="font-mono normal-case tracking-normal text-neutral-400">{{ side.nodes.length }}</span></h4>
                  <p v-if="side.nodes.length === 0" class="mt-2 text-sm text-neutral-500">{{ side.empty }}</p>
                  <ul v-else class="mt-2 flex max-h-[168px] flex-col gap-1 overflow-y-auto">
                    <li v-for="n in side.nodes" :key="n.id" class="flex min-w-0 items-center gap-2">
                      <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" :class="roleDotClass(n.role)"></span>
                      <router-link :to="`/views/files/${n.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="n.file">{{ n.label }}</router-link>
                      <span v-if="n.external" class="ui-tag ml-auto shrink-0" :title="n.component">{{ store.getComponentName(n.component) || n.component }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </template>
          </div>
        </div>
      </ExhibitFrame>
    </section>
    <!-- The rules the wiring breaks: one finding per rule, its classes worst
         first, so the singleton with 64 fields is not one row among sixteen. -->
    <section v-if="flagGroups.length > 0" class="flex flex-col gap-4">
      <div class="flex items-baseline gap-2">
        <h3 class="ui-section-title">{{ t('java.componentWiring.structuralFlags') }}</h3>
        <span class="font-mono text-xs text-neutral-400">{{ formatNumber(flags.length) }}</span>
      </div>
      <div v-for="group in flagGroups" :key="group.rule" class="overflow-hidden rounded-lg hairline">
        <div class="flex items-baseline gap-2 px-4 py-2.5 hairline-b">
          <span class="text-sm font-medium text-neutral-900">{{ group.rule }}</span>
          <span class="ui-tag">{{ formatNumber(group.flags.length) }}</span>
        </div>
        <ul class="grid grid-cols-1 xl:grid-cols-2">
          <li v-for="flag in group.shown" :key="flag.key" class="flag-row">
            <router-link :to="`/views/files/${flag.from.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-900 hover:underline" :title="flag.from.file">{{ flag.from.label }}</router-link>
            <template v-if="flag.to">
              <Icon icon="arrow-right" :size="12" class="shrink-0 text-neutral-400"/>
              <router-link :to="`/views/files/${flag.to.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="flag.to.file">{{ flag.to.label }}</router-link>
            </template>
            <span class="ml-auto shrink-0 pl-3 text-sm text-neutral-500">{{ flag.detail }}</span>
          </li>
        </ul>
        <div v-if="group.flags.length > group.shown.length" class="px-4 py-2 hairline-t">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="expanded.add(group.rule)">{{ t('java.componentWiring.showAll', { count: group.flags.length, total: formatNumber(group.flags.length) }) }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, reactive, watch } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useComponentJava } from "~/features/java/useComponentJava"
import { roleDotClass, roleName } from "~/features/java/java"
import { formatNumber } from "~/shared/format"
import ComponentWiringGraph from "./ComponentWiringGraph.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

const props = defineProps<{ name: string }>()

const store = useDataStore()
const name = computed(() => props.name)
const { hasJava, flags, wiring, includeExternal, selected, selectedNode, selectedOut, selectedIn } = useComponentJava(name)

const crowded = computed(() => wiring.value.nodes.length > 24)

// One finding per rule, its classes worst first; long ones open on request.
const FIRST = 8
const expanded = reactive(new Set<string>())
watch(name, () => expanded.clear())
const flagGroups = computed(() => {
  const byRule = new Map<string, typeof flags.value>()
  for (const f of flags.value) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f])
  return [...byRule.entries()]
    .map(([rule, list]) => {
      const sorted = [...list].sort((a, b) => b.weight - a.weight || a.from.label.localeCompare(b.from.label))
      return { rule, flags: sorted, shown: expanded.has(rule) ? sorted : sorted.slice(0, FIRST) }
    })
    .sort((a, b) => b.flags.length - a.flags.length)
})

const sides = computed(() => [
  { key: "out", title: t("java.componentWiring.imports"), nodes: selectedOut.value, empty: t("java.componentWiring.importsNothingGraph") },
  { key: "in", title: t("java.componentWiring.imported"), nodes: selectedIn.value, empty: t("java.componentWiring.nothingGraphImports") },
])

</script>

<style scoped>
.flag-row { display: flex; min-width: 0; align-items: center; gap: 0.5rem; height: 2rem; padding: 0 1rem; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-100)); }
.flag-row:hover { background: rgb(var(--c-neutral-50)); }
</style>
