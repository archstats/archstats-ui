<template>
  <section v-if="data.hasData" class="ui-panel mt-8 overflow-hidden" aria-labelledby="extremes-title">
    <div class="flex items-baseline gap-3 px-4 pb-2 pt-3 hairline-b">
      <h2 id="extremes-title" class="ui-panel-title">{{ t('overview.extremes.extremesSnapshot') }}</h2>
      <span class="text-sm text-neutral-500">{{ t('overview.extremes.sortedEvidenceOneSort') }}</span>
      <span v-if="scope.isActive" class="ml-auto text-sm text-neutral-500">{{ scopeNote }}</span>
    </div>
    <ul>
      <li v-for="row in rows" :key="row.id" class="flex flex-col gap-1.5 px-4 py-3 hairline-b last:border-0 md:flex-row md:items-baseline md:gap-6">
        <div class="md:w-[300px] md:shrink-0">
          <p class="text-sm font-medium text-neutral-900">
            <template v-if="row.id === 'ca'">{{ t('overview.extremes.mostDependedAmongComponents') }}
              <input v-model.number="caThreshold" type="number" min="0" max="1" step="0.05" class="ui-input ui-input-sm inline-block w-16 px-1 py-0 font-mono" :aria-label="t('overview.extremes.instabilityThreshold')">
            </template>
            <template v-else-if="row.id === 'knowledge'">{{ t('overview.extremes.fewestAuthorsCovering80') }}
              <input v-model.number="knowledgeFloor" type="number" min="0" step="500" class="ui-input ui-input-sm inline-block w-20 px-1 py-0 font-mono" :aria-label="t('overview.extremes.linesAddedFloor')">{{ ' ' + t('overview.extremes.linesAdded') }}
            </template>
            <template v-else>{{ row.title }}</template>
          </p>
          <p class="text-xs text-neutral-500">{{ row.filter }}</p>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-neutral-700">{{ row.sentence }}</p>
          <div v-if="row.evidence.length" class="mt-1 flex flex-wrap gap-1.5">
            <router-link v-for="e in row.evidence" :key="e.to" :to="e.to" class="ui-chip max-w-[320px] truncate font-mono" :title="e.title">{{ e.label }}</router-link>
          </div>
        </div>
        <router-link v-if="row.open" :to="row.open.to" class="shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ t('overview.extremes.open', { openLabel: row.open.label }) }}</router-link>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useDataStore } from "~/features/snapshot/data.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useAuthorsStore } from "~/features/git/authors.store";
import { knowledgeSql } from "~/features/git/authors";
import { looksLikeProductionCode } from "~/features/snapshot/fileRole";
import { componentPath, filePath } from "~/features/navigation/routes";
import { scopeLabel } from "~/features/groups/scopeSql";
import { metricsPath } from "~/features/metrics/link";
import { t, intlLocale } from "~/shared/i18n";

const DEPENDENTS = "modularity__coupling__dependents";

// Where to look in the first hour: a handful of fixed sorts over this
// snapshot, each named for what it sorts by and filters on. No row ranks
// against another, and a row with nothing to show still says so.

const data = useDataStore();
const scope = useScopeStore();
const caThreshold = ref(0.5);
const scopeNote = computed(() => t("overview.extremes.within", { scopeLabel: scopeLabel() }));
const fmt = (n: number, d = 0) => n.toLocaleString(intlLocale, { maximumFractionDigits: d });

interface Row { id: string; title: string; filter: string; sentence: string; evidence: Array<{ label: string; to: string; title: string }>; open?: { label: string; to: string } }

// Row 1: hotspots among production files, stated as a filter of its own.
const { data: hotFiles } = useAsyncQuery<Array<{ name: string; component: string | null; hotspot: number; role: string | null }>>(
  () => data.hasColumn("files", "codesmells__hotspot_score")
    ? data.query(`SELECT name, component, codesmells__hotspot_score AS hotspot, ${data.hasColumn("files", "role") ? "role" : "NULL AS role"} FROM files WHERE codesmells__hotspot_score > 0 ORDER BY codesmells__hotspot_score DESC LIMIT 400`)
    : Promise.resolve([]),
  [],
  { initial: [] },
);
// Row 2: tangles by size.
const { data: tangles } = useAsyncQuery<Array<{ group: string; size: number; members: string }>>(
  () => data.hasView("component_strongly_connected_groups")
    ? data.query(`SELECT "group", count(*) AS size, group_concat(component, char(10)) AS members FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC`)
    : Promise.resolve([]),
  [],
  { initial: [] },
);
// Row 5: knowledge concentration, among components with enough history to say.
const authors = useAuthorsStore();
const knowledgeFloor = ref(1000);
const { data: knowledge } = useAsyncQuery<Array<{ component: string; added: number; cover80: number; authors: number; main: string }>>(
  () => data.hasView("git_commits") ? data.query(knowledgeSql(authors.aliases, authors.showBots)) : Promise.resolve([]),
  [() => authors.aliases, () => authors.showBots],
  { initial: [] },
);
// Row 4: rule findings by the component they start in.
const { data: ruleCounts } = useAsyncQuery<Array<{ component: string; n: number }>>(
  () => data.hasView("rules") ? data.query(`SELECT "from" AS component, count(*) AS n FROM rules WHERE status = 'violation' GROUP BY 1 ORDER BY 2 DESC`) : Promise.resolve([]),
  [],
  { initial: [] },
);

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const recorded = data.rolesRecorded;
  const prod = hotFiles.value.filter(f => (recorded ? (f.role ?? "production") === "production" : looksLikeProductionCode(f.name)) && scope.fileInScope(f.name, f.component)).slice(0, 3);
  out.push({
    id: "hotspot",
    title: t("overview.extremes.highestHotspotProductionFiles"),
    filter: recorded ? t("overview.extremes.testsGeneratedThirdParty") : t("overview.extremes.testsStylesheetsDataVendored"),
    sentence: prod.length ? t("overview.extremes.scores100ChangesMost", { pop: prod[0].name.split("/").pop(), hotspot: fmt(prod[0].hotspot) }) : t("overview.extremes.noProductionFileHas"),
    evidence: prod.map(f => ({ label: f.name.split("/").pop() ?? f.name, to: filePath(f.name), title: t("overview.extremes.hotspot", { name: f.name, hotspot: fmt(f.hotspot) }) })),
    open: { label: t("overview.extremes.hotspots"), to: "/views/components/hotspots" },
  });

  const item = tangles.value.map(x => ({ ...x, list: String(x.members).split("\n") })).filter(x => x.list.some(m => scope.componentInScope(m)));
  out.push({
    id: "tangle",
    title: t("overview.extremes.largestTangle"),
    filter: t("overview.extremes.componentsCanEachReach"),
    sentence: item.length ? t("overview.extremes.componentsFormOneTangle", { size: fmt(item[0].size), value: item.length > 1 ? t("overview.extremes.smallerTangleBesides", { value: fmt(item.length - 1), value2: item.length === 2 ? "" : "s" }) : "" }) : t("overview.extremes.noTangleEveryDependency"),
    evidence: item.length ? item[0].list.slice(0, 3).map(m => ({ label: m, to: componentPath(m, "cycles"), title: m })) : [],
    open: { label: t("overview.extremes.cycles"), to: "/views/components/cycles" },
  });

  // Afferent coupling counts the files that import a component, not the
  // components: the dependents count is the one that reads "used by N
  // components". Older snapshots have only the file count, and say so.
  const byComponents = data.hasColumn("components", DEPENDENTS);
  const ca = byComponents ? DEPENDENTS : "modularity__coupling__afferent";
  const unstable = (data.allComponents as any[])
    .filter(c => c.name !== "." && scope.componentInScope(c.name) && Number(c.modularity__instability) > caThreshold.value && Number(c[ca]) > 0)
    .sort((a, b) => Number(b[ca]) - Number(a[ca]))
    .slice(0, 3);
  const usedBy = (c: any) => byComponents
    ? t("overview.extremes.usedOther", { value: fmt(Number(c[ca])), components: t("common.noun.component", { count: Number(c[ca]) }) })
    : t("overview.extremes.imported", { files: t("common.count.file", { count: Number(c[ca]) }) });
  out.push({
    id: "ca",
    title: "",
    filter: byComponents ? t("overview.extremes.dependedMostComponentsWhile") : t("overview.extremes.importedMostFilesWhile"),
    sentence: unstable.length ? t("overview.extremes.instability", { name: unstable[0].name, value: usedBy(unstable[0]), value2: Number(unstable[0].modularity__instability).toFixed(2) }) : t("overview.extremes.noComponentAboveInstability", { caThreshold: caThreshold.value }),
    evidence: unstable.map(c => ({ label: c.name, to: componentPath(c.name), title: `${byComponents ? t("overview.extremes.dependents") : t("overview.extremes.ca")} ${c[ca]} · I ${Number(c.modularity__instability).toFixed(2)}` })),
    // The same question, asked in Strips: instability brushed above the
    // threshold, ranked by what depends on it, these three picked out.
    open: { label: t("overview.extremes.metrics"), to: metricsPath({ view: "strips", sort: ca, brushes: { modularity__instability: [caThreshold.value, 1] }, selected: unstable.map(c => c.name) }) },
  });

  const rc = ruleCounts.value.filter(r => scope.componentInScope(r.component)).slice(0, 3);
  out.push({
    id: "rules",
    title: t("overview.extremes.mostRuleFindings"),
    filter: t("overview.extremes.importsModuleRuleForbids"),
    sentence: !data.hasView("rules") ? t("overview.extremes.rulesWereNotChecked") : rc.length ? t("overview.extremes.startsForbidden", { component: rc[0].component, n: fmt(rc[0].n), imports: t("common.noun.import", { count: rc[0].n }) }) : t("overview.extremes.noModuleRuleBroken"),
    evidence: rc.map(r => ({ label: r.component, to: componentPath(r.component), title: t("overview.extremes.findings", { n: r.n }) })),
    open: { label: t("overview.extremes.rules"), to: "/views/rules" },
  });

  // Mostly production code: a vendored library committed by one person is concentrated by construction.
  const production = (component: string) => {
    const files = data.componentFilesIndex.get(component) ?? [];
    const ok = files.filter(f => (recorded ? (data.fileRoleIndex.get(f) ?? "production") === "production" : looksLikeProductionCode(f))).length;
    return files.length > 0 && ok * 2 >= files.length;
  };
  const k = knowledge.value
    .filter(r => Number(r.added) >= knowledgeFloor.value && scope.componentInScope(r.component) && production(r.component))
    .sort((a, b) => Number(a.cover80) - Number(b.cover80) || Number(b.added) - Number(a.added))
    .slice(0, 3);
  out.push({
    id: "knowledge",
    title: "",
    filter: recorded ? t("overview.extremes.mostlyProductionFilesLines") : t("overview.extremes.mostlyProductionFilesPath"),
    sentence: !data.hasView("git_commits") ? t("overview.extremes.noGitHistorySnapshot") : k.length
      ? t("overview.extremes.added80Lines", { component: k[0].component, value: Number(k[0].cover80) === 1 ? t("overview.extremes.oneAuthor", { main: authors.display(k[0].main) }) : t("overview.extremes.authors", { cover80: fmt(Number(k[0].cover80)), authors: fmt(Number(k[0].authors)) }), added: fmt(Number(k[0].added)) })
      : t("overview.extremes.noComponentHasLines", { knowledgeFloor: fmt(knowledgeFloor.value) }),
    evidence: k.map(r => ({ label: r.component, to: componentPath(r.component), title: t("overview.extremes.authorsCover80Lines", { cover80: r.cover80, authors: r.authors, added: fmt(Number(r.added)) }) })),
    open: { label: t("overview.extremes.authors2"), to: "/views/git/authors?grain=components" },
  });
  return out;
});
</script>
