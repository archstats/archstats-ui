<template>
  <!-- What a pipeline does, as stations on one line: the seven stages in the
       order a delivery runs, the ones it does as filled stations joined by a
       rail from its first to its last, the rest as small ticks. Every track
       shares the columns, so tracks stacked in a list compare by column. The
       station width comes from --stage-w, set by the list that holds them. -->
  <span class="relative grid shrink-0 items-center" :style="{ gridTemplateColumns: `repeat(${STAGES.length}, var(--stage-w, 52px))` }" role="img" :aria-label="aria">
    <span
      v-if="span"
      class="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
      :class="muted ? 'bg-neutral-300' : 'bg-neutral-400'"
      :style="{ left: `calc(var(--stage-w, 52px) * ${span[0] + 0.5})`, width: `calc(var(--stage-w, 52px) * ${span[1] - span[0]})` }"
    />
    <span v-for="s in STAGES" :key="s" class="relative flex h-5 items-center justify-center" :title="`${STAGE_LABEL[s]}: ${on.has(s) ? 'yes' : t('deployables.stageTrack.notSeen')}`">
      <span v-if="on.has(s)" class="h-2.5 w-2.5 rounded-full ring-2 ring-surface" :class="muted ? 'bg-neutral-400' : 'bg-neutral-800'"/>
      <span v-else class="h-1 w-1 rounded-full bg-neutral-300"/>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { STAGE_LABEL, STAGES, list } from "../deployables"
import { t } from "~/shared/i18n"

const props = withDefaults(defineProps<{ stages: string | ReadonlySet<string>; muted?: boolean }>(), { muted: false })

const on = computed(() => (typeof props.stages === "string" ? new Set(list(props.stages)) : new Set(props.stages)))
const idx = computed(() => STAGES.map((s, i) => (on.value.has(s) ? i : -1)).filter(i => i >= 0))
const span = computed<[number, number] | null>(() => (idx.value.length > 1 ? [idx.value[0], idx.value[idx.value.length - 1]] : null))
const aria = computed(() => t("deployables.stageTrack.stages", { value: STAGES.filter(s => on.value.has(s)).map(s => STAGE_LABEL[s]).join(", ") || t("deployables.stageTrack.noneRecognised") }))
</script>
