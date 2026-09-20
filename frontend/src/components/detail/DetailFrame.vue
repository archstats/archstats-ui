<template>
  <div class="flex h-full min-h-0 w-full flex-col bg-surface">
    <!-- Toolbar: back, breadcrumb, kind, key stats; actions on the right. -->
    <header class="ui-toolbar drag-region gap-3">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet -ml-1" aria-label="Back" title="Back" @click="back">
        <Icon icon="arrow-left" :size="14"/>
      </button>
      <nav class="flex min-w-0 items-center gap-1.5 text-base" aria-label="Breadcrumb">
        <template v-for="(crumb, i) in crumbs" :key="i">
          <router-link v-if="crumb.to" :to="crumb.to" class="shrink-0 text-neutral-500 transition-colors hover:text-neutral-900">{{ crumb.label }}</router-link>
          <span v-else class="shrink-0 text-neutral-500">{{ crumb.label }}</span>
          <Icon icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
        </template>
        <h2 class="ui-toolbar-title min-w-0 truncate" :class="{ 'font-mono text-sm': mono }" :title="title">{{ title }}</h2>
      </nav>
      <span v-if="kind" class="ui-tag shrink-0">{{ kind }}</span>
      <span v-if="stats && stats.length" class="ui-toolbar-meta hidden items-center gap-1.5 lg:flex">
        <template v-for="(stat, i) in stats" :key="stat.label">
          <span v-if="i > 0" class="text-neutral-300">·</span>
          <span>{{ stat.label }} <span class="font-mono text-neutral-800">{{ stat.value }}</span></span>
        </template>
      </span>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="actions"></slot>
      </div>
    </header>

    <!-- Tab strip: the same rule as the inspector tabs, one row, no rail. -->
    <nav class="flex h-9 shrink-0 items-stretch gap-4 px-4 hairline-b" role="tablist">
      <router-link
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        role="tab"
        :aria-selected="isActive(tab)"
        class="-mb-px flex items-center gap-1.5 border-b-2 px-0.5 text-sm font-medium transition-colors"
        :class="isActive(tab) ? 'border-accent-500 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'"
      >
        <span>{{ tab.label }}</span>
        <span v-if="tab.count !== undefined" class="font-mono text-xs text-neutral-400">{{ tab.count }}</span>
      </router-link>
    </nav>

    <div class="relative flex min-h-0 grow flex-col overflow-hidden">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import Icon from "~/components/ui/common/Icon.vue";
import { useBack } from "~/composables/useBack";

export interface DetailTab { id: string; label: string; to: string; exact?: boolean; count?: number | string }
export interface DetailCrumb { label: string; to?: string }
export interface DetailStat { label: string; value: string | number }

const props = defineProps<{
  title: string
  crumbs: DetailCrumb[]
  tabs: DetailTab[]
  kind?: string
  stats?: DetailStat[]
  fallback: string
  mono?: boolean
}>()

const route = useRoute()
const back = useBack(props.fallback)

function norm(path: string): string {
  return path.replace(/\/+$/, "")
}

function isActive(tab: DetailTab): boolean {
  const current = norm(route.path)
  const target = norm(tab.to)
  if (tab.exact) return current === target
  return current === target || current.startsWith(`${target}/`)
}
</script>
