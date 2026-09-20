<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface">
    <div v-show="navExpanded" class="relative flex h-full shrink-0">
      <NavBar @collapse="navExpanded = false"/>
      <PaneHandle
        side="right"
        label="Resize sidebar"
        :model-value="panes.sidebarWidth"
        :min="SIDEBAR.min"
        :max="SIDEBAR.max"
        @update:model-value="panes.setSidebar"
        @reset="panes.setSidebar(SIDEBAR.default)"
      />
    </div>

    <!-- Collapsed rail: a slim handle that re-expands; the orange line means a scan is running.
         On macOS the rail stays wide enough to keep the traffic lights on sidebar ground. -->
    <div
        v-show="!navExpanded"
        class="shell-rail relative flex h-full shrink-0 flex-col bg-ground hairline-r"
        :class="isMac ? 'w-[80px]' : 'w-5'"
    >
      <div v-if="isMac" class="drag-region h-[52px] shrink-0" aria-hidden="true"></div>
      <button
          type="button"
          class="flex flex-1 flex-col items-center pt-3 text-neutral-400 transition-colors hover:text-neutral-800 outline-none focus-visible:text-neutral-900"
          aria-label="Expand sidebar"
          title="Expand sidebar"
          @click="navExpanded = true"
      >
        <PanelLeftOpen :size="13" :stroke-width="1.75"/>
      </button>
      <span v-if="anyScanning" class="shell-progress absolute inset-y-0 left-0 w-0.5" aria-hidden="true"><span/></span>
    </div>

    <main class="min-w-0 flex-1 overflow-y-auto">
      <WorkspaceEmptyState v-if="!hasData"/>
      <slot v-else/>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { PanelLeftOpen } from "lucide-vue-next";
import NavBar from "~/components/navbar/NavBar.vue";
import PaneHandle from "~/components/shell/PaneHandle.vue";
import WorkspaceEmptyState from "~/components/shell/WorkspaceEmptyState.vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { SIDEBAR, usePanesStore } from "~/stores/panes";
import { usePlatform } from "~/composables/usePlatform";

const navExpanded = ref(true);

const dataStore = useDataStore();
const workspaces = useWorkspacesStore();
const panes = usePanesStore();
const { isMac } = usePlatform();
const hasData = computed(() => dataStore.hasData);
const anyScanning = computed(() => workspaces.anyScanning);

onMounted(() => {
  panes.load();
  if (!workspaces.loaded) workspaces.init();
});

// Window title doubles as a status line: the workspace normally, the scan while one runs.
// macOS hides it (the sidebar carries the workspace); Windows and Linux show it.
useHead({
  title: computed(() => {
    if (workspaces.isScanning) return "Scanning…";
    return workspaces.active?.name ?? "";
  }),
  titleTemplate: (chunk) => (chunk ? `${chunk} – Archstats` : "Archstats"),
});
</script>
