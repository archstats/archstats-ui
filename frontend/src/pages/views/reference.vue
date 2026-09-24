<template>
  <ViewWorkspaceLayout
    :queryable="false"
    title="Metric reference"
    v-model:search-query="search"
    :search-placeholder="`Search ${entries.length} metrics`"
  >
    <template #stats>
      <span v-if="entries.length">Metrics <span class="text-neutral-800">{{ filtered.length === entries.length ? entries.length : `${filtered.length} of ${entries.length}` }}</span></span>
    </template>

    <template #visualizer>
      <EmptyState v-if="!data.hasData" title="Definitions come from a snapshot" text="Open a scan: the reference shows the definitions that scan was written with, so they match its numbers." icon="file-text"/>
      <div v-else class="flex min-h-0 grow">
        <!-- Every metric, grouped by family. -->
        <nav class="flex w-[300px] shrink-0 flex-col overflow-y-auto bg-ground py-2 hairline-r" aria-label="Metrics">
          <p v-if="filtered.length === 0" class="px-4 py-3 text-sm text-neutral-500">No metric matches “{{ search }}”.</p>
          <section v-for="group in groups" :key="group.category" class="pb-2">
            <h3 class="ui-section-title px-4 pb-1 pt-2">{{ group.category }}</h3>
            <ul>
              <li v-for="e in group.entries" :key="e.id">
                <button
                  :ref="el => { if (e.id === selectedId) selectedEl = el as HTMLElement }"
                  type="button"
                  class="flex h-7 w-full items-center gap-2 px-4 text-left text-base transition-colors hover:bg-neutral-100"
                  :class="e.id === selectedId ? 'bg-accent-50 text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'text-neutral-700'"
                  :aria-current="e.id === selectedId ? 'true' : undefined"
                  @click="select(e.id)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
                  <span v-if="e.derived" class="shrink-0 text-xs text-neutral-400" title="Computed by the app">app</span>
                </button>
              </li>
            </ul>
          </section>
        </nav>

        <!-- The chosen definition. -->
        <article v-if="selected" class="min-w-0 grow overflow-y-auto">
          <div class="mx-auto flex max-w-[720px] flex-col gap-4 px-8 py-8">
            <div class="flex flex-col gap-1">
              <p class="ui-label">{{ selected.category }}</p>
              <h1 class="text-2xl font-semibold leading-8 text-neutral-900">{{ selected.name }}</h1>
              <p class="break-all font-mono text-sm text-neutral-500">{{ selected.id }}</p>
            </div>
            <p v-if="selected.derived" class="text-sm text-neutral-600"><span class="ui-tag">Computed by the app</span> from this snapshot's tables; not stored by the scan.</p>
            <p class="text-lg leading-7 text-neutral-900">{{ selected.short || "No short description." }}</p>
            <p v-if="selected.long && selected.long !== selected.short" class="whitespace-pre-line text-base leading-6 text-neutral-700">{{ selected.long }}</p>
            <section v-if="selected.derived" class="flex flex-col gap-2">
              <h2 class="ui-section-title">How to reproduce it</h2>
              <pre v-if="selected.derived.sql" class="overflow-x-auto rounded-md bg-neutral-50 p-3 font-mono text-sm leading-5 text-neutral-800 hairline">{{ selected.derived.sql }}</pre>
              <p v-else class="text-base text-neutral-700">{{ selected.derived.method }}</p>
            </section>
            <div class="flex items-center gap-2 pt-2">
              <button type="button" class="ui-btn ui-btn-sm" @click="copySelected">
                <Icon :icon="copied ? 'check' : 'copy'" :size="13" class="text-neutral-500"/><span>{{ copied ? "Copied" : "Copy definition" }}</span>
              </button>
              <router-link v-if="metricsLink" :to="metricsLink" class="ui-btn ui-btn-sm ui-btn-quiet">
                <span>See it in Metrics</span><Icon icon="arrow-up-right" :size="12" class="text-neutral-500"/>
              </router-link>
            </div>
          </div>
        </article>
        <EmptyState v-else class="grow" :title="notDefined ? 'Not defined in this snapshot' : 'Pick a metric'" :text="notDefined ? String(route.query.m) : 'Its definition shows here.'" icon="file-text"/>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { definitionMarkdown, glossaryMarkdown, referenceEntries, type ReferenceEntry } from "~/utils/definition";
import { copyText } from "~/utils/files";

// Every metric the open snapshot defines, plus the ones the app computes,
// grouped by family. Definitions come from the snapshot so they match its
// numbers; a newer build's wording never describes an older scan's figures.

const data = useDataStore();
const route = useRoute();
const router = useRouter();
const search = ref("");
const copied = ref(false);
let selectedEl: HTMLElement | null = null;

const entries = computed(() => (data.hasData ? referenceEntries(data.definitions.values()) : []));

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return entries.value;
  return entries.value.filter(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.short.toLowerCase().includes(q));
});

const groups = computed(() => {
  const map = new Map<string, ReferenceEntry[]>();
  for (const e of filtered.value) map.set(e.category, [...(map.get(e.category) ?? []), e]);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({ category, entries: list.sort((x, y) => x.name.localeCompare(y.name)) }));
});

const selectedId = computed(() => (typeof route.query.m === "string" ? route.query.m : groups.value[0]?.entries[0]?.id ?? ""));
const selected = computed(() => entries.value.find(e => e.id === selectedId.value) ?? null);
const notDefined = computed(() => typeof route.query.m === "string" && !!route.query.m && !selected.value);

function select(id: string) {
  void router.replace({ query: { ...route.query, m: id } });
}

// Arriving from a hint, the metric is scrolled into view in the list.
watch(() => route.query.m, () => nextTick(() => selectedEl?.scrollIntoView({ block: "nearest" })), { immediate: true });

const metricsLink = computed(() => {
  const id = selected.value?.id;
  if (!id || selected.value?.derived) return null;
  if (data.hasColumn("components", id)) return { path: "/views/metrics", query: { grain: "components" } };
  if (data.hasColumn("files", id)) return { path: "/views/metrics", query: { grain: "files" } };
  return null;
});

async function copySelected() {
  if (!selected.value) return;
  try { await copyText(definitionMarkdown(selected.value)); copied.value = true; setTimeout(() => { copied.value = false; }, 1400); } catch { /* unchanged */ }
}

const { register } = useExportables();
register({
  kind: "document",
  title: "Metric reference",
  label: "Copy Markdown glossary",
  savable: true,
  markdown: () => `# Metric reference\n\n${glossaryMarkdown(filtered.value)}`,
  disabledReason: () => (filtered.value.length ? null : "No metrics to export."),
});
</script>
