<template>
  <!-- Two intents. The button jumps to the line, in the place picked once
       (Archstats' source view or an editor). The chevron opens the choices
       at any time, with the ones that do not jump: the file's page, the
       default app, the folder. -->
  <span ref="root" class="relative inline-flex shrink-0 items-center">
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
    <button
      type="button"
      class="ui-btn ui-btn-sm ui-btn-quiet !w-3.5 !px-0"
      :class="buttonClass"
      :title="t('files.openInEditor.choose')"
      :aria-label="t('files.openInEditor.choose')"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click.stop.prevent="openMenu"
    >
      <Icon icon="chevron-down" :size="11" class="text-neutral-500"/>
    </button>
    <!-- On the top layer, placed from the button: a rail or a scrolling
         pane must not clip it. -->
    <Teleport v-if="menuOpen" to="body">
      <div class="fixed inset-0 z-40 cursor-default" @click.stop="menuOpen = false"></div>
      <div class="ui-menu fixed z-50 flex w-64 flex-col animate-in" :style="menuStyle" role="menu" @click.stop @keydown.esc="menuOpen = false">
        <p v-if="justLaunched" class="px-2 pb-1 pt-1.5 text-sm text-neutral-500">{{ t('files.openInEditor.didnTOpenChoose') }}</p>
        <p v-else class="ui-menu-title">{{ line ? t('files.openInEditor.jumpTo', { line }) : t('files.openInEditor.openIn') }}</p>
        <button v-for="e in EDITORS" :key="e.id" type="button" class="ui-menu-item" role="menuitemradio" :aria-checked="current === e.id" @click="choose(e.id)">
          <Icon :icon="current === e.id ? 'check' : 'minus'" :size="12" :class="current === e.id ? 'text-neutral-700' : 'text-transparent'"/>
          <span>{{ e.label }}</span>
        </button>
        <div class="my-1 h-px bg-neutral-100" role="separator"></div>
        <button type="button" class="ui-menu-item" role="menuitem" @click="openPage">
          <Icon icon="file-text" :size="12" class="text-neutral-500"/><span>{{ t('files.openInEditor.filePage') }}</span>
        </button>
        <button type="button" class="ui-menu-item" role="menuitem" @click="openOnce('system')">
          <Icon icon="external-link" :size="12" class="text-neutral-500"/><span>{{ t('files.openInEditor.defaultAppNoLine') }}</span>
        </button>
        <button type="button" class="ui-menu-item" role="menuitem" @click="revealFile">
          <Icon icon="folder" :size="12" class="text-neutral-500"/><span>{{ isMac ? t('files.openInEditor.revealFinder') : t('files.openInEditor.showFolder') }}</span>
        </button>
      </div>
    </Teleport>
    <span v-if="note && !menuOpen" class="ui-tooltip absolute right-0 top-full z-50 mt-1 w-max max-w-[260px] whitespace-normal" role="status">{{ note }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { filePath } from "~/features/navigation/routes";
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
  // The file's source in Archstats, at the line: no editor needed.
  { id: "archstats", label: t("files.openInEditor.archstats") },
  { id: "vscode", label: t("files.openInEditor.visualStudioCode") },
  { id: "cursor", label: t("files.openInEditor.cursor") },
  { id: "idea", label: t("files.openInEditor.jetbrainsIde") },
] as const;

const state = useStateStore();
const router = useRouter();
const root = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const workspaces = useWorkspacesStore();
const { isMac } = usePlatform();
const menuOpen = ref(false);
const justLaunched = ref(false);
const note = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

const current = computed(() => state.setting<string>("editor", ""));
// "system" was a default before the menu split it off; it still names one.
const editorLabel = computed(() => EDITORS.find(e => e.id === current.value)?.label ?? (current.value === "system" ? t("files.openInEditor.defaultAppNoLine") : t("files.openInEditor.editor")));
const basename = computed(() => props.file.split("/").pop() ?? props.file);

void state.loadSettings();

function flash(text: string, ms = 4000) {
  note.value = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { note.value = ""; justLaunched.value = false; }, ms);
}

function openMenu() {
  const r = root.value?.getBoundingClientRect();
  if (r) {
    const width = 240;
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    const below = r.bottom + 4;
    // Up when there is no room below for the six items.
    const top = below + 260 > window.innerHeight ? Math.max(8, r.top - 264) : below;
    menuStyle.value = { left: `${left}px`, top: `${top}px` };
  }
  menuOpen.value = true;
}

async function onClick() {
  if (!current.value || justLaunched.value) { openMenu(); return; }
  await launch(current.value);
}

async function choose(id: string) {
  menuOpen.value = false;
  justLaunched.value = false;
  await state.setSetting("editor", id);
  await launch(id);
}

async function launch(editor: string) {
  if (editor === "archstats") {
    await router.push({ path: filePath(props.file.replace(/^\.\//, ""), "source"), hash: props.line ? `#L${props.line}` : "" });
    return;
  }
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

/** The file's page in Archstats: what it is, not where the line is. */
async function openPage() {
  menuOpen.value = false;
  await router.push(filePath(props.file.replace(/^\.\//, "")));
}

/** Open once in a place without making it the button's default. */
async function openOnce(editor: string) {
  menuOpen.value = false;
  justLaunched.value = false;
  await launch(editor);
}

async function revealFile() {
  menuOpen.value = false;
  const ws = workspaces.active;
  if (!ws) return;
  try { await RevealWorkspaceFile(ws.id, props.file); } catch (e) { flash(t("files.openInEditor.couldNotReveal", { value: e instanceof Error ? e.message : String(e) })); }
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>
