<template>
  <div class="flex min-h-0 grow flex-col">
    <LoadingState v-if="k.loading.value && !k.rows.value.length" :text="t('git.knowledgeView.checkingWhoStillActive')"/>
    <EmptyState v-else-if="k.error.value" :title="t('git.knowledgeView.couldNotReadWho')" :text="k.error.value" icon="alert"/>
    <EmptyState v-else-if="!k.rows.value.length" :title="t('git.knowledgeView.noGitHistoryPer')" :text="t('git.knowledgeView.scanGitCheckoutSee')" icon="users"/>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[1480px] flex-col px-8 pb-16 pt-7">

        <!-- 1 · The answer, and what counts as "still here". -->
        <header class="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div class="flex max-w-[70ch] flex-col gap-2">
            <h2 class="text-balance text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-neutral-900">
              <template v-if="nobody.lines === 0">{{ t('git.knowledgeView.everyPartCodeHas') }}</template>
              <template v-else><span class="kn-mark">{{ pctOfCode(nobody.lines) }}</span>{{ ' ' + t('git.knowledgeView.codeHasNoActive') }}</template>
            </h2>
            <p class="text-[13px] leading-5 text-neutral-600">
              <template v-if="nobody.lines">{{ t('git.knowledgeView.nobodyWhoCommittedWrote', { windowWords, components: formatNumber(nobody.components, 0), components2: formatNumber(s.components, 0) }) }}</template>
              {{ t('git.knowledgeView.peopleWhoWroteCode', { peopleHere: formatNumber(s.peopleHere, 0), people: formatNumber(s.people, 0) }) }}
            </p>
          </div>
          <div class="flex items-center gap-2.5 pb-1">
            <span class="text-sm text-neutral-600" :title="t('git.knowledgeView.anyoneCommitAnywhereRepository')">{{ t('git.knowledgeView.activeMeansCommitLast') }}</span>
            <div class="ui-segmented" role="group" :aria-label="t('git.knowledgeView.activeWindow')">
              <button v-for="w in HERE_WINDOWS" :key="w.id" type="button" :aria-pressed="k.windowId.value === w.id" :title="anchorLabel(w.days)" @click="k.windowId.value = w.id">{{ w.label }}</button>
            </div>
          </div>
        </header>

        <!-- 2 · The ladder: the code split by how well someone here knows it. Each part filters. -->
        <section class="mt-7 flex flex-col gap-4" :aria-label="t('git.knowledgeView.howWellCodeKnown')">
          <div class="flex h-10 w-full gap-[3px]" role="group" :aria-label="t('git.knowledgeView.shareCodeEachState')">
            <button v-for="st in ladder" v-show="st.share > 0" :key="st.id" type="button"
                    class="relative h-full min-w-[6px] rounded-[4px] transition-[opacity,filter] duration-150 first:rounded-l-md last:rounded-r-md hover:brightness-[1.06]"
                    :class="[{ 'opacity-25': only && only !== st.id }, st.id === 'nobody' || st.id === 'once' ? 'hairline' : '']"
                    :style="{ flexGrow: st.share, flexBasis: 0, background: stateBackground(st.id, palette) }"
                    :aria-pressed="only === st.id" :title="t('git.knowledgeView.code', { stLabel: st.label, lines: pctOfCode(st.lines) })" @click="toggleOnly(st.id)">
              <span v-if="st.share > 0.06" class="absolute inset-y-0 left-3 flex items-center font-mono text-[13px] font-medium tabular-nums" :style="{ color: palette.ink[st.id] }">
                <span :class="{ 'rounded-sm bg-surface/85 px-1 text-neutral-800': st.id === 'nobody' }">{{ pctOfCode(st.lines) }}</span>
              </span>
            </button>
          </div>
          <div class="grid grid-cols-4 gap-6">
            <button v-for="st in ladder" :key="st.id" type="button"
                    class="flex flex-col items-start gap-1.5 rounded-md py-1 text-left transition-opacity duration-150"
                    :class="only && only !== st.id ? 'opacity-40 hover:opacity-80' : ''" :aria-pressed="only === st.id" @click="toggleOnly(st.id)">
              <span class="flex items-center gap-2 text-[13px] font-medium text-neutral-900">
                <span class="h-3 w-3 shrink-0 rounded-[3px]" :class="{ hairline: st.id === 'nobody' || st.id === 'once' }" :style="{ background: stateBackground(st.id, palette) }"></span>
                {{ st.label }}
              </span>
              <span class="flex items-baseline gap-2">
                <span class="text-[22px] font-medium leading-7 tabular-nums text-neutral-900">{{ pctOfCode(st.lines) }}</span>
                <span class="text-sm text-neutral-500">{{ t('git.knowledgeView.text', { components: t('common.count.component', { count: st.components }) }) }}</span>
              </span>
              <span class="text-xs leading-4 text-neutral-500">{{ st.rule }}</span>
            </button>
          </div>
        </section>

        <!-- 3 · Where it sits, and whom to ask. -->
        <section class="mt-10 grid grid-cols-[minmax(0,1fr)_300px] overflow-hidden rounded-lg hairline" :aria-label="t('git.knowledgeView.map')">
          <div class="flex min-w-0 flex-col gap-3 p-4">
            <!-- The map's own frame hands its figure to this one, so the export button ends the "Code map" row.
                 Fixed height: the filter chips appear and go on hover, and must not move the map. -->
            <ExhibitFrame :title="t('git.knowledgeView.codeMap')" header-class="h-7 pb-3 box-content">
              <template #controls>
                <button v-if="only" type="button" class="ui-chip is-active" @click="only = null">{{ STATES.find(x => x.id === only)!.label }} <Icon icon="x" :size="11"/></button>
                <button v-if="personHl" type="button" class="ui-chip is-active" @click="pinned = null">{{ t('git.knowledgeView.mostActive', { personHl: authors.display(personHl) }) }} <Icon icon="x" :size="11"/></button>
              </template>
              <KnowledgeMap :tree="k.tree.value" :selected="selected" :focused="focused" :only="only" :matching="mapMatching" :window-words="windowWords"
                            v-model:at="mapAt" @pick="pick" @pick-many="pickMany"/>
            </ExhibitFrame>
          </div>
          <aside class="flex min-h-0 flex-col bg-ground hairline-l" :style="{ maxHeight: '760px' }">
            <KnowledgeInspector v-if="focusedRow" :row="focusedRow" :window-days="k.windowDays.value" @close="focused = null"/>
            <KnowledgePeople v-else :people="people.people" :known="people.known" :half="people.half" :pinned="pinned"
                             @hover="hovered = $event" @pin="pinned = $event"/>
          </aside>
        </section>

        <!-- 4 · Every component, read as a list. -->
        <section class="mt-10 flex flex-col gap-3">
          <ExhibitFrame :exhibit="componentTable" :title="t('git.knowledgeView.components')" header-class="pb-1">
            <template #controls>
              <span class="text-sm text-neutral-500">
                {{ formatNumber(listed.length, 0) }}<template v-if="only"> {{ STATES.find(x => x.id === only)!.label.toLowerCase() }}</template><template v-if="mapAt">{{ ' ' + t('git.knowledgeView.in') }} <span class="font-mono">{{ shortName(mapAt) }}</span></template><template v-if="personHl">{{ ' ' + t('git.knowledgeView.whereMostActive', { personHl: authors.display(personHl) }) }}</template><template v-if="search">{{ ' ' + t('git.knowledgeView.matching', { search }) }}</template>
              </span>
            </template>
            <template #aside>{{ t('git.knowledgeView.sortedStatusThenSize') }}</template>
            <EmptyState v-if="!listed.length" :title="t('git.knowledgeView.nothingList')" :text="search ? t('git.knowledgeView.noComponentPersonMatches', { search }) : t('git.knowledgeView.noComponentFitsThese')" icon="users"/>
            <table v-else class="ui-table">
              <thead>
                <tr>
                  <th class="w-8"><Checkbox :model-value="allSelected" :aria-label="t('git.knowledgeView.selectAllListed')" @update:model-value="toggleAll"/></th>
                  <th v-for="c in COLUMNS" :key="c.key" :class="[c.right ? 'text-right' : '', c.width, 'cursor-pointer select-none']" :title="c.title" :aria-sort="sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'" @click="sortBy(c.key)">
                    {{ c.label }}<span v-if="sortKey === c.key" class="ml-1 text-neutral-400">{{ sortDir === 1 ? "↑" : "↓" }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in visible" :key="r.component" class="is-clickable" :class="{ 'is-selected': r.component === focused }" tabindex="0"
                    @click="pick(r.component, $event)" @keydown.enter.prevent="router.push(componentPath(r.component))">
                  <td @click.stop><Checkbox :model-value="selected.has(r.component)" :aria-label="t('git.knowledgeView.select', { component: r.component })" @update:model-value="toggle(r.component)"/></td>
                  <td>
                    <span class="inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium" :class="{ hairline: r.state === 'nobody' || r.state === 'once' }"
                          :style="{ background: stateBackground(r.state, palette), color: palette.ink[r.state] }">
                      <span :class="{ 'rounded-sm bg-surface/85 px-0.5': r.state === 'nobody' }">{{ STATES.find(x => x.id === r.state)!.short }}</span>
                    </span>
                  </td>
                  <td class="max-w-0">
                    <router-link :to="componentPath(r.component)" class="block truncate font-mono text-[12px] text-neutral-800 hover:underline" :title="r.component" @click.stop>{{ shortName(r.component) }}</router-link>
                  </td>
                  <td class="max-w-0">
                    <span v-if="r.ask" class="flex items-center gap-2">
                      <Monogram :name="authors.display(r.ask.author)" here size="sm"/>
                      <router-link :to="authors.authorPath(r.ask.author)" class="min-w-0 truncate text-neutral-800 hover:underline" @click.stop>{{ authors.display(r.ask.author) }}</router-link>
                    </span>
                    <span v-else class="text-neutral-400">—</span>
                  </td>
                  <td class="is-num text-right">{{ r.hereCommits ? formatNumber(r.hereCommits, 0) : "—" }}</td>
                  <td>
                    <span class="flex items-center gap-2" :title="t('git.knowledgeView.activeContributorsWroteLines', { hereShare: pct(r.hereShare) })">
                      <span class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100"><span class="block h-full rounded-full bg-blue-500" :style="{ width: `${Math.min(100, r.hereShare * 100)}%` }"></span></span>
                      <span class="w-9 text-right font-mono text-xs tabular-nums text-neutral-600">{{ pct(r.hereShare) }}</span>
                    </span>
                  </td>
                  <td class="max-w-0" :title="r.main ? t('git.knowledgeView.wroteLines', { author: authors.display(r.main.author), share: pct(r.main.share), value: r.main.here ? t('git.knowledgeView.active') : t('git.knowledgeView.noLongerActive') }) : undefined">
                    <span v-if="r.main" class="flex items-center gap-2">
                      <Monogram :name="authors.display(r.main.author)" :here="r.main.here" size="sm"/>
                      <span class="min-w-0 truncate" :class="r.main.here ? 'text-neutral-800' : 'text-neutral-500'">{{ authors.display(r.main.author) }}</span>
                      <span class="shrink-0 font-mono text-xs text-neutral-500">{{ pct(r.main.share) }}</span>
                    </span>
                  </td>
                  <td class="is-num text-right">{{ formatNumber(r.lines, 0) }}</td>
                </tr>
              </tbody>
            </table>
          </ExhibitFrame>
          <button v-if="listed.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet self-start" @click="limit += 200">{{ t('git.knowledgeView.showMore', { min: formatNumber(Math.min(200, listed.length - visible.length), 0) }) }}</button>
        </section>
      </div>
    </div>
    <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :universe="listed.map(r => r.component)" :show-in-except="[]"
                    @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { useTable } from "~/features/export/useExportables"
import { componentLabel, componentPath } from "~/features/navigation/routes"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import Checkbox from "~/shared/ui/Checkbox.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { formatNumber } from "~/shared/format"
import { useAuthorsStore } from "../authors.store"
import { anchorLabel } from "../history"
import { HERE_WINDOWS, STATES, WROTE, peopleToAsk, type KnowledgeRow, type StateId } from "../knowledgeLeft"
import type { KnowledgeLeft } from "../useKnowledgeLeft"
import KnowledgeInspector from "./KnowledgeInspector.vue"
import KnowledgeMap from "./KnowledgeMap.vue"
import KnowledgePeople from "./KnowledgePeople.vue"
import Monogram from "./Monogram.vue"
import { stateBackground, useKnowledgePalette } from "./knowledgeColors"
import { t } from "~/shared/i18n"

const props = defineProps<{ k: KnowledgeLeft; search?: string }>()
/** The component the rail reads. */
const focused = defineModel<string | null>("focused", { default: null })

const router = useRouter()
const authors = useAuthorsStore()
const workspaces = useWorkspacesStore()
const palette = useKnowledgePalette()

const s = computed(() => props.k.summary.value)
const nobody = computed(() => s.value.byState.nobody)
const windowWords = computed(() => {
  const d = props.k.windowDays.value
  return d === 365 ? t("git.knowledgeView.lastYear") : d === 730 ? t("git.knowledgeView.lastTwoYears") : t("git.knowledgeView.lastDays", { d })
})
const pct = (v: number) => `${v > 0 && v < 0.01 ? "<1" : Math.round(v * 100)}%`
const pctOfCode = (lines: number) => pct(s.value.lines ? lines / s.value.lines : 0)

// Known best first, nobody last, so the bar reads from known to unknown.
const RULES = computed<Record<StateId, string>>(() => ({
  wrote: t("git.knowledgeView.activeContributorsWroteLeast", { value: Math.round(WROTE * 100) }),
  works: t("git.knowledgeView.activeContributorsChangedTwo", { windowWords: windowWords.value }),
  once: t("git.knowledgeView.oneChangeActiveContributor", { windowWords: windowWords.value }),
  nobody: t("git.knowledgeView.noActiveContributorWrote", { value: Math.round(WROTE * 100), windowWords: windowWords.value }),
}))
const ladder = computed(() => STATES.map(st => ({
  ...st, rule: RULES.value[st.id], lines: s.value.byState[st.id].lines, components: s.value.byState[st.id].components,
  share: s.value.lines ? s.value.byState[st.id].lines / s.value.lines : 0,
})))
const only = ref<StateId | null>(null)
function toggleOnly(id: StateId) { only.value = only.value === id ? null : id }

// ── People ──────────────────────────────────────────────────────────────
const people = computed(() => peopleToAsk(props.k.rows.value))
const hovered = ref<string | null>(null)
const pinned = ref<string | null>(null)
const personHl = computed(() => hovered.value ?? pinned.value)
const personSet = computed(() => {
  const who = personHl.value
  return who ? new Set(people.value.people.find(p => p.author === who)?.components.map(r => r.component) ?? []) : null
})

// ── Search and the map's place ──────────────────────────────────────────
const search = computed(() => (props.search ?? "").trim())
const matching = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return null
  return new Set(props.k.rows.value.filter(r => r.component.toLowerCase().includes(q)
    || (r.ask && authors.display(r.ask.author).toLowerCase().includes(q))
    || (r.main && authors.display(r.main.author).toLowerCase().includes(q))).map(r => r.component))
})
const mapMatching = computed(() => {
  const a = matching.value, b = personSet.value
  if (a && b) return new Set([...a].filter(x => b.has(x)))
  return a ?? b
})
const mapAt = ref("")
// Names read from under the prefix the map folds away (`src/oscar/`).
function shortName(c: string): string {
  const root = props.k.tree.value.path
  if (c === ".") return componentLabel(c, workspaces.active?.name)
  return root && c.startsWith(root) && c.length > root.length ? c.slice(root.length).replace(/^[./\\:]/, "") : c
}
const focusedRow = computed(() => props.k.rows.value.find(r => r.component === focused.value) ?? null)

// ── The list ────────────────────────────────────────────────────────────
const STATE_ORDER: Record<StateId, number> = { nobody: 0, once: 1, works: 2, wrote: 3 }
const COLUMNS = [
  { key: "state", label: t("git.knowledgeView.status"), width: "w-[112px]", title: t("git.knowledgeView.whetherActiveContributorsWrote") },
  { key: "component", label: t("git.knowledgeView.component"), width: "min-w-[220px]" },
  { key: "ask", label: t("git.knowledgeView.mostActive2"), width: "w-[180px]", title: t("git.knowledgeView.activeContributorMostCommits") },
  { key: "hereCommits", label: t("git.knowledgeView.recentChanges"), right: true, width: "w-[118px]", title: t("git.knowledgeView.commitsActiveContributorsWindow") },
  { key: "hereShare", label: t("git.knowledgeView.writtenActive"), width: "w-[140px]", title: t("git.knowledgeView.howMuchCodeActive") },
  { key: "main", label: t("git.knowledgeView.mainAuthor"), width: "w-[190px]", title: t("git.knowledgeView.whoWroteMostBlue") },
  { key: "lines", label: t("git.knowledgeView.lines"), right: true, width: "w-[76px]", title: t("git.knowledgeView.linesCodeNow") },
] as const
type Key = (typeof COLUMNS)[number]["key"]
const sortKey = ref<Key>("state")
const sortDir = ref<1 | -1>(1)
function sortBy(key: Key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 1 ? -1 : 1
  else { sortKey.value = key; sortDir.value = key === "component" || key === "ask" || key === "main" || key === "state" ? 1 : -1 }
}
function sortValue(r: KnowledgeRow, key: Key): number | string {
  if (key === "state") return STATE_ORDER[r.state] * 1e12 - r.lines
  if (key === "ask") return r.ask ? authors.display(r.ask.author).toLowerCase() : "￿"
  if (key === "main") return r.main ? authors.display(r.main.author).toLowerCase() : "￿"
  return r[key]
}
const underMap = (c: string) => !mapAt.value || c === mapAt.value || (c.startsWith(mapAt.value) && /[./\\:]/.test(c[mapAt.value.length] ?? ""))
const listed = computed(() => {
  const pinnedSet = pinned.value ? new Set(people.value.people.find(p => p.author === pinned.value)?.components.map(r => r.component) ?? []) : null
  const list = props.k.rows.value.filter(r => (!only.value || r.state === only.value) && (!matching.value || matching.value.has(r.component))
    && (!pinnedSet || pinnedSet.has(r.component)) && underMap(r.component))
  const key = sortKey.value, dir = sortDir.value
  return [...list].sort((a, b) => {
    const x = sortValue(a, key), y = sortValue(b, key)
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)
    return c * dir || b.lines - a.lines
  })
})
const limit = ref(100)
const visible = computed(() => listed.value.slice(0, limit.value))
watch([only, search, sortKey, sortDir, mapAt, pinned], () => { limit.value = 100 })

// ── Selection ───────────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set())
const allSelected = computed(() => listed.value.length > 0 && listed.value.every(r => selected.value.has(r.component)))
function toggle(c: string) { const n = new Set(selected.value); n.has(c) ? n.delete(c) : n.add(c); selected.value = n }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(listed.value.map(r => r.component)) }
function pickMany(components: string[]) {
  const n = new Set(selected.value)
  const all = components.every(c => n.has(c))
  for (const c of components) all ? n.delete(c) : n.add(c)
  selected.value = n
}
// A click reads the component in the rail; ⌘ or ⇧ adds it to the selection instead.
function pick(component: string, ev: MouseEvent) {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey) { toggle(component); return }
  focused.value = focused.value === component ? null : component
}

const componentTable = useTable({
  title: t("git.knowledgeView.knowledgeComponent"),
  rows: () => listed.value.map(r => ({
    component: r.component, state: STATES.find(x => x.id === r.state)!.label, who_to_ask: r.ask ? authors.display(r.ask.author) : "",
    commits_by_people_here: r.hereCommits, written_by_people_here: Number(r.hereShare.toFixed(3)),
    wrote_most: r.main ? authors.display(r.main.author) : "", wrote_most_share: r.main ? Number(r.main.share.toFixed(3)) : null, lines: r.lines,
  })),
  columns: () => [
    { id: "component", label: t("git.knowledgeView.component") }, { id: "state", label: t("git.knowledgeView.status") }, { id: "who_to_ask", label: t("git.knowledgeView.mostActiveContributor") },
    { id: "commits_by_people_here", label: t("git.knowledgeView.changesActiveContributors", { windowWords: windowWords.value }) }, { id: "written_by_people_here", label: t("git.knowledgeView.writtenActiveContributors") },
    { id: "wrote_most", label: t("git.knowledgeView.mainAuthor") }, { id: "wrote_most_share", label: t("git.knowledgeView.theirShare") }, { id: "lines", label: t("git.knowledgeView.lines") },
  ],
  // Nothing is said while the rows still load: a report's take reads a reason as "there is nothing here".
  disabledReason: () => (!props.k.loading.value && !listed.value.length ? t("git.knowledgeView.noComponentsListed") : null),
  ready: () => !props.k.loading.value,
})
</script>

<style scoped>
/* The headline's number, underlined in the hatch that marks unknown code everywhere else on the page. */
.kn-mark {
  background-image: repeating-linear-gradient(135deg, rgb(var(--c-neutral-300)) 0 1.5px, transparent 1.5px 4.5px);
  background-size: 100% 6px;
  background-repeat: no-repeat;
  background-position: 0 100%;
  padding-bottom: 3px;
}
</style>
