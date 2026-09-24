<template>
  <Teleport to="body">
    <div v-if="path" class="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 pt-[12vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover w-[520px] max-w-[92vw] p-5 animate-in" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title" class="text-base font-semibold text-neutral-900">Import a snapshot</h2>
        <p class="mt-1 truncate font-mono text-xs text-neutral-500" :title="path">{{ path.split(/[\\/]/).pop() }}</p>

        <p v-if="loading" class="mt-4 text-sm text-neutral-500">Reading the file…</p>
        <p v-else-if="info && !info.valid" class="mt-4 text-sm text-red-700">{{ info.reason }}</p>
        <template v-else-if="info">
          <dl class="ui-kv mt-4">
            <dt>Scanned</dt><dd>{{ formatScanTime(info.scannedAt) }}</dd>
            <template v-if="info.headCommit"><dt>Commit</dt><dd class="font-mono">{{ info.branch ? info.branch + " @ " : "" }}{{ info.headCommit.slice(0, 12) }}</dd></template>
            <dt>Analysis</dt><dd>revision {{ info.revision }}<span v-if="info.revision < (data._engineRevision ?? 0)" class="ml-2 text-neutral-500">older than this build's</span></dd>
            <dt>Files</dt><dd>{{ info.files.toLocaleString("en-US") }}</dd>
            <dt>Git history</dt><dd>{{ info.hasGit ? "yes" : "no" }}</dd>
            <dt>Source text</dt><dd>{{ info.hasSource ? "yes" : "no: the code viewer will be empty" }}</dd>
            <dt>Size</dt><dd>{{ formatBytes(info.sizeBytes) }}</dd>
          </dl>
          <div v-if="info.alreadyImportedScanId" class="mt-4 flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            <span>Already imported.</span>
            <button type="button" class="ui-btn ui-btn-sm ml-auto" @click="openExisting">Open it</button>
          </div>
          <template v-else>
            <label class="mt-4 flex items-center gap-3 text-sm text-neutral-700">
              <span>Into workspace</span>
              <SingleSelect :model-value="target" :options="options" @update:model-value="(o: any) => (targetId = o?.id ?? targetId)"/>
            </label>
            <p v-if="lowOverlap" class="mt-2 text-sm text-amber-700">Few of its files are in that workspace's folder; it may be another codebase.</p>
          </template>
        </template>
        <p v-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!canImport || importing" @click="doImport">{{ importing ? "Importing…" : "Import" }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ImportSnapshot, InspectSnapshot } from "wailsjs/go/app/WorkspaceService";
import SingleSelect from "~/components/ui/common/SingleSelect.vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { formatBytes } from "~/utils/format";
import { formatScanTime } from "~/utils/time";

// A snapshot from elsewhere (CI, a colleague, the CLI) joins a workspace's
// scans. The sheet says what the file is before it is copied in; the
// original is left where it was.

const workspaces = useWorkspacesStore();
const data = useDataStore();
const path = computed(() => workspaces.importPath);
const info = ref<any>(null);
const loading = ref(false);
const importing = ref(false);
const error = ref("");
const targetId = ref("");

const options = computed(() => workspaces.workspaces.map((w: any) => ({ id: w.id, name: w.name })));
const target = computed(() => options.value.find(o => o.id === targetId.value) ?? null);
const lowOverlap = computed(() => !!info.value && targetId.value === info.value.suggestedWorkspaceId && info.value.overlap < 0.3);
const canImport = computed(() => !!info.value?.valid && !info.value.alreadyImportedScanId && !!targetId.value);

watch(path, async (p) => {
  info.value = null; error.value = "";
  if (!p) return;
  loading.value = true;
  try {
    info.value = await InspectSnapshot(p);
    targetId.value = info.value?.suggestedWorkspaceId || workspaces.activeWorkspaceId || "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}, { immediate: true });

function close() { workspaces.importPath = null; }

async function doImport() {
  if (!path.value || !targetId.value) return;
  importing.value = true; error.value = "";
  try {
    const scan: any = await ImportSnapshot(path.value, targetId.value);
    const ws = targetId.value;
    close();
    if (workspaces.activeWorkspaceId !== ws) await workspaces.select(ws);
    await workspaces.refreshScans();
    await workspaces.openSnapshot(scan.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    importing.value = false;
  }
}

async function openExisting() {
  const id = info.value?.alreadyImportedScanId;
  if (!id) return;
  const owner = await findOwner(id);
  close();
  if (owner && workspaces.activeWorkspaceId !== owner) await workspaces.select(owner);
  await workspaces.openSnapshot(id);
}
async function findOwner(scanId: string): Promise<string | null> {
  if (workspaces.scans.some((s: any) => s.id === scanId)) return workspaces.activeWorkspaceId;
  return info.value?.suggestedWorkspaceId ?? null;
}
</script>
