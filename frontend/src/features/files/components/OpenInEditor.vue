<template>
  <span ref="root" class="relative inline-flex shrink-0">
    <button
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
      :class="buttonClass"
      :title="note || t('files.openInEditor.open', { basename, value: line ? ':' + line : '', editorLabel })"
      :aria-label="t('files.openInEditor.openEditor', { file, value: line ? t('files.openInEditor.line', { line }) : '' })"
      @click.stop.prevent="onClick"
    >
      <Icon icon="external-link" :size="13"/>
    </button>
    <template v-if="menuOpen">
      <div class="fixed inset-0 z-40 cursor-default" @click.stop="menuOpen = false"></div>
      <div class="ui-menu absolute right-0 top-full z-50 mt-1 flex w-60 flex-col animate-in" role="menu" @click.stop>
        <p v-if="justLaunched" class="px-2 pb-1 pt-1.5 text-sm text-neutral-500">{{ t('files.openInEditor.didnTOpenChoose') }}</p>
        <p v-else class="ui-menu-title">{{ t('files.openInEditor.openFiles') }}</p>
        <button v-for="e in EDITORS" :key="e.id" type="button" class="ui-menu-item" role="menuitemradio" :aria-checked="current === e.id" @click="choose(e.id)">
          <Icon :icon="current === e.id ? 'check' : 'minus'" :size="12" :class="current === e.id ? 'text-neutral-700' : 'text-transparent'"/>
          <span>{{ e.label }}</span>
        </button>
        <div class="my-1 h-px bg-neutral-100" role="separator"></div>
        <button type="button" class="ui-menu-item" role="menuitem" @click="revealFile">
          <Icon icon="folder" :size="12" class="text-neutral-500"/><span>{{ isMac ? t('files.openInEditor.revealFinder') : t('files.openInEditor.showFolder') }}</span>
        </button>
      </div>
    </template>
    <span v-if="note && !menuOpen" class="ui-tooltip absolute right-0 top-full z-50 mt-1 w-max max-w-[260px] whitespace-normal" role="status">{{ note }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { OpenInEditor, RevealWorkspaceFile } from "wailsjs/go/app/WorkspaceService";
import Icon from "~/shared/ui/Icon.vue";
import { usePlatform } from "~/platform/usePlatform";
import { useStateStore } from "~/platform/state.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { t } from "~/shared/i18n";

// Act on a finding without retyping "Foo.cs:212". The editor is asked for
// once, from the first click; a scheme nobody registered fails silently, so
// right after each launch a second click offers another editor instead.

const props = defineProps<{ file: string; line?: number; col?: number; buttonClass?: string }>();

const EDITORS = [
  { id: "vscode", label: t("files.openInEditor.visualStudioCode") },
  { id: "cursor", label: t("files.openInEditor.cursor") },
  { id: "idea", label: t("files.openInEditor.jetbrainsIde") },
  { id: "system", label: t("files.openInEditor.defaultAppNoLine") },
] as const;

const state = useStateStore();
const workspaces = useWorkspacesStore();
const { isMac } = usePlatform();
const menuOpen = ref(false);
const justLaunched = ref(false);
const note = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

const current = computed(() => state.setting<string>("editor", ""));
const editorLabel = computed(() => EDITORS.find(e => e.id === current.value)?.label ?? t("files.openInEditor.editor"));
const basename = computed(() => props.file.split("/").pop() ?? props.file);

void state.loadSettings();

function flash(text: string, ms = 4000) {
  note.value = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { note.value = ""; justLaunched.value = false; }, ms);
}

async function onClick() {
  if (!current.value || justLaunched.value) { menuOpen.value = true; return; }
  await launch(current.value);
}

async function choose(id: string) {
  menuOpen.value = false;
  justLaunched.value = false;
  await state.setSetting("editor", id);
  await launch(id);
}

async function launch(editor: string) {
  const ws = workspaces.active;
  if (!ws) return;
  try {
    const r: any = await OpenInEditor(ws.id, workspaces.openScanId ?? "", props.file, props.line ?? 1, props.col ?? 1, editor);
    if (r.status === "missing") return flash(t("files.openInEditor.notDiskAnyMore"));
    if (r.status === "outside") return flash(t("files.openInEditor.pathOutsideWorkspaceFolder"));
    justLaunched.value = editor !== "system";
    flash(r.changedSinceScan ? t("files.openInEditor.changedSinceSnapshotLine") : "", r.changedSinceScan ? 5000 : 6000);
  } catch (e) {
    flash(t("files.openInEditor.couldNotOpen", { value: e instanceof Error ? e.message : String(e) }));
  }
}

async function revealFile() {
  menuOpen.value = false;
  const ws = workspaces.active;
  if (!ws) return;
  try { await RevealWorkspaceFile(ws.id, props.file); } catch (e) { flash(t("files.openInEditor.couldNotReveal", { value: e instanceof Error ? e.message : String(e) })); }
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>
