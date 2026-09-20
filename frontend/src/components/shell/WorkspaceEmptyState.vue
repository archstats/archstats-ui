<template>
  <div class="flex min-h-full items-center justify-center px-8 py-16">
    <div class="w-full max-w-[480px]">
      <img src="/img/archstats/Archstats-icon.png" alt="" class="mb-6 h-10 w-10 select-none" draggable="false">

      <!-- First run: no workspace at all. -->
      <template v-if="variant === 'first-run'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">Point Archstats at a folder</h1>
        <p class="mt-2 max-w-[48ch] text-base leading-5 text-neutral-600">
          It scans the source on this machine and keeps every snapshot, so you can come back later and see what changed.
        </p>

        <ol class="mt-7 grid grid-cols-3 gap-5" aria-label="How it works">
          <li v-for="(step, i) in STEPS" :key="step.title" class="flex flex-col gap-1 pt-3 hairline-t">
            <span class="text-base font-semibold leading-5 text-neutral-900">
              <span class="mr-2 font-mono tabular-nums text-neutral-400">{{ i + 1 }}</span>{{ step.title }}
            </span>
            <span class="text-sm leading-4 text-neutral-500">{{ step.body }}</span>
          </li>
        </ol>

        <div class="mt-7 flex flex-wrap items-center gap-3">
          <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" :disabled="adding" @click="add">
            <Loader2 v-if="adding" :size="14" class="animate-spin" aria-hidden="true"/>
            <FolderPlus v-else :size="14" :stroke-width="2" aria-hidden="true"/>
            Choose folder…
          </button>
          <span class="text-sm text-neutral-500">Everything runs locally. Nothing is uploaded.</span>
        </div>

        <p v-if="conflict" class="mt-4 rounded bg-accent-50 px-3 py-2.5 text-base leading-5 text-neutral-900 shadow-[0_0_0_1px_rgb(var(--c-accent-200))]">
          That folder is already the workspace <span class="font-medium">{{ conflict.existing.name }}</span>.
          <button type="button" class="ml-1 font-medium text-accent-700 underline underline-offset-2 hover:text-accent-800" @click="store.select(conflict.existing.id)">Switch to it</button>
        </p>
        <p v-if="store.error" class="mt-4 whitespace-pre-wrap break-words rounded bg-red-50 px-3 py-2.5 font-mono text-sm leading-4 text-red-800 shadow-[0_0_0_1px_rgb(var(--c-red-200))]" role="alert">{{ store.error }}</p>
      </template>

      <!-- A scan is running and there is no snapshot to show underneath. -->
      <template v-else-if="variant === 'scanning'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">Scanning {{ active?.name }}</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>

        <ol class="mt-7 flex flex-col gap-2.5" aria-label="Scan progress" aria-live="polite">
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
          <span>Large repositories take a few minutes. You can switch workspaces meanwhile.</span>
        </p>
      </template>

      <!-- The most recent scan failed and nothing older can be shown. -->
      <template v-else-if="variant === 'failed'">
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">The scan of {{ active?.name }} failed</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>
        <pre class="mt-5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-red-50 px-3 py-2.5 font-mono text-sm leading-4 text-red-800 shadow-[0_0_0_1px_rgb(var(--c-red-200))]">{{ failure?.error }}</pre>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" @click="store.startScan()">
            <Play :size="12" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
            Scan again
          </button>
          <span class="text-sm text-neutral-500">Fix the cause first if the message names one.</span>
        </div>
      </template>

      <!-- Workspace exists, nothing has been scanned yet. -->
      <template v-else>
        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 text-balance">{{ active?.name }} has no snapshots yet</h1>
        <p class="mt-1.5 font-mono text-sm leading-4 text-neutral-500" :title="active?.folderPath">{{ active?.folderPath }}</p>
        <p class="mt-3 max-w-[48ch] text-base leading-5 text-neutral-600">Run a scan to build the first snapshot. Every later scan is kept alongside it.</p>
        <div class="mt-6">
          <button type="button" class="ui-btn ui-btn-primary h-8 px-3.5" @click="store.startScan()">
            <Play :size="12" :stroke-width="2.4" fill="currentColor" aria-hidden="true"/>
            Scan now
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, FolderPlus, Loader2, Play } from "lucide-vue-next";
import { useWorkspacesStore } from "~/stores/workspaces";
import { formatElapsed } from "~/utils/time";

const store = useWorkspacesStore();
const active = computed(() => store.active);
const progress = computed(() => store.activeProgress);
const failure = computed(() => store.latestFailure);
const conflict = computed(() => store.pickConflict);

type Variant = "first-run" | "scanning" | "failed" | "no-snapshot";
const variant = computed<Variant>(() => {
  if (!active.value) return "first-run";
  if (progress.value) return "scanning";
  if (failure.value) return "failed";
  return "no-snapshot";
});

const STEPS = [
  { title: "Choose a folder", body: "Any codebase on this machine. Parent folders with several repos work too." },
  { title: "Scan it", body: "Languages are detected automatically. The result is one snapshot." },
  { title: "Explore", body: "Coupling, hotspots, cycles, churn. Rescan any time and compare." },
];

const PHASES = [
  { key: "starting", label: "Preparing" },
  { key: "detecting", label: "Detecting languages" },
  { key: "analyzing", label: "Analyzing files" },
  { key: "rendering", label: "Rendering views" },
  { key: "saving", label: "Saving snapshot" },
] as const;

const phaseIndex = computed(() => {
  const phase = progress.value?.phase;
  if (!phase) return 0;
  if (phase === "starting") return 1;
  return Math.max(0, PHASES.findIndex((p) => p.key === phase));
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
