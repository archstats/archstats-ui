<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

definePageMeta({ layout: false });
import { Create, Delete, DeleteScan, List, ListScans } from "wailsjs/go/app/WorkspaceService";
import { Start } from "wailsjs/go/app/ScanService";
import { EventsOn } from "wailsjs/runtime/runtime";
import { useDataStore } from "~/stores/data";
import type { store } from "wailsjs/go/models";

type WorkspaceRow = { workspace: store.Workspace; scans: store.Scan[] };

const router = useRouter();
const dataStore = useDataStore();

const rows = ref<WorkspaceRow[]>([]);
const newName = ref("");
const newFolder = ref("");
const error = ref("");
const busy = ref(false);

async function refresh() {
    try {
        const workspaces = (await List()) ?? [];
        rows.value = await Promise.all(
            workspaces.map(async (workspace) => ({
                workspace,
                scans: (await ListScans(workspace.id)) ?? [],
            })),
        );
    } catch (e: any) {
        error.value = String(e);
    }
}

async function createWorkspace() {
    error.value = "";
    if (!newName.value || !newFolder.value) {
        error.value = "Name and folder path are required.";
        return;
    }
    try {
        busy.value = true;
        await Create(newName.value, newFolder.value);
        newName.value = "";
        newFolder.value = "";
        await refresh();
    } catch (e: any) {
        error.value = String(e);
    } finally {
        busy.value = false;
    }
}

async function scan(workspaceId: string) {
    error.value = "";
    try {
        await Start(workspaceId);
        await refresh();
    } catch (e: any) {
        error.value = String(e);
    }
}

async function open(scan: store.Scan) {
    if (scan.status !== "complete") return;
    error.value = "";
    try {
        busy.value = true;
        await dataStore.openScan(scan.id);
        router.push("/");
    } catch (e: any) {
        error.value = String(e);
    } finally {
        busy.value = false;
    }
}

async function removeWorkspace(workspaceId: string) {
    error.value = "";
    try {
        await Delete(workspaceId);
        await refresh();
    } catch (e: any) {
        error.value = String(e);
    }
}

async function removeScan(scanId: string) {
    error.value = "";
    try {
        await DeleteScan(scanId);
        await refresh();
    } catch (e: any) {
        error.value = String(e);
    }
}

function formatDate(value: any): string {
    if (!value) return "";
    return String(value).replace("T", " ").slice(0, 19);
}

const unsubscribers: (() => void)[] = [];
onMounted(() => {
    refresh();
    for (const event of ["scan:started", "scan:done", "scan:failed"]) {
        unsubscribers.push(EventsOn(event, refresh));
    }
});
onUnmounted(() => unsubscribers.forEach((off) => off()));
</script>

<template>
  <div class="min-h-screen bg-archstats-900 p-10 text-archstats-50">
    <div class="mx-auto max-w-3xl">
      <h1 class="text-3xl font-bold">Archstats Desktop</h1>
      <p class="mt-1 text-archstats-200">Pick a workspace and scan to explore.</p>

      <div v-if="error" class="mt-4 rounded bg-red-900/60 p-3 text-red-200">{{ error }}</div>

      <div class="mt-8 rounded-lg bg-archstats-800 p-4">
        <h2 class="font-semibold text-archstats-100">New workspace</h2>
        <div class="mt-2 flex gap-2">
          <input v-model="newName" placeholder="Name" class="w-1/3 rounded bg-archstats-700 p-2 text-archstats-50 placeholder-archstats-300" />
          <input v-model="newFolder" placeholder="/absolute/path/to/folder" class="flex-grow rounded bg-archstats-700 p-2 font-mono text-sm text-archstats-50 placeholder-archstats-300" />
          <button :disabled="busy" class="rounded bg-secondary-500 px-4 py-2 font-semibold hover:bg-secondary-400 disabled:opacity-50" @click="createWorkspace">
            Create
          </button>
        </div>
      </div>

      <div v-for="row in rows" :key="row.workspace.id" class="mt-6 rounded-lg bg-archstats-800 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold">{{ row.workspace.name }}</h2>
            <p class="font-mono text-xs text-archstats-300">{{ row.workspace.folderPath }}</p>
          </div>
          <div class="flex gap-2">
            <button class="rounded bg-secondary-500 px-3 py-1.5 font-semibold hover:bg-secondary-400" @click="scan(row.workspace.id)">
              Scan
            </button>
            <button class="rounded bg-archstats-700 px-3 py-1.5 text-archstats-200 hover:bg-red-900" @click="removeWorkspace(row.workspace.id)">
              Delete
            </button>
          </div>
        </div>

        <ul class="mt-3 divide-y divide-archstats-700">
          <li v-for="scanRow in row.scans" :key="scanRow.id" class="flex items-center justify-between py-2">
            <button
              class="text-left"
              :class="scanRow.status === 'complete' ? 'hover:text-secondary-300' : 'cursor-default text-archstats-400'"
              @click="open(scanRow)"
            >
              <span class="font-mono text-sm">{{ formatDate(scanRow.startedAt) }}</span>
              <span
                class="ml-3 rounded px-2 py-0.5 text-xs"
                :class="{
                  'bg-green-900 text-green-200': scanRow.status === 'complete',
                  'bg-yellow-900 text-yellow-200': scanRow.status === 'running',
                  'bg-red-900 text-red-200': scanRow.status === 'failed',
                }"
              >{{ scanRow.status }}</span>
              <span v-if="scanRow.error" class="ml-2 text-xs text-red-300">{{ scanRow.error }}</span>
            </button>
            <button class="text-xs text-archstats-400 hover:text-red-300" @click="removeScan(scanRow.id)">remove</button>
          </li>
          <li v-if="row.scans.length === 0" class="py-2 text-sm text-archstats-400">No scans yet.</li>
        </ul>
      </div>

      <p v-if="rows.length === 0" class="mt-8 text-archstats-300">No workspaces yet — create one above.</p>
    </div>
  </div>
</template>
