<template>
  <ViewWorkspaceLayout :title="t('pages.rules.rules')" :queryable="false" :show-config="false">
    <template #stats>
      <span v-if="verdict === 'violations'" class="text-neutral-800">{{ summaryLine }}</span>
      <span v-else-if="verdict === 'clean'">{{ heldRules.length ? t('pages.rules.kept', { heldRulesLength: heldRules.length }) : t('pages.rules.noneApplied') }}</span>
    </template>

    <template #visualizer>
      <div class="h-full w-full overflow-y-auto">
        <div class="mx-auto w-full max-w-[900px] px-8 py-7">

          <LoadingState v-if="loading" :text="t('pages.rules.checkingRules')"/>

          <EmptyState
            v-else-if="error"
            icon="alert"
            :title="t('pages.rules.couldNotReadRules')"
            :text="error"
          />

          <!-- A rule is a statement about the modules a project declares. One
               that declares none earns neither a pass nor a failure, and a
               green tick here would claim something nobody checked. -->
          <EmptyState
            v-else-if="verdict === 'no-modules'"
            icon="boxes"
            :title="t('pages.rules.projectDeclaresNoModules')"
            :text="t('pages.rules.rulesCompareThingsProject')"
          />

          <template v-else>
            <!-- Broken rules first, worst first. -->
            <section v-for="group in brokenRules" :key="group.id" class="mb-6">
              <div class="ui-panel overflow-hidden">
                <div class="flex items-start justify-between gap-4 p-4 pb-3">
                  <div class="min-w-0">
                    <h2 class="ui-panel-title flex items-center gap-2">
                      <Icon icon="scale" :size="15" class="shrink-0 text-red-500"/>
                      <span class="truncate">{{ group.name }}</span>
                    </h2>
                    <p v-if="group.short" class="mt-1.5 text-sm leading-4 text-neutral-500">{{ group.short }}</p>
                  </div>
                  <span class="ui-tag shrink-0 whitespace-nowrap">{{ brokenBetween(group) }}</span>
                </div>

                <table class="ui-table">
                  <thead>
                    <tr>
                      <th class="w-[22%]">{{ t('pages.rules.from') }}</th>
                      <th class="w-[22%]">{{ t('pages.rules.to') }}</th>
                      <th class="w-[80px]">{{ t('pages.rules.how') }}</th>
                      <th>{{ t('pages.rules.where') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(v, i) in group.violations" :key="`${group.id}-${i}`" class="group">
                      <td class="max-w-0 truncate font-mono text-sm text-neutral-800" :title="v.from">{{ v.from }}</td>
                      <td class="max-w-0 truncate font-mono text-sm text-neutral-800" :title="v.to">{{ v.to }}</td>
                      <td>
                        <span class="ui-tag" :title="kindHint(v.kind)">{{ kindLabel(v.kind) }}</span>
                      </td>
                      <td class="relative max-w-0 pr-16">
                        <span class="absolute right-1 top-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <PinButton icon kind="rule" :entity-key="`${v.rule ?? group.id}|${v.from}|${v.to}|${v.file}`" :title="`${group.name}: ${v.from} → ${v.to}`" :values="{ findings: 1 }"/>
                          <OpenInEditor :file="v.file" :line="v.line"/>
                        </span>
                        <router-link
                          :to="`${filePath(v.file, 'source')}${v.line ? `#L${v.line}` : ''}`"
                          class="block truncate font-mono text-sm text-neutral-600 hover:text-neutral-900 hover:underline"
                          :title="atLine(v.file, v.line)"
                        >{{ shortLocation(v.file, v.line) }}</router-link>
                        <span class="block truncate text-sm leading-4 text-neutral-400" :title="v.file">{{ v.file }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Kept. Worth showing: a rule that held is a result, and it is
                 the only thing that distinguishes a clean project from one
                 nothing was checked against. -->
            <section v-if="heldRules.length > 0" class="mb-6">
              <h3 class="ui-section-title">{{ t('pages.rules.kept2') }}</h3>
              <ul class="mt-2 flex flex-col gap-1.5">
                <li v-for="group in heldRules" :key="group.id" class="flex items-start gap-2">
                  <Icon icon="check" :size="14" class="mt-0.5 shrink-0 text-green-600"/>
                  <div class="min-w-0">
                    <p class="text-base text-neutral-800">{{ group.name }}</p>
                    <p v-if="group.short" class="text-sm leading-4 text-neutral-500">{{ group.short }}</p>
                  </div>
                </li>
              </ul>
            </section>

            <p v-if="brokenRules.length === 0 && heldRules.length === 0" class="mb-6 max-w-[64ch] text-base text-neutral-600">
              {{ t('pages.rules.noneBuiltRulesAbout') }}
            </p>

            <!-- Not the same as kept, and the difference is the point. -->
            <section v-if="silentRules.length > 0">
              <h3 class="ui-section-title">{{ t('pages.rules.noOpinionHere') }}</h3>
              <p class="mt-1 text-sm leading-4 text-neutral-500">
                {{ t('pages.rules.theseRulesAboutEcosystem') }}
              </p>
              <ul class="mt-2 flex flex-col gap-1">
                <li v-for="group in silentRules" :key="group.id" class="flex items-center gap-2">
                  <Icon icon="minus" :size="14" class="shrink-0 text-neutral-300"/>
                  <span class="truncate text-base text-neutral-500">{{ group.name }}</span>
                </li>
              </ul>
            </section>
          </template>

          <!-- The lens's own rules: the architecture declared on it, checked
               import by import. Independent of the project's module rules. -->
          <section v-if="lensDeclared" id="lens" class="mt-10">
            <div class="flex items-baseline gap-3">
              <h2 class="ui-section-title">{{ t('pages.rules.lensRules', { active: lens.active }) }}</h2>
              <span v-if="lensDeclared.source === 'manifests'" class="ui-tag" :title="t('pages.rules.seededDependenciesBuildFiles')">{{ t('pages.rules.declaredManifests') }}</span>
              <span class="text-sm text-neutral-500">{{ lensCheck.count ? t('pages.rules.importsCrossDeclaredOrder', { value: lensCheck.count.toLocaleString(intlLocale) }) : t('pages.rules.nothingCrossesDeclaredOrder') }}</span>
              <RulesExport v-if="lens.active" :lens="lens.active" class="ml-auto"/>
              <button type="button" class="text-sm text-neutral-500 hover:text-neutral-900" @click="declaring = lens.active">{{ t('pages.rules.editDeclaration') }}</button>
            </div>
            <p v-if="lensCheck.ambiguous || lensCheck.unplacedFrom" class="mt-1 text-sm text-neutral-500">
              <template v-if="lensCheck.unplacedFrom">{{ t('pages.rules.importsComeFilesNo', { value: lensCheck.unplacedFrom.toLocaleString(intlLocale) }) + ' ' }} </template>
              <template v-if="lensCheck.ambiguous">{{ t('pages.rules.goComponentGroupsSplit', { value: lensCheck.ambiguous.toLocaleString(intlLocale) }) }}</template>
            </p>
            <p v-for="sc in lensCheck.silent" :key="sc.groups.join()" class="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {{ t('pages.rules.cycleGroupsCrossesNothing', { groupsLength: sc.groups.length, value: sc.groups.map(groupName).join(", ") }) }}
              <template v-if="sc.outOfLayers.length">{{ t('pages.rules.notLayersSoImports', { value: sc.outOfLayers.map(groupName).join(", "), are: t('common.noun.is', { count: sc.outOfLayers.length }), their: t('common.noun.its', { count: sc.outOfLayers.length }) }) }}</template>
              <template v-else>{{ t('pages.rules.pairsAllowedHandLet') }}</template>
              <button type="button" class="ml-1 underline" @click="declaring = lens.active">{{ t('pages.rules.editDeclaration') }}</button>
            </p>
            <LoadingState v-if="lensLoading" :text="t('pages.rules.checkingDeclaration')"/>
            <div v-for="c in lensCheck.crossings" :key="c.from + '>' + c.to" class="ui-panel mt-4 overflow-hidden">
              <div class="flex items-baseline gap-2 px-4 py-2.5 hairline-b">
                <span class="text-base font-medium text-neutral-900">{{ groupName(c.from) }}</span>
                <Icon icon="arrow-right" :size="12" class="text-neutral-400"/>
                <span class="text-base font-medium text-neutral-900">{{ groupName(c.to) }}</span>
                <span v-if="lensDeclared.source === 'manifests'" class="text-sm text-neutral-500">{{ t('pages.rules.importedNotDeclared') }}<template v-if="viaOf(c)">{{ ' ' + t('pages.rules.declaredVia', { c: viaOf(c) }) }}</template></span>
                <span class="ml-auto font-mono text-xs text-neutral-500">{{ t('pages.rules.refs', { imports: t('common.count.import', { count: c.edges.length }), value: c.refs.toLocaleString(intlLocale) }) }}<template v-if="c.typeOnly">{{ ' ' + t('pages.rules.alsoTypeOnly', { typeOnly: c.typeOnly }) }}</template></span>
              </div>
              <table class="ui-table">
                <thead><tr><th>{{ t('pages.rules.from') }}</th><th>{{ t('pages.rules.to') }}</th><th class="w-24">{{ t('pages.rules.how') }}</th><th>{{ t('pages.rules.where') }}</th></tr></thead>
                <tbody>
                  <tr v-for="e in c.edges.slice(0, lensShown(c))" :key="e.file + e.toComponent" class="group">
                    <td class="max-w-0 truncate font-mono text-sm" :title="e.fromComponent">{{ e.fromComponent }}</td>
                    <td class="max-w-0 truncate font-mono text-sm" :title="e.toComponent">{{ e.toComponent }}<span v-if="e.ambiguous" class="ui-tag ml-2" :title="t('pages.rules.targetComponentSplitBetween')">{{ t('pages.rules.ambiguous') }}</span></td>
                    <td class="text-sm text-neutral-600">{{ e.kind === "dynamic" ? t('pages.rules.runtimeLookup') : t('pages.rules.import') }}</td>
                    <td class="relative max-w-0 pr-9">
                      <OpenInEditor :file="e.file" :line="e.line ?? undefined" class="absolute right-1 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"/>
                      <router-link :to="`${filePath(e.file, 'source')}${e.line ? `#L${e.line}` : ''}`" class="block truncate font-mono text-sm text-neutral-700 hover:underline" :title="e.file">{{ e.file.split("/").pop() }}{{ e.line ? `:${e.line}` : "" }}</router-link>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button v-if="c.edges.length > lensShown(c)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet m-2" @click="lensExpanded = new Set([...lensExpanded, c.from + '>' + c.to])">{{ t('pages.rules.showAll', { edgesLength: c.edges.length }) }}</button>
            </div>
          </section>
          <DeclareSheet v-model="declaring"/>

        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import { useBuildModules } from "~/features/lens-builder/useBuildModules"
import { declaredVia } from "~/features/lens-builder/buildModules"
import PinButton from "~/features/reports/components/PinButton.vue"
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { filePath } from "~/features/navigation/routes"
import DeclareSheet from "~/features/rules/components/DeclareSheet.vue"
import RulesExport from "~/features/rules/components/RulesExport.vue"
import { useLensFindings } from "~/features/rules/useLensFindings"
import { useLensStore } from "~/features/groups/lens.store"
import { useScopeStore } from "~/features/groups/scope.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { computed as vueComputed, ref as vueRef } from "vue"

const lens = useLensStore()
const scopeStore = useScopeStore()
const lensGroupsStore = useGroupsStore()
const declaring = vueRef<string | null>(null)
const lensExpanded = vueRef(new Set<string>())
const { check: lensCheck, declared: lensDeclared, loading: lensLoading } = useLensFindings(vueComputed(() => lens.active))
// For a declaration seeded from manifests: the declared path an undeclared import could lean on.
const buildModules = useBuildModules()
function viaOf(c: { from: string; to: string }): string {
  const byName = new Map(buildModules.rows.value.map(m => [buildModules.nameOf(m), m.name]))
  const from = byName.get(groupName(c.from)), to = byName.get(groupName(c.to))
  if (!from || !to) return ""
  const via = declaredVia(from, to, new Map(buildModules.rows.value.map(m => [m.name, m.dependsOn])))
  return via && via.length ? via.join(" → ") : ""
}
const groupName = (id: string) => lensGroupsStore.getGroupById(id)?.name ?? id
const lensShown = (c: { from: string; to: string }) => (lensExpanded.value.has(c.from + ">" + c.to) ? Infinity : 20)
import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import {
  atLine, groupByRule, held, kindHint, kindLabel, notApplicable, scopeToEcosystems, shortLocation, summarise, verdictOf,
  type RuleFinding,
} from "~/features/rules/rules"
import { t, intlLocale } from "~/shared/i18n"

// Every rule's verdict on this codebase.
//
// A metric goes up or down and somebody has to decide what it means. A rule
// is kept or broken, and when it is broken this names the file and the line.
// The third state matters as much as the other two: a rule that had no
// opinion was not checked, and showing it as kept would claim otherwise.

const store = useDataStore()

const { data: rawFindings, loading, error } = useAsyncQuery<RuleFinding[]>(
  async () => {
    if (!store.hasView("rules")) return []
    const rows = await store.query<any>("SELECT rule, status, `from`, `to`, kind, file, line FROM rules")
    return rows.map(r => ({
      rule: String(r.rule ?? ""),
      status: String(r.status ?? ""),
      from: String(r.from ?? ""),
      to: String(r.to ?? ""),
      kind: String(r.kind ?? ""),
      file: String(r.file ?? ""),
      line: Number(r.line) || 0,
    }))
  },
  [() => store.datasetKey],
  { initial: [], immediate: true },
)

// Rules register themselves in the definitions table like any metric, so the
// name and the blurb come from the snapshot rather than being duplicated here.
const definitionFor = (id: string) => {
  const def = store.definitions.get(id)
  return def ? { name: def.name, short: def.short } : undefined
}

// Older snapshots report ecosystem rules as kept wherever they found nothing.
const findings = computed(() => {
  const files: string[] = []
  for (const list of (store.componentFilesIndex as Map<string, string[]>).values()) files.push(...list)
  const all = scopeToEcosystems(rawFindings.value, files)
  // The scope narrows violations to the files it holds; kept and silent
  // rules stay, since they say something about the whole project.
  if (!scopeStore.isActive) return all
  return all.filter((f: any) => f.status !== "violation" || !f.file || scopeStore.fileInScope(f.file, store.fileComponentIndex.get(f.file)))
})
const verdict = computed(() => verdictOf(findings.value))
const brokenRules = computed(() => groupByRule(findings.value, definitionFor))
const heldRules = computed(() => held(findings.value, definitionFor))
const silentRules = computed(() => notApplicable(findings.value, definitionFor))
const summaryLine = computed(() => summarise(brokenRules.value))

// "twice, between 2 module pairs" reads worse than it sounds; keep it to the
// fact that matters — how many pairs of modules break it.
function brokenBetween(group: { edges: number; violations: unknown[] }): string {
  const pairs = group.edges === 1 ? t("pages.rules.text1ModulePair") : t("pages.rules.modulePairs", { edges: group.edges })
  const lines = group.violations.length === 1 ? "1 place" : t("pages.rules.places", { violationsLength: group.violations.length })
  return `${pairs} · ${lines}`
}
</script>
