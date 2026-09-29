<template>
  <section class="px-2" aria-label="Snapshots">
    <!-- The open snapshot (a select over the history) and the one action that makes a new one. -->
    <div class="flex items-center gap-1.5">
      <button
          ref="trigger"
          type="button"
          class="ui-btn min-w-0 flex-1 justify-start gap-2 px-2 font-normal"
          :disabled="!scans.length"
          :aria-expanded="open"
          aria-haspopup="dialog"
          :aria-label="openScan ? `Snapshot: ${titleOf(openScan)}. Show history` : 'Snapshot history'"
          :title="openScan ? tooltipOf(openScan) : undefined"
          @click="toggle"
      >
        <template v-if="openScan">
          <span class="min-w-0 truncate text-neutral-900">{{ titleOf(openScan) }}</span>
          <span v-if="shortCommit(openScan)" class="shrink-0 font-mono text-xs text-neutral-500">{{ shortCommit(openScan) }}</span>
          <Flag v-if="openScan.id === baselineId" :size="11" class="shrink-0 text-neutral-500" aria-label="Baseline"/>
        </template>
        <span v-else class="min-w-0 truncate text-neutral-500">{{ scans.length ? "No snapshot open" : "No snapshots yet" }}</span>
        <ChevronDown :size="14" :stroke-width="1.75" class="ml-auto shrink-0 text-neutral-400" aria-hidden="true"/>
      </button>

      <button
          type="button"
          class="relative shrink-0 overflow-hidden"
          :class="progress ? 'ui-btn cursor-default gap-1.5 px-2 font-normal' : upToDate ? 'ui-btn' : 'ui-btn ui-btn-primary'"
          :disabled="!active || !!progress"
          :aria-busy="!!progress"
          :title="progress ? undefined : `${scanHint} (${isMac ? '⌘R' : 'Ctrl+R'})`"
          @click="store.startScan()"
      >
        <template v-if="progress">
          <Loader2 :size="12" class="animate-spin text-neutral-500" aria-hidden="true"/>
          <span class="font-mono text-xs tabular-nums text-neutral-800">{{ elapsed }}</span>
          <!-- Against the last scan's time when there is one; a sweep when there is not. -->
          <span v-if="eta.fraction !== null" class="absolute inset-x-0 bottom-0 h-0.5 bg-accent-500/20" aria-hidden="true">
            <span class="block h-full bg-accent-500 transition-[width] duration-1000 ease-linear" :style="{ width: `${eta.fraction * 100}%` }"/>
          </span>
          <span v-else class="shell-progress absolute inset-x-0 bottom-0 h-0.5" aria-hidden="true"><span/></span>
        </template>
        <template v-else>
          <Play :size="11" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
          <span>Scan</span>
        </template>
      </button>
    </div>

    <!-- One status line at most: what is running, what is waiting, what went wrong. -->
    <!-- The languages follow the phase, and take their own line when the phase is long. -->
    <p v-if="progress" class="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 px-1 text-xs leading-4 text-neutral-600" aria-live="polite">
      <span class="max-w-full truncate">{{ statusLine }}</span>
      <span v-if="eta.label" class="max-w-full truncate text-neutral-500">{{ eta.label }}</span>
      <span v-if="progress.extensions.length" class="max-w-full truncate font-mono text-[11px] text-neutral-500" :title="progress.extensions.join(', ')">{{ progress.extensions.join(" · ") }}</span>
      <span v-if="progress.note" class="mt-0.5 w-full text-neutral-500">{{ progress.note }}</span>
    </p>
    <div v-else-if="failed" class="mt-1.5 px-1 text-xs leading-4" role="alert">
      <div class="flex items-center gap-1.5">
        <AlertTriangle :size="12" class="shrink-0 text-red-600" aria-hidden="true"/>
        <span class="text-red-700">The scan failed.</span>
        <button type="button" class="font-medium text-neutral-600 hover:text-neutral-900" :aria-expanded="failureOpen" @click="failureOpen = !failureOpen">{{ failureOpen ? "Hide" : "Why" }}</button>
        <button type="button" class="ml-auto text-neutral-400 hover:text-neutral-700" aria-label="Dismiss" @click="store.dismissFailed()"><X :size="12"/></button>
      </div>
      <p v-if="failureOpen" class="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1.5 font-mono text-[11px] leading-4 text-red-800">{{ failed.error || "No reason was recorded." }}</p>
    </div>
    <div v-else-if="ready" class="mt-1.5 flex items-center gap-1.5 px-1 text-xs leading-4 text-neutral-600" role="status">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true"/>
      <span>A new snapshot is ready.</span>
      <button type="button" class="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500" @click="store.openSnapshot(ready.scanId)">Open it</button>
      <button type="button" class="ml-auto text-neutral-400 hover:text-neutral-700" aria-label="Dismiss" @click="store.dismissReady()"><X :size="12"/></button>
    </div>

    <p v-if="store.error" class="mt-1.5 flex items-start gap-1.5 px-1 text-xs leading-4 text-red-700" role="alert">
      <AlertTriangle :size="12" class="mt-0.5 shrink-0" aria-hidden="true"/>
      <span class="min-w-0 break-words">{{ store.error }}</span>
      <button type="button" class="ml-auto shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Dismiss" @click="store.clearError()"><X :size="12"/></button>
    </p>

    <BackfillQueue/>

    <!-- The history: every snapshot, newest code first, with what can be done to each. -->
    <Teleport to="body">
      <Transition name="switcher">
        <div
            v-if="open"
            ref="panel"
            class="ui-popover w-[320px] overflow-hidden text-neutral-900"
            :style="{ ...panelStyle, zIndex: '900' }"
            role="dialog"
            aria-label="Snapshots"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
        >
          <!-- What a scan would read now: the row above the history. -->
          <div class="px-3 pb-2.5 pt-2.5 hairline-b">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-neutral-500">{{ active?.managed ? "Clone" : "Working copy" }}</span>
              <button
                  v-if="!progress"
                  type="button"
                  class="ui-btn ui-btn-sm ml-auto"
                  :class="upToDate ? '' : 'ui-btn-primary'"
                  @click="close(false); store.startScan()"
              >
                <Play :size="10" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>Scan
              </button>
              <span v-else class="ml-auto text-xs text-neutral-500">{{ statusLine }}</span>
            </div>
            <p v-if="wc?.status === 'ok'" class="mt-1 truncate font-mono text-[11px] leading-4 text-neutral-800" :title="wc.subject">
              {{ wc.branch }} @ {{ wc.headSha.slice(0, 7) }}<span class="text-neutral-500"> · {{ wc.subject }}</span>
            </p>
            <p class="mt-0.5 text-xs leading-4" :class="wc?.status === 'missing-folder' ? 'text-red-700' : 'text-neutral-600'">{{ freshness }}</p>
          </div>

          <ol class="overflow-y-auto p-1" :style="{ maxHeight: `${Math.min(440, space - 160)}px` }" aria-label="Snapshot history">
            <li v-for="(scan, i) in history" :key="scan.id" class="group/scan relative">
              <div v-if="confirmingId === scan.id" class="rounded bg-neutral-50 px-2 py-2">
                <p class="text-base leading-5 text-neutral-900">Delete the snapshot from {{ formatScanTime(scan.startedAt, now) }}?</p>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirmDelete(scan.id)">Delete</button>
                  <button type="button" class="ui-btn ui-btn-sm" :ref="(el) => focusOnMount(el)" @click="confirmingId = null">Keep</button>
                </div>
              </div>
              <form v-else-if="renamingId === scan.id" class="px-1 py-1" @submit.prevent="saveLabel(scan.id)">
                <input
                    ref="renameInput"
                    v-model="labelDraft"
                    class="ui-input ui-input-sm w-full"
                    placeholder="Label, e.g. before the split"
                    aria-label="Snapshot label"
                    @keydown.esc.prevent.stop="renamingId = null"
                    @blur="saveLabel(scan.id)"
                />
              </form>
              <template v-else>
                <button
                    type="button"
                    :ref="(el) => setRowRef(el, i)"
                    class="flex w-full min-w-0 items-center gap-2 rounded py-1.5 pl-2 pr-9 text-left outline-none transition-colors"
                    :class="[scan.id === openId ? 'bg-accent-50' : 'hover:bg-neutral-100 focus-visible:bg-neutral-100', scan.status === 'complete' ? '' : 'cursor-default']"
                    :aria-current="scan.id === openId ? 'true' : undefined"
                    :aria-label="rowLabel(scan)"
                    :title="scan.status === 'complete' && scan.sizeBytes ? formatBytes(scan.sizeBytes) : undefined"
                    :tabindex="i === focusIndex ? 0 : -1"
                    @click="onRowClick(scan)"
                    @focus="focusIndex = i"
                >
                  <span class="flex w-3 shrink-0 justify-center" aria-hidden="true">
                    <AlertTriangle v-if="scan.status === 'failed'" :size="11" class="text-red-600"/>
                    <span v-else class="h-1.5 w-1.5 rounded-full" :class="scan.id === openId ? 'bg-accent-500' : 'bg-neutral-300'"/>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="truncate text-base leading-4" :class="scan.status === 'failed' ? 'text-neutral-500' : scan.id === openId ? 'font-medium text-neutral-900' : 'text-neutral-800'">
                        {{ scan.status === 'failed' ? `Failed · ${formatScanTime(scan.startedAt, now)}` : titleOf(scan) }}
                      </span>
                      <Flag v-if="scan.id === baselineId" :size="11" class="shrink-0 text-neutral-500" aria-label="Baseline"/>
                      <span v-if="scan.origin === 'import'" class="ui-tag h-4 shrink-0 !text-[10px]">imported</span>
                      <span v-if="scan.origin === 'backfill'" class="ui-tag h-4 shrink-0 !text-[10px]" :title="`Rebuilt from ${tagOf(scan) ? `tag ${scan.revisionRef}` : `commit ${scan.revisionRef}`} in a clean clone`">rescan</span>
                    </span>
                    <span v-if="identityOf(scan)" class="mt-0.5 block truncate font-mono text-[11px] leading-4 text-neutral-500" :title="scan.headCommit">{{ identityOf(scan) }}</span>
                  </span>
                  <span class="shrink-0 self-start font-mono text-[11px] leading-4 tabular-nums text-neutral-500">{{ relativeAge(scan.startedAt, now) }}</span>
                </button>
                <p
                    v-if="scan.status === 'failed' && expandedId === scan.id"
                    class="mx-2 mb-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1.5 font-mono text-[11px] leading-4 text-red-800"
                >{{ scan.error }}</p>
                <p v-if="actionError && actionErrorId === scan.id" class="mx-2 mb-1 text-xs leading-4 text-red-700" role="alert">{{ actionError }}</p>
                <button
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-1.5 top-1.5 opacity-0 focus-visible:opacity-100 group-hover/scan:opacity-100"
                    :class="{ '!opacity-100 bg-neutral-100': menuId === scan.id }"
                    :aria-label="`Actions for the snapshot from ${formatScanTime(scan.startedAt, now)}`"
                    aria-haspopup="menu"
                    :aria-expanded="menuId === scan.id"
                    tabindex="-1"
                    @click.stop="openMenu(scan.id, $event.currentTarget as HTMLElement)"
                >
                  <MoreHorizontal :size="13" :stroke-width="1.75"/>
                </button>
              </template>
            </li>
          </ol>

          <div class="p-1 hairline-t">
            <p v-if="completeCount" class="flex h-6 items-center px-2 font-mono text-[11px] text-neutral-500">
              {{ completeCount }} snapshot{{ completeCount === 1 ? "" : "s" }} · {{ formatBytes(totalBytes) }}
            </p>
            <button type="button" class="ui-menu-item" title="Scan the repository's tags, each in a clean clone, to fill in history" @click="open = false; tagsOpen = true">
              <span class="flex w-5 justify-center text-neutral-500" aria-hidden="true"><History :size="14" :stroke-width="1.75"/></span>
              Scan tags…
            </button>
            <button type="button" class="ui-menu-item" @click="open = false; storageOpen = true">
              <span class="flex w-5 justify-center text-neutral-500" aria-hidden="true"><HardDrive :size="14" :stroke-width="1.75"/></span>
              Manage storage…
            </button>
          </div>
        </div>
      </Transition>

      <!-- A snapshot's actions, beside its row. -->
      <div
          v-if="menuScan"
          ref="menuEl"
          class="ui-menu fixed z-[910] w-56 animate-in"
          :style="menuStyle"
          role="menu"
          @keydown.esc.prevent.stop="closeMenu"
      >
        <template v-if="menuScan.status === 'complete'">
          <button type="button" class="ui-menu-item" role="menuitem" @click="startRename(menuScan)">Rename…</button>
          <button v-if="menuScan.id !== baselineId" type="button" class="ui-menu-item" role="menuitem" @click="act(() => store.setBaseline(menuScan!.id))">Set as baseline</button>
          <button v-else type="button" class="ui-menu-item" role="menuitem" @click="act(() => store.setBaseline(null))">Clear baseline</button>
          <div class="my-1 hairline-b"></div>
          <button type="button" class="ui-menu-item" role="menuitem" :title="menuScan.headCommit ? `Scan commit ${menuScan.headCommit.slice(0, 7)} again with this build's analysis` : 'Scan the commit HEAD was at when this scan ran'" @click="rescan(menuScan.id)">Rescan this commit…</button>
          <div class="my-1 hairline-b"></div>
          <button type="button" class="ui-menu-item" role="menuitem" @click="act(() => RevealSnapshot(menuScan!.id))">Reveal in {{ fileManager }}</button>
          <button type="button" class="ui-menu-item" role="menuitem" @click="act(copyPath(menuScan.id))">Copy path</button>
          <button type="button" class="ui-menu-item" role="menuitem" :title="sourceNote" @click="act(() => SaveSnapshotCopy(menuScan!.id, true))">Save a copy…</button>
          <button type="button" class="ui-menu-item" role="menuitem" title="The same snapshot without the stored text of every file" @click="act(() => SaveSnapshotCopy(menuScan!.id, false))">Save a copy without source…</button>
          <div class="my-1 hairline-b"></div>
        </template>
        <button type="button" class="ui-menu-item text-red-700" role="menuitem" @click="confirmingId = menuScan.id; closeMenu()">Delete…</button>
      </div>
    </Teleport>
    <StorageSheet v-model="storageOpen"/>
    <ScanTagsSheet v-model="tagsOpen"/>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertTriangle, ChevronDown, Flag, HardDrive, History, Loader2, MoreHorizontal, Play, X } from "lucide-vue-next";
import { RevealSnapshot, SaveSnapshotCopy, SnapshotPath } from "wailsjs/go/app/WorkspaceService";
import { copyText } from "~/platform/files";
import { formatBytes } from "~/shared/format";
import StorageSheet from "./StorageSheet.vue";
import ScanTagsSheet from "./ScanTagsSheet.vue";
import BackfillQueue from "./BackfillQueue.vue";
import { usePlatform } from "~/platform/usePlatform";
import { useAnchoredPanel } from "~/shared/ui/useAnchoredPanel";
import type { store as models } from "wailsjs/go/models";
import { useWorkspacesStore, type ScanPhase } from "~/features/workspace/workspaces.store";
import { refLabel, scanEta } from "~/features/workspace/scanFlow";
import { formatElapsed, formatScanTime, relativeAge } from "~/shared/time";

const store = useWorkspacesStore();

const active = computed(() => store.active);
const scans = computed(() => store.scans);
const progress = computed(() => store.activeProgress);
const openId = computed(() => store.openScanId);
const openScan = computed(() => store.openScan);
const baselineId = computed(() => (store.active as any)?.baselineScanId ?? null);
const now = computed(() => new Date(store.now));

// A notice belongs to the workspace it came from.
const ready = computed(() => (store.ready?.workspaceId === store.activeWorkspaceId ? store.ready : null));
const failed = computed(() => (store.failed?.workspaceId === store.activeWorkspaceId ? store.failed : null));
const failureOpen = ref(false);
watch(failed, () => { failureOpen.value = false; });

// The running scan is the status line's; the history lists what exists.
const history = computed(() => scans.value.filter((s) => s.status !== "running"));
const completeCount = computed(() => scans.value.filter((s) => s.status === "complete").length);
const totalBytes = computed(() => scans.value.reduce((sum, s: any) => sum + (Number(s.sizeBytes) || 0), 0));

const { isMac, isWindows } = usePlatform();
const fileManager = computed(() => (isMac.value ? "Finder" : isWindows.value ? "Explorer" : "file manager"));
const sourceNote = "The copy holds the stored text of every file, import lines, commit subjects and author emails.";

// ── Progress ────────────────────────────────────────────
const elapsed = computed(() => (progress.value ? formatElapsed(progress.value.startedAt, now.value) : ""));
// A rescan reads another commit in a fresh clone; the working copy's times say nothing about it.
const eta = computed(() => {
  const p = progress.value;
  if (!p || p.ref || p.phase === "starting") return { fraction: null, label: "" };
  return scanEta(now.value.getTime() - p.startedAt, store.estimateMs);
});

// ── What a scan would pick up ───────────────────────────
const wc = computed(() => store.workingCopy);
const hasOwnSnapshot = computed(() => scans.value.some((s: any) => s.status === "complete" && s.origin !== "backfill" && s.origin !== "import"));
function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
// Nothing new is the one case worth saying quietly: the Scan button steps
// down from primary. A clone may have news upstream, so it never does.
const upToDate = computed(() => {
  const w = wc.value;
  return !!w && w.status === "ok" && !active.value?.managed && hasOwnSnapshot.value && w.ahead === 0 && w.dirty === 0;
});
const freshness = computed(() => {
  const w = wc.value;
  const host = (active.value as any)?.slug?.split("/")[0];
  if (!w) return "";
  if (w.status === "missing-folder") return "The folder is gone. Move it back, or delete this workspace.";
  if (w.status === "no-git") return "Not a git checkout: a scan reads the folder as it is, with no history.";
  const lead = active.value?.managed ? `Scan fetches the latest from ${host || "origin"} first.` : "";
  if (!hasOwnSnapshot.value) return lead || "Not scanned yet.";
  if (!store.comparedCommit) return lead || "The snapshots here did not record their commit; the next scan will.";
  if (w.ahead < 0) return [lead, "HEAD is on a commit the newest snapshot's history does not reach."].filter(Boolean).join(" ");
  const news = [
    w.ahead > 0 ? plural(w.ahead, "new commit", "new commits") : "",
    w.dirty > 0 ? plural(w.dirty, "edited file", "edited files") : "",
  ].filter(Boolean);
  if (!news.length) return lead || "Nothing new since the newest snapshot.";
  return [lead, `${news.join(" and ")} since the newest snapshot.`].filter(Boolean).join(" ");
});
const scanHint = computed(() => (upToDate.value ? "Nothing new since the newest snapshot; scan anyway" : freshness.value ? `Scan: ${freshness.value.replace(/\.$/, "")}` : "Scan the working copy"));

const PHASES: Record<ScanPhase, string> = {
  starting: "Starting",
  updating: "Fetching the latest",
  detecting: "Detecting languages",
  analyzing: "Analyzing files",
  rendering: "Rendering views",
  saving: "Saving snapshot",
  running: "Scanning",
};
// A rescan says so, and names what it reads: it is not the user's scan.
const statusLine = computed(() => {
  const p = progress.value;
  if (!p) return "";
  const phase = PHASES[p.phase] ?? "Scanning";
  return p.ref ? `Rescanning ${refLabel(p.ref)} · ${phase.toLowerCase()}…` : `${phase}…`;
});

// ── Naming a snapshot ───────────────────────────────────
/** A backfilled tag's row reads as the tag and its commit date: "v1.9.0 · 12 Feb 2023". */
function tagOf(scan: models.Scan): string {
  const s: any = scan;
  if (s.origin !== "backfill" || !s.revisionRef || /^[0-9a-f]{40}$/.test(s.revisionRef)) return "";
  const t = s.headTime ? new Date(s.headTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  return t ? `${s.revisionRef} · ${t}` : s.revisionRef;
}

function titleOf(scan: models.Scan): string {
  return (scan as any).label || tagOf(scan) || formatScanTime(scan.startedAt, now.value);
}

function shortCommit(scan: models.Scan): string {
  const s: any = scan;
  return s.headCommit ? String(s.headCommit).slice(0, 7) : "";
}

/** "main @ 3f2a91c · +4": the commit a scan read, when the snapshot recorded it. */
function identityOf(scan: models.Scan): string {
  const s: any = scan;
  if (!s.headCommit) return "";
  const dirty = s.dirtyFiles ? ` · +${s.dirtyFiles}` : "";
  return `${s.branch || "HEAD"} @ ${String(s.headCommit).slice(0, 7)}${dirty}`;
}

function tooltipOf(scan: models.Scan): string {
  const lines = [`Scanned ${formatScanTime(scan.startedAt, now.value)}`];
  const id = identityOf(scan);
  if (id) lines.push(id);
  if (scan.id === baselineId.value) lines.push("Baseline for Changes");
  return lines.join("\n");
}

function rowLabel(scan: models.Scan): string {
  const when = formatScanTime(scan.startedAt, now.value);
  if (scan.status === "failed") return `Failed scan from ${when}. Show error`;
  const size = scan.sizeBytes ? `, ${formatBytes(scan.sizeBytes)}` : "";
  return scan.id === openId.value ? `Snapshot from ${when}, open${size}` : `Open snapshot from ${when}${size}`;
}

// ── History popover ─────────────────────────────────────
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const { style: panelStyle, space } = useAnchoredPanel(trigger, open);
const rowRefs = ref<(HTMLButtonElement | null)[]>([]);
const focusIndex = ref(0);
const confirmingId = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const storageOpen = ref(false);
const tagsOpen = ref(false);

function setRowRef(el: unknown, i: number) {
  rowRefs.value[i] = (el as HTMLButtonElement) ?? null;
}

async function toggle() {
  if (open.value) return close();
  void store.refreshWorkingCopy();
  confirmingId.value = null;
  focusIndex.value = Math.max(0, history.value.findIndex((s) => s.id === openId.value));
  open.value = true;
  await nextTick();
  rowRefs.value[focusIndex.value]?.focus();
}

function close(refocus = true) {
  open.value = false;
  closeMenu();
  confirmingId.value = null;
  renamingId.value = null;
  if (refocus) trigger.value?.focus();
}

function move(delta: number) {
  if (menuId.value || renamingId.value) return;
  const n = history.value.length;
  if (n === 0) return;
  focusIndex.value = (focusIndex.value + delta + n) % n;
  rowRefs.value[focusIndex.value]?.focus();
}

async function onRowClick(scan: models.Scan) {
  if (scan.status === "failed") {
    expandedId.value = expandedId.value === scan.id ? null : scan.id;
    return;
  }
  if (scan.status !== "complete") return;
  close();
  if (scan.id !== openId.value) await store.openSnapshot(scan.id);
}

async function confirmDelete(id: string) {
  confirmingId.value = null;
  if (expandedId.value === id) expandedId.value = null;
  await store.removeScan(id);
  if (!history.value.length) close();
}

function focusOnMount(el: unknown) {
  const button = el as HTMLButtonElement | null;
  if (button && (document.activeElement === document.body || !panel.value?.contains(document.activeElement))) button.focus();
}

// ── A row's actions ─────────────────────────────────────
const menuId = ref<string | null>(null);
const menuEl = ref<HTMLDivElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const menuScan = computed(() => (menuId.value ? history.value.find((s) => s.id === menuId.value) ?? null : null));
const actionError = ref<string | null>(null);
const actionErrorId = ref<string | null>(null);

async function openMenu(id: string, anchor: HTMLElement) {
  if (menuId.value === id) return closeMenu();
  const r = anchor.getBoundingClientRect();
  // Beside the popover when there is room, so the row stays readable; else under the button.
  const right = window.innerWidth - r.right - 8;
  menuStyle.value = right > 240
    ? { left: `${Math.round(r.right + 6)}px`, top: `${Math.round(Math.min(r.top - 4, window.innerHeight - 340))}px` }
    : { right: `${Math.round(window.innerWidth - r.right)}px`, top: `${Math.round(r.bottom + 4)}px` };
  menuId.value = id;
  await nextTick();
  menuEl.value?.querySelector<HTMLButtonElement>("button")?.focus();
}

function closeMenu() {
  menuId.value = null;
}

async function act(fn: () => Promise<unknown>) {
  const id = menuId.value;
  closeMenu();
  actionError.value = null;
  try { await fn(); } catch (e) { actionError.value = e instanceof Error ? e.message : String(e); actionErrorId.value = id; }
}

function copyPath(scanId: string) {
  return async () => { await copyText(await SnapshotPath(scanId)); };
}

function rescan(scanId: string) {
  close(false);
  store.requestRescan(scanId);
}

// ── Labels ──────────────────────────────────────────────
const renamingId = ref<string | null>(null);
const labelDraft = ref("");
const renameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

async function startRename(scan: models.Scan) {
  closeMenu();
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

// ── Dismissal ───────────────────────────────────────────
function onDocumentKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (menuId.value) { e.preventDefault(); closeMenu(); return; }
  if (open.value && !renamingId.value) { e.preventDefault(); close(); }
}

function onDocumentPointer(e: PointerEvent) {
  const t = e.target as Node;
  if (menuId.value && !menuEl.value?.contains(t)) {
    const onOwnButton = (t as Element).closest?.("[aria-haspopup='menu']") && panel.value?.contains(t);
    if (!onOwnButton) closeMenu();
  }
  if (!open.value) return;
  if (panel.value?.contains(t) || trigger.value?.contains(t) || menuEl.value?.contains(t)) return;
  close(false);
}

// Back from the editor, the working copy has usually moved.
let lastFocusRead = 0;
function onWindowFocus() {
  if (Date.now() - lastFocusRead < 2000) return;
  lastFocusRead = Date.now();
  void store.refreshWorkingCopy();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointer, true);
  document.addEventListener("keydown", onDocumentKey);
  window.addEventListener("focus", onWindowFocus);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointer, true);
  document.removeEventListener("keydown", onDocumentKey);
  window.removeEventListener("focus", onWindowFocus);
});

// Another workspace, another history.
watch(() => store.activeWorkspaceId, () => close(false));
</script>

<style scoped>
.switcher-enter-active,
.switcher-leave-active {
  transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1), transform 160ms cubic-bezier(0.2, 0, 0, 1);
}
.switcher-enter-from,
.switcher-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
