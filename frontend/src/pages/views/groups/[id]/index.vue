<template>
  <div class="min-h-0 grow overflow-y-auto">
    <div v-if="group" class="mx-auto w-full max-w-[1040px] px-6 pb-12 pt-5">
      <StatStrip :cells="strip"/>

      <ReadingBand title="Depends on" :lede="dependsLede">
        <PairTable :rows="dependsRows" :loading="loading" name-label="Group" empty-title="Uses nothing outside itself" empty-text="No file of this group imports a component outside it." export-title="Depends on"/>
      </ReadingBand>

      <ReadingBand title="Used by" :lede="usedLede">
        <PairTable :rows="usedRows" :loading="loading" name-label="Group" empty-title="Nothing outside uses it" empty-text="No file outside this group imports its components." export-title="Used by"/>
      </ReadingBand>

      <ReadingBand v-if="tangles.length" title="Tangles" :lede="`${tangles.length} tangle${tangles.length === 1 ? '' : 's'} reach into this group.`" to="/views/components/cycles" link-label="Cycles">
        <ul class="flex flex-col gap-3">
          <li v-for="t in tangles" :key="t.group" class="flex flex-wrap gap-1.5">
            <router-link v-for="m in t.members" :key="m" :to="componentPath(m)" class="ui-chip font-mono" :class="{ 'is-active': memberSet.has(m) }" :title="memberSet.has(m) ? 'In this group' : 'Outside this group'">{{ m }}</router-link>
          </li>
        </ul>
      </ReadingBand>

      <ReadingBand v-if="hottest.length" title="Hottest files" lede="The files that change most, weighted by size: where work in this group concentrates." to="/views/components/hotspots" link-label="Hotspots">
        <ul class="flex flex-col">
          <li v-for="f in hottest" :key="f.name" class="flex h-7 items-center gap-3">
            <router-link :to="filePath(f.name)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-900 hover:underline" :title="f.name">{{ f.name }}</router-link>
            <span class="font-mono text-xs tabular-nums text-neutral-500">{{ Math.round(f.hotspot) }}</span>
          </li>
        </ul>
      </ReadingBand>

      <ReadingBand v-if="knowers.length" title="Who knows it" lede="The people who wrote most of what is here, by lines added, bots left out.">
        <ul class="flex flex-col">
          <li v-for="a in knowers" :key="a.name" class="flex h-7 items-center gap-3">
            <router-link :to="authors.authorPath(a.name)" class="min-w-0 flex-1 truncate text-sm text-neutral-900 hover:underline">{{ authors.display(a.name) }}</router-link>
            <span class="font-mono text-xs tabular-nums text-neutral-500">{{ a.commits.toLocaleString("en-US") }} commits · {{ a.additions.toLocaleString("en-US") }} lines</span>
          </li>
        </ul>
      </ReadingBand>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import StatStrip, { type StatCell } from "~/components/detail/StatStrip.vue"
import ReadingBand from "~/components/component/ReadingBand.vue"
import PairTable, { type PairRow } from "~/components/coupling/PairTable.vue"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { OUTSIDE, useGroupDetail } from "~/composables/useGroupDetail"
import { useAuthorsStore } from "~/stores/authors"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { authorStatsSql, periodStats } from "~/utils/authors"
import { anchorSql } from "~/utils/history"
import { componentPath, filePath, groupPath } from "~/utils/routes"
import { sqlLiteral } from "~/utils/sql"

const route = useRoute()
const data = useDataStore()
const groupsStore = useGroupsStore()
const authors = useAuthorsStore()
const id = computed(() => String(route.params.id ?? ""))
const { group, components, fileSql, outgoing, incoming, ca, ce, instability, insideShare, loading } = useGroupDetail(id)
const memberSet = computed(() => new Set(components.value))
const pct = (v: number) => `${Math.round(v * 100)}%`

const strip = computed<StatCell[]>(() => [
  { label: "Used by", value: `${ca.value.toLocaleString("en-US")} files`, title: "Files outside the group that import it (afferent coupling)" },
  { label: "Uses", value: `${ce.value.toLocaleString("en-US")} components`, title: "Components outside the group its files import (efferent coupling)" },
  { label: "Instability", value: instability.value === null ? "—" : instability.value.toFixed(2), title: "Uses / (used by + uses): 0 is depended on, 1 depends" },
  { label: "Stays inside", value: insideShare.value === null ? "—" : pct(insideShare.value), title: "Share of the references its files make that land inside the group" },
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
    name: gid === OUTSIDE ? "Outside any group" : groupsStore.getGroupById(gid)?.name ?? gid,
    to: gid === OUTSIDE ? undefined : groupPath(gid),
    references: v.refs,
    files: v.files.size,
  }))
}
const dependsRows = computed(() => pairRows(outgoing.value, "toGroup"))
const usedRows = computed(() => pairRows(incoming.value, "fromGroup"))
const dependsLede = computed(() => dependsRows.value.length ? `Its files import ${dependsRows.value.length} other part${dependsRows.value.length === 1 ? "" : "s"} of the code, read by ${group.value?.dimension}.` : "")
const usedLede = computed(() => usedRows.value.length ? `${usedRows.value.length} other part${usedRows.value.length === 1 ? "" : "s"} of the code import it.` : "")

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
