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

    <BackfillQueue/>

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
        <form v-else-if="renamingId === scan.id" class="flex items-center gap-1 px-1 py-0.5" @submit.prevent="saveLabel(scan.id)">
          <input
              ref="renameInput"
              v-model="labelDraft"
              class="ui-input ui-input-sm min-w-0 flex-1"
              placeholder="Label, e.g. before the split"
              aria-label="Snapshot label"
              @keydown.esc.prevent="renamingId = null"
              @blur="saveLabel(scan.id)"
          />
        </form>
        <div v-else class="relative flex items-stretch rounded transition-colors" :class="scan.id === openId ? 'bg-neutral-100' : 'hover:bg-neutral-100'">
          <button
              type="button"
              class="flex min-h-[26px] min-w-0 flex-1 items-center gap-2 rounded px-2 py-0.5 text-left outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--c-accent-400))]"
              :class="scan.status === 'complete' ? '' : 'cursor-default'"
              :disabled="scan.status !== 'complete'"
              :aria-current="scan.id === openId ? 'true' : undefined"
              :aria-label="scanLabel(scan)"
              :title="scan.status === 'complete' && scan.sizeBytes ? formatBytes(scan.sizeBytes) : undefined"
              @click="onRowClick(scan)"
          >
            <span class="flex w-3 shrink-0 justify-center" aria-hidden="true">
              <span v-if="scan.id === openId" class="h-1.5 w-1.5 rounded-full bg-accent-500"/>
              <Loader2 v-else-if="scan.status === 'running'" :size="11" class="animate-spin text-neutral-500"/>
              <AlertTriangle v-else-if="scan.status === 'failed'" :size="11" class="text-red-600"/>
              <span v-else class="h-1.5 w-1.5 rounded-full bg-neutral-300"/>
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="truncate text-sm leading-4" :class="rowTextClass(scan)" :title="scan.label || tagOf(scan) ? formatScanTime(scan.startedAt, now) : undefined">
                  {{ scan.label || tagOf(scan) || formatScanTime(scan.startedAt, now) }}
                </span>
                <Flag v-if="scan.id === baselineId" :size="11" class="shrink-0 text-neutral-500" aria-label="Baseline"/>
                <span v-if="scan.origin === 'import'" class="ui-tag shrink-0 !text-[10px]">imported</span>
                <span v-if="scan.origin === 'backfill'" class="ui-tag shrink-0 !text-[10px]" :title="`Rebuilt from ${tagOf(scan) ? `tag ${scan.revisionRef}` : `commit ${scan.revisionRef}`} in a clean clone`">rescan</span>
              </span>
              <span v-if="identityOf(scan)" class="truncate font-mono text-[11px] leading-4 text-neutral-500" :title="scan.headCommit">{{ identityOf(scan) }}</span>
            </span>
            <span class="shrink-0 text-xs leading-4 text-neutral-500" :class="scan.status === 'complete' ? 'font-mono tabular-nums' : ''">
              {{ scan.status === 'running' ? 'running' : scan.status === 'failed' ? 'failed' : relativeAge(scan.startedAt, now) }}
            </span>
          </button>
          <button
              v-if="scan.status !== 'running'"
              type="button"
              class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet my-0.5 mr-0.5 h-5 w-5 self-center opacity-0 focus-visible:opacity-100 group-hover/scan:opacity-100"
              :class="{ '!opacity-100': menuId === scan.id }"
              :aria-label="`Actions for the snapshot from ${formatScanTime(scan.startedAt, now)}`"
              :aria-expanded="menuId === scan.id"
              @click.stop="menuId = menuId === scan.id ? null : scan.id"
          >
            <MoreHorizontal :size="13" :stroke-width="1.75"/>
          </button>
          <template v-if="menuId === scan.id">
            <div class="fixed inset-0 z-40" @click="menuId = null"></div>
            <div class="ui-menu absolute right-0 top-full z-50 mt-1 w-56 animate-in" role="menu">
              <button v-if="scan.status === 'complete'" type="button" class="ui-menu-item" role="menuitem" @click="startRename(scan)">Rename…</button>
              <button v-if="scan.status === 'complete' && scan.id !== baselineId" type="button" class="ui-menu-item" role="menuitem" @click="act(() => store.setBaseline(scan.id))">Set as baseline</button>
              <button v-if="scan.id === baselineId" type="button" class="ui-menu-item" role="menuitem" @click="act(() => store.setBaseline(null))">Clear baseline</button>
              <template v-if="scan.status === 'complete'">
                <div class="my-1 hairline-b"></div>
                <button type="button" class="ui-menu-item" role="menuitem" :title="scan.headCommit ? `Scan commit ${scan.headCommit.slice(0, 7)} again with this build's analysis` : 'Scan the commit HEAD was at when this scan ran'" @click="menuId = null; store.requestRescan(scan.id)">Rescan this commit…</button>
                <div class="my-1 hairline-b"></div>
                <button type="button" class="ui-menu-item" role="menuitem" @click="act(() => RevealSnapshot(scan.id))">Reveal in {{ fileManager }}</button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="act(copyPath(scan.id))">Copy path</button>
                <button type="button" class="ui-menu-item" role="menuitem" :title="sourceNote" @click="act(() => SaveSnapshotCopy(scan.id, true))">Save a copy…</button>
                <button type="button" class="ui-menu-item" role="menuitem" title="The same snapshot without the stored text of every file" @click="act(() => SaveSnapshotCopy(scan.id, false))">Save a copy without source…</button>
              </template>
              <div class="my-1 hairline-b"></div>
              <button type="button" class="ui-menu-item text-red-700" role="menuitem" @click="menuId = null; confirmingId = scan.id">Delete…</button>
            </div>
          </template>
        </div>
        <p v-if="actionError && actionErrorId === scan.id" class="mx-2 mb-1 text-xs leading-4 text-red-700" role="alert">{{ actionError }}</p>
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
    <div v-if="completeCount" class="mt-1 flex items-center gap-2 px-2 text-xs text-neutral-500">
      <span class="font-mono tabular-nums">{{ completeCount }} snapshot{{ completeCount === 1 ? "" : "s" }} · {{ formatBytes(totalBytes) }}</span>
      <button type="button" class="ml-auto font-medium transition-colors hover:text-neutral-900" title="Scan the repository's tags, each in a clean clone, to fill in history" @click="tagsOpen = true">Tags…</button>
      <button type="button" class="font-medium transition-colors hover:text-neutral-900" @click="storageOpen = true">Manage…</button>
    </div>
    <StorageSheet v-model="storageOpen"/>
    <ScanTagsSheet v-model="tagsOpen"/>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { AlertTriangle, Flag, Loader2, MoreHorizontal, Play, X } from "lucide-vue-next";
import { RevealSnapshot, SaveSnapshotCopy, SnapshotPath } from "wailsjs/go/app/WorkspaceService";
import { copyText } from "~/utils/files";
import { formatBytes } from "~/utils/format";
import StorageSheet from "~/components/shell/StorageSheet.vue";
import ScanTagsSheet from "~/components/shell/ScanTagsSheet.vue";
import BackfillQueue from "~/components/shell/BackfillQueue.vue";
import { usePlatform } from "~/composables/usePlatform";
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
const storageOpen = ref(false);
const tagsOpen = ref(false);
const completeCount = computed(() => scans.value.filter(s => s.status === "complete").length);
const totalBytes = computed(() => scans.value.reduce((sum, s: any) => sum + (Number(s.sizeBytes) || 0), 0));
const visibleScans = computed(() => (showAll.value ? scans.value : scans.value.slice(0, COLLAPSED)));

const confirmingId = ref<string | null>(null);
const menuId = ref<string | null>(null);
const renamingId = ref<string | null>(null);
const labelDraft = ref("");
const renameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const actionError = ref<string | null>(null);
const actionErrorId = ref<string | null>(null);
const baselineId = computed(() => (store.active as any)?.baselineScanId ?? null);
const { isMac, isWindows } = usePlatform();
const fileManager = computed(() => (isMac.value ? "Finder" : isWindows.value ? "Explorer" : "file manager"));
const sourceNote = "The copy holds the stored text of every file, import lines, commit subjects and author emails.";

/** A backfilled tag's row reads as the tag and its commit date: "v1.9.0 · 12 Feb 2023". */
function tagOf(scan: models.Scan): string {
  const s: any = scan;
  if (s.origin !== "backfill" || !s.revisionRef || /^[0-9a-f]{40}$/.test(s.revisionRef)) return "";
  const t = s.headTime ? new Date(s.headTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  return t ? `${s.revisionRef} · ${t}` : s.revisionRef;
}

/** "main @ 3f2a91c · +4": the commit a scan read, when the snapshot recorded it. */
function identityOf(scan: models.Scan): string {
  const s: any = scan;
  if (!s.headCommit) return "";
  const dirty = s.dirtyFiles ? ` · +${s.dirtyFiles}` : "";
  return `${s.branch || "HEAD"} @ ${String(s.headCommit).slice(0, 7)}${dirty}`;
}

async function act(fn: () => Promise<unknown>) {
  const id = menuId.value;
  menuId.value = null;
  actionError.value = null;
  try { await fn(); } catch (e) { actionError.value = e instanceof Error ? e.message : String(e); actionErrorId.value = id; }
}
function copyPath(scanId: string) {
  return async () => { await copyText(await SnapshotPath(scanId)); };
}
async function startRename(scan: models.Scan) {
  menuId.value = null;
  labelDraft.value = (scan as any).label ?? "";
  renamingId.value = scan.id;
  await nextTick();
  const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
  el?.focus();
  el?.select();
}
async function saveLabel(scanId: string) {
  if (renamingId.value !== scanId) return;
  renamingId.value = null;
  await store.labelScan(scanId, labelDraft.value);
}
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
  const size = scan.sizeBytes ? `, ${formatBytes(scan.sizeBytes)}` : "";
  return scan.id === openId.value ? `Snapshot from ${when}, open${size}` : `Open snapshot from ${when}${size}`;
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
