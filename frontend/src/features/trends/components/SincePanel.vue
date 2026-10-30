<template>
  <!-- What stands between the point picked and a comparison, and the one
       button that clears it. Never a dead end: every state names its way on. -->
  <div class="mx-auto flex w-full max-w-[600px] flex-col gap-4 px-6 py-14">
    <template v-if="state === 'scanning'">
      <LoadingState :text="t('trends.sincePanel.scanning', { sha: short, date: when })"/>
    </template>

    <template v-else-if="state === 'same'">
      <EmptyState icon="check" :title="sinceIsTime ? t('trends.sincePanel.noCommitsTitle') : t('trends.sincePanel.sameCommitTitle')"
                  :text="sinceIsTime ? t('trends.sincePanel.noCommitsText', { point, sha: short }) : t('trends.sincePanel.sameCommitText', { sha: short })"/>
    </template>

    <template v-else-if="state === 'outdated' || state === 'scan'">
      <h2 class="text-lg font-semibold text-neutral-900">{{ t('trends.sincePanel.readAsItWas', { point }) }}</h2>
      <dl v-if="commit" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt class="text-neutral-500">{{ t('trends.sincePanel.commit') }}</dt><dd class="font-mono text-sm leading-6 text-neutral-900">{{ commit.sha.slice(0, 12) }}</dd>
        <dt class="text-neutral-500">{{ t('trends.sincePanel.committed') }}</dt><dd class="text-neutral-900">{{ when }}</dd>
        <dt class="text-neutral-500">{{ t('trends.sincePanel.subject') }}</dt><dd class="text-neutral-900">{{ subject }}</dd>
      </dl>

      <template v-if="state === 'outdated'">
        <p class="text-base leading-6 text-neutral-700">{{ t('trends.sincePanel.headOutdated', { head: headRevision, engine: engineRevision }) }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="ui-btn ui-btn-primary" :disabled="workspaces.isScanning" @click="workspaces.startScan()">{{ t('trends.sincePanel.scanWorkingCopy') }}</button>
          <button v-for="o in other.slice(0, 1)" :key="o.id" type="button" class="ui-btn" @click="emit('anyway', o.id)">{{ t('trends.sincePanel.compareAnyway', { revision: o.analysisRevision || '?' }) }}</button>
        </div>
      </template>
      <template v-else>
        <p class="text-base leading-6 text-neutral-700">{{ t('trends.sincePanel.scanExplain', { revision: engineRevision }) }}<template v-if="estimate">{{ ' ' + t('trends.sincePanel.takesAbout', { estimate }) }}</template></p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="ui-btn ui-btn-primary" :disabled="!commit || starting || workspaces.isScanning" @click="start">
            {{ starting ? t('trends.sincePanel.starting') : t('trends.sincePanel.scanAndCompare', { sha: short }) }}
          </button>
          <button v-for="o in other.slice(0, 1)" :key="o.id" type="button" class="ui-btn" :title="t('trends.sincePanel.anywayTitle')" @click="emit('anyway', o.id)">{{ t('trends.sincePanel.compareAnyway', { revision: o.analysisRevision || '?' }) }}</button>
        </div>
        <p v-if="workspaces.isScanning && !starting" class="text-sm text-neutral-500">{{ t('trends.sincePanel.otherScanRunning') }}</p>
        <p v-if="startError" class="text-sm text-red-700">{{ startError }}</p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useAuthorsStore } from "~/features/git/authors.store";
import { formatScanTime } from "~/shared/time";
import { t } from "~/shared/i18n";

const props = defineProps<{
  state: "same" | "outdated" | "scan" | "scanning"
  commit: { sha: string; time: string; subject: string } | null
  /** How the point reads in a sentence: "3 months back", "v1.2.0". */
  point: string
  sinceIsTime: boolean
  other: any[]
  headRevision: number | null
  engineRevision: number | null
}>();
const emit = defineEmits<{ (e: "anyway", scanId: string): void }>();

const workspaces = useWorkspacesStore();
const authors = useAuthorsStore();
const short = computed(() => props.commit?.sha.slice(0, 7) ?? "");
const when = computed(() => (props.commit?.time ? formatScanTime(props.commit.time) : ""));
const subject = computed(() => authors.displayText(props.commit?.subject ?? ""));

// The last scan's duration is the best guess at the next one's.
const estimate = computed(() => {
  const last: any = workspaces.scans.find((s: any) => s.status === "complete" && s.finishedAt);
  if (!last) return "";
  const secs = (new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime()) / 1000;
  return secs < 90 ? `${Math.max(5, Math.round(secs))} s` : t("trends.sincePanel.minutes", { value: Math.round(secs / 60) });
});

const starting = ref(false);
const startError = ref("");
async function start() {
  if (!props.commit) return;
  starting.value = true;
  startError.value = "";
  try {
    await workspaces.startScanAt(props.commit.sha);
  } catch (e) {
    startError.value = e instanceof Error ? e.message : String(e);
  } finally {
    starting.value = false;
  }
}
</script>
