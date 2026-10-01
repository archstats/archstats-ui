<template>
  <div class="px-2">
    <!-- The active workspace, one line. Click switches; double-click the name renames. -->
    <button
        ref="trigger"
        type="button"
        class="flex h-8 w-full items-center gap-2 rounded px-2 text-left outline-none transition-colors focus-visible:shadow-[0_0_0_2px_rgb(var(--c-accent-400))]"
        :class="open ? 'bg-neutral-100' : 'hover:bg-neutral-100'"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :aria-label="active ? t('workspace.workspaceSwitcher.workspaceSwitchWorkspace', { activeName: active.name }) : t('workspace.workspaceSwitcher.addWorkspace')"
        :title="active ? t('workspace.workspaceSwitcher.doubleClickNameRename', { value: active.managed && active.slug ? active.slug : active.folderPath }) : undefined"
        @click="toggle"
    >
      <Monogram :name="active?.name ?? ''"/>
      <input
          v-if="editing && active"
          ref="nameInput"
          v-model="draftName"
          type="text"
          class="ui-input ui-input-sm -ml-1 h-6 min-w-0 flex-1 px-1 text-base font-semibold"
          :aria-label="t('workspace.workspaceSwitcher.workspaceName')"
          maxlength="40"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename"
          @click.stop
      >
      <span
          v-else
          class="min-w-0 flex-1 truncate text-base font-semibold text-neutral-900"
          @dblclick.stop="beginRename"
      >{{ active?.name ?? t('workspace.workspaceSwitcher.noWorkspace') }}</span>
      <ChevronDown :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400 transition-transform" :class="{ 'rotate-180': open }" aria-hidden="true"/>
    </button>

    <!-- Clones in flight or waiting, under the workspace they will become. -->
    <ul v-if="railClones.length || clones.landed" class="mt-1 flex flex-col gap-1" :aria-label="t('workspace.workspaceSwitcher.clones')">
      <li v-for="j in railClones" :key="j.id">
        <button
            type="button"
            class="group/clone w-full rounded px-2 py-1 text-left transition-colors hover:bg-neutral-100"
            :title="j.state === 'failed' ? j.error : t('workspace.workspaceSwitcher.showClone', { j: slugOf(j) })"
            @click="clones.show(j.id)"
        >
          <span class="flex items-center gap-1.5 text-xs leading-4">
            <AlertTriangle v-if="j.state === 'failed'" :size="12" class="shrink-0 text-red-600" aria-hidden="true"/>
            <Download v-else :size="12" :stroke-width="1.75" class="shrink-0 text-neutral-500" aria-hidden="true"/>
            <span class="min-w-0 flex-1 truncate" :class="j.state === 'failed' ? 'text-red-700' : 'text-neutral-700'">
              {{ j.state === "failed" ? t('workspace.workspaceSwitcher.cloneFailed', { j: slugOf(j) }) : t('workspace.workspaceSwitcher.cloning', { j: slugOf(j) }) }}
            </span>
            <span v-if="j.state === 'running' && j.progress.percent >= 0" class="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">{{ Math.floor(j.progress.percent) }}%</span>
          </span>
          <span v-if="j.state === 'running'" class="mt-1 block h-0.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
            <span v-if="j.progress.percent >= 0" class="block h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out" :style="{ width: `${Math.max(2, j.progress.percent)}%` }"/>
            <span v-else class="shell-progress block h-full"><span/></span>
          </span>
        </button>
      </li>
      <li v-if="clones.landed" class="flex items-center gap-1.5 px-2 py-1 text-xs leading-4 text-neutral-600" role="status">
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true"/>
        <span class="min-w-0 truncate">{{ t('workspace.workspaceSwitcher.cloned', { landed: slugOf(clones.landed) }) }}</span>
        <button type="button" class="shrink-0 font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500" @click="clones.openLanded()">{{ t('workspace.workspaceSwitcher.open') }}</button>
        <button type="button" class="ml-auto shrink-0 text-neutral-400 hover:text-neutral-700" :aria-label="t('workspace.workspaceSwitcher.dismiss')" @click="clones.dismissLanded()"><X :size="12"/></button>
      </li>
    </ul>

    <p v-if="conflict" class="mt-0.5 px-2 text-xs leading-4 text-neutral-500" role="status">
      {{ t('workspace.workspaceSwitcher.folderWasAlreadyWorkspace') }}
    </p>

    <Teleport to="body">
      <Transition name="switcher">
        <div
            v-if="open"
            ref="panel"
            class="ui-popover fixed z-[900] flex w-[340px] flex-col overflow-hidden text-neutral-900"
            :style="panelStyle"
            role="dialog"
            :aria-label="t('workspace.workspaceSwitcher.workspaces')"
        >
          <!-- Type to narrow; arrows and Enter pick. -->
          <div class="flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
            <Search :size="13" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
            <input
                ref="searchEl"
                v-model="query"
                type="text"
                class="h-full min-w-0 flex-1 bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                :placeholder="t('workspace.workspaceSwitcher.findWorkspace')"
                :aria-label="t('workspace.workspaceSwitcher.findWorkspace')"
                role="combobox"
                aria-controls="workspace-list"
                :aria-activedescendant="shown[highlight] ? `ws-${shown[highlight].id}` : undefined"
                spellcheck="false"
                autocomplete="off"
                @keydown.down.prevent="move(1)"
                @keydown.up.prevent="move(-1)"
                @keydown.enter.prevent="chooseHighlighted"
            >
            <span class="shrink-0 font-mono text-[11px] text-neutral-400">{{ shown.length }}<template v-if="query">{{ ' ' + t('workspace.workspaceSwitcher.of', { workspacesLength: workspaces.length }) }}</template></span>
          </div>

          <ul id="workspace-list" role="listbox" :aria-label="t('workspace.workspaceSwitcher.workspaces')" class="max-h-[min(400px,55vh)] overflow-y-auto p-1">
            <li v-for="(ws, i) in shown" :id="`ws-${ws.id}`" :key="ws.id" role="option" :aria-selected="i === highlight" class="group/row relative">
              <div v-if="confirmingId === ws.id" class="rounded bg-neutral-50 px-2 py-2">
                <p class="text-base leading-5 text-neutral-900">
{{ t('workspace.workspaceSwitcher.delete') }} <span class="font-semibold">{{ ws.name }}</span>{{ deletionSuffix(ws) }}?
                </p>
                <p class="mt-0.5 text-xs leading-4 text-neutral-500">{{ ws.managed ? t('workspace.workspaceSwitcher.archstatsMadeCloneGoes') : t('workspace.workspaceSwitcher.folderDiskUntouched') }}</p>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirmDelete(ws.id)">{{ t('workspace.workspaceSwitcher.delete') }}</button>
                  <button type="button" class="ui-btn ui-btn-sm" :ref="(el) => focusOnMount(el)" @click="cancelConfirm">{{ t('workspace.workspaceSwitcher.keep') }}</button>
                </div>
              </div>
              <template v-else>
                <button
                    type="button"
                    tabindex="-1"
                    class="flex w-full min-w-0 items-center gap-2.5 rounded py-1.5 pl-2 pr-9 text-left outline-none transition-colors"
                    :class="ws.id === activeId ? 'bg-accent-50' : i === highlight ? 'bg-neutral-100' : ''"
                    :aria-current="ws.id === activeId ? 'true' : undefined"
                    @click="choose(ws.id)"
                    @mousemove="highlight = i"
                >
                  <Monogram :name="ws.name" :active="ws.id === activeId"/>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-2">
                      <span class="min-w-0 flex-1 truncate text-base font-medium leading-4 text-neutral-900">{{ ws.name }}</span>
                      <span v-if="store.progress[ws.id]" class="flex shrink-0 items-center gap-1 font-mono text-[11px] leading-4 text-neutral-600">
                        <Loader2 :size="10" class="animate-spin" aria-hidden="true"/>{{ t('workspace.workspaceSwitcher.scanning') }}
                      </span>
                      <span v-else class="shrink-0 font-mono text-[11px] leading-4 text-neutral-500" :title="metaTitle(ws.id)">{{ lastScan(ws.id) }}</span>
                    </span>
                    <span class="mt-0.5 flex min-w-0 items-center gap-1 font-mono text-[11px] leading-4 text-neutral-500">
                      <GitBranch v-if="ws.managed" :size="10" :stroke-width="2" class="shrink-0" aria-hidden="true"/>
                      <span class="truncate" :title="ws.folderPath">{{ ws.managed && ws.slug ? ws.slug : shortenPath(ws.folderPath, 44) }}</span>
                    </span>
                  </span>
                </button>
                <button
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 hover:!text-red-700"
                    :aria-label="t('workspace.workspaceSwitcher.deleteWorkspace', { wsName: ws.name })"
                    :title="t('workspace.workspaceSwitcher.delete2', { wsName: ws.name })"
                    tabindex="-1"
                    @click.stop="confirmingId = ws.id"
                >
                  <Trash2 :size="13" :stroke-width="1.75"/>
                </button>
              </template>
            </li>
            <li v-if="!shown.length" class="px-2 py-3 text-sm leading-4 text-neutral-500">
              <template v-if="query">
                {{ t('workspace.workspaceSwitcher.noWorkspaceMatches', { query }) }}
                <button v-if="looksLikeAddress" type="button" class="ml-1 font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2" @click="cloneQuery">{{ t('workspace.workspaceSwitcher.clone') }}</button>
              </template>
              <template v-else>{{ t('workspace.workspaceSwitcher.noWorkspacesYet') }}</template>
            </li>
          </ul>

          <div class="p-1 hairline-t">
            <button type="button" class="ui-menu-item" :disabled="adding" @click="add">
              <span class="flex w-5 justify-center text-neutral-500" aria-hidden="true">
                <Loader2 v-if="adding" :size="13" class="animate-spin"/>
                <FolderPlus v-else :size="14" :stroke-width="1.75"/>
              </span>
              <span class="flex-1">{{ t('workspace.workspaceSwitcher.addFolder') }}</span>
              <kbd class="font-mono text-[11px] text-neutral-400">{{ mod }}N</kbd>
            </button>
            <button type="button" class="ui-menu-item" @click="cloneQuery">
              <span class="flex w-5 justify-center text-neutral-500" aria-hidden="true"><Download :size="14" :stroke-width="1.75"/></span>
              <span class="flex-1">{{ t('workspace.workspaceSwitcher.cloneRepository') }}</span>
              <kbd class="font-mono text-[11px] text-neutral-400">{{ isMac ? "⇧⌘N" : "Ctrl+Shift+N" }}</kbd>
            </button>
            <button v-if="active" type="button" class="ui-menu-item" @click="settingsOpen = true; open = false">
              <span class="flex w-5 justify-center text-neutral-500" aria-hidden="true"><Settings2 :size="14" :stroke-width="1.75"/></span>
              <span class="flex-1 truncate">{{ t('workspace.workspaceSwitcher.settings', { activeName: active.name }) }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
    <WorkspaceSettingsSheet v-model="settingsOpen"/>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AlertTriangle, ChevronDown, Download, FolderPlus, GitBranch, Loader2, Search, Settings2, Trash2, X } from "lucide-vue-next";
import type { clone, store as models } from "wailsjs/go/models";
import WorkspaceSettingsSheet from "./WorkspaceSettingsSheet.vue";
import Monogram from "./Monogram.vue";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useCloneStore } from "~/features/workspace/clone.store";
import { relativeAge } from "~/shared/time";
import { shortenPath } from "~/features/workspace/scanFlow";
import { usePlatform } from "~/platform/usePlatform";
import { t, listOf } from "~/shared/i18n";

const store = useWorkspacesStore();
const clones = useCloneStore();
const router = useRouter();
const { isMac } = usePlatform();
const mod = computed(() => (isMac.value ? "⌘" : "Ctrl+"));

const active = computed(() => store.active);
const activeId = computed(() => store.activeWorkspaceId);
const workspaces = computed(() => store.workspaces);
const conflict = computed(() => store.pickConflict);

// Running clones, and failed ones nobody has looked at yet.
const railClones = computed(() => clones.jobs.filter((j) => j.state === "running" || j.state === "failed"));

function slugOf(j: clone.Job): string {
  const r = j.repo;
  return r.local ? r.name : [r.owner, r.name].filter(Boolean).join("/");
}

// The "already a workspace" note is an explanation, not a state: it goes.
let conflictTimer: ReturnType<typeof setTimeout> | null = null;
watch(conflict, (c) => {
  if (conflictTimer) clearTimeout(conflictTimer);
  if (c) conflictTimer = setTimeout(() => store.clearConflict(), 5000);
});

// ── Popover ─────────────────────────────────────────────
const open = ref(false);
const settingsOpen = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
const query = ref("");
const highlight = ref(0);
const confirmingId = ref<string | null>(null);
const adding = ref(false);

// Name, folder and repository all match. The highlight opens on the active
// workspace, so Enter straight away changes nothing.
const shown = computed<models.Workspace[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return workspaces.value;
  return workspaces.value.filter((w) => `${w.name} ${w.folderPath} ${w.slug ?? ""}`.toLowerCase().includes(q));
});
watch(query, () => { highlight.value = 0; });

const looksLikeAddress = computed(() => /[/:]/.test(query.value.trim()) && query.value.trim().length > 3);

function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const top = Math.min(rect.bottom + 4, window.innerHeight - 80);
  panelStyle.value = { top: `${top}px`, left: `${Math.max(8, rect.left)}px` };
}

async function toggle() {
  if (editing.value) return;
  if (open.value) return close();
  place();
  confirmingId.value = null;
  store.clearConflict();
  query.value = "";
  highlight.value = Math.max(0, workspaces.value.findIndex((w) => w.id === activeId.value));
  open.value = true;
  await nextTick();
  searchEl.value?.focus();
}

function close() {
  open.value = false;
  confirmingId.value = null;
  trigger.value?.focus();
}

function move(delta: number) {
  const n = shown.value.length;
  if (n === 0) return;
  highlight.value = (highlight.value + delta + n) % n;
  document.getElementById(`ws-${shown.value[highlight.value].id}`)?.scrollIntoView({ block: "nearest" });
}

function chooseHighlighted() {
  const ws = shown.value[highlight.value];
  if (ws) void choose(ws.id);
  else if (looksLikeAddress.value) cloneQuery();
}

// Every view holds state in its URL (selection, roll-up, search); another
// workspace starts from the overview so none of it points at the old one.
async function goHomeIfChanged(before: string | null) {
  if (store.activeWorkspaceId !== before) await router.push("/");
}

async function choose(id: string) {
  open.value = false;
  confirmingId.value = null;
  const before = store.activeWorkspaceId;
  await store.select(id);
  await goHomeIfChanged(before);
}

async function add() {
  adding.value = true;
  const before = store.activeWorkspaceId;
  try {
    const picked = await store.addWorkspace();
    if (picked) {
      open.value = false;
      await goHomeIfChanged(before);
    }
  } finally {
    adding.value = false;
  }
}

// A pasted address that matches no workspace is a clone waiting to happen.
function cloneQuery() {
  const q = looksLikeAddress.value ? query.value.trim() : "";
  open.value = false;
  clones.open(q);
}

async function confirmDelete(id: string) {
  confirmingId.value = null;
  await store.removeWorkspace(id);
  if (store.workspaces.length === 0) open.value = false;
  await nextTick();
  searchEl.value?.focus();
}

function deletionSuffix(ws: models.Workspace): string {
  const n = store.scanCounts[ws.id] ?? 0;
  const parts: string[] = [];
  if (n === 1) parts.push(t("workspace.workspaceSwitcher.snapshot"));
  else if (n > 1) parts.push(t("workspace.workspaceSwitcher.snapshots2", { n }));
  if (ws.managed) parts.push(t("workspace.workspaceSwitcher.clone2"));
  return parts.length ? t("workspace.workspaceSwitcher.and", { parts: listOf(parts) }) : "";
}

function lastScan(id: string): string {
  const last = store.lastScanAt[id];
  return last ? relativeAge(last, new Date(store.now)) : t("workspace.workspaceSwitcher.notScanned");
}

function metaTitle(id: string): string {
  const n = store.scanCounts[id] ?? 0;
  return n === 1 ? "1 snapshot" : t("workspace.workspaceSwitcher.snapshots", { n });
}

async function cancelConfirm() {
  confirmingId.value = null;
  await nextTick();
  searchEl.value?.focus();
}

// The confirm block replaces the row; land focus on the safe action.
function focusOnMount(el: unknown) {
  const button = el as HTMLButtonElement | null;
  if (button && confirmingId.value) button.focus();
}

function onDocumentKey(e: KeyboardEvent) {
  if (!open.value || e.key !== "Escape") return;
  e.preventDefault();
  if (confirmingId.value) { void cancelConfirm(); return; }
  if (query.value) { query.value = ""; return; }
  close();
}

function onDocumentPointer(e: PointerEvent) {
  if (!open.value) return;
  const t = e.target as Node;
  if (panel.value?.contains(t) || trigger.value?.contains(t)) return;
  open.value = false;
  confirmingId.value = null;
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointer, true);
  document.addEventListener("keydown", onDocumentKey);
  window.addEventListener("resize", place);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointer, true);
  document.removeEventListener("keydown", onDocumentKey);
  window.removeEventListener("resize", place);
  if (conflictTimer) clearTimeout(conflictTimer);
});

// ── Inline rename ───────────────────────────────────────
const editing = ref(false);
const draftName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

async function beginRename() {
  if (!active.value) return;
  open.value = false;
  draftName.value = active.value.name;
  editing.value = true;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
}

async function commitRename() {
  if (!editing.value || !active.value) return;
  editing.value = false;
  await store.rename(active.value.id, draftName.value);
}

function cancelRename() {
  editing.value = false;
}

watch(activeId, () => {
  editing.value = false;
});
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
