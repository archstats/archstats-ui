<template>
  <div class="px-2">
    <!-- Header: the active workspace. Click opens the switcher; double-click the name renames. -->
    <div
        class="group relative flex w-full items-stretch rounded transition-colors"
        :class="open ? 'bg-neutral-100' : 'hover:bg-neutral-100'"
    >
      <button
          ref="trigger"
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
          :aria-expanded="open"
          aria-haspopup="listbox"
          :aria-label="active ? `Workspace: ${active.name}. Switch workspace` : 'Add a workspace'"
          @click="toggle"
      >
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface text-neutral-500 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]" aria-hidden="true">
          <FolderOpen :size="15" :stroke-width="1.75"/>
        </span>
        <span class="min-w-0 flex-1">
          <template v-if="active">
            <input
                v-if="editing"
                ref="nameInput"
                v-model="draftName"
                type="text"
                class="ui-input ui-input-sm -mx-1 h-5 w-full px-1 text-base font-semibold"
                aria-label="Workspace name"
                maxlength="40"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename"
                @click.stop
            >
            <span
                v-else
                class="block truncate text-base font-semibold leading-4 text-neutral-900"
                :title="`${active.name} (double-click to rename)`"
                @dblclick.stop="beginRename"
            >{{ active.name }}</span>
            <span class="mt-0.5 block truncate font-mono text-xs leading-4 text-neutral-500" :title="active.folderPath">
              {{ shortenPath(active.folderPath, 28) }}
            </span>
          </template>
          <template v-else>
            <span class="block text-base font-semibold leading-4 text-neutral-900">No workspace</span>
            <span class="mt-0.5 block text-xs leading-4 text-neutral-500">Choose a folder to begin</span>
          </template>
        </span>
        <ChevronsUpDown :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" aria-hidden="true"/>
      </button>
    </div>

    <!-- Popover: every workspace, plus add. Teleported so it escapes the rail's scroll box. -->
    <Teleport to="body">
      <Transition name="switcher">
        <div
            v-if="open"
            ref="panel"
            class="ui-popover fixed z-[900] w-[320px] overflow-hidden text-neutral-900"
            :style="panelStyle"
            role="dialog"
            aria-label="Workspaces"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
        >
          <ul role="listbox" aria-label="Switch workspace" class="max-h-[min(420px,60vh)] overflow-y-auto p-1">
            <li
                v-for="(ws, i) in workspaces"
                :key="ws.id"
                role="option"
                :aria-selected="ws.id === activeId"
                class="group/row relative"
            >
              <div v-if="confirmingId === ws.id" class="py-2 pl-[30px] pr-2">
                <p class="text-base leading-5 text-neutral-900">
                  Delete <span class="font-semibold">{{ ws.name }}</span>{{ deletionSuffix(ws.id) }}?
                </p>
                <p class="mt-0.5 text-xs leading-4 text-neutral-500">The folder on disk is untouched.</p>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirmDelete(ws.id)">Delete</button>
                  <button type="button" class="ui-btn ui-btn-sm" :ref="(el) => focusOnMount(el)" @click="cancelConfirm(i)">Keep</button>
                </div>
              </div>
              <div v-else class="flex items-stretch">
                <button
                    type="button"
                    :ref="(el) => setRowRef(el, i)"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left outline-none transition-colors hover:bg-neutral-100 focus-visible:bg-neutral-100"
                    :tabindex="i === focusIndex ? 0 : -1"
                    @click="choose(ws.id)"
                    @focus="focusIndex = i"
                >
                  <span class="flex w-3.5 shrink-0 justify-center" aria-hidden="true">
                    <Check v-if="ws.id === activeId" :size="13" :stroke-width="2.5" class="text-accent-600"/>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-base font-medium leading-4 text-neutral-900">{{ ws.name }}</span>
                    <span class="mt-0.5 block truncate font-mono text-xs leading-4 text-neutral-500" :title="ws.folderPath">{{ shortenPath(ws.folderPath, 34) }}</span>
                    <span class="block text-xs leading-4 text-neutral-500">{{ metaLine(ws.id) }}</span>
                  </span>
                </button>
                <button
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet my-1.5 mr-1 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 hover:text-red-600"
                    :aria-label="`Delete workspace ${ws.name}`"
                    tabindex="-1"
                    @click.stop="beginConfirm(ws.id)"
                >
                  <Trash2 :size="13" :stroke-width="1.75"/>
                </button>
              </div>
            </li>
            <li v-if="workspaces.length === 0" class="px-2 py-3 text-sm leading-4 text-neutral-500">
              No workspaces yet.
            </li>
          </ul>

          <div class="p-1 hairline-t">
            <div v-if="conflict" class="px-2 pb-1 pt-1.5 text-sm leading-4 text-neutral-700">
              <p>
                That folder is already the workspace
                <span class="font-medium text-neutral-900">{{ conflict.existing.name }}</span>.
              </p>
              <button type="button" class="ui-btn ui-btn-sm mt-1.5" @click="switchToConflict">Switch to it</button>
            </div>
            <button
                type="button"
                class="ui-menu-item font-medium"
                :disabled="adding"
                @click="add"
            >
              <span class="flex w-3.5 justify-center text-neutral-500" aria-hidden="true">
                <Loader2 v-if="adding" :size="13" class="animate-spin"/>
                <FolderPlus v-else :size="14" :stroke-width="1.75"/>
              </span>
              Add workspace…
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Check, ChevronsUpDown, FolderOpen, FolderPlus, Loader2, Trash2 } from "lucide-vue-next";
import { useWorkspacesStore } from "~/stores/workspaces";
import { relativeAge } from "~/utils/time";
import { shortenPath } from "~/utils/shell";

const store = useWorkspacesStore();
const router = useRouter();

const active = computed(() => store.active);
const activeId = computed(() => store.activeWorkspaceId);
const workspaces = computed(() => store.workspaces);
const conflict = computed(() => store.pickConflict);

// ── Popover ─────────────────────────────────────────────
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
const focusIndex = ref(0);
const rowRefs = ref<(HTMLButtonElement | null)[]>([]);
const confirmingId = ref<string | null>(null);
const adding = ref(false);

function setRowRef(el: unknown, i: number) {
  rowRefs.value[i] = (el as HTMLButtonElement) ?? null;
}

function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const top = Math.min(rect.bottom + 4, window.innerHeight - 80);
  panelStyle.value = { top: `${top}px`, left: `${Math.max(8, rect.left)}px` };
}

async function toggle() {
  if (open.value) {
    close();
    return;
  }
  place();
  confirmingId.value = null;
  focusIndex.value = Math.max(0, workspaces.value.findIndex((w) => w.id === activeId.value));
  open.value = true;
  await nextTick();
  rowRefs.value[focusIndex.value]?.focus();
}

function close() {
  open.value = false;
  confirmingId.value = null;
  store.clearConflict();
  trigger.value?.focus();
}

function move(delta: number) {
  const n = workspaces.value.length;
  if (n === 0) return;
  focusIndex.value = (focusIndex.value + delta + n) % n;
  rowRefs.value[focusIndex.value]?.focus();
}

async function choose(id: string) {
  open.value = false;
  confirmingId.value = null;
  store.clearConflict();
  const changed = id !== store.activeWorkspaceId;
  await store.select(id);
  // Every view holds state in its URL (selection, roll-up, search); a new
  // workspace starts from the overview so none of it points at the old one.
  if (changed) router.push("/");
}

async function add() {
  adding.value = true;
  try {
    const created = await store.addWorkspace();
    if (created) open.value = false;
  } finally {
    adding.value = false;
  }
}

async function switchToConflict() {
  const c = conflict.value;
  if (!c) return;
  await choose(c.existing.id);
}

async function confirmDelete(id: string) {
  confirmingId.value = null;
  await store.removeWorkspace(id);
  if (store.workspaces.length === 0) open.value = false;
}

function deletionSuffix(id: string): string {
  const n = store.scanCounts[id] ?? 0;
  if (n === 0) return "";
  return n === 1 ? " and its snapshot" : ` and its ${n} snapshots`;
}

function metaLine(id: string): string {
  const n = store.scanCounts[id] ?? 0;
  const last = store.lastScanAt[id];
  if (n === 0 || !last) return "No snapshots yet";
  const count = n === 1 ? "1 snapshot" : `${n} snapshots`;
  return `${count} · scanned ${relativeAge(last)}`;
}

function beginConfirm(id: string) {
  confirmingId.value = id;
}

async function cancelConfirm(rowIndex: number) {
  confirmingId.value = null;
  await nextTick();
  rowRefs.value[rowIndex]?.focus();
}

// The confirm block replaces the focused row, which would drop focus to
// body and take Escape with it; land it on the safe action instead.
function focusOnMount(el: unknown) {
  const button = el as HTMLButtonElement | null;
  if (button && document.activeElement === document.body) button.focus();
}

function onDocumentKey(e: KeyboardEvent) {
  if (!open.value || e.key !== "Escape") return;
  e.preventDefault();
  close();
}

function onDocumentPointer(e: PointerEvent) {
  if (!open.value) return;
  const t = e.target as Node;
  if (panel.value?.contains(t) || trigger.value?.contains(t)) return;
  open.value = false;
  confirmingId.value = null;
  store.clearConflict();
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
});

// ── Inline rename ───────────────────────────────────────
const editing = ref(false);
const draftName = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

async function beginRename() {
  if (!active.value) return;
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
