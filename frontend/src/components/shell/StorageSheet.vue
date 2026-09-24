<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[65] flex items-start justify-center bg-neutral-900/20 pt-[8vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover flex max-h-[80vh] w-[760px] max-w-[94vw] flex-col animate-in" role="dialog" aria-modal="true" aria-labelledby="storage-title">
        <header class="flex items-center gap-3 px-5 py-3 hairline-b">
          <h2 id="storage-title" class="text-base font-semibold text-neutral-900">Snapshots on disk</h2>
          <span class="font-mono text-sm text-neutral-500">{{ totalCount }} · {{ formatBytes(totalBytes) }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" aria-label="Close" @click="close"><Icon icon="x" :size="13"/></button>
        </header>

        <div class="min-h-0 grow overflow-y-auto px-5 py-3">
          <p v-if="loading" class="text-sm text-neutral-500">Reading sizes…</p>
          <p v-else-if="error" class="text-sm text-red-700">{{ error }}</p>
          <section v-for="ws in summary" v-else :key="ws.id" class="mb-5">
            <div class="flex items-baseline gap-2">
              <h3 class="text-base font-medium text-neutral-900">{{ ws.name }}</h3>
              <span class="font-mono text-sm text-neutral-500">{{ formatBytes(ws.bytes) }}</span>
              <button v-if="deletable(ws).length > 3" type="button" class="ml-auto text-sm text-neutral-500 hover:text-neutral-900" @click="selectAllButNewest(ws, 3)">Select all but newest 3</button>
            </div>
            <table class="ui-table mt-1">
              <tbody>
                <tr v-for="s in complete(ws)" :key="s.id" :class="{ 'is-selected': selected.has(s.id) }">
                  <td class="w-8"><Checkbox :model-value="selected.has(s.id)" :disabled="!!lockReason(ws, s)" @update:model-value="lockReason(ws, s) || toggle(s.id)"/></td>
                  <td class="whitespace-nowrap text-sm text-neutral-800">{{ s.label || formatScanTime(s.headTime ?? s.startedAt) }}<span v-if="s.headCommit" class="ml-2 font-mono text-xs text-neutral-500">{{ s.headCommit.slice(0, 7) }}</span><span v-if="s.headTime" class="ml-2 text-xs text-neutral-400">scanned {{ formatScanTime(s.startedAt) }}</span></td>
                  <td class="text-sm text-neutral-500">{{ lockReason(ws, s) }}</td>
                  <td class="w-16 text-right font-mono text-xs text-neutral-500">r{{ s.analysisRevision }}</td>
                  <td class="w-24 text-right font-mono text-sm tabular-nums text-neutral-800">{{ formatBytes(s.sizeBytes) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="shrinkable(ws)" class="mt-1 text-sm text-neutral-500">Snapshots over 1 GB from an older analysis are smaller when scanned again.</p>
          </section>
        </div>

        <footer class="flex items-center gap-3 px-5 py-3 hairline-t">
          <span class="text-sm text-neutral-600">{{ selected.size ? `${selected.size} selected · ${formatBytes(selectedBytes)}` : "Select snapshots to delete. The open one and each baseline stay." }}</span>
          <div class="ml-auto flex items-center gap-2">
            <template v-if="confirming">
              <span class="text-sm text-neutral-800">Delete {{ selected.size }} snapshot{{ selected.size === 1 ? "" : "s" }} and free {{ formatBytes(selectedBytes) }}?</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="confirming = false">Cancel</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" :disabled="deleting" @click="remove">{{ deleting ? "Deleting…" : "Delete" }}</button>
            </template>
            <button v-else type="button" class="ui-btn ui-btn-sm ui-btn-danger" :disabled="selected.size === 0" @click="confirming = true">Delete selected</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { DeleteScans, StorageSummary } from "wailsjs/go/app/WorkspaceService";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { formatBytes } from "~/utils/format";
import { newestFirst } from "~/utils/scanOrder";
import { formatScanTime } from "~/utils/time";

// Where the disk went, by workspace and snapshot, and a way to give it back.
// The snapshot open now and each workspace's baseline cannot be picked: the
// app is reading one and comparing against the other.

const open = defineModel<boolean>({ default: false });
const workspaces = useWorkspacesStore();
const data = useDataStore();
const summary = ref<any[]>([]);
const loading = ref(false);
const error = ref("");
const selected = ref(new Set<string>());
const confirming = ref(false);
const deleting = ref(false);

async function load() {
  loading.value = true; error.value = "";
  try { summary.value = ((await StorageSummary()) ?? []) as any[]; } catch (e) { error.value = e instanceof Error ? e.message : String(e); } finally { loading.value = false; }
}
watch(open, o => { if (o) { selected.value = new Set(); confirming.value = false; void load(); } });

const complete = (ws: any) => newestFirst((ws.scans ?? []).filter((s: any) => s.status === "complete")) as any[];
const totalCount = computed(() => summary.value.reduce((n, ws) => n + complete(ws).length, 0));
const totalBytes = computed(() => summary.value.reduce((n, ws) => n + (Number(ws.bytes) || 0), 0));
const bytesById = computed(() => new Map(summary.value.flatMap(ws => (ws.scans ?? []).map((s: any) => [s.id, Number(s.sizeBytes) || 0]))));
const selectedBytes = computed(() => [...selected.value].reduce((n, id) => n + (bytesById.value.get(id) ?? 0), 0));

function lockReason(ws: any, s: any): string {
  if (s.id === workspaces.openScanId) return "Open now";
  if (s.id === ws.baselineScanId) return "The baseline";
  return "";
}
const deletable = (ws: any) => complete(ws).filter(s => !lockReason(ws, s));
function selectAllButNewest(ws: any, keep: number) {
  const next = new Set(selected.value);
  complete(ws).slice(keep).filter(s => !lockReason(ws, s)).forEach(s => next.add(s.id));
  selected.value = next;
}
function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
  confirming.value = false;
}
const shrinkable = (ws: any) => complete(ws).some(s => (Number(s.sizeBytes) || 0) > 1024 ** 3 && (s.analysisRevision ?? 0) < (data._engineRevision ?? 0));

async function remove() {
  deleting.value = true;
  try {
    await DeleteScans([...selected.value]);
    selected.value = new Set();
    confirming.value = false;
    await Promise.all([load(), workspaces.refreshScans()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    deleting.value = false;
  }
}
function close() { open.value = false; }
</script>
