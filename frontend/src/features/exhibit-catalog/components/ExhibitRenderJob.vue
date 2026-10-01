<template>
  <!-- One exhibit drawn for export, at full density, its figure caught in a scope of its own. -->
  <div :style="{ ...(def?.figure?.fill ? { height: `${height}px` } : {}), ...(def?.figure?.exportWidth ? { width: `${def.figure.exportWidth}px` } : {}) }">
    <component :is="figure" v-if="figure" v-bind="props_"/>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide } from "vue"
import { EXPORT_SCOPE, type FigureExportable } from "~/features/export/useExportables"
import { defOf } from "~/features/exhibits/engine"
import type { RenderJob } from "../render"

const props = defineProps<{ job: RenderJob }>()

const def = defOf(props.job.spec.kind)
const opts = { density: "full" as const, highlight: props.job.highlight, title: def?.title(props.job.spec.params, props.job.data) ?? "" }
const figure = def?.figure ? defineAsyncComponent(def.figure.load) : null
const props_ = computed(() => (def?.figure ? def.figure.props(props.job.data, props.job.spec.params, opts) : {}))
const height = computed(() => (def?.figure ? def.figure.height(props.job.data, opts) : 400))

let handed = false
provide(EXPORT_SCOPE, {
  add(item) {
    if (item.kind === "figure" && !handed) { handed = true; props.job.done(item as FigureExportable) }
    return () => {}
  },
})
// A component that never registers a figure (a plain table) hands back nothing.
onMounted(() => setTimeout(() => { if (!handed) { handed = true; props.job.done(null) } }, 3000))
</script>
