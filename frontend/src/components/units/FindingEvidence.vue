<template>
  <!-- One finding, opened.
       The claim, then how the files behind it relate -- which is Connections'
       question, answered inline over just these files rather than by sending
       the reader away -- then where the declarations actually are. -->
  <div v-if="finding" class="flex h-full min-w-0 flex-col">
    <header class="shrink-0 px-6 pb-3 pt-5">
      <h2 class="flex items-start gap-2 text-lg leading-6 text-neutral-900">
        <span v-if="finding.tone === 'warn'" class="mt-1 shrink-0 text-red-500" aria-hidden="true">
          <Icon icon="alert" :size="15"/>
        </span>
        <span class="min-w-0 max-w-[62ch]">{{ finding.headline }}</span>
      </h2>
      <p class="mt-1 max-w-[70ch] text-base leading-5 text-neutral-600">{{ finding.detail }}</p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class="ui-btn ui-btn-sm" @click="$emit('openInConnections')">
          <Icon icon="waypoints" :size="13"/>
          <span>See these in Connections</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" @click="$emit('makeGroup')">
          <Icon icon="layers" :size="13"/>
          <span>Collect the {{ finding.files.length }} files</span>
        </button>
      </div>

      <!-- Connections scopes by component, so the finding's files arrive
           among their neighbours. Saying the real number beats promising
           one and delivering another. -->
      <p v-if="handoff" class="mt-1.5 text-sm leading-4 text-neutral-500">
        Connections scopes by component, so this opens the
        {{ handoff.components.toLocaleString() }}
        {{ handoff.components === 1 ? 'component' : 'components' }} holding them —
        {{ handoff.files.toLocaleString() }} files, with these
        {{ finding.files.length }} among them.
      </p>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <section v-if="graph.nodes.length > 1">
        <h3 class="ui-section-title">How these files relate</h3>
        <p class="mb-2 mt-1 max-w-[70ch] text-sm leading-5 text-neutral-500">
          <template v-if="graph.connected">
            A filled cell means the file on that row imports the one in that column.
            <template v-if="graph.omitted > 0">
              The {{ graph.nodes.length }} most connected of {{ finding.files.length }} are drawn.
            </template>
          </template>
          <template v-else>
            None of these {{ finding.files.length }} files imports another. Whatever they have in
            common, it is not a dependency — so this is repetition rather than a shared idea.
          </template>
        </p>
        <div v-if="graph.connected" class="h-[320px] overflow-hidden rounded hairline">
          <ConnectionsMatrix
            :nodes="graph.nodes" :edges="graph.edges" :directed="true"
            :selected-id="null" :selected-pair="null" :multi="NONE" :hovered="null"
            @activate="(id) => $emit('openFile', id)"/>
        </div>
      </section>

      <section class="mt-6">
        <h3 class="flex items-baseline gap-2">
          <span class="ui-section-title">{{ rowsTitle }}</span>
          <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ finding.rows.length }}</span>
        </h3>
        <ul class="mt-1 divide-y divide-neutral-200">
          <li v-for="(row, i) in finding.rows" :key="i">
            <button type="button"
                    class="flex w-full items-center gap-3 py-1.5 text-left hover:text-neutral-900"
                    @click="row.file && $emit('openFile', row.file)">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800">{{ row.label }}</span>
              <span class="min-w-0 flex-[2] truncate font-mono text-[11px] text-neutral-500"
                    :title="row.sub">{{ row.sub }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>

  <div v-else class="flex h-full items-center justify-center px-6 text-center">
    <p class="max-w-[34ch] text-sm leading-5 text-neutral-500">
      Pick a finding to see what it was read off, how the files behind it relate, and where to go next.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import ConnectionsMatrix from "~/components/connections/ConnectionsMatrix.vue"
import type { UnitFinding } from "~/utils/unitFindings"
import type { FindingGraph } from "~/utils/findingGraph"

const props = defineProps<{
  finding: UnitFinding | null
  graph: FindingGraph
  handoff: { components: number; files: number } | null
}>()
defineEmits<{
  (e: "openInConnections"): void
  (e: "makeGroup"): void
  (e: "openFile", path: string): void
}>()

const NONE = new Set<string>()

const rowsTitle = computed(() => ({
  repeated: "Every place it is declared",
  crowded: "What the file declares",
  overgrown: "Its members",
  loadBearing: "What depends on it",
  entangled: "The two declarations",
  unreachable: "What nothing imports",
}[props.finding?.kind ?? "repeated"] ?? "Evidence"))
</script>
