<template>
  <div
    v-if="visible"
    class="flex shrink-0 items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="refresh" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 flex-1 truncate" :title="detail">
      <span class="font-medium text-neutral-900">{{ headline }}</span>{{ " " }}<span class="text-neutral-600">{{ firstReason }}<template v-if="reasons.length > 1"> And {{ reasons.length - 1 }} more.</template> Scan again to see {{ outdated ? "them" : "it" }}.</span>
    </p>
    <div v-if="reasons.length > 1" class="relative shrink-0">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :aria-expanded="open" @click.stop="open = !open">What changed</button>
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
      <div v-if="open" class="ui-popover absolute right-0 z-50 mt-1 w-[440px] p-3 animate-in" role="dialog" aria-label="What changed since this scan">
        <p v-if="outdated" class="ui-label mb-2">Since revision {{ store._snapshotRevision }} of the analysis</p>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { HeadDrift } from "wailsjs/go/app/WorkspaceService";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { reasonsBetween } from "~/utils/revisions";

// Two ways a snapshot stops being the code: the analysis that read it has
// since been corrected (a snapshot never changes after it is written), or
// the checkout has moved on since the newest scan. Both are said here, with
// Scan again, and neither is guessed: an unknown drift says unknown.

const store = useDataStore();
const workspaces = useWorkspacesStore();

// Dismissed per scan and per session: a new scan, or the next launch, asks again.
const dismissed = ref(new Set<string>());
const scanId = computed(() => store._openScanId as string | null);
const open = ref(false);

const outdated = computed(() => !!store.snapshotOutdated);
const revisionReasons = computed(() => (outdated.value ? reasonsBetween(store._snapshotRevision ?? 0, store._engineRevision ?? 0) : []));

interface Drift { status: string; ahead: number; branch: string; branchChanged: boolean }
const drift = ref<Drift | null>(null);
const driftReason = computed(() => {
  const d = drift.value;
  if (!d) return "";
  if (d.status === "unknown") return "HEAD has moved to a commit this scan's history does not reach (a rebase, a force-push or an unfetched history).";
  if (d.status !== "ok") return "";
  if (d.branchChanged) return `The checkout is now on ${d.branch}${d.ahead ? `, ${d.ahead.toLocaleString("en-US")} commit${d.ahead === 1 ? "" : "s"} past this scan` : ""}.`;
  if (d.ahead > 0) return `HEAD moved ${d.ahead.toLocaleString("en-US")} commit${d.ahead === 1 ? "" : "s"} since this snapshot.`;
  return "";
});

const reasons = computed(() => [...(driftReason.value ? [driftReason.value] : []), ...revisionReasons.value]);
const headline = computed(() => (outdated.value ? "Scanned by an older analysis." : "The code has moved on."));
const firstReason = computed(() => reasons.value[0] ?? "");
const visible = computed(() => reasons.value.length > 0 && !!scanId.value && !dismissed.value.has(scanId.value));
const detail = computed(() => outdated.value
  ? `This scan was written by analysis revision ${store._snapshotRevision}; this build runs revision ${store._engineRevision}.`
  : "The checkout's HEAD differs from the commit this scan read.");

// Drift only matters for the newest scan: an older one is old on purpose.
async function checkDrift() {
  drift.value = null;
  const ws = workspaces.active;
  const id = scanId.value;
  const newest: any = workspaces.newestComplete;
  if (!ws || !id || !newest || newest.id !== id || !newest.headCommit) return;
  try { drift.value = (await HeadDrift(ws.id, id)) as any; } catch { drift.value = null; }
}
watch(scanId, () => { void checkDrift(); }, { immediate: true });
const onFocus = () => { void checkDrift(); };
onMounted(() => window.addEventListener("focus", onFocus));
onBeforeUnmount(() => window.removeEventListener("focus", onFocus));

function dismiss() {
  if (!scanId.value) return;
  dismissed.value = new Set([...dismissed.value, scanId.value]);
}
function rescan() {
  void workspaces.startScan();
}
</script>
