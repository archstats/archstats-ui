<template>
  <section class="flex flex-col gap-1.5">
    <h3 class="ui-section-title">Shared commits<span v-if="rows.length" class="ml-1.5 font-mono text-neutral-400">{{ rows.length }}</span></h3>
    <p v-if="loading" class="text-sm text-neutral-500">Reading commits…</p>
    <p v-else-if="!rows.length" class="text-sm text-neutral-500">No commit touched both, sweeping commits left out.</p>
    <ul v-else class="flex flex-col">
      <li v-for="c in rows.slice(0, shown)" :key="c.commit_hash" class="flex flex-col py-1 hairline-b last:border-0">
        <span class="truncate text-sm text-neutral-900" :title="authors.displayText(c.commit_message)">{{ authors.displayText(c.commit_message).split("\n")[0] }}</span>
        <span class="flex items-center gap-2 font-mono text-xs text-neutral-500">
          <span :title="c.commit_hash">{{ c.commit_hash.slice(0, 7) }}</span>
          <span>{{ formatDate(c.commit_time) }}</span>
          <router-link :to="authors.authorPath(c.author_name)" class="truncate hover:text-neutral-900 hover:underline">{{ authors.display(c.author_name) }}</router-link>
        </span>
      </li>
    </ul>
    <button v-if="rows.length > shown" type="button" class="self-start text-xs text-neutral-500 hover:text-neutral-900" @click="shown += 20">Show {{ Math.min(20, rows.length - shown) }} more</button>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useAuthorsStore } from "~/stores/authors";
import { useDataStore } from "~/stores/data";
import { formatDate } from "~/utils/time";

// The evidence behind a co-change number: the commits that touched both
// sides, newest first, within the same sweep limit the count uses.

const props = defineProps<{ aFiles: string; bFiles: string }>();
const data = useDataStore();
const authors = useAuthorsStore();
const shown = ref(20);
watch(() => [props.aFiles, props.bFiles], () => { shown.value = 20; });

const { data: rows, loading } = useAsyncQuery<Array<{ commit_hash: string; commit_time: string; commit_message: string; author_name: string }>>(
  async () => {
    if (!data.hasView("git_commits")) return [];
    const [lim] = await data.query<{ v: string | null }>(`SELECT (SELECT value FROM _snapshot WHERE key = 'git_max_changes_per_commit' LIMIT 1) AS v`).catch(() => [{ v: null }]);
    const max = Number(lim?.v) || 100;
    return data.query(`SELECT commit_hash, max(commit_time) AS commit_time, max(commit_message) AS commit_message, max(author_name) AS author_name
      FROM git_commits
      WHERE ${props.aFiles} AND commit_hash IN (SELECT commit_hash FROM git_commits WHERE ${props.bFiles})
        AND commit_hash IN (SELECT commit_hash FROM git_commits GROUP BY commit_hash HAVING count(DISTINCT file) <= ${max})
      GROUP BY commit_hash ORDER BY commit_time DESC`);
  },
  [() => props.aFiles, () => props.bFiles],
  { initial: [] },
);
</script>
