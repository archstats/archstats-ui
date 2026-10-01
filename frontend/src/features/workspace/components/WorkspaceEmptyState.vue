<template>
  <div class="flex min-h-full items-center justify-center px-8 py-16">
    <div class="w-full max-w-[480px]">
      <img src="/img/archstats/Archstats-icon.png" alt="" class="mb-6 h-10 w-10 select-none" draggable="false">

      <!-- First run: no workspace at all. Two ways in: a folder here, or a repository elsewhere. -->
      <template v-if="variant === 'first-run'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">{{ t('workspace.workspaceEmptyState.addCodebase') }}</h1>
        <p class="mt-2 max-w-[48ch] text-base leading-5 text-neutral-600">
          {{ t('workspace.workspaceEmptyState.archstatsReadsSourceMachine') }}
        </p>

        <section class="mt-8" aria-labelledby="first-folder">
          <h2 id="first-folder" class="text-base font-semibold text-neutral-900">{{ t('workspace.workspaceEmptyState.folderMachine') }}</h2>
          <p class="mt-0.5 text-sm leading-4 text-neutral-500">{{ t('workspace.workspaceEmptyState.checkoutParentFolderHolding') }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" :disabled="adding" @click="add">
              <Loader2 v-if="adding" :size="14" class="animate-spin" aria-hidden="true"/>
              <FolderPlus v-else :size="14" :stroke-width="2" aria-hidden="true"/>
              {{ t('workspace.workspaceEmptyState.chooseFolder') }}
            </button>
            <span class="text-sm text-neutral-500">{{ t('workspace.workspaceEmptyState.dropOneWindow') }}</span>
          </div>
        </section>

        <section class="mt-6 pt-6 hairline-t" aria-labelledby="first-clone">
          <h2 id="first-clone" class="text-base font-semibold text-neutral-900">{{ t('workspace.workspaceEmptyState.repository') }}</h2>
          <p class="mt-0.5 text-sm leading-4 text-neutral-500">{{ t('workspace.workspaceEmptyState.clonedYourOwnGit') }}</p>
          <form class="mt-3 flex items-center gap-2" @submit.prevent="clones.open(address.trim())">
            <input
                v-model="address"
                type="text"
                class="ui-input h-8 min-w-0 flex-1 font-mono text-sm"
                placeholder="https://github.com/owner/repo"
                :aria-label="t('workspace.workspaceEmptyState.repositoryAddress')"
                spellcheck="false"
                autocomplete="off"
            >
            <button type="submit" class="ui-btn h-8 px-3.5">
              <Download :size="14" :stroke-width="1.75" aria-hidden="true"/>
              {{ t('workspace.workspaceEmptyState.clone') }}
            </button>
          </form>
        </section>

        <p class="mt-8 text-sm text-neutral-500">{{ t('workspace.workspaceEmptyState.everythingRunsLocallyNothing') }}</p>
        <p v-if="store.error" class="mt-4 whitespace-pre-wrap break-words rounded bg-red-50 px-3 py-2.5 font-mono text-sm leading-4 text-red-800 shadow-[0_0_0_1px_rgb(var(--c-red-200))]" role="alert">{{ store.error }}</p>
      </template>

      <!-- A scan is running and there is no snapshot to show underneath. -->
      <template v-else-if="variant === 'scanning'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">{{ progress?.ref ? t('workspace.workspaceEmptyState.rescanning', { activeName: active?.name, ref: refLabel(progress.ref) }) : t('workspace.workspaceEmptyState.scanning', { activeName: active?.name }) }}</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>

        <ol class="mt-7 flex flex-col gap-2.5" :aria-label="t('workspace.workspaceEmptyState.scanProgress')" aria-live="polite">
          <li v-for="(p, i) in PHASES" :key="p.key" class="flex items-center gap-3" :aria-current="phaseIndex === i ? 'step' : undefined">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" :class="phaseRing(i)" aria-hidden="true">
              <Check v-if="i < phaseIndex" :size="11" :stroke-width="2.6"/>
              <Loader2 v-else-if="i === phaseIndex" :size="11" class="animate-spin"/>
              <span v-else class="h-1 w-1 rounded-full bg-current"/>
            </span>
            <span class="text-base leading-5" :class="i <= phaseIndex ? 'text-neutral-900' : 'text-neutral-400'">{{ p.label }}</span>
            <span v-if="i === 1 && progress?.extensions.length" class="ml-1 flex flex-wrap gap-1">
              <span v-for="ext in progress?.extensions" :key="ext" class="ui-tag">{{ ext }}</span>
            </span>
          </li>
        </ol>

        <p class="mt-7 flex items-center gap-3 text-sm text-neutral-500">
          <span class="font-mono tabular-nums text-neutral-900">{{ elapsed }}</span>
          <span>{{ t('workspace.workspaceEmptyState.largeRepositoriesTakeFew') }}</span>
        </p>
      </template>

      <!-- The most recent scan failed and nothing older can be shown. -->
      <template v-else-if="variant === 'failed'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">{{ t('workspace.workspaceEmptyState.scanFailed', { activeName: active?.name }) }}</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>
        <pre class="mt-5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-red-50 px-3 py-2.5 font-mono text-sm leading-4 text-red-800 shadow-[0_0_0_1px_rgb(var(--c-red-200))]">{{ failure?.error }}</pre>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" @click="store.startScan()">
            <Play :size="12" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
            {{ t('workspace.workspaceEmptyState.scanAgain') }}
          </button>
          <span class="text-sm text-neutral-500">{{ t('workspace.workspaceEmptyState.fixCauseFirstIf') }}</span>
        </div>
      </template>

      <!-- Workspace exists, nothing has been scanned yet. -->
      <template v-else>
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">{{ t('workspace.workspaceEmptyState.hasNoSnapshotsYet', { activeName: active?.name }) }}</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>
        <p class="mt-3 max-w-[48ch] text-base leading-5 text-neutral-600">{{ t('workspace.workspaceEmptyState.runScanBuildFirst') }}</p>
        <div class="mt-6">
          <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" @click="store.startScan()">
            <Play :size="12" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
            {{ t('workspace.workspaceEmptyState.scanNow') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Download, FolderPlus, Loader2, Play } from "lucide-vue-next";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useCloneStore } from "~/features/workspace/clone.store";
import { formatElapsed } from "~/shared/time";
import { refLabel } from "~/features/workspace/scanFlow";
import { t } from "~/shared/i18n";

const store = useWorkspacesStore();
const active = computed(() => store.active);
const progress = computed(() => store.activeProgress);
const failure = computed(() => store.latestFailure);

type Variant = "first-run" | "scanning" | "failed" | "no-snapshot";
const variant = computed<Variant>(() => {
  if (!active.value) return "first-run";
  if (progress.value) return "scanning";
  if (failure.value) return "failed";
  return "no-snapshot";
});

const clones = useCloneStore();
const address = ref("");

const PHASES = computed(() => [
  { key: "starting", label: active.value?.managed ? t("workspace.workspaceEmptyState.fetchingLatest") : t("workspace.workspaceEmptyState.preparing") },
  { key: "detecting", label: t("workspace.workspaceEmptyState.detectingLanguages") },
  { key: "analyzing", label: t("workspace.workspaceEmptyState.analyzingFiles") },
  { key: "rendering", label: t("workspace.workspaceEmptyState.renderingViews") },
  { key: "saving", label: t("workspace.workspaceEmptyState.savingSnapshot") },
]);

// A scan found running after a reload has no known phase; it reads as analysis.
const phaseIndex = computed(() => {
  const phase = progress.value?.phase;
  if (!phase) return 0;
  if (phase === "running") return 2;
  if (phase === "updating") return 0;
  return Math.max(0, PHASES.value.findIndex((p) => p.key === phase));
});

function phaseRing(i: number): string {
  if (i < phaseIndex.value) return "bg-neutral-900 text-surface";
  if (i === phaseIndex.value) return "bg-accent-100 text-accent-700 shadow-[0_0_0_1px_rgb(var(--c-accent-300))]";
  return "bg-surface text-neutral-300 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]";
}

const elapsed = computed(() => (progress.value ? formatElapsed(progress.value.startedAt, new Date(store.now)) : ""));

const adding = ref(false);
async function add() {
  adding.value = true;
  try {
    await store.addWorkspace();
  } finally {
    adding.value = false;
  }
}
</script>
