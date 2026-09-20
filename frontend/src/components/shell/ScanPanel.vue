<template>
  <section class="px-2" aria-label="Snapshots">
    <!-- Primary action. While a scan runs it becomes the progress readout. -->
    <button
        type="button"
        class="relative w-full overflow-hidden"
        :class="progress ? 'ui-btn cursor-default font-normal' : 'ui-btn ui-btn-primary'"
        :disabled="!active || !!progress"
        :aria-busy="!!progress"
        @click="store.startScan()"
    >
      <template v-if="progress">
        <Loader2 :size="13" class="animate-spin text-neutral-500" aria-hidden="true"/>
        <span class="text-neutral-800">{{ phaseLabel(progress.phase) }}</span>
        <span class="font-mono text-xs tabular-nums text-neutral-500">{{ elapsed }}</span>
        <span class="shell-progress absolute inset-x-0 bottom-0 h-0.5" aria-hidden="true"><span/></span>
      </template>
      <template v-else>
        <Play :size="12" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
        <span>{{ scans.length ? "Scan again" : "Scan" }}</span>
      </template>
    </button>

    <ul v-if="progress && progress.extensions.length" class="mt-1.5 flex flex-wrap gap-1" aria-label="Detected extensions">
      <li v-for="ext in progress.extensions" :key="ext" class="ui-tag">{{ ext }}</li>
    </ul>

    <p v-if="store.error" class="mt-2 flex items-start gap-1.5 text-sm leading-4 text-red-700" role="alert">
      <AlertTriangle :size="13" class="mt-0.5 shrink-0" aria-hidden="true"/>
      <span class="min-w-0 break-words">{{ store.error }}</span>
      <button type="button" class="ml-auto shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Dismiss" @click="store.clearError()">
        <X :size="13"/>
      </button>
    </p>

    <!-- History, newest first. -->
    <ol v-if="scans.length" class="mt-1.5" aria-label="Snapshot history">
      <li v-for="scan in visibleScans" :key="scan.id" class="group/scan">
        <div v-if="confirmingId === scan.id" class="rounded bg-neutral-100 px-2 py-1.5">
          <p class="text-sm leading-4 text-neutral-900">Delete this snapshot?</p>
          <div class="mt-1.5 flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirmDelete(scan.id)">Delete</button>
            <button type="button" class="ui-btn ui-btn-sm" @click="confirmingId = null">Keep</button>
          </div>
        </div>
        <div v-else class="flex items-stretch rounded transition-colors" :class="scan.id === openId ? 'bg-neutral-100' : 'hover:bg-neutral-100'">
          <button
              type="button"
              class="flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded px-2 text-left outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--c-accent-400))]"
              :class="scan.status === 'complete' ? '' : 'cursor-default'"
              :disabled="scan.status !== 'complete'"
              :aria-current="scan.id === openId ? 'true' : undefined"
              :aria-label="scanLabel(scan)"
              @click="onRowClick(scan)"
          >
            <span class="flex w-3 shrink-0 justify-center" aria-hidden="true">
              <span v-if="scan.id === openId" class="h-1.5 w-1.5 rounded-full bg-accent-500"/>
              <Loader2 v-else-if="scan.status === 'running'" :size="11" class="animate-spin text-neutral-500"/>
              <AlertTriangle v-else-if="scan.status === 'failed'" :size="11" class="text-red-600"/>
              <span v-else class="h-1.5 w-1.5 rounded-full bg-neutral-300"/>
            </span>
            <span class="min-w-0 flex-1 truncate text-sm leading-4" :class="rowTextClass(scan)">
              {{ formatScanTime(scan.startedAt, now) }}
            </span>
            <span class="shrink-0 text-xs leading-4 text-neutral-500" :class="scan.status === 'complete' ? 'font-mono tabular-nums' : ''">
              {{ scan.status === 'running' ? 'running' : scan.status === 'failed' ? 'failed' : relativeAge(scan.startedAt, now) }}
            </span>
          </button>
          <button
              v-if="scan.status !== 'running'"
              type="button"
              class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet my-0.5 mr-0.5 h-5 w-5 opacity-0 focus-visible:opacity-100 group-hover/scan:opacity-100 hover:text-red-600"
              :aria-label="`Delete snapshot from ${formatScanTime(scan.startedAt, now)}`"
              @click.stop="confirmingId = scan.id"
          >
            <Trash2 :size="12" :stroke-width="1.75"/>
          </button>
        </div>
        <p
            v-if="scan.status === 'failed' && expandedId === scan.id"
            class="mx-2 mb-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1.5 font-mono text-xs leading-4 text-red-800"
        >{{ scan.error }}</p>
      </li>
    </ol>
    <p v-else-if="active && !progress" class="mt-2 px-2 text-sm leading-4 text-neutral-500">
      No snapshots yet.
    </p>

    <button
        v-if="scans.length > COLLAPSED"
        type="button"
        class="mt-0.5 px-2 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
        @click="showAll = !showAll"
    >
      {{ showAll ? "Show fewer" : `Show all ${scans.length}` }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, Loader2, Play, Trash2, X } from "lucide-vue-next";
import type { store as models } from "wailsjs/go/models";
import { useWorkspacesStore, type ScanPhase } from "~/stores/workspaces";
import { formatElapsed, formatScanTime, relativeAge } from "~/utils/time";

const COLLAPSED = 3;
const store = useWorkspacesStore();

const active = computed(() => store.active);
const scans = computed(() => store.scans);
const progress = computed(() => store.activeProgress);
const openId = computed(() => store.openScanId);

const showAll = ref(false);
const visibleScans = computed(() => (showAll.value ? scans.value : scans.value.slice(0, COLLAPSED)));

const confirmingId = ref<string | null>(null);
const expandedId = ref<string | null>(null);

// The store's shared clock drives every age and the elapsed counter.
const now = computed(() => new Date(store.now));

const elapsed = computed(() => (progress.value ? formatElapsed(progress.value.startedAt, now.value) : ""));

const PHASES: Record<ScanPhase, string> = {
  starting: "Starting…",
  detecting: "Detecting languages…",
  analyzing: "Analyzing files…",
  rendering: "Rendering views…",
  saving: "Saving snapshot…",
};
function phaseLabel(phase: ScanPhase): string {
  return PHASES[phase] ?? "Scanning…";
}

function rowTextClass(scan: models.Scan): string {
  if (scan.id === openId.value) return "text-neutral-900 font-medium";
  if (scan.status === "failed") return "text-neutral-500";
  if (scan.status === "running") return "text-neutral-700";
  return "text-neutral-800";
}

function scanLabel(scan: models.Scan): string {
  const when = formatScanTime(scan.startedAt, now.value);
  if (scan.status === "failed") return `Failed scan from ${when}. Show error`;
  if (scan.status === "running") return `Scan running since ${when}`;
  return scan.id === openId.value ? `Snapshot from ${when}, open` : `Open snapshot from ${when}`;
}

async function onRowClick(scan: models.Scan) {
  if (scan.status === "failed") {
    expandedId.value = expandedId.value === scan.id ? null : scan.id;
    return;
  }
  if (scan.status !== "complete" || scan.id === openId.value) return;
  await store.openSnapshot(scan.id);
}

async function confirmDelete(id: string) {
  confirmingId.value = null;
  if (expandedId.value === id) expandedId.value = null;
  await store.removeScan(id);
}
</script>
