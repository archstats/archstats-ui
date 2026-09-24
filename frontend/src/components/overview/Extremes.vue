<template>
  <section v-if="data.hasData" class="ui-panel mt-8 overflow-hidden" aria-labelledby="extremes-title">
    <div class="flex items-baseline gap-3 px-4 pb-2 pt-3 hairline-b">
      <h2 id="extremes-title" class="ui-panel-title">Extremes in this snapshot</h2>
      <span class="text-sm text-neutral-500">Sorted evidence, one sort per row. Where to look first; what it means is yours to judge.</span>
      <span v-if="scope.isActive" class="ml-auto text-sm text-neutral-500">{{ scopeNote }}</span>
    </div>
    <ul>
      <li v-for="row in rows" :key="row.id" class="flex flex-col gap-1.5 px-4 py-3 hairline-b last:border-0 md:flex-row md:items-baseline md:gap-6">
        <div class="md:w-[300px] md:shrink-0">
          <p class="text-sm font-medium text-neutral-900">
            <template v-if="row.id === 'ca'">Highest Ca among components with I &gt;
              <input v-model.number="caThreshold" type="number" min="0" max="1" step="0.05" class="ui-input ui-input-sm inline-block w-16 px-1 py-0 font-mono" aria-label="Instability threshold">
            </template>
            <template v-else-if="row.id === 'knowledge'">Fewest authors covering 80% of lines, among components with ≥
              <input v-model.number="knowledgeFloor" type="number" min="0" step="500" class="ui-input ui-input-sm inline-block w-20 px-1 py-0 font-mono" aria-label="Lines added floor"> lines added
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
        <router-link v-if="row.open" :to="row.open.to" class="shrink-0 text-sm text-neutral-500 hover:text-neutral-900">Open in {{ row.open.label }} →</router-link>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useDataStore } from "~/stores/data";
import { useScopeStore } from "~/stores/scope";
import { useAuthorsStore } from "~/stores/authors";
import { knowledgeSql } from "~/utils/authors";
import { looksLikeProductionCode } from "~/utils/fileRole";
import { componentPath, filePath } from "~/utils/routes";
import { scopeLabel } from "~/utils/scopeSql";

// Where to look in the first hour: a handful of fixed sorts over this
// snapshot, each named for what it sorts by and filters on. No row ranks
// against another, and a row with nothing to show still says so.

const data = useDataStore();
const scope = useScopeStore();
const caThreshold = ref(0.5);
const scopeNote = computed(() => `Within ${scopeLabel()}`);
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

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
    title: "Highest hotspot · production files",
    filter: recorded ? "Tests, generated, third-party and non-code files left out" : "Tests, stylesheets, data and vendored libraries left out by path convention; scan again for recorded roles",
    sentence: prod.length ? `${prod[0].name.split("/").pop()} scores ${fmt(prod[0].hotspot)} of 100: it changes most, weighted by its size.` : "No production file has a hotspot score here.",
    evidence: prod.map(f => ({ label: f.name.split("/").pop() ?? f.name, to: filePath(f.name), title: `${f.name} · hotspot ${fmt(f.hotspot)}` })),
    open: { label: "Hotspots", to: "/views/components/hotspots" },
  });

  const t = tangles.value.map(x => ({ ...x, list: String(x.members).split("\n") })).filter(x => x.list.some(m => scope.componentInScope(m)));
  out.push({
    id: "tangle",
    title: "Largest tangle",
    filter: "Components that can each reach every other by imports",
    sentence: t.length ? `${fmt(t[0].size)} components form one tangle${t.length > 1 ? `; ${fmt(t.length - 1)} smaller tangle${t.length === 2 ? "" : "s"} besides` : ""}.` : "No tangle: every dependency runs one way.",
    evidence: t.length ? t[0].list.slice(0, 3).map(m => ({ label: m, to: componentPath(m, "cycles"), title: m })) : [],
    open: { label: "Cycles", to: "/views/components/cycles" },
  });

  const unstable = (data.allComponents as any[])
    .filter(c => c.name !== "." && scope.componentInScope(c.name) && Number(c.modularity__instability) > caThreshold.value && Number.isFinite(Number(c.modularity__coupling__afferent)))
    .sort((a, b) => Number(b.modularity__coupling__afferent) - Number(a.modularity__coupling__afferent))
    .slice(0, 3);
  out.push({
    id: "ca",
    title: "",
    filter: "Depended on (Ca) while depending more than it is depended on",
    sentence: unstable.length ? `${unstable[0].name} is used by ${fmt(Number(unstable[0].modularity__coupling__afferent))} components at instability ${Number(unstable[0].modularity__instability).toFixed(2)}.` : `No component above instability ${caThreshold.value} is depended on.`,
    evidence: unstable.map(c => ({ label: c.name, to: componentPath(c.name), title: `Ca ${c.modularity__coupling__afferent} · I ${Number(c.modularity__instability).toFixed(2)}` })),
    open: { label: "Metrics", to: "/views/metrics?grain=components" },
  });

  const rc = ruleCounts.value.filter(r => scope.componentInScope(r.component)).slice(0, 3);
  out.push({
    id: "rules",
    title: "Most rule findings",
    filter: "Imports a module rule forbids, by the component they start in",
    sentence: !data.hasView("rules") ? "Rules were not checked in this snapshot." : rc.length ? `${rc[0].component} starts ${fmt(rc[0].n)} forbidden import${rc[0].n === 1 ? "" : "s"}.` : "No module rule is broken.",
    evidence: rc.map(r => ({ label: r.component, to: componentPath(r.component), title: `${r.n} findings` })),
    open: { label: "Rules", to: "/views/rules" },
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
    filter: recorded ? "Mostly production files · lines added, not blame · bots hidden · aliases merged" : "Mostly production files by path convention · lines added, not blame · bots hidden · aliases merged",
    sentence: !data.hasView("git_commits") ? "No git history in this snapshot." : k.length
      ? `${k[0].component}: ${Number(k[0].cover80) === 1 ? `one author, ${authors.display(k[0].main)},` : `${fmt(Number(k[0].cover80))} of ${fmt(Number(k[0].authors))} authors`} added 80% of its ${fmt(Number(k[0].added))} lines.`
      : `No component has ${fmt(knowledgeFloor.value)} lines added.`,
    evidence: k.map(r => ({ label: r.component, to: componentPath(r.component), title: `${r.cover80} of ${r.authors} authors cover 80% of ${fmt(Number(r.added))} lines` })),
    open: { label: "Authors", to: "/views/git/authors?grain=components" },
  });
  return out;
});
</script>
