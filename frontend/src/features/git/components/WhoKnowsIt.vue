<template>
  <ReadingBand v-if="rows.length" :title="t('git.whoKnowsIt.whoKnows')" :lede="lede" to="/views/git/authors?grain=components" :link-label="t('git.whoKnowsIt.everyComponent')">
    <ul class="flex max-w-[640px] flex-col">
      <li v-for="r in rows.slice(0, 5)" :key="r.author" class="flex h-8 items-center gap-3">
        <router-link :to="authors.authorPath(r.author)" class="w-44 min-w-0 shrink-0 truncate text-base text-neutral-800 hover:underline">{{ authors.display(r.author) }}</router-link>
        <span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100" :title="t('git.whoKnowsIt.linesAdded', { added: pctOf(r.added) })">
          <span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${Math.max(2, (r.added / total) * 100)}%` }"></span>
        </span>
        <span class="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-600">{{ pctOf(r.added) }}</span>
        <span class="w-40 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500" :title="t('git.whoKnowsIt.lastCommitTouchingComponent', { last: r.last })">{{ formatDate(r.last) }} · {{ daysBefore(r.last) }}</span>
      </li>
    </ul>
    <p class="mt-2 text-xs text-neutral-400">{{ t('git.whoKnowsIt.linesAddedNotBlame') }}</p>
  </ReadingBand>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ReadingBand from "~/shared/ui/ReadingBand.vue";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useAuthorsStore } from "~/features/git/authors.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { componentAuthorsSql, coverCount } from "~/features/git/authors";
import { historyAnchor } from "~/features/git/history";
import { formatDate } from "~/shared/time";
import { t, dateLocale } from "~/shared/i18n";

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
const daysBeforeAnchor = (text: string) => Math.round((anchor.value.date.getTime() - new Date(text).getTime()) / 86400000);
const daysBefore = (text: string) => {
  const d = daysBeforeAnchor(text);
  return d <= 0 ? t("git.whoKnowsIt.atAnchor") : t("git.whoKnowsIt.dBefore", { value: d });
};
const monthYear = (t: string) => new Date(t).toLocaleDateString(dateLocale, { month: "short", year: "numeric" });

const lede = computed(() => {
  if (!rows.value.length) return "";
  const n = coverCount(rows.value.map(r => Number(r.added)), 0.8);
  const main = rows.value[0];
  const who = n === 1 ? t("git.whoKnowsIt.oneAuthorAdded") : t("git.whoKnowsIt.authorsAdded", { n, rowsLength: rows.value.length });
  const days = daysBeforeAnchor(main.last);
  const anchorName = anchor.value.source === "commit" ? t("git.whoKnowsIt.scannedCommit") : t("git.whoKnowsIt.scan");
  const last = days <= 0 ? t("git.whoKnowsIt.mainAuthorSLast", { anchorName }) : t("git.whoKnowsIt.mainAuthorSLast2", { last: monthYear(main.last), since: t("git.whoKnowsIt.dBefore", { value: days }), anchorName });
  return t("git.whoKnowsIt.text80Lines", { who, last });
});
</script>
