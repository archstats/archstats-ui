<template>
  <div
    v-if="visible"
    class="flex shrink-0 items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="refresh" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 flex-1 truncate" :title="detail">
      <span class="font-medium text-neutral-900">Scanned by an older analysis.</span>
      <span class="text-neutral-600"> {{ reasons[0] ?? "The analysis has changed since." }}<template v-if="reasons.length > 1"> And {{ reasons.length - 1 }} more.</template> Scan again to see them.</span>
    </p>
    <div v-if="reasons.length > 1" class="relative shrink-0">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :aria-expanded="open" @click.stop="open = !open">What changed</button>
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
      <div v-if="open" class="ui-popover absolute right-0 z-50 mt-1 w-[440px] p-3 animate-in" role="dialog" aria-label="What changed since this scan">
        <p class="ui-label mb-2">Since revision {{ store._snapshotRevision }} of the analysis</p>
        <ul class="flex list-disc flex-col gap-1.5 pl-4 text-sm text-neutral-700">
          <li v-for="r in reasons" :key="r">{{ r }}</li>
        </ul>
      </div>
    </div>
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
import { reasonsBetween } from "~/utils/revisions";

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
const open = ref(false);
const reasons = computed(() => reasonsBetween(store._snapshotRevision ?? 0, store._engineRevision ?? 0));
const detail = computed(() => `This scan was written by analysis revision ${store._snapshotRevision}; this build runs revision ${store._engineRevision}.`);

function dismiss() {
  if (!scanId.value) return;
  dismissed.value = new Set([...dismissed.value, scanId.value]);
}
function rescan() {
  void workspaces.startScan();
}
</script>
