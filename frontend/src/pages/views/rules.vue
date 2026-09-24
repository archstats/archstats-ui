<template>
  <ViewWorkspaceLayout title="Rules" :queryable="false" :show-config="false">
    <template #stats>
      <span v-if="verdict === 'violations'" class="text-neutral-800">{{ summaryLine }}</span>
      <span v-else-if="verdict === 'clean'">{{ heldRules.length ? `${heldRules.length} kept` : "None applied" }}</span>
    </template>

    <template #visualizer>
      <div class="h-full w-full overflow-y-auto">
        <div class="mx-auto w-full max-w-[900px] px-8 py-7">

          <LoadingState v-if="loading" text="Checking rules…"/>

          <EmptyState
            v-else-if="error"
            icon="alert"
            title="Could not read the rules"
            :text="error"
          />

          <!-- A rule is a statement about the modules a project declares. One
               that declares none earns neither a pass nor a failure, and a
               green tick here would claim something nobody checked. -->
          <EmptyState
            v-else-if="verdict === 'no-modules'"
            icon="boxes"
            title="This project declares no modules"
            text="Rules compare the things a project builds and publishes — .csproj projects, composer packages, gradle modules, npm workspaces, Django apps. This snapshot found none, so there is nothing for a rule to compare and no verdict to give."
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
                      <th class="w-[22%]">From</th>
                      <th class="w-[22%]">To</th>
                      <th class="w-[80px]">How</th>
                      <th>Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(v, i) in group.violations" :key="`${group.id}-${i}`" class="group">
                      <td class="max-w-0 truncate font-mono text-sm text-neutral-800" :title="v.from">{{ v.from }}</td>
                      <td class="max-w-0 truncate font-mono text-sm text-neutral-800" :title="v.to">{{ v.to }}</td>
                      <td>
                        <span class="ui-tag" :title="kindHint(v.kind)">{{ kindLabel(v.kind) }}</span>
                      </td>
                      <td class="relative max-w-0 pr-9">
                        <OpenInEditor :file="v.file" :line="v.line" class="absolute right-1 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"/>
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
              <h3 class="ui-section-title">Kept</h3>
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
              None of the built-in rules is about an ecosystem this codebase uses, so nothing was checked here. That is no verdict either way.
            </p>

            <!-- Not the same as kept, and the difference is the point. -->
            <section v-if="silentRules.length > 0">
              <h3 class="ui-section-title">No opinion here</h3>
              <p class="mt-1 text-sm leading-4 text-neutral-500">
                These rules are about an ecosystem or a layout this codebase does not have, so they were not checked.
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
              <h2 class="ui-section-title">Lens rules: {{ lens.active }}</h2>
              <span class="text-sm text-neutral-500">{{ lensCheck.count ? `${lensCheck.count.toLocaleString("en-US")} imports cross the declared order` : "Nothing crosses the declared order" }}</span>
              <button type="button" class="ml-auto text-sm text-neutral-500 hover:text-neutral-900" @click="declaring = lens.active">Edit declaration…</button>
            </div>
            <p v-if="lensCheck.ambiguous || lensCheck.unplacedFrom" class="mt-1 text-sm text-neutral-500">
              <template v-if="lensCheck.unplacedFrom">{{ lensCheck.unplacedFrom.toLocaleString("en-US") }} imports come from files in no group and are not judged. </template>
              <template v-if="lensCheck.ambiguous">{{ lensCheck.ambiguous.toLocaleString("en-US") }} go to a component the groups split, where the target file is unknown: marked ambiguous.</template>
            </p>
            <LoadingState v-if="lensLoading" text="Checking the declaration…"/>
            <div v-for="c in lensCheck.crossings" :key="c.from + '>' + c.to" class="ui-panel mt-4 overflow-hidden">
              <div class="flex items-baseline gap-2 px-4 py-2.5 hairline-b">
                <span class="text-base font-medium text-neutral-900">{{ groupName(c.from) }}</span>
                <Icon icon="arrow-right" :size="12" class="text-neutral-400"/>
                <span class="text-base font-medium text-neutral-900">{{ groupName(c.to) }}</span>
                <span class="ml-auto font-mono text-xs text-neutral-500">{{ c.edges.length }} import{{ c.edges.length === 1 ? "" : "s" }} · {{ c.refs.toLocaleString("en-US") }} refs<template v-if="c.typeOnly"> · also {{ c.typeOnly }} type-only</template></span>
              </div>
              <table class="ui-table">
                <thead><tr><th>From</th><th>To</th><th class="w-24">How</th><th>Where</th></tr></thead>
                <tbody>
                  <tr v-for="e in c.edges.slice(0, lensShown(c))" :key="e.file + e.toComponent" class="group">
                    <td class="max-w-0 truncate font-mono text-sm" :title="e.fromComponent">{{ e.fromComponent }}</td>
                    <td class="max-w-0 truncate font-mono text-sm" :title="e.toComponent">{{ e.toComponent }}<span v-if="e.ambiguous" class="ui-tag ml-2" title="The target component is split between groups">ambiguous</span></td>
                    <td class="text-sm text-neutral-600">{{ e.kind === "dynamic" ? "runtime lookup" : "import" }}</td>
                    <td class="relative max-w-0 pr-9">
                      <OpenInEditor :file="e.file" :line="e.line ?? undefined" class="absolute right-1 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"/>
                      <router-link :to="`${filePath(e.file, 'source')}${e.line ? `#L${e.line}` : ''}`" class="block truncate font-mono text-sm text-neutral-700 hover:underline" :title="e.file">{{ e.file.split("/").pop() }}{{ e.line ? `:${e.line}` : "" }}</router-link>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button v-if="c.edges.length > lensShown(c)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet m-2" @click="lensExpanded = new Set([...lensExpanded, c.from + '>' + c.to])">Show all {{ c.edges.length }}</button>
            </div>
          </section>
          <DeclareSheet v-model="declaring"/>

        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import OpenInEditor from "~/components/ui/OpenInEditor.vue"
import { filePath } from "~/utils/routes"
import DeclareSheet from "~/components/groups/DeclareSheet.vue"
import { useLensFindings } from "~/composables/useLensFindings"
import { useLensStore } from "~/stores/lens"
import { useScopeStore } from "~/stores/scope"
import { useGroupsStore } from "~/stores/groups"
import { computed as vueComputed, ref as vueRef } from "vue"

const lens = useLensStore()
const scopeStore = useScopeStore()
const lensGroupsStore = useGroupsStore()
const declaring = vueRef<string | null>(null)
const lensExpanded = vueRef(new Set<string>())
const { check: lensCheck, declared: lensDeclared, loading: lensLoading } = useLensFindings(vueComputed(() => lens.active))
const groupName = (id: string) => lensGroupsStore.getGroupById(id)?.name ?? id
const lensShown = (c: { from: string; to: string }) => (lensExpanded.value.has(c.from + ">" + c.to) ? Infinity : 20)
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Icon from "~/components/ui/common/Icon.vue"
import {
  atLine, groupByRule, held, kindHint, kindLabel, notApplicable, scopeToEcosystems, shortLocation, summarise, verdictOf,
  type RuleFinding,
} from "~/utils/rules"

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
  const pairs = group.edges === 1 ? "1 module pair" : `${group.edges} module pairs`
  const lines = group.violations.length === 1 ? "1 place" : `${group.violations.length} places`
  return `${pairs} · ${lines}`
}
</script>
