<template>
  <!-- Reports, then the open report's outline: where you are in the file browser and in the file. -->
  <aside class="flex w-[232px] shrink-0 flex-col bg-ground hairline-r" aria-label="Reports">
    <div class="flex h-9 shrink-0 items-center gap-2 pl-3 pr-1.5">
      <h2 class="ui-label flex-1">Reports</h2>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="New report" title="New report" @click="$emit('create')"><Icon icon="plus" :size="13"/></button>
    </div>
    <ul class="shrink-0 px-1.5 pb-2" :class="reports.length > 8 ? 'max-h-[40%] overflow-y-auto' : ''">
      <li v-for="r in reports" :key="r.id" class="group/r relative" draggable="true" @dragstart="dragFrom = r.id" @dragover.prevent @drop.prevent="drop(r.id)">
        <form v-if="renaming === r.id" class="px-1 py-0.5" @submit.prevent="finishRename(r.id)">
          <input ref="renameEl" v-model="draft" class="ui-input ui-input-sm w-full" aria-label="Report name" @blur="finishRename(r.id)" @keydown.esc.prevent="renaming = null">
        </form>
        <button
          v-else
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
          :class="r.id === currentId ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
          :aria-current="r.id === currentId ? 'page' : undefined"
          @click="$emit('open', r.id)"
          @dblclick="startRename(r)"
        >
          <Icon icon="file-text" :size="13" class="shrink-0" :class="r.id === currentId ? 'text-accent-600' : 'text-neutral-400'"/>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] text-neutral-900">{{ r.title || "Untitled report" }}</span>
            <span class="block truncate font-mono text-[10.5px] leading-4 text-neutral-500">{{ meta(r) }}</span>
          </span>
        </button>
        <button
          v-if="renaming !== r.id"
          type="button"
          class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-1 top-1.5 h-6 w-6 opacity-0 focus-visible:opacity-100 group-hover/r:opacity-100"
          :class="{ '!opacity-100': menu === r.id }"
          :aria-label="`More for ${r.title}`"
          @click.stop="menu = menu === r.id ? null : r.id"
        ><Icon icon="more-horizontal" :size="13"/></button>
        <template v-if="menu === r.id">
          <div class="fixed inset-0 z-40" @click="menu = null"></div>
          <div class="ui-menu absolute right-0 top-8 z-50 w-44 animate-in" role="menu">
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; startRename(r)">Rename</button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; $emit('duplicate', r.id)">Duplicate</button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; $emit('saveTemplate', r.id)">Save as template…</button>
            <div class="my-1 hairline-t"></div>
            <button type="button" class="ui-menu-item text-red-700" role="menuitem" @click="menu = null; confirming = r.id">Delete…</button>
          </div>
        </template>
        <div v-if="confirming === r.id" class="mx-1 mb-1 rounded bg-neutral-100 px-2 py-1.5">
          <p class="text-xs leading-4 text-neutral-800">Delete this report? The pins stay in the pool.</p>
          <div class="mt-1.5 flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirming = null; $emit('remove', r.id)">Delete</button>
            <button type="button" class="ui-btn ui-btn-sm" @click="confirming = null">Keep</button>
          </div>
        </div>
      </li>
      <li v-if="!reports.length" class="px-2 py-2 text-xs leading-5 text-neutral-500">No reports yet. Start one from a template or a blank page.</li>
    </ul>

    <div class="flex min-h-0 flex-1 flex-col hairline-t">
      <h2 class="ui-label px-3 pb-1 pt-3">Outline</h2>
      <ol class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <li v-for="o in outline" :key="o.id">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left transition-colors hover:bg-neutral-200/60"
            :class="o.id === selectedId ? 'text-neutral-950' : 'text-neutral-600'"
            :style="{ paddingLeft: `${8 + o.indent * 12}px` }"
            @click="$emit('jump', o.id)"
          >
            <Icon v-if="o.icon" :icon="o.icon" :size="12" class="shrink-0 text-neutral-400"/>
            <span class="truncate" :class="o.heading ? 'text-[12.5px] font-medium' : 'text-[12px]'">{{ o.label }}</span>
            <span v-if="o.stale" class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" title="Ran on an older snapshot"></span>
          </button>
        </li>
        <li v-if="!outline.length" class="px-2 py-1 text-xs text-neutral-500">Headings and evidence appear here.</li>
      </ol>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import type { ReportRecord } from "~/stores/reports";
import { relativeAge } from "~/utils/time";

export interface OutlineItem { id: string; label: string; indent: number; heading: boolean; icon?: string; stale?: boolean }

const props = defineProps<{
  reports: ReportRecord[]
  currentId: string | null
  outline: OutlineItem[]
  selectedId: string | null
  counts: Record<string, number>
}>();
const emit = defineEmits<{
  (e: "open", id: string): void
  (e: "create"): void
  (e: "rename", id: string, title: string): void
  (e: "duplicate", id: string): void
  (e: "saveTemplate", id: string): void
  (e: "remove", id: string): void
  (e: "reorder", ids: string[]): void
  (e: "jump", id: string): void
}>();

const menu = ref<string | null>(null);
const confirming = ref<string | null>(null);
const renaming = ref<string | null>(null);
const draft = ref("");
const renameEl = ref<HTMLInputElement[] | null>(null);
const dragFrom = ref<string | null>(null);

const meta = (r: ReportRecord) => {
  const n = props.counts[r.id] ?? 0;
  return `${n} ${n === 1 ? "cell" : "cells"} · ${relativeAge(r.updatedAt, new Date())}`;
};
function startRename(r: ReportRecord) {
  renaming.value = r.id;
  draft.value = r.title;
  void nextTick(() => { const el = renameEl.value?.[0]; el?.focus(); el?.select(); });
}
function finishRename(id: string) {
  if (renaming.value !== id) return;
  renaming.value = null;
  emit("rename", id, draft.value);
}
function drop(target: string) {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (!from || from === target) return;
  const ids = props.reports.map(r => r.id).filter(id => id !== from);
  ids.splice(ids.indexOf(target), 0, from);
  emit("reorder", ids);
}
</script>
