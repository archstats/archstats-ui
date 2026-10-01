<template>
  <div class="min-h-0 grow overflow-y-auto">
    <div v-if="group" class="mx-auto w-full max-w-[1040px] px-6 pb-12 pt-5">
      <StatStrip :cells="strip"/>

      <ReadingBand :title="t('pages.groupsIndex.depends')" :lede="dependsLede">
        <PairTable :rows="dependsRows" :loading="loading" :name-label="t('pages.groupsIndex.group2')" :empty-title="t('pages.groupsIndex.usesNothingOutsideItself')" :empty-text="t('pages.groupsIndex.noFileGroupImports')" :export-title="t('pages.groupsIndex.depends')"/>
      </ReadingBand>

      <ReadingBand :title="t('pages.groupsIndex.used')" :lede="usedLede">
        <PairTable :rows="usedRows" :loading="loading" :name-label="t('pages.groupsIndex.group2')" :empty-title="t('pages.groupsIndex.nothingOutsideUses')" :empty-text="t('pages.groupsIndex.noFileOutsideGroup')" :export-title="t('pages.groupsIndex.used')"/>
      </ReadingBand>

      <ReadingBand v-if="tangles.length" :title="t('pages.groupsIndex.tangles')" :lede="t('pages.groupsIndex.reachGroup', { tangles: t('common.count.tangle', { count: tangles.length }) })" to="/views/components/cycles" :link-label="t('pages.groupsIndex.cycles')">
        <ul class="flex flex-col gap-3">
          <li v-for="tangle in tangles" :key="tangle.group" class="flex flex-wrap gap-1.5">
            <router-link v-for="m in t.members" :key="m" :to="componentPath(m)" class="ui-chip font-mono" :class="{ 'is-active': memberSet.has(m) }" :title="memberSet.has(m) ? t('pages.groupsIndex.group') : t('pages.groupsIndex.outsideGroup')">{{ m }}</router-link>
          </li>
        </ul>
      </ReadingBand>

      <ReadingBand v-if="hottest.length" :title="t('pages.groupsIndex.hottestFiles')" :lede="t('pages.groupsIndex.filesChangeMostWeighted')" to="/views/components/hotspots" :link-label="t('pages.groupsIndex.hotspots')">
        <ul class="flex flex-col">
          <li v-for="f in hottest" :key="f.name" class="flex h-7 items-center gap-3">
            <router-link :to="filePath(f.name)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-900 hover:underline" :title="f.name">{{ f.name }}</router-link>
            <span class="font-mono text-xs tabular-nums text-neutral-500">{{ Math.round(f.hotspot) }}</span>
          </li>
        </ul>
      </ReadingBand>

      <ReadingBand v-if="knowers.length" :title="t('pages.groupsIndex.whoKnows')" :lede="t('pages.groupsIndex.peopleWhoWroteMost')">
        <ul class="flex flex-col">
          <li v-for="a in knowers" :key="a.name" class="flex h-7 items-center gap-3">
            <router-link :to="authors.authorPath(a.name)" class="min-w-0 flex-1 truncate text-sm text-neutral-900 hover:underline">{{ authors.display(a.name) }}</router-link>
            <span class="font-mono text-xs tabular-nums text-neutral-500">{{ t('pages.groupsIndex.commitsLines', { value: a.commits.toLocaleString(intlLocale), value2: a.additions.toLocaleString(intlLocale) }) }}</span>
          </li>
        </ul>
      </ReadingBand>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import StatStrip, { type StatCell } from "~/features/metrics/components/StatStrip.vue"
import ReadingBand from "~/shared/ui/ReadingBand.vue"
import PairTable, { type PairRow } from "~/features/connections/components/PairTable.vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { OUTSIDE, useGroupDetail } from "~/features/groups/useGroupDetail"
import { useAuthorsStore } from "~/features/git/authors.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { authorStatsSql, periodStats } from "~/features/git/authors"
import { anchorSql } from "~/features/git/history"
import { componentPath, filePath, groupPath } from "~/features/navigation/routes"
import { sqlLiteral } from "~/shared/sql"
import { t, intlLocale } from "~/shared/i18n"

const route = useRoute()
const data = useDataStore()
const groupsStore = useGroupsStore()
const authors = useAuthorsStore()
const id = computed(() => String(route.params.id ?? ""))
const { group, components, fileSql, outgoing, incoming, ca, ce, instability, insideShare, loading } = useGroupDetail(id)
const memberSet = computed(() => new Set(components.value))
const pct = (v: number) => `${Math.round(v * 100)}%`

const strip = computed<StatCell[]>(() => [
  { label: t("pages.groupsIndex.used"), value: `${ca.value.toLocaleString(intlLocale)} files`, title: t("pages.groupsIndex.filesOutsideGroupImport") },
  { label: t("pages.groupsIndex.uses"), value: `${ce.value.toLocaleString(intlLocale)} components`, title: t("pages.groupsIndex.componentsOutsideGroupFiles") },
  { label: t("pages.groupsIndex.instability"), value: instability.value === null ? "—" : instability.value.toFixed(2), title: t("pages.groupsIndex.usesUsedUses0") },
  { label: t("pages.groupsIndex.staysInside"), value: insideShare.value === null ? "—" : pct(insideShare.value), title: t("pages.groupsIndex.shareReferencesFilesMake") },
])

function pairRows(list: typeof outgoing.value, side: "toGroup" | "fromGroup"): PairRow[] {
  const by = new Map<string, { refs: number; files: Set<string> }>()
  for (const e of list) {
    const k = e[side]
    const cur = by.get(k) ?? { refs: 0, files: new Set<string>() }
    cur.refs += e.refs
    cur.files.add(e.file)
    by.set(k, cur)
  }
  return [...by.entries()].map(([gid, v]) => ({
    name: gid === OUTSIDE ? t("pages.groupsIndex.outsideAnyGroup") : groupsStore.getGroupById(gid)?.name ?? gid,
    to: gid === OUTSIDE ? undefined : groupPath(gid),
    references: v.refs,
    files: v.files.size,
  }))
}
const dependsRows = computed(() => pairRows(outgoing.value, "toGroup"))
const usedRows = computed(() => pairRows(incoming.value, "fromGroup"))
const dependsLede = computed(() => dependsRows.value.length ? t("pages.groupsIndex.filesImportOtherCode", { dependsRowsLength: dependsRows.value.length, parts: t("common.noun.part", { count: dependsRows.value.length }), dimension: group.value?.dimension }) : "")
const usedLede = computed(() => usedRows.value.length ? t("pages.groupsIndex.otherCodeImport", { usedRowsLength: usedRows.value.length, parts: t("common.noun.part", { count: usedRows.value.length }) }) : "")

const { data: tangles } = useAsyncQuery<Array<{ group: string; members: string[] }>>(
  async () => {
    if (!components.value.length || !data.hasView("component_strongly_connected_groups")) return []
    const rows = await data.query<{ group: string; component: string }>(`SELECT "group", component FROM component_strongly_connected_groups WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups WHERE component IN (${components.value.map(sqlLiteral).join(", ")})) AND "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1) ORDER BY 1, 2`)
    const by = new Map<string, string[]>()
    for (const r of rows) by.set(r.group, [...(by.get(r.group) ?? []), r.component])
    return [...by.entries()].map(([group, members]) => ({ group, members }))
  },
  [components],
  { initial: [] },
)
const { data: hottest } = useAsyncQuery<Array<{ name: string; hotspot: number }>>(
  () => data.query(`SELECT name, codesmells__hotspot_score AS hotspot FROM files WHERE ${fileSql.value.replace(/^file /, "name ")} AND codesmells__hotspot_score > 0 ORDER BY 2 DESC LIMIT 5`),
  [fileSql],
  { initial: [] },
)
const { data: knowers } = useAsyncQuery<Array<{ name: string; commits: number; additions: number }>>(
  async () => {
    if (!data.hasView("git_commits")) return []
    const rows = await data.query<Record<string, any>>(authorStatsSql(fileSql.value, { aliases: authors.aliases, anchor: anchorSql() }))
    return rows.map(r => ({ name: String(r.author_name), ...periodStats(r, "total") })).sort((a, b) => b.additions - a.additions).slice(0, 6)
  },
  [fileSql, () => authors.aliases],
  { initial: [] },
)
</script>
