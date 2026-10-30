<template>
  <!-- A CI system's mark: two letters in a square, so the list reads without logos. -->
  <span class="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] font-mono text-[8.5px] font-semibold leading-none ring-1" :class="tone" :title="t(`cicd.systems.${known ? system : 'other'}`)">{{ letters }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { t } from "~/shared/i18n"

const props = defineProps<{ system: string }>()
const MARKS: Record<string, [string, string]> = {
  github_actions: ["GH", "bg-neutral-100 text-neutral-800 ring-neutral-300"],
  gitlab: ["GL", "bg-amber-50 text-amber-800 ring-amber-200"],
  jenkins: ["JK", "bg-red-50 text-red-800 ring-red-200"],
  rancher_fleet: ["FL", "bg-blue-50 text-blue-800 ring-blue-200"],
  rancher_pipelines: ["RP", "bg-blue-50 text-blue-800 ring-blue-200"],
  azure_pipelines: ["AZ", "bg-blue-50 text-blue-800 ring-blue-200"],
  bitbucket: ["BB", "bg-blue-50 text-blue-800 ring-blue-200"],
  circleci: ["CI", "bg-neutral-100 text-neutral-800 ring-neutral-300"],
}
const known = computed(() => props.system in MARKS || ["cloud_build", "travis", "drone", "tekton", "buildkite", "woodpecker"].includes(props.system))
const letters = computed(() => MARKS[props.system]?.[0] ?? props.system.slice(0, 2).toUpperCase())
const tone = computed(() => MARKS[props.system]?.[1] ?? "bg-neutral-50 text-neutral-500 ring-neutral-200")
</script>
