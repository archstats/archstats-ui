<template>
  <!-- A Dockerfile as a ladder of stages: what each starts from, what it
       copies in, and which earlier stage it copies from. The last rung is
       the image that ships. -->
  <ol class="flex flex-col">
    <li v-for="(s, i) in stages" :key="s.index" class="relative flex gap-2.5 pb-3">
      <span class="relative flex w-3 shrink-0 justify-center">
        <span class="mt-1.5 h-2 w-2 rounded-full" :class="i === stages.length - 1 ? 'bg-accent-500' : 'bg-neutral-400'"></span>
        <span v-if="i < stages.length - 1" class="absolute bottom-0 top-4 w-px bg-neutral-300"></span>
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="flex min-w-0 items-baseline gap-1.5">
          <span class="text-xs text-neutral-500">FROM</span>
          <span class="min-w-0 truncate font-mono text-[12px]" :class="s.from_kind === 'stage' ? 'text-neutral-600' : 'text-neutral-900'" :title="s.from">{{ s.from }}</span>
          <span v-if="s.name" class="shrink-0 font-mono text-[11px] text-neutral-500">AS {{ s.name }}</span>
        </span>
        <span v-for="c in copiesOf(s)" :key="c" class="truncate font-mono text-[11px] text-neutral-600" :title="c">{{ c }}</span>
        <span v-if="i === stages.length - 1" class="text-[11px]" :class="user ? 'text-neutral-600' : 'text-amber-700'">{{ user ? t('cicd.inspector.user', { user }) : t('cicd.inspector.rootUser') }}</span>
        <EvidenceLine :file="s.file" :line="s.line"/>
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import EvidenceLine from "./EvidenceLine.vue"
import type { ArtifactContent, DockerStage } from "../cicd"
import { t } from "~/shared/i18n"

const props = defineProps<{ stages: DockerStage[]; contents: ArtifactContent[]; user: string }>()

/** What goes into a stage, from the artifact's contents read at that stage's lines. */
function copiesOf(s: DockerStage): string[] {
  const next = props.stages.find(x => x.index === s.index + 1)
  const end = next ? next.line : Number.POSITIVE_INFINITY
  return props.contents
    .filter(c => c.line > s.line && c.line < end)
    .map(c => (c.path === "." ? "." : c.path) + (c.pattern ? "/" + c.pattern : "") + (c.module ? `  (${c.module})` : ""))
}
</script>
