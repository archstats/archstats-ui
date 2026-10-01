<template>
  <!-- How the component's own classes are wired to each other, and which of
       those wires break a layering rule. Java only; silent everywhere else. -->
  <div v-if="hasJava && (flags.length > 0 || wiring.nodes.length > 0)" class="flex flex-col gap-5">
    <section v-if="flags.length > 0">
      <div class="flex items-center gap-2">
        <h3 class="ui-section-title">{{ t('java.componentWiring.structuralFlags') }}</h3>
        <span class="font-mono text-xs text-neutral-400">{{ formatNumber(flags.length) }}</span>
      </div>
      <div class="mt-2 overflow-hidden rounded-lg hairline">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="w-[200px]">{{ t('java.componentWiring.rule') }}</th>
              <th>{{ t('java.componentWiring.from') }}</th>
              <th>{{ t('java.componentWiring.to') }}</th>
              <th>{{ t('java.componentWiring.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="flag in flags" :key="flag.key">
              <td class="text-neutral-800">{{ flag.rule }}</td>
              <td class="max-w-0">
                <router-link :to="`/views/files/${flag.from.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="flag.from.file">{{ flag.from.label }}</router-link>
              </td>
              <td class="max-w-0">
                <router-link v-if="flag.to" :to="`/views/files/${flag.to.file}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="flag.to.file">{{ flag.to.label }}</router-link>
                <span v-else class="text-neutral-400">—</span>
              </td>
              <td class="max-w-0 truncate text-neutral-600" :title="flag.detail">{{ flag.detail }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useComponentJava } from "~/features/java/useComponentJava"
import { roleDotClass, roleName } from "~/features/java/java"
import { formatNumber } from "~/shared/format"
import ComponentWiringGraph from "./ComponentWiringGraph.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import { t } from "~/shared/i18n"

const props = defineProps<{ name: string }>()

const store = useDataStore()
const name = computed(() => props.name)
const { hasJava, flags, wiring, includeExternal, selected, selectedNode, selectedOut, selectedIn } = useComponentJava(name)

const crowded = computed(() => wiring.value.nodes.length > 24)

const sides = computed(() => [
  { key: "out", title: t("java.componentWiring.imports"), nodes: selectedOut.value, empty: t("java.componentWiring.importsNothingGraph") },
  { key: "in", title: t("java.componentWiring.imported"), nodes: selectedIn.value, empty: t("java.componentWiring.nothingGraphImports") },
])

</script>
