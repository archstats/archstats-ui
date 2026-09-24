<template>
  <div
    v-if="visible"
    class="flex shrink-0 items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="refresh" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 flex-1 truncate" :title="detail">
      <span class="font-medium text-neutral-900">Scanned by an older analysis.</span>
      <span class="text-neutral-600"> Rule verdicts, counts and file classifications have been corrected since. Scan again to see them.</span>
    </p>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="workspaces.isScanning" @click="rescan">
      {{ workspaces.isScanning ? "Scanning…" : "Scan again" }}
    </button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" aria-label="Dismiss for this scan" title="Dismiss for this scan" @click="dismiss">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";

// A snapshot never changes after it is written, so a fix to the analysis
// only reaches it through a new scan. Without this bar an older scan keeps
// reporting what the engine has since corrected -- a Go rule "kept" on a
// Java codebase, 22 modules in a PHP one -- and nothing says why.

const store = useDataStore();
const workspaces = useWorkspacesStore();

// Dismissed per scan and per session: a new scan, or the next launch, asks again.
const dismissed = ref(new Set<string>());
const scanId = computed(() => store._openScanId as string | null);
const visible = computed(() => store.snapshotOutdated && !!scanId.value && !dismissed.value.has(scanId.value));
const detail = computed(() => `This scan was written by analysis revision ${store._snapshotRevision}; this build runs revision ${store._engineRevision}.`);

function dismiss() {
  if (!scanId.value) return;
  dismissed.value = new Set([...dismissed.value, scanId.value]);
}
function rescan() {
  void workspaces.startScan();
}
</script>
