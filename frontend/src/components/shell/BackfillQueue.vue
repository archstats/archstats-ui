<template>
  <div v-if="items.length" class="mt-1.5 rounded bg-neutral-50 px-2 py-1.5" aria-label="Backfill queue">
    <div class="flex items-center gap-2 text-xs text-neutral-500">
      <span class="font-medium text-neutral-700">Backfill</span>
      <span class="font-mono tabular-nums">{{ done }} of {{ items.length }}</span>
      <button v-if="pending && !stopping" type="button" class="ml-auto hover:text-neutral-900" title="The scan in progress finishes; the rest is dropped" @click="stop">Stop after current</button>
      <span v-else-if="stopping && running" class="ml-auto">Stopping after this one</span>
      <button v-else-if="!running" type="button" class="ml-auto hover:text-neutral-900" @click="clear">Clear</button>
    </div>
    <ul class="mt-1 flex flex-col">
      <li v-for="it in items" :key="it.sha + it.ref" class="flex h-5 items-center gap-2 text-xs">
        <Loader2 v-if="it.state === 'running'" :size="10" class="shrink-0 animate-spin text-neutral-500"/>
        <span v-else class="h-1.5 w-1.5 shrink-0 rounded-full" :class="DOT[it.state] ?? 'bg-neutral-300'"></span>
        <span class="min-w-0 flex-1 truncate font-mono" :class="it.state === 'queued' ? 'text-neutral-500' : 'text-neutral-800'" :title="it.sha">{{ it.ref }}</span>
        <span class="shrink-0" :class="it.state === 'failed' ? 'text-red-700' : 'text-neutral-500'" :title="it.error || undefined">{{ it.state }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import { EventsOn } from "wailsjs/runtime/runtime";
import { ClearFinished, Queue, StopAfterCurrent } from "wailsjs/go/app/ScanService";
import { useWorkspacesStore } from "~/stores/workspaces";

// The backfill queue under the scan button: what is queued, running, done.

interface Item { ref: string; sha: string; state: string; scanId: string; error: string }
const DOT: Record<string, string> = { done: "bg-neutral-500", failed: "bg-red-600", stopped: "bg-neutral-200" };

const workspaces = useWorkspacesStore();
const items = ref<Item[]>([]);
const stopping = ref(false);

async function refresh() {
  const ws = workspaces.active?.id;
  if (!ws) { items.value = []; return; }
  try { const q: any = await Queue(ws); items.value = q?.items ?? []; stopping.value = !!q?.stopping; } catch { items.value = []; }
}
watch(() => workspaces.active?.id, refresh, { immediate: true });

const done = computed(() => items.value.filter(i => i.state === "done").length);
const running = computed(() => items.value.some(i => i.state === "running"));
const pending = computed(() => items.value.some(i => i.state === "queued"));

async function stop() { if (workspaces.active) { await StopAfterCurrent(workspaces.active.id); await refresh(); } }
async function clear() { if (workspaces.active) { await ClearFinished(workspaces.active.id); await refresh(); } }

let off: (() => void) | null = null;
onMounted(() => {
  try {
    off = EventsOn("backfill:queue", (p: any) => {
      if (p?.workspaceId === workspaces.active?.id) void refresh();
      // A finished scan belongs in the history list straight away.
      void workspaces.refreshScans();
    });
  } catch { off = null; }
});
onBeforeUnmount(() => off?.());
</script>
