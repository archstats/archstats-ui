import { computed, ref } from "vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { queryFileImportEdges } from "~/utils/fileImports";
import { frameworkStorageKey, loadRawClasses, rememberedFramework } from "~/utils/javaFacts";
import { classify, detectFramework, profileById } from "~/utils/javaFrameworks";
import { EMPTY_SOURCES, buildSuggestInput, placeRest, suggest, type Constraints, type Grain, type Placement, type SignalSources, type SuggestInput, type SuggestSettings, type Suggestion , type GraphMetrics } from "~/utils/suggest";

// Loads, once per snapshot and only when asked, every table the group
// suggester reads, then runs the engine for a settings object. The pair
// signals are built once per grain and reused across weight changes, so
// dragging a slider costs one clustering pass, not a reload.

const DOMAIN_LANES = new Set(["entities", "models"]);

/**
 * Change coupling, weighted by the size of the commit that produced it.
 *
 * Counting shared commits flat lets a handful of sweeps decide everything: on
 * BroadleafCommerce, 70% of all co-change evidence comes from 2.3% of commits,
 * and eleven commits alone produce a seventh of it. That is how a vendor
 * monitor handler ends up the closest thing in the codebase to the catalog
 * domain, at 719 shared commits — a licence header, not a relationship.
 *
 * So each commit contributes 1/(n-1) to every pair it touches: a commit that
 * changes two components is full evidence that they move together, one that
 * changes twenty is a twentieth of it, and a sweep above the cap is no
 * evidence at all.
 */
const BULK_COMMIT = 20;
const COCHANGE_SQL = `
  with touched as (
    select commit_hash, component from git_commits where component is not null and component <> '' group by 1, 2
  ), sized as (
    select commit_hash, count(*) n from touched group by 1
  )
  select a.component as "from", b.component as "to", sum(1.0 / (s.n - 1.0)) as count
  from touched a
  join touched b on b.commit_hash = a.commit_hash and b.component > a.component
  join sized s on s.commit_hash = a.commit_hash
  where s.n between 2 and ${BULK_COMMIT}
  group by 1, 2`;

/**
 * Everything the suggester reads, from any snapshot that answers SQL.
 *
 * Pulled out of the composable so that the bench measures the engine the app
 * runs rather than a copy of it: a harness that reimplements the loading is a
 * harness that can agree with itself while the app is wrong.
 */
export async function loadSignalSources(
  query: (sql: string) => Promise<any[]>,
  hasView: (view: string) => boolean,
  framework?: string | null,
): Promise<SignalSources> {
  const q = query;
  const hasGit = hasView("git_component_shared_commits");
  const hasJava = hasView("java_class_connections_direct");
  const [components, files, componentRefs, componentCochange, fileRefs, fileCochange, authorRows, classes, classEdges, graphRows] = await Promise.all([
    q(`select name from components`) as Promise<Array<{ name: string }>>,
    q(`select name, component from files`) as Promise<Array<{ name: string; component: string | null }>>,
    q(`select "from", "to", sum(reference_count) as "references" from component_connections_direct group by "from", "to"`),
    hasGit && hasView("git_commits") ? q(COCHANGE_SQL) : Promise.resolve([]),
    hasView("snippets") ? queryFileImportEdges(q) : Promise.resolve([]),
    hasGit && hasView("file_matrix") ? q(`select "from", "to", git_co_changes as count from file_matrix where git_co_changes > 0`) : Promise.resolve([]),
    hasView("git_commits") ? q(`select distinct author_name as author, file from git_commits`) as Promise<Array<{ author: string; file: string }>> : Promise.resolve([]),
    hasJava ? loadRawClasses(q, hasView) : Promise.resolve(new Map()),
    hasJava ? q("SELECT `from`, `to` FROM java_class_connections_direct") as Promise<Array<{ from: string; to: string }>> : Promise.resolve([]),
    // The engine already scores the graph; there is no sense in guessing
    // at what it has measured.
    hasView("component_communities")
      ? q(`select component, community_nr, community__graph__hits__hub_score as hub, community__graph__hits__authority_score as authority, community__graph__page_rank as page_rank, community__graph__betweenness as betweenness from component_communities`)
      : Promise.resolve([]),
  ]);

  const laneOfFile = new Map<string, string>();
  const laneLabels: Record<string, string> = {};
  const entityImports = new Map<string, string[]>();
  if (classes.size) {
    const detected = detectFramework([...classes.values()].map(c => c.facts));
    const profile = profileById(framework ?? detected.id);
    for (const l of profile.lanes) laneLabels[l.id] = l.label;
    const inD = new Map<string, number>(), outD = new Map<string, number>();
    for (const e of classEdges) { outD.set(e.from, (outD.get(e.from) ?? 0) + 1); inD.set(e.to, (inD.get(e.to) ?? 0) + 1); }
    const fileOfClass = new Map<string, string>();
    classes.forEach((c, id) => {
      fileOfClass.set(id, c.file);
      laneOfFile.set(c.file, classify(profile, c.facts, { inDegree: inD.get(id) ?? 0, outDegree: outD.get(id) ?? 0 }));
    });
    classes.forEach(c => {
      const ents: string[] = [];
      for (const imp of c.facts.imports) {
        const f = fileOfClass.get(imp);
        if (f && DOMAIN_LANES.has(laneOfFile.get(f) ?? "")) ents.push(f);
      }
      if (ents.length) entityImports.set(c.file, ents);
    });
  }
  const graph = new Map<string, GraphMetrics>();
  for (const r of graphRows as Array<Record<string, any>>) {
    if (!r.component) continue;
    graph.set(r.component, {
      community: r.community_nr ?? null,
      hub: Number(r.hub) || 0,
      authority: Number(r.authority) || 0,
      pageRank: Number(r.page_rank) || 0,
      betweenness: Number(r.betweenness) || 0,
    });
  }

  const authorsOfFile = new Map<string, string[]>();
  for (const r of authorRows) if (r.author && r.file) authorsOfFile.set(r.file, [...(authorsOfFile.get(r.file) ?? []), r.author]);

  return { components: components.map(c => c.name), files, componentRefs, fileRefs, componentCochange, fileCochange, laneOfFile, laneLabels, entityImports, authorsOfFile, graph };
}

export function useSuggestModel() {
  const store = useDataStore();
  const workspaces = useWorkspacesStore();
  const sources = ref<SignalSources | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let loadedFor: string | null = null;
  const inputs = new Map<string, SuggestInput>();

  const hasGit = computed(() => store.hasData && store.hasView("git_component_shared_commits"));
  const hasJava = computed(() => store.hasData && store.hasView("java_class_connections_direct"));

  async function load(): Promise<SignalSources> {
    const key = store.datasetKey ?? "";
    if (sources.value && loadedFor === key) return sources.value;
    if (pending) { const s = await pending; if (loadedFor === (store.datasetKey ?? "")) return s; }
    pending = loadNow(key);
    try { return await pending; } finally { pending = null; }
  }
  let pending: Promise<SignalSources> | null = null;

  async function loadNow(key: string): Promise<SignalSources> {
    loading.value = true;
    error.value = null;
    inputs.clear();
    try {
      sources.value = await loadSignalSources(
        (sql: string) => store.query<any>(sql),
        v => store.hasView(v),
        rememberedFramework(frameworkStorageKey(workspaces.active?.id, store.datasetKey)),
      );
      loadedFor = key;
      return sources.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      sources.value = EMPTY_SOURCES;
      loadedFor = key;
      return sources.value;
    } finally {
      loading.value = false;
    }
  }

  /** The pair signals for a grain and scope, built once per snapshot. */
  async function inputFor(settings: SuggestSettings, include: (component: string) => boolean, scopeKey: string): Promise<SuggestInput> {
    let src = await load();
    // The snapshot may have changed while loading; read the current one.
    if (loadedFor !== (store.datasetKey ?? "")) src = await load();
    const grain: Grain = settings.splitFiles ? "file" : "component";
    const cacheKey = loadedFor + "|" + grain + "|" + scopeKey;
    let input = inputs.get(cacheKey);
    if (!input) { input = buildSuggestInput(src, grain, include); inputs.set(cacheKey, input); }
    return input;
  }

  /** Runs the engine; `include` limits it to the scoped components; `constraints` reshuffle around a draft. */
  async function run(settings: SuggestSettings, include: (component: string) => boolean, taken: ReadonlySet<string>, scopeKey = "", constraints?: Constraints): Promise<Suggestion[]> {
    const input = await inputFor(settings, include, scopeKey);
    return suggest(input, settings, taken, constraints);
  }

  /** For every unplaced unit, the closest draft group. Keys are unit ids at the engine's grain. */
  async function hints(settings: SuggestSettings, include: (component: string) => boolean, placed: Map<string, string>, scopeKey = ""): Promise<{ grain: Grain; placements: Map<string, Placement> }> {
    const input = await inputFor(settings, include, scopeKey);
    return { grain: input.grain, placements: placeRest(input, settings, placed) };
  }

  function reset() { sources.value = null; loadedFor = null; inputs.clear(); }

  return { sources, loading, error, hasGit, hasJava, load, run, hints, reset };
}
