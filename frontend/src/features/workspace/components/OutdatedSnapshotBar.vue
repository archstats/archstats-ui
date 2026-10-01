<template>
  <div
    v-if="visible"
    class="flex shrink-0 items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="refresh" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 flex-1 truncate" :title="detail">
      <span class="font-medium text-neutral-900">{{ headline }}</span>{{ " " }}<span class="text-neutral-600">{{ firstReason }}<template v-if="reasons.length > 1">{{ ' ' + t('workspace.outdatedSnapshotBar.more', { value: reasons.length - 1 }) }}</template>{{ ' ' + t('workspace.outdatedSnapshotBar.scanAgainSee', { value: outdated ? "them" : "it" }) }}</span>
    </p>
    <div v-if="reasons.length > 1" class="relative shrink-0">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :aria-expanded="open" @click.stop="open = !open">{{ t('workspace.outdatedSnapshotBar.whatChanged') }}</button>
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
      <div v-if="open" class="ui-popover absolute right-0 z-50 mt-1 w-[440px] p-3 animate-in" role="dialog" :aria-label="t('workspace.outdatedSnapshotBar.whatChangedSinceScan')">
        <p v-if="outdated" class="ui-label mb-2">{{ t('workspace.outdatedSnapshotBar.sinceRevisionAnalysis', { _snapshotRevision: store._snapshotRevision }) }}</p>
        <ul class="flex list-disc flex-col gap-1.5 pl-4 text-sm text-neutral-700">
          <li v-for="r in reasons" :key="r">{{ r }}</li>
        </ul>
        <router-link to="/views/snapshot" class="mt-3 inline-block text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline" @click="open = false">{{ t('workspace.outdatedSnapshotBar.aboutSnapshot') }}</router-link>
      </div>
    </div>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="workspaces.isScanning" @click="rescan">
      {{ workspaces.isScanning ? t('workspace.outdatedSnapshotBar.scanning') : t('workspace.outdatedSnapshotBar.scanAgain') }}
    </button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('workspace.outdatedSnapshotBar.dismissScan')" :title="t('workspace.outdatedSnapshotBar.dismissScan')" @click="dismiss">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { HeadDrift } from "wailsjs/go/app/WorkspaceService";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { reasonsBetween } from "~/features/snapshot/revisions";
import { t } from "~/shared/i18n";

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
  if (d.status === "unknown") return t("workspace.outdatedSnapshotBar.headHasMovedCommit");
  if (d.status !== "ok") return "";
  if (d.branchChanged) return t("workspace.outdatedSnapshotBar.checkoutNow", { branch: d.branch, value: d.ahead ? t("workspace.outdatedSnapshotBar.pastScan", { commits: t("common.count.commit", { count: d.ahead }) }) : "" });
  if (d.ahead > 0) return t("workspace.outdatedSnapshotBar.headMovedSinceSnapshot", { commits: t("common.count.commit", { count: d.ahead }) });
  return "";
});

const reasons = computed(() => [...(driftReason.value ? [driftReason.value] : []), ...revisionReasons.value]);
const headline = computed(() => (outdated.value ? t("workspace.outdatedSnapshotBar.scannedOlderAnalysis") : t("workspace.outdatedSnapshotBar.codeHasMoved")));
const firstReason = computed(() => reasons.value[0] ?? "");
const visible = computed(() => reasons.value.length > 0 && !!scanId.value && !dismissed.value.has(scanId.value));
const detail = computed(() => outdated.value
  ? t("workspace.outdatedSnapshotBar.scanWasWrittenAnalysis", { _snapshotRevision: store._snapshotRevision, _engineRevision: store._engineRevision })
  : t("workspace.outdatedSnapshotBar.checkoutSHeadDiffers"));

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
