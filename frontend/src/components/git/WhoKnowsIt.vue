<template>
  <ReadingBand v-if="rows.length" title="Who knows it" :lede="lede" to="/views/git/authors?grain=components" link-label="Every component">
    <ul class="flex max-w-[640px] flex-col">
      <li v-for="r in rows.slice(0, 5)" :key="r.author" class="flex h-8 items-center gap-3">
        <router-link :to="authors.authorPath(r.author)" class="w-44 min-w-0 shrink-0 truncate text-base text-neutral-800 hover:underline">{{ authors.display(r.author) }}</router-link>
        <span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100" :title="`${pctOf(r.added)} of the lines added`">
          <span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${Math.max(2, (r.added / total) * 100)}%` }"></span>
        </span>
        <span class="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-600">{{ pctOf(r.added) }}</span>
        <span class="w-40 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500" :title="`Last commit touching this component: ${r.last}`">{{ formatDate(r.last) }} · {{ daysBefore(r.last) }}</span>
      </li>
    </ul>
    <p class="mt-2 text-xs text-neutral-400">Lines added, not blame · bots hidden · aliases merged</p>
  </ReadingBand>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ReadingBand from "~/components/component/ReadingBand.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useAuthorsStore } from "~/stores/authors";
import { useDataStore } from "~/stores/data";
import { componentAuthorsSql, coverCount } from "~/utils/authors";
import { historyAnchor } from "~/utils/history";
import { formatDate } from "~/utils/time";

// Whom to ask about a component: who added its lines, how few of them hold
// most of it, and how long ago the main one last touched it.

const props = defineProps<{ name: string }>();
const data = useDataStore();
const authors = useAuthorsStore();

const { data: rows } = useAsyncQuery<Array<{ author: string; added: number; last: string }>>(
  () => (data.hasView("git_commits") ? data.query(componentAuthorsSql(props.name, authors.aliases, authors.showBots)) : Promise.resolve([])),
  [() => props.name, () => data.datasetKey, () => authors.aliases, () => authors.showBots],
  { initial: [] },
);

const total = computed(() => rows.value.reduce((s, r) => s + Number(r.added), 0) || 1);
const pctOf = (n: number) => `${Math.round((Number(n) / total.value) * 100)}%`;
const anchor = computed(() => { void data.datasetKey; return historyAnchor(); });
const daysBefore = (t: string) => {
  const d = Math.round((anchor.value.date.getTime() - new Date(t).getTime()) / 86400000);
  return d <= 0 ? "at the anchor" : `${d.toLocaleString("en-US")} d before`;
};
const monthYear = (t: string) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const lede = computed(() => {
  if (!rows.value.length) return "";
  const n = coverCount(rows.value.map(r => Number(r.added)), 0.8);
  const main = rows.value[0];
  const who = n === 1 ? "One author added" : `${n} of ${rows.value.length} authors added`;
  const since = daysBefore(main.last);
  const anchorName = anchor.value.source === "commit" ? "the scanned commit" : "the scan";
  const last = since === "at the anchor" ? `the main author's last commit is ${anchorName}` : `the main author's last commit was ${monthYear(main.last)}, ${since} ${anchorName}`;
  return `${who} 80% of the lines; ${last}.`;
});
</script>
