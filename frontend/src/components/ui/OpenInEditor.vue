<template>
  <span ref="root" class="relative inline-flex shrink-0">
    <button
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
      :class="buttonClass"
      :title="note || `Open ${basename}${line ? ':' + line : ''} in ${editorLabel}`"
      :aria-label="`Open ${file}${line ? ' at line ' + line : ''} in an editor`"
      @click.stop.prevent="onClick"
    >
      <Icon icon="external-link" :size="13"/>
    </button>
    <template v-if="menuOpen">
      <div class="fixed inset-0 z-40 cursor-default" @click.stop="menuOpen = false"></div>
      <div class="ui-menu absolute right-0 top-full z-50 mt-1 flex w-60 flex-col animate-in" role="menu" @click.stop>
        <p v-if="justLaunched" class="px-2 pb-1 pt-1.5 text-sm text-neutral-500">Didn't open? Choose another editor.</p>
        <p v-else class="ui-menu-title">Open files in</p>
        <button v-for="e in EDITORS" :key="e.id" type="button" class="ui-menu-item" role="menuitemradio" :aria-checked="current === e.id" @click="choose(e.id)">
          <Icon :icon="current === e.id ? 'check' : 'minus'" :size="12" :class="current === e.id ? 'text-neutral-700' : 'text-transparent'"/>
          <span>{{ e.label }}</span>
        </button>
        <div class="my-1 h-px bg-neutral-100" role="separator"></div>
        <button type="button" class="ui-menu-item" role="menuitem" @click="revealFile">
          <Icon icon="folder" :size="12" class="text-neutral-500"/><span>{{ isMac ? "Reveal in Finder" : "Show in folder" }}</span>
        </button>
      </div>
    </template>
    <span v-if="note && !menuOpen" class="ui-tooltip absolute right-0 top-full z-50 mt-1 w-max max-w-[260px] whitespace-normal" role="status">{{ note }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { OpenInEditor, RevealWorkspaceFile } from "wailsjs/go/app/WorkspaceService";
import Icon from "~/components/ui/common/Icon.vue";
import { usePlatform } from "~/composables/usePlatform";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";

// Act on a finding without retyping "Foo.cs:212". The editor is asked for
// once, from the first click; a scheme nobody registered fails silently, so
// right after each launch a second click offers another editor instead.

const props = defineProps<{ file: string; line?: number; col?: number; buttonClass?: string }>();

const EDITORS = [
  { id: "vscode", label: "Visual Studio Code" },
  { id: "cursor", label: "Cursor" },
  { id: "idea", label: "JetBrains IDE" },
  { id: "system", label: "Default app (no line)" },
] as const;

const state = useStateStore();
const workspaces = useWorkspacesStore();
const { isMac } = usePlatform();
const menuOpen = ref(false);
const justLaunched = ref(false);
const note = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

const current = computed(() => state.setting<string>("editor", ""));
const editorLabel = computed(() => EDITORS.find(e => e.id === current.value)?.label ?? "an editor");
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
    if (r.status === "missing") return flash("Not on disk any more.");
    if (r.status === "outside") return flash("That path is outside the workspace folder.");
    justLaunched.value = editor !== "system";
    flash(r.changedSinceScan ? "Changed since this snapshot; the line may have moved." : "", r.changedSinceScan ? 5000 : 6000);
  } catch (e) {
    flash(`Could not open: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function revealFile() {
  menuOpen.value = false;
  const ws = workspaces.active;
  if (!ws) return;
  try { await RevealWorkspaceFile(ws.id, props.file); } catch (e) { flash(`Could not reveal: ${e instanceof Error ? e.message : String(e)}`); }
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>
