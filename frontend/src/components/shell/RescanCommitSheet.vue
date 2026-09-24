<template>
  <Teleport to="body">
    <div v-if="scan" class="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 pt-[14vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover w-[480px] max-w-[92vw] p-5 animate-in" role="dialog" aria-modal="true" aria-labelledby="rescan-title">
        <h2 id="rescan-title" class="text-base font-semibold text-neutral-900">Rescan this commit</h2>
        <p v-if="loading" class="mt-3 text-sm text-neutral-500">Finding the commit…</p>
        <p v-else-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p>
        <template v-else-if="commit">
          <p v-if="guessed" class="mt-2 text-sm text-neutral-600">This scan did not record its commit. HEAD at scan time was probably:</p>
          <dl class="ui-kv mt-3">
            <dt>Commit</dt><dd class="font-mono">{{ commit.sha.slice(0, 12) }}</dd>
            <dt>Committed</dt><dd>{{ formatScanTime(commit.time) }}</dd>
            <dt>Subject</dt><dd class="!whitespace-normal !text-left">{{ commit.subject }}</dd>
            <template v-if="estimate"><dt>Takes about</dt><dd>{{ estimate }}</dd></template>
          </dl>
          <p class="mt-3 text-sm leading-5 text-neutral-600">
            Scans a clean checkout of that commit in a temporary clone; your working copy is not touched.
            <template v-if="dirty"> The original scan's {{ dirty }} uncommitted file{{ dirty === 1 ? "" : "s" }} {{ dirty === 1 ? "is" : "are" }} not included.</template>
            The new snapshot is read by this build's analysis, revision {{ data._engineRevision ?? "–" }}.
          </p>
        </template>
        <div class="mt-5 flex items-center justify-end gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!commit || starting || workspaces.isScanning" @click="start">
            {{ starting ? "Starting…" : commit ? `Rescan ${commit.sha.slice(0, 7)}` : "Rescan" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ResolveCommit, ResolveCommitAt } from "wailsjs/go/app/ScanService";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { formatScanTime } from "~/utils/time";

// The one confirmation before a commit is rebuilt: which commit, how long,
// and what the rebuild leaves out. Opened from a scan's row menu and from the
// Changes gate ("Rescan baseline commit").

const workspaces = useWorkspacesStore();
const data = useDataStore();
const scan = computed<any>(() => (workspaces.rescanFor ? workspaces.scans.find(s => s.id === workspaces.rescanFor) ?? null : null));
const commit = ref<{ sha: string; time: string; subject: string } | null>(null);
const guessed = ref(false);
const loading = ref(false);
const starting = ref(false);
const error = ref("");

const dirty = computed(() => Number(scan.value?.dirtyFiles ?? 0));
const estimate = computed(() => {
  const done = workspaces.scans.filter((s: any) => s.status === "complete" && s.finishedAt);
  const last: any = done[0];
  if (!last) return "";
  const secs = (new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime()) / 1000;
  return secs < 90 ? `${Math.max(5, Math.round(secs))} s` : `${Math.round(secs / 60)} min`;
});

watch(scan, async (s) => {
  commit.value = null; error.value = ""; guessed.value = false;
  const ws = workspaces.active;
  if (!s || !ws) return;
  loading.value = true;
  try {
    if (s.headCommit) commit.value = (await ResolveCommit(ws.id, s.headCommit)) as any;
    else { commit.value = (await ResolveCommitAt(ws.id, s.startedAt)) as any; guessed.value = true; }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}, { immediate: true });

function close() { workspaces.rescanFor = null; }

async function start() {
  if (!commit.value) return;
  starting.value = true;
  try {
    await workspaces.startScanAt(commit.value.sha);
    close();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    starting.value = false;
  }
}
</script>
