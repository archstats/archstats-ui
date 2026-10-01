<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 pt-[10vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover flex max-h-[76vh] w-[560px] max-w-[92vw] flex-col animate-in" role="dialog" aria-modal="true" aria-labelledby="tags-title">
        <header class="px-5 pb-3 pt-4 hairline-b">
          <h2 id="tags-title" class="text-base font-semibold text-neutral-900">{{ t('workspace.scanTagsSheet.scanTags') }}</h2>
          <p class="mt-1 text-sm leading-5 text-neutral-600">
            {{ t('workspace.scanTagsSheet.eachTagScannedOwn') }}
          </p>
        </header>
        <div class="min-h-0 grow overflow-y-auto px-3 py-2">
          <p v-if="loading" class="px-2 py-3 text-sm text-neutral-500">{{ t('workspace.scanTagsSheet.readingTags') }}</p>
          <p v-else-if="error" class="px-2 py-3 text-sm text-red-700">{{ error }}</p>
          <p v-else-if="!tags.length" class="px-2 py-3 text-sm text-neutral-500">{{ t('workspace.scanTagsSheet.repositoryHasNoTags') }}</p>
          <template v-else>
            <div class="flex items-center gap-3 px-2 pb-1 text-xs text-neutral-500">
              <button type="button" class="hover:text-neutral-900" @click="pickNewest(8)">{{ t('workspace.scanTagsSheet.newest8') }}</button>
              <button type="button" class="hover:text-neutral-900" @click="picked = new Set()">{{ t('workspace.scanTagsSheet.none') }}</button>
              <span class="ml-auto">{{ t('workspace.scanTagsSheet.tags', { tagsLength: tags.length }) }}</span>
            </div>
            <ul class="flex flex-col">
              <li v-for="tag in tags" :key="tag.ref">
                <label class="flex h-8 items-center gap-2.5 rounded px-2" :class="tag.unavailable || scanned.has(tag.sha) ? 'text-neutral-400' : 'hover:bg-neutral-50'">
                  <Checkbox :model-value="picked.has(tag.ref)" :disabled="!!tag.unavailable" :aria-label="t('workspace.scanTagsSheet.scan', { ref: tag.ref })" @update:model-value="toggle(tag.ref)"/>
                  <span class="min-w-0 flex-1 truncate font-mono text-sm" :class="tag.unavailable ? '' : 'text-neutral-900'">{{ tag.ref }}</span>
                  <span v-if="tag.unavailable" class="shrink-0 text-xs" :title="tag.unavailable">{{ t('workspace.scanTagsSheet.notClone') }}</span>
                  <span v-else-if="scanned.has(tag.sha)" class="ui-tag shrink-0" :title="t('workspace.scanTagsSheet.snapshotCommitExistsAlready')">{{ t('workspace.scanTagsSheet.scanned') }}</span>
                  <span class="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">{{ formatDay(tag.time) }}</span>
                </label>
              </li>
            </ul>
          </template>
        </div>
        <footer class="flex items-center gap-2 px-5 py-3 hairline-t">
          <span class="text-sm text-neutral-600">{{ estimate }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="close">{{ t('workspace.scanTagsSheet.cancel') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!picked.size || starting" @click="start">
            {{ starting ? t('workspace.scanTagsSheet.queuing') : t('workspace.scanTagsSheet.scan2', { value: picked.size || "", tags: t('common.noun.tag', { count: picked.size }) }) }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Enqueue, Tags } from "wailsjs/go/app/ScanService";
import Checkbox from "~/shared/ui/Checkbox.vue";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { formatBytes } from "~/shared/format";
import { t, dateLocale } from "~/shared/i18n";

// Backfilling history: pick tags, see what it will cost, queue them. Each
// is a clean clone at the tag's commit, so the series is on one analysis.

interface Tag { ref: string; sha: string; time: string; unavailable: string }

const open = defineModel<boolean>({ default: false });
const workspaces = useWorkspacesStore();
const tags = ref<Tag[]>([]);
const picked = ref<Set<string>>(new Set());
const loading = ref(false);
const starting = ref(false);
const error = ref("");

const scanned = computed(() => new Set(workspaces.scans.filter((s: any) => s.status === "complete" && s.headCommit).map((s: any) => String(s.headCommit))));

watch(open, async (o) => {
  if (!o || !workspaces.active) return;
  loading.value = true; error.value = ""; picked.value = new Set();
  try {
    tags.value = ((await Tags(workspaces.active.id)) ?? []) as any;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

function toggle(ref: string) { const s = new Set(picked.value); s.has(ref) ? s.delete(ref) : s.add(ref); picked.value = s; }
function pickNewest(n: number) {
  picked.value = new Set(tags.value.filter(t => !t.unavailable && !scanned.value.has(t.sha)).slice(0, n).map(t => t.ref));
}

// The estimate is the last complete scan, times the number of tags.
const estimate = computed(() => {
  const n = picked.value.size;
  if (!n) return "";
  const last: any = workspaces.scans.find((s: any) => s.status === "complete" && s.finishedAt);
  if (!last) return t("workspace.scanTagsSheet.scans", { n });
  const secs = (new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime()) / 1000;
  const total = secs * n;
  const time = total < 90 ? `~${Math.max(5, Math.round(total))} s` : total < 5400 ? t("workspace.scanTagsSheet.min", { value: Math.round(total / 60) }) : `~${(total / 3600).toFixed(1)} h`;
  const size = last.sizeBytes ? ` · ~${formatBytes(Number(last.sizeBytes) * n)}` : "";
  return t("workspace.scanTagsSheet.text", { scans: t("common.count.scan", { count: n }), time, size });
});

const formatDay = (t: string) => (t ? new Date(t).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "");

async function start() {
  if (!workspaces.active || !picked.value.size) return;
  starting.value = true;
  try {
    // Oldest first, so the history fills in the order it happened.
    const revs = tags.value.filter(t => picked.value.has(t.ref)).reverse();
    await Enqueue(workspaces.active.id, revs as any);
    close();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    starting.value = false;
  }
}
function close() { open.value = false; }
</script>
