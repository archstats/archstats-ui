<template>
  <!-- Where the comparison starts, chosen as a point in the code's history.
       The open snapshot is always the newer side; the range it reads is
       written out at the end of the row. -->
  <div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 hairline-b">
    <span class="ui-label">{{ t('trends.sinceBar.since') }}</span>
    <div class="ui-segmented" role="group" :aria-label="t('trends.sinceBar.since')">
      <button v-if="previous" type="button" :aria-pressed="isPrevious" :title="t('trends.sinceBar.previousTitle')" @click="emit('update:since', { kind: 'scan', id: previous.id })">
        {{ t('trends.sinceBar.previous', { date: shortDate(previous.headTime ?? previous.startedAt) }) }}
      </button>
      <button v-for="m in AGO_MONTHS" :key="m" type="button" :aria-pressed="since.kind === 'ago' && since.months === m" @click="emit('update:since', { kind: 'ago', months: m })">
        {{ t('trends.sinceBar.monthsAgo', { count: m }) }}
      </button>
    </div>

    <!-- A tag, a commit, or an earlier snapshot. -->
    <div class="relative">
      <button ref="pickBtn" type="button" class="ui-chip" :class="{ 'is-active': isPicked }" :aria-expanded="open" @click="toggle">
        <Icon icon="git-commit" :size="13" class="text-neutral-500"/>
        <span class="max-w-[220px] truncate" :class="isPicked ? 'font-mono' : ''">{{ pickedLabel }}</span>
        <Icon icon="chevron-down" :size="13" class="text-neutral-400"/>
      </button>
      <div v-if="open" class="fixed inset-0 z-40 cursor-default" @click="open = false"></div>
      <div v-if="open" class="ui-popover absolute left-0 z-50 mt-1 flex w-[340px] flex-col animate-in" role="dialog" :aria-label="t('trends.sinceBar.pickPoint')">
        <form class="p-2 hairline-b" @submit.prevent="submitRef">
          <input ref="refInput" v-model="typed" class="ui-input ui-input-sm w-full font-mono" :placeholder="t('trends.sinceBar.refPlaceholder')" :aria-label="t('trends.sinceBar.refPlaceholder')" spellcheck="false" autocomplete="off"/>
        </form>
        <div class="max-h-[320px] overflow-y-auto p-1">
          <p v-if="tagsLoading" class="px-2 py-1.5 text-sm text-neutral-500">{{ t('trends.sinceBar.readingTags') }}</p>
          <template v-else-if="shownTags.length">
            <p class="ui-section-title px-2 pb-1 pt-1.5">{{ t('trends.sinceBar.tags') }}</p>
            <button v-for="tag in shownTags" :key="tag.ref" type="button" class="ui-menu-item w-full justify-between gap-3" :disabled="!!tag.unavailable" :title="tag.unavailable || tag.sha"
                    :class="{ 'is-active': since.kind === 'ref' && since.ref === tag.ref }" @click="pick({ kind: 'ref', ref: tag.ref })">
              <span class="truncate font-mono text-sm">{{ tag.ref }}</span>
              <span class="shrink-0 font-mono text-sm text-neutral-500">{{ shortDate(tag.time) }}</span>
            </button>
          </template>
          <template v-if="snapshots.length">
            <p class="ui-section-title px-2 pb-1 pt-2">{{ t('trends.sinceBar.snapshots') }}</p>
            <button v-for="s in snapshots" :key="s.id" type="button" class="ui-menu-item w-full justify-between gap-3"
                    :class="{ 'is-active': since.kind === 'scan' && since.id === s.id }" @click="pick({ kind: 'scan', id: s.id })">
              <span class="truncate"><span class="font-mono text-sm">{{ (s.headCommit || "").slice(0, 7) || "–" }}</span><span v-if="s.label" class="ml-2 text-neutral-600">{{ s.label }}</span></span>
              <span class="shrink-0 font-mono text-sm text-neutral-500">{{ shortDate(s.headTime ?? s.startedAt) }}<span class="ml-2 text-neutral-400">r{{ s.analysisRevision || "?" }}</span></span>
            </button>
          </template>
          <p v-if="!tagsLoading && !shownTags.length && !snapshots.length" class="px-2 py-1.5 text-sm text-neutral-500">{{ t('trends.sinceBar.noTags') }}</p>
        </div>
      </div>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-2 font-mono text-sm text-neutral-500">
      <template v-if="base">
        <span class="truncate" :title="base.subject">{{ base.sha.slice(0, 7) }} <span class="text-neutral-400">{{ shortDate(base.time) }}</span></span>
        <Icon icon="arrow-right" :size="12" class="shrink-0 text-neutral-400"/>
      </template>
      <span class="truncate text-neutral-800" :title="t('trends.sinceBar.openSnapshot')">{{ (head?.headCommit || "").slice(0, 7) || t('trends.sinceBar.workingCopy') }} <span class="text-neutral-400">{{ head ? shortDate(head.headTime ?? head.startedAt) : "" }}</span></span>
      <span v-if="commits !== null" class="shrink-0 font-sans text-neutral-500">· {{ t('trends.reading.commits', { count: commits }) }}</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-1 shrink-0 font-sans" :title="t('trends.sinceBar.pickSnapshotsTitle')" @click="emit('pickSnapshots')">{{ t('trends.sinceBar.pickSnapshots') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Tags } from "wailsjs/go/app/ScanService";
import Icon from "~/shared/ui/Icon.vue";
import { AGO_MONTHS, sameCommit, type Since } from "~/features/trends/since";
import { dateLocale, t } from "~/shared/i18n";

const props = defineProps<{
  since: Since
  workspaceId: string | null
  /** The open snapshot. */
  head: any
  /** The previous snapshot of other code read alike, when there is one. */
  previous: any | null
  /** Snapshots of other commits than head's, newest first. */
  snapshots: any[]
  /** The commit the point resolved to. */
  base: { sha: string; time: string; subject: string } | null
  commits: number | null
}>();
const emit = defineEmits<{ (e: "update:since", s: Since): void; (e: "pickSnapshots"): void }>();

const shortDate = (v: string | Date | null | undefined) => {
  if (!v) return "";
  const d = new Date(v);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(dateLocale, thisYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
};

const isPrevious = computed(() => props.since.kind === "scan" && props.previous?.id === props.since.id);
const isPicked = computed(() => props.since.kind === "ref" || (props.since.kind === "scan" && !isPrevious.value));
const pickedLabel = computed(() => {
  const s = props.since;
  if (s.kind === "ref") return /^[0-9a-f]{12,40}$/i.test(s.ref) ? s.ref.slice(0, 7) : s.ref;
  if (s.kind === "scan" && !isPrevious.value) {
    const scan = props.snapshots.find(x => x.id === s.id);
    return scan ? `${(scan.headCommit || "").slice(0, 7)} · ${shortDate(scan.headTime ?? scan.startedAt)}` : t("trends.sinceBar.snapshot");
  }
  return t("trends.sinceBar.tagOrCommit");
});

// Tags, read once per workspace and only when the menu first opens.
const tags = ref<Array<{ ref: string; sha: string; time: string; unavailable: string }>>([]);
const tagsLoading = ref(false);
let tagsFor = "";
async function loadTags() {
  if (!props.workspaceId || tagsFor === props.workspaceId) return;
  tagsFor = props.workspaceId;
  tagsLoading.value = true;
  try { tags.value = ((await Tags(props.workspaceId)) as any[]) ?? []; } catch { tags.value = []; } finally { tagsLoading.value = false; }
}
watch(() => props.workspaceId, () => { tagsFor = ""; tags.value = []; });
const shownTags = computed(() => {
  const q = typed.value.trim().toLowerCase();
  // Newest first, and never head's own commit: there is nothing to compare.
  return [...tags.value].filter(x => !sameCommit(x.sha, props.head?.headCommit)).filter(x => !q || x.ref.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 40);
});

const open = ref(false);
const typed = ref("");
const refInput = ref<HTMLInputElement | null>(null);
async function toggle() {
  open.value = !open.value;
  if (open.value) { typed.value = ""; void loadTags(); await nextTick(); refInput.value?.focus(); }
}
function pick(s: Since) { open.value = false; emit("update:since", s); }
function submitRef() {
  const r = typed.value.trim();
  if (r) pick({ kind: "ref", ref: r });
}
</script>
