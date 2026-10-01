<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface">
    <div v-show="navExpanded" class="relative flex h-full shrink-0">
      <NavBar @collapse="navExpanded = false"/>
      <PaneHandle
        side="right"
        :label="t('pages.layoutDefault.resizeSidebar')"
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
          :aria-label="t('pages.layoutDefault.expandSidebar')"
          :title="t('pages.layoutDefault.expandSidebar')"
          @click="navExpanded = true"
      >
        <PanelLeftOpen :size="13" :stroke-width="1.75"/>
      </button>
      <span v-if="anyScanning" class="shell-progress absolute inset-y-0 left-0 w-0.5" aria-hidden="true"><span/></span>
    </div>

    <ShortcutSheet v-model="shortcutsOpen"/>
    <SettingsSheet v-model="settingsOpen"/>
    <ExportMenu headless/>
    <GoToAnything/>
    <AddToReportSheet/>
    <RescanCommitSheet/>
    <ImportSnapshotSheet/>
    <CloneSheet/>
    <main class="flex min-w-0 flex-1 flex-col">
      <!-- A figure-taking run has the view's top to itself: its strip is the one thing to read there. -->
      <template v-if="hasData && !reportsStore.takeQueue">
        <OutdatedSnapshotBar/>
        <ImportCoverageBar/>
        <DriftBar/>
      </template>
      <SlotFillBar v-if="hasData"/>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceEmptyState v-if="!hasData"/>
        <slot v-else/>
      </div>
    </main>
    <!-- Ask and ⌘J exist only while AI features are on (the stage draws views for Ask, so it keeps its door). -->
    <AskLauncher v-if="ai.enabled || STAGE_SCAN"/>
    <ExhibitRenderHost/>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { PanelLeftOpen } from "lucide-vue-next";
import NavBar from "~/features/shell/components/NavBar.vue";
import PaneHandle from "~/features/shell/components/PaneHandle.vue";
import WorkspaceEmptyState from "~/features/workspace/components/WorkspaceEmptyState.vue";
import OutdatedSnapshotBar from "~/features/workspace/components/OutdatedSnapshotBar.vue";
import ImportCoverageBar from "~/features/snapshot/components/ImportCoverageBar.vue";
import DriftBar from "~/features/rules/components/DriftBar.vue";
import ShortcutSheet from "~/features/shell/components/ShortcutSheet.vue";
import SettingsSheet from "~/features/shell/components/SettingsSheet.vue";
import { useAIStore } from "~/features/ai/ai.store";
import { STAGE_SCAN } from "~/platform/stage";
import ExportMenu from "~/features/reports/components/ExportMenu.vue";
import GoToAnything from "~/features/shell/components/GoToAnything.vue";
import AddToReportSheet from "~/features/reports/components/AddToReportSheet.vue";
import SlotFillBar from "~/features/reports/components/SlotFillBar.vue";
import AskLauncher from "~/features/ask/components/AskLauncher.vue";
import ExhibitRenderHost from "~/features/exhibit-catalog/components/ExhibitRenderHost.vue";
import { useReportsStore } from "~/features/reports/reports.store";
// Provides the code search that `contains` lines in live groups answer from.
import "~/features/files/codeSearch";
import RescanCommitSheet from "~/features/workspace/components/RescanCommitSheet.vue";
import ImportSnapshotSheet from "~/features/workspace/components/ImportSnapshotSheet.vue";
import CloneSheet from "~/features/workspace/components/CloneSheet.vue";
import { useCloneStore } from "~/features/workspace/clone.store";
import { useMenuCommands } from "~/features/shell/useMenuCommands";
import { useAuthorsStore } from "~/features/git/authors.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { SIDEBAR, usePanesStore } from "~/features/shell/panes.store";
import { usePlatform } from "~/platform/usePlatform";
import { t } from "~/shared/i18n";

const navExpanded = ref(true);
const { shortcutsOpen, settingsOpen } = useMenuCommands();
const ai = useAIStore();

const dataStore = useDataStore();
const workspaces = useWorkspacesStore();
const panes = usePanesStore();
const { isMac } = usePlatform();
const hasData = computed(() => dataStore.hasData);
const anyScanning = computed(() => workspaces.anyScanning);

// Pseudonyms follow the open snapshot and the merges; numbered once per change.
const authors = useAuthorsStore();
const reportsStore = useReportsStore();
watch(() => workspaces.active?.id, (id) => { if (id) authors.load(id); }, { immediate: true });
watch(() => [authors.pseudonymise, dataStore._openScanId, dataStore.hasData, authors.aliases] as const, ([on]) => { if (on) void authors.loadLabels(); }, { immediate: true });

const clones = useCloneStore();
const router = useRouter();
// A workspace opened from a clone starts from the overview: every view keeps
// state in its URL, and none of it belongs to the new workspace.
watch(() => clones.openRequest, () => { void router.push("/"); });

onMounted(() => {
  void ai.load();
  panes.load();
  if (!workspaces.loaded) workspaces.init();
  void clones.init();
});

// Window title doubles as a status line: the workspace normally, the scan while one runs.
// macOS hides it (the sidebar carries the workspace); Windows and Linux show it.
useHead({
  title: computed(() => {
    if (workspaces.isScanning) return t("pages.layoutDefault.scanning");
    if (clones.running.length) return t("pages.layoutDefault.cloning");
    return workspaces.active?.name ?? "";
  }),
  titleTemplate: (chunk) => (chunk ? t("pages.layoutDefault.archstats", { chunk }) : t("pages.layoutDefault.archstats2")),
});
</script>
