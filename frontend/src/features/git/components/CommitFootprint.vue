<template>
  <div class="flex min-h-0 flex-col" @keydown.esc="emit('close')">
    <div class="flex items-center gap-2 px-4 pb-2 pt-4">
      <h3 class="ui-section-title">{{ t('git.commitFootprint.commit') }}</h3>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" :aria-label="t('git.commitFootprint.backContributors')" :title="t('git.commitFootprint.backContributorsEsc')" @click="emit('close')"><Icon icon="x" :size="12"/></button>
    </div>
    <div v-if="commit" class="flex flex-col gap-2 px-4">
      <p class="text-sm font-medium leading-5 text-neutral-900">{{ firstLine }}</p>
      <p class="flex flex-wrap items-center gap-x-2 font-mono text-xs text-neutral-500">
        <span :title="commit.commit_hash">{{ commit.commit_hash.slice(0, 10) }}</span>
        <span>{{ formatDate(commit.commit_time) }}</span>
        <span class="text-green-700">{{ formatSigned(additions) }}</span>
        <span class="text-red-700">{{ formatSigned(-deletions) }}</span>
      </p>
      <router-link :to="authors.authorPath(commit.author_name)" class="text-sm text-neutral-700 hover:text-neutral-900 hover:underline">{{ authors.display(commit.author_name) }}</router-link>
      <p class="text-sm text-neutral-700">
        <I18nT k="git.commitFootprint.componentFile"><template #components>{{ t('common.count.component', { count: comps.length }) }}</template><template #files>{{ t('common.count.file', { count: inSnapshot.length }) }}</template><template #span><span v-if="isMerge" class="block text-xs text-neutral-500">{{ t('git.commitFootprint.mergeFilesResolvedMerge') }}</span></template></I18nT>
      </p>
      <div class="flex flex-wrap gap-1.5 py-1">
        <button type="button" class="ui-btn ui-btn-sm" :disabled="!comps.length" :title="t('git.commitFootprint.groupComponentsCommitTouched', { compsLength: comps.length })" @click="makeGroup">{{ made ? t('git.commitFootprint.groupCreated') : t('git.commitFootprint.createGroup') }}</button>
        <router-link :to="connectionsLink" class="ui-btn ui-btn-sm">{{ t('git.commitFootprint.showConnections') }}</router-link>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="copyHash">{{ copied ? t('git.commitFootprint.copied') : t('git.commitFootprint.copyHash') }}</button>
      </div>
    </div>
    <p v-else-if="!loading" class="px-4 text-sm text-neutral-500">{{ t('git.commitFootprint.commitNotSnapshotS') }}</p>

    <ul class="mt-2 flex flex-col pb-4">
      <li v-for="c in comps" :key="c.name" class="px-4 py-1.5 hairline-t">
        <router-link v-if="c.name" :to="componentPath(c.name)" class="block truncate font-mono text-sm text-neutral-900 hover:underline" :title="c.name">{{ c.name }}</router-link>
        <span v-else class="block text-sm text-neutral-500">{{ t('git.commitFootprint.noComponent') }}</span>
        <ul class="mt-0.5 flex flex-col">
          <li v-for="f in c.files" :key="f.file" class="flex items-center gap-2">
            <router-link v-if="f.inSnapshot" :to="filePath(f.file)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-600 hover:underline" :title="f.file">{{ f.file.split("/").pop() }}</router-link>
            <span v-else class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400" :title="t('git.commitFootprint.notSnapshot', { file: f.file })">{{ f.file.split("/").pop() }}</span>
            <span class="font-mono text-[11px] tabular-nums text-neutral-400">{{ formatSigned(f.a) }} {{ formatSigned(-f.d) }}</span>
          </li>
        </ul>
      </li>
    </ul>
    <p v-if="outside" class="px-4 pb-4 text-xs text-neutral-500">{{ t('git.commitFootprint.notSnapshot2', { files: t('common.count.file', { count: outside }) }) }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useAuthorsStore } from "~/features/git/authors.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { useGroupsStore, units } from "~/features/groups/groups.store";
import { copyText } from "~/platform/files";
import { formatSigned } from "~/shared/format";
import { componentPath, filePath } from "~/features/navigation/routes";
import { sqlLiteral } from "~/shared/sql";
import { formatDate } from "~/shared/time";
import { t } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT";

// One commit's architectural footprint: which components it touched, with
// their files nested, and the ways out: a group of them, or the same set
// selected in Connections.

const props = defineProps<{ hash: string }>();
const emit = defineEmits<{ (e: "close"): void }>();
const data = useDataStore();
const authors = useAuthorsStore();
const groups = useGroupsStore();
const made = ref(false);
const copied = ref(false);

interface Row { file: string; component: string | null; a: number; d: number; commit_time: string; commit_message: string; author_name: string; commit_hash: string; in_snapshot: number; change_kind?: string | null }
const { data: rows, loading } = useAsyncQuery<Row[]>(
  () => data.query(`SELECT g.file, g.component, coalesce(g.file_additions, 0) AS a, coalesce(g.file_deletions, 0) AS d, g.commit_time, g.commit_message, g.author_name, g.commit_hash,
      (f.name IS NOT NULL) AS in_snapshot${data.hasColumn("git_commits", "change_kind") ? ", g.change_kind" : ""}
    FROM git_commits g LEFT JOIN files f ON f.name = g.file WHERE g.commit_hash = ${sqlLiteral(props.hash)} ORDER BY g.component, g.file`),
  [() => props.hash],
  { initial: [] },
);
const commit = computed(() => rows.value[0] ?? null);
const firstLine = computed(() => authors.displayText(commit.value?.commit_message).split("\n")[0]);
const isMerge = computed(() => /^Merge /.test(commit.value?.commit_message ?? ""));
const files = computed(() => rows.value.map(r => ({ file: r.file, a: Number(r.a) || 0, d: Number(r.d) || 0, inSnapshot: Number(r.in_snapshot) === 1, component: r.component })));
// Counted over the snapshot's files, as the commit's row counts them.
const inSnapshot = computed(() => files.value.filter(f => f.inSnapshot));
const additions = computed(() => inSnapshot.value.reduce((n, f) => n + f.a, 0));
const deletions = computed(() => inSnapshot.value.reduce((n, f) => n + f.d, 0));
const outside = computed(() => files.value.filter(f => !f.inSnapshot).length);
const comps = computed(() => {
  const by = new Map<string, typeof files.value>();
  for (const f of files.value.filter(x => x.inSnapshot)) by.set(f.component ?? "", [...(by.get(f.component ?? "") ?? []), f]);
  return [...by.entries()].map(([name, fs]) => ({ name, files: fs })).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
});
const componentNames = computed(() => comps.value.map(c => c.name).filter(Boolean));
const connectionsLink = computed(() => `/views/connections?level=components&hl=${encodeURIComponent(JSON.stringify(componentNames.value))}`);

function makeGroup() {
  if (!componentNames.value.length) return;
  groups.createGroup(t("git.commitFootprint.commit2", { hash: props.hash.slice(0, 7) }), units("component", componentNames.value));
  made.value = true;
}
async function copyHash() {
  try { await copyText(props.hash); copied.value = true; setTimeout(() => { copied.value = false; }, 1400); } catch { /* unchanged */ }
}
</script>
