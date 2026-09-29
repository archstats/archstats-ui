<template>
  <Teleport to="body">
    <div
        v-if="clones.sheetOpen"
        class="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 pt-[12vh]"
        @click.self="close"
        @keydown.esc.stop="close"
    >
      <div class="ui-popover w-[540px] max-w-[92vw] animate-in" role="dialog" aria-modal="true" aria-labelledby="clone-title">
        <!-- In flight: the clone's own progress, and the way out. -->
        <template v-if="job && job.state === 'running'">
          <div class="px-5 pb-4 pt-5">
            <h2 id="clone-title" class="text-lg font-semibold text-neutral-900">Cloning {{ slugOf(job) }}</h2>
            <p class="mt-1 truncate font-mono text-xs text-neutral-500" :title="job.dest">{{ job.dest }}</p>

            <div class="mt-5 h-1 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Clone progress" :aria-valuenow="job.progress.percent >= 0 ? Math.round(job.progress.percent) : undefined" aria-valuemin="0" aria-valuemax="100">
              <div v-if="job.progress.percent >= 0" class="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out" :style="{ width: `${Math.max(2, job.progress.percent)}%` }"/>
              <span v-else class="shell-progress block h-full"><span/></span>
            </div>
            <div class="mt-2 flex items-baseline gap-3 text-sm leading-4">
              <span class="min-w-0 flex-1 truncate text-neutral-700" aria-live="polite">{{ phaseText(job) }}</span>
              <span class="shrink-0 font-mono tabular-nums text-neutral-500">{{ elapsedOf(job) }}</span>
              <span v-if="job.progress.percent >= 0" class="w-10 shrink-0 text-right font-mono tabular-nums text-neutral-900">{{ Math.floor(job.progress.percent) }}%</span>
            </div>
            <p class="mt-4 text-sm leading-5 text-neutral-500">You can hide this. The clone carries on, and the workspace is scanned when it lands.</p>
          </div>
          <div class="flex items-center gap-2 px-5 py-3 hairline-t">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet text-red-700" @click="clones.cancel(job.id)">Cancel clone</button>
            <button ref="primaryBtn" type="button" class="ui-btn ui-btn-sm ml-auto" @click="close">Hide</button>
          </div>
        </template>

        <!-- The form: an address, a name, how much history, where it goes. -->
        <form v-else @submit.prevent="submit">
          <div class="px-5 pt-5">
            <h2 id="clone-title" class="text-lg font-semibold text-neutral-900">Clone a repository</h2>
            <p class="mt-1 text-sm leading-5 text-neutral-500">Archstats clones it with your own git credentials, then scans it.</p>

            <p v-if="job && job.state === 'failed'" class="mt-4 whitespace-pre-wrap break-words rounded bg-red-50 px-3 py-2 text-sm leading-5 text-red-800 shadow-[0_0_0_1px_rgb(var(--c-red-200))]" role="alert">{{ job.error }}</p>

            <label class="mt-4 block">
              <span class="ui-label">Repository</span>
              <input
                  ref="inputEl"
                  v-model="input"
                  type="text"
                  class="ui-input mt-1 w-full font-mono text-sm"
                  placeholder="https://github.com/owner/repo"
                  spellcheck="false"
                  autocomplete="off"
                  autocapitalize="off"
                  aria-describedby="clone-resolved"
              >
            </label>
            <p id="clone-resolved" class="mt-1.5 flex min-h-4 items-center gap-1.5 text-xs leading-4">
              <template v-if="!input.trim()"><span class="text-neutral-500">An https or SSH address, or owner/repo for GitHub.</span></template>
              <template v-else-if="plan?.error"><span class="text-neutral-500">{{ plan.error }}</span></template>
              <template v-else-if="plan">
                <Check :size="12" :stroke-width="2.25" class="shrink-0 text-green-600" aria-hidden="true"/>
                <span class="truncate font-mono text-neutral-700">{{ plan.repo.local ? plan.repo.url : [plan.repo.host, plan.repo.owner, plan.repo.name].filter(Boolean).join(" / ") }}</span>
              </template>
            </p>

            <div class="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
              <label class="block min-w-0">
                <span class="ui-label">Workspace name</span>
                <input v-model="name" type="text" maxlength="40" class="ui-input mt-1 w-full" :placeholder="plan?.repo?.name || 'Name'" autocomplete="off">
              </label>
            </div>

            <fieldset class="mt-4">
              <legend class="ui-label">History</legend>
              <div class="ui-segmented mt-1 w-full" role="radiogroup" aria-label="How much history to fetch">
                <button v-for="h in HISTORIES" :key="h.key" type="button" class="grow" role="radio" :aria-checked="history === h.key" :aria-pressed="history === h.key" @click="history = h.key">{{ h.label }}</button>
              </div>
              <p class="mt-1.5 text-xs leading-4 text-neutral-500">{{ currentHistory.hint }}</p>
            </fieldset>

            <div class="mt-4">
              <span class="ui-label">Location</span>
              <div class="mt-1 flex items-center gap-2">
                <p class="min-w-0 flex-1 truncate rounded bg-neutral-50 px-2 py-1.5 font-mono text-xs text-neutral-700 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]" :title="plan?.dest">{{ plan?.dest ? shortenPath(plan.dest, 64) : "—" }}</p>
                <button type="button" class="ui-btn ui-btn-sm shrink-0" :disabled="!plan || !!plan.error" @click="chooseDest">Change…</button>
                <button v-if="customDest" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="customDest = ''">Reset</button>
              </div>
              <p class="mt-1.5 text-xs leading-4 text-neutral-500">
                <template v-if="!customDest">Kept by Archstats: brought up to date before each scan, and deleted with the workspace.</template>
                <template v-else>Your folder: Archstats never updates it or deletes it.</template>
              </p>
            </div>

            <p v-if="plan?.existing" class="mt-4 flex items-center gap-2 rounded bg-neutral-50 px-3 py-2 text-sm leading-5 text-neutral-800 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]">
              <span class="min-w-0 flex-1">Already cloned as <span class="font-medium">{{ plan.existing.name }}</span>.</span>
              <button type="button" class="ui-btn ui-btn-sm shrink-0" @click="openExisting">Open it</button>
            </p>
            <p v-else-if="plan?.destExists" class="mt-4 text-sm leading-5 text-red-700">That folder already exists and is not empty. Change the location.</p>
            <p v-if="startError" class="mt-4 text-sm leading-5 text-red-700" role="alert">{{ startError }}</p>
          </div>

          <div class="mt-5 flex items-center gap-2 px-5 py-3 hairline-t">
            <span class="text-xs text-neutral-500">Nothing leaves this machine except git's own fetch.</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="close">Cancel</button>
            <button ref="primaryBtn" type="submit" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!canClone">
              <Loader2 v-if="starting" :size="12" class="animate-spin" aria-hidden="true"/>
              {{ job && job.state === 'failed' ? "Try again" : "Clone" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Check, Loader2 } from "lucide-vue-next";
import { ChooseParent, Plan } from "wailsjs/go/app/CloneService";
import { ClipboardGetText } from "wailsjs/runtime/runtime";
import type { clone } from "wailsjs/go/models";
import { useCloneStore, type History } from "~/features/workspace/clone.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { shortenPath } from "~/features/workspace/scanFlow";
import { formatElapsed } from "~/shared/time";

const clones = useCloneStore();
const workspaces = useWorkspacesStore();

const HISTORIES: { key: History; label: string; hint: string }[] = [
  { key: "full", label: "Full history", hint: "Every commit: churn, co-change, authors and every history view work. The largest download." },
  { key: "year", label: "Last year", hint: "Commits from the past twelve months. History views cover that year only." },
  { key: "latest", label: "Latest only", hint: "One commit and no history: the structure views work, the git views stay empty. The fastest." },
];

const input = ref("");
const name = ref("");
const nameTouched = ref(false);
const history = ref<History>("full");
const customDest = ref("");
const plan = ref<clone.Plan | null>(null);
const starting = ref(false);
const startError = ref("");
const inputEl = ref<HTMLInputElement | null>(null);
const primaryBtn = ref<HTMLButtonElement | null>(null);

const job = computed(() => clones.watched);
const currentHistory = computed(() => HISTORIES.find((h) => h.key === history.value) ?? HISTORIES[0]);
const canClone = computed(() => !!plan.value && !plan.value.error && !plan.value.existing && !plan.value.destExists && !starting.value);

// ── Reading the address ─────────────────────────────────
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
function replan() {
  if (timer) clearTimeout(timer);
  const text = input.value.trim();
  if (!text) { plan.value = null; return; }
  timer = setTimeout(async () => {
    const mine = ++seq;
    try {
      const p = await Plan(text, customDest.value);
      if (mine !== seq) return;
      plan.value = p;
      if (!nameTouched.value && !p.error) name.value = p.repo.name;
    } catch (e) {
      if (mine === seq) plan.value = null;
    }
  }, 150);
}
watch([input, customDest], () => { startError.value = ""; replan(); });
watch(name, (v) => { if (plan.value && v !== plan.value.repo?.name) nameTouched.value = true; });

// ── Opening ─────────────────────────────────────────────
function looksLikeRepo(text: string): boolean {
  const t = text.trim();
  return /^(https?:\/\/|git@|ssh:\/\/)\S+$/.test(t) && !/\s/.test(t) && t.length < 300;
}

watch(() => clones.sheetOpen, async (open) => {
  if (!open) return;
  startError.value = "";
  const failed = job.value && job.value.state === "failed" ? job.value : null;
  if (failed) {
    // Back to the form it came from, to fix and retry.
    input.value = failed.repo.url;
    name.value = failed.name;
    nameTouched.value = true;
    history.value = (failed.history as History) || "full";
  } else if (!job.value) {
    input.value = clones.sheetInput;
    name.value = "";
    nameTouched.value = false;
    history.value = "full";
    customDest.value = "";
    // A repository address on the clipboard is almost always why the sheet was opened.
    if (!input.value) {
      try {
        const clip = await ClipboardGetText();
        if (clip && looksLikeRepo(clip)) input.value = clip.trim();
      } catch { /* no clipboard outside the desktop shell */ }
    }
  }
  replan();
  await nextTick();
  if (job.value?.state === "running") primaryBtn.value?.focus();
  else { inputEl.value?.focus(); inputEl.value?.select(); }
}, { immediate: true });

// ── Acting ──────────────────────────────────────────────
async function submit() {
  if (!canClone.value || !plan.value) return;
  starting.value = true;
  startError.value = "";
  const retrying = job.value && job.value.state === "failed" ? job.value.id : null;
  try {
    await clones.start({ input: input.value.trim(), dest: customDest.value, history: history.value, name: name.value.trim() });
    if (retrying) clones.drop(retrying);
  } catch (e) {
    startError.value = e instanceof Error ? e.message : String(e);
  } finally {
    starting.value = false;
  }
  await nextTick();
  primaryBtn.value?.focus();
}

async function chooseDest() {
  if (!plan.value || plan.value.error) return;
  try {
    const dest = await ChooseParent(name.value.trim() || plan.value.repo.name);
    if (dest) customDest.value = dest;
  } catch (e) {
    startError.value = e instanceof Error ? e.message : String(e);
  }
}

async function openExisting() {
  const ws = plan.value?.existing;
  if (!ws) return;
  close();
  await workspaces.select(ws.id);
  clones.openRequest++;
}

function close() {
  clones.close();
}

// ── Words ───────────────────────────────────────────────
const now = computed(() => new Date(workspaces.now));

function slugOf(j: clone.Job): string {
  const r = j.repo;
  return r.local ? r.name : [r.owner, r.name].filter(Boolean).join("/");
}

function elapsedOf(j: clone.Job): string {
  return formatElapsed(j.startedAt as any, now.value);
}

const PHASE: Record<string, string> = {
  connecting: "Connecting",
  counting: "Counting objects",
  compressing: "The server is packing the repository",
  receiving: "Receiving",
  resolving: "Resolving deltas",
  checkout: "Writing files",
};
function phaseText(j: clone.Job): string {
  const p = j.progress;
  const label = PHASE[p.phase] ?? "Cloning";
  if (p.phase === "receiving" && p.received) return `${label} ${p.received}${p.rate ? ` at ${p.rate}` : ""}`;
  if (p.phase === "connecting") return `${label} to ${j.repo.host || "the repository"}…`;
  return `${label}…`;
}
</script>
