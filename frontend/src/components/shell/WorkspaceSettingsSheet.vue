<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 pt-[10vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover w-[560px] max-w-[92vw] p-5 animate-in" role="dialog" aria-modal="true" aria-labelledby="ws-settings-title">
        <h2 id="ws-settings-title" class="text-base font-semibold text-neutral-900">{{ workspaces.active?.name }} settings</h2>
        <section class="mt-4">
          <h3 class="ui-section-title">Leave out of scans</h3>
          <p class="mt-1 text-sm text-neutral-600">Paths in .gitignore syntax, one per line, on top of the repository's own ignore files: generated clients, fixtures, a vendored folder nobody ignored. Their files are not read and their history is dropped. CODEOWNERS is never left out.</p>
          <textarea v-model="text" rows="7" spellcheck="false" class="ui-input mt-2 w-full font-mono text-sm" placeholder="src/generated/&#10;**/fixtures/&#10;*.min.js"></textarea>
          <p class="mt-2 min-h-[1.25rem] text-sm" :class="preview?.excluded ? 'text-neutral-700' : 'text-neutral-500'">
            <template v-if="previewing">Counting…</template>
            <template v-else-if="previewError">{{ previewError }}</template>
            <template v-else-if="preview">{{ preview.excluded.toLocaleString("en-US") }} of {{ preview.files.toLocaleString("en-US") }} files would be left out<template v-if="preview.sample.length">, such as <span class="font-mono text-xs">{{ preview.sample.slice(0, 3).join(", ") }}</span></template>.</template>
          </p>
          <p class="mt-2 text-sm text-neutral-500">Changing these makes the next scan not comparable with earlier ones: they read different code. Changes will say so.</p>
        </section>
        <div class="mt-5 flex items-center justify-end gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm" @click="save(false)">Save</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="workspaces.isScanning" @click="save(true)">Save and scan</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { PreviewIgnore } from "wailsjs/go/app/WorkspaceService";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";

// A workspace's own exclusions for its scans. Kept with the workspace, read
// by the backend at scan time, recorded in each snapshot so comparisons can
// tell when two scans left out different things.

const open = defineModel<boolean>({ default: false });
const workspaces = useWorkspacesStore();
const state = useStateStore();
const text = ref("");
const preview = ref<{ files: number; excluded: number; sample: string[] } | null>(null);
const previewing = ref(false);
const previewError = ref("");

const patterns = computed(() => text.value.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#")));

watch(open, o => {
  if (!o) return;
  text.value = (state.get<string[]>("scan.ignoreGlobs", []) ?? []).join("\n");
  void runPreview();
});

let timer: ReturnType<typeof setTimeout> | null = null;
watch(text, () => { if (timer) clearTimeout(timer); timer = setTimeout(runPreview, 400); });

async function runPreview() {
  const ws = workspaces.active;
  if (!ws || !open.value) return;
  previewing.value = true; previewError.value = "";
  try { preview.value = (await PreviewIgnore(ws.id, patterns.value)) as any; } catch (e) { previewError.value = e instanceof Error ? e.message : String(e); } finally { previewing.value = false; }
}

async function save(scan: boolean) {
  state.set("scan.ignoreGlobs", patterns.value.length ? patterns.value : null);
  await state.flush();
  close();
  if (scan) await workspaces.startScan();
}
function close() { open.value = false; }
</script>
