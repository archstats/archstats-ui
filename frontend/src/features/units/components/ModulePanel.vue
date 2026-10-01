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
                  :title="inTray ? t('units.modulePanel.removeGroupTray') : t('units.modulePanel.collectGroupTray')"
                  @click="$emit('toggleTray', module.path)">
            <Icon :icon="inTray ? 'check' : 'plus'" :size="12"/>
            <span>{{ inTray ? t('units.modulePanel.collected') : t('units.modulePanel.collect') }}</span>
          </button>
        </div>

        <div class="mt-1 flex items-center gap-1">
          <router-link :to="`/views/files/${module.path}`" class="block min-w-0 truncate font-mono text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline" :title="module.path">{{ module.path }}</router-link>
          <OpenInEditor :file="module.path" class="-my-1"/>
        </div>

        <dl class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div><dt class="ui-label">{{ t('units.modulePanel.lane') }}</dt><dd class="text-xs text-neutral-700">{{ laneLabel(module.lane) }}</dd></div>
          <div v-if="module.component"><dt class="ui-label">{{ t('units.modulePanel.component') }}</dt><dd class="truncate text-xs text-neutral-700">{{ module.component }}</dd></div>
          <div v-if="module.declared.length > 1"><dt class="ui-label">{{ t('units.modulePanel.holds') }}</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ module.declared.length }}</dd></div>
          <div><dt class="ui-label">{{ t('units.modulePanel.imported') }}</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ usedBy.length }}</dd></div>
          <div><dt class="ui-label">{{ t('units.modulePanel.imports') }}</dt><dd class="font-mono text-xs tabular-nums text-neutral-700">{{ uses.length }}</dd></div>
        </dl>

        <!-- The question an architect actually arrives with. One hop is what
             this module touches; the reach is what a change to it can break,
             and in any real codebase those differ by an order of magnitude. -->
        <p v-if="reach && reach.count > 0" class="mt-2.5 text-sm leading-4 text-neutral-600">
<I18nT k="units.modulePanel.changingCanReachUp"><template #reachCount><span class="font-mono tabular-nums text-neutral-900">{{ reach.count.toLocaleString(intlLocale) }}</span></template><template #value>{{t('common.noun.module', { count: reach.count })}}</template><template #hops>{{ reach.hops }}</template><template #value2>{{t('common.noun.hop', { count: reach.hops })}}</template></I18nT> </p>
        <p v-else-if="reach" class="mt-2.5 text-sm leading-4 text-neutral-600">
          {{ t('units.modulePanel.nothingDependsDirectlyAny') }}
        </p>

        <p v-if="module.inCycle.length" class="mt-2 flex items-start gap-1.5 text-sm leading-4 text-red-500">
          <span class="mt-px shrink-0"><Icon icon="recycle" :size="12"/></span>
          <span>
            {{ t('units.modulePanel.imports') }} <template v-for="(other, i) in module.inCycle" :key="other"><template v-if="i">{{ ' ' + t('units.modulePanel.and') }} </template><button
              type="button" class="underline underline-offset-2 hover:text-neutral-900"
              :title="other" @click="$emit('select', other)">{{ nameOf(other) }}</button></template>{{ t('units.modulePanel.whichBackNeitherCan', { import: t('common.noun.imports', { count: module.inCycle.length }) }) }}
          </span>
        </p>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <section v-if="module.declared.length > 1">
          <h3 class="flex items-baseline gap-2 px-4 pb-1 pt-3">
            <span class="ui-section-title">{{ t('units.modulePanel.declares') }}</span>
            <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ module.declared.length }}</span>
          </h3>
          <p class="px-4 pb-2 text-xs leading-4 text-neutral-500">
            {{ t('units.modulePanel.whatLivesInsideFile') }}
          </p>
          <ul>
            <li v-for="u in module.declared" :key="u.id"
                class="flex items-center gap-2 px-4" style="height:24px">
              <span class="ui-tag shrink-0">{{ u.kind }}</span>
              <span class="truncate font-mono text-xs text-neutral-800" :title="u.id">{{ u.name }}</span>
              <span class="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
                    :class="u.fanIn > 0 ? 'text-neutral-600' : 'text-neutral-500'"
                    :title="t('units.modulePanel.referencesOutsideModule', { fanIn: u.fanIn })">{{ u.fanIn }}</span>
            </li>
          </ul>
        </section>

        <ModuleRelationList :label="t('units.modulePanel.imported')" :modules="usedBy" :lane-color="laneColor"
                            :empty="t('units.modulePanel.nothingImportsEntryPoint')"
                            @select="$emit('select', $event)"/>
        <ModuleRelationList :label="t('units.modulePanel.imports')" :modules="uses" :lane-color="laneColor"
                            :empty="t('units.modulePanel.dependsNothingInsideCodebase')"
                            @select="$emit('select', $event)"/>
      </div>
    </template>

    <div v-else class="flex h-full items-center justify-center px-6 text-center">
      <p class="max-w-[30ch] text-sm leading-5 text-neutral-500">
        {{ t('units.modulePanel.pickModuleSeeWhat') }}
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { computed } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import ModuleRelationList from "./ModuleRelationList.vue"
import { laneDotClass, type LaneColor } from "~/features/frameworks/frameworkProfiles"
import type { ModuleNode } from "~/features/units/moduleGraph"
import type { Reach } from "~/features/units/graph"
import { t, intlLocale } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

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
