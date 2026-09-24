import { computed, type Ref } from "vue";
import { useDataStore } from "~/stores/data";
import { useGroupsStore, type Coverage, type SavedGroup } from "~/stores/groups";

/** A saved group resolved to component grain for the tree and the hulls. */
export interface RollupGroup {
  id: string
  name: string
  color: string
  dimension: string
  /** Components held whole or in part. */
  members: string[]
  coverage: Map<string, Coverage>
  files: Set<string>
}
import { useScopeStore } from "~/stores/scope";
import { useLensStore } from "~/stores/lens";
import { useWorkspacesStore } from "~/stores/workspaces";
import { componentLabel } from "~/utils/routes";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { queryFileImportEdges } from "~/utils/fileImports";
import { TRUSTED_PAIR_SQL } from "~/utils/cochange";
import {
  type CEdge, type CNode, type CycleMode, type Level, type RawEdge, type Source,
  buildTreeNodes, cycleEdgeKeys, directedReferenceEdges, levelOf, normalizeEdges, presetOpenIds,
  reindexEdges, stronglyConnectedSets, treeResolver, undirectedSharedCommitEdges,
} from "~/utils/connections";

// The picture is one tree: groups of the roll-up dimension hold components,
// components hold files, and each node is open or closed. Raw rows load once
// per level of detail; everything after that (source, scope, search, hidden,
// colour dimension, cycles) is synchronous derivation.

interface ComponentRow { name: string; lines: number | null; health: number | null; hotspot: number | null }
interface FileRow { name: string; component: string | null; lines: number | null; health: number | null; hotspot: number | null }

interface RawComponentData {
  components: ComponentRow[]
  filesPerComponent: Map<string, number>
  /** Lines of every file, for sizing the part of a component a group holds. */
  fileLines: Map<string, number>
  staticEdges: RawEdge[]
  gitEdges: RawEdge[]
}
interface RawFileData { files: FileRow[]; staticEdges: RawEdge[]; gitEdges: RawEdge[] }

const EMPTY_COMPONENTS: RawComponentData = { components: [], filesPerComponent: new Map(), fileLines: new Map(), staticEdges: [], gitEdges: [] };
const EMPTY_FILES: RawFileData = { files: [], staticEdges: [], gitEdges: [] };

export interface Hull { key: string; name: string; color: string; members: string[]; dashed?: boolean }

export function useConnectionsModel(opts: {
  source: Ref<Source>
  by: Ref<string | null>
  color: Ref<string | null>
  cycles: Ref<CycleMode>
  query: Ref<string>
  hidden: Ref<Set<string>>
  openIds: Ref<Set<string>>
  selectedId: Ref<string | null>
  selectedCycleId: Ref<string | null>
}) {
  const store = useDataStore();
  const groups = useGroupsStore();
  const scope = useScopeStore();
  const workspaces = useWorkspacesStore();

  const hasGit = computed(() => store.hasData && store.hasView("git_component_shared_commits"));

  const componentData = useAsyncQuery<RawComponentData>(async () => {
    if (!store.hasData) return EMPTY_COMPONENTS;
    const [components, fileCounts, fileLineRows, staticRows, gitRows] = await Promise.all([
      store.query<ComponentRow>(`select name, complexity__lines as lines, codesmells__code_health as health, codesmells__hotspot_score as hotspot from components`),
      store.query<{ component: string; n: number }>(`select component, count(*) as n from files group by component`),
      store.query<{ name: string; lines: number | null }>(`select name, complexity__lines as lines from files`),
      store.query<{ from: string; to: string; references: number }>(`select "from", "to", sum(reference_count) as "references" from ${store.runtimeComponentEdges} group by "from", "to"`),
      hasGit.value ? store.query<{ from: string; to: string; sharedCommits: number }>(`select pair_1 as "from", pair_2 as "to", shared_commits as sharedCommits from git_component_shared_commits where shared_commits > 0 and ${TRUSTED_PAIR_SQL}`) : Promise.resolve([]),
    ]);
    return { components, filesPerComponent: new Map(fileCounts.map(r => [r.component, r.n])), fileLines: new Map(fileLineRows.map(r => [r.name, Number(r.lines) || 0])), staticEdges: directedReferenceEdges(staticRows), gitEdges: undirectedSharedCommitEdges(gitRows) };
  }, [], { initial: EMPTY_COMPONENTS });

  const componentIds = computed(() => new Set(componentData.data.value.components.map(c => c.name)));
  // File rows are only worth loading once a component is open.
  const needFiles = computed(() => { for (const id of opts.openIds.value) if (componentIds.value.has(id)) return true; return false; });

  const fileData = useAsyncQuery<RawFileData>(async () => {
    if (!store.hasData || !needFiles.value) return EMPTY_FILES;
    const [files, importEdges, gitRows] = await Promise.all([
      store.query<FileRow>(`select name, component, complexity__lines as lines, codesmells__code_health as health, codesmells__hotspot_score as hotspot from files`),
      queryFileImportEdges(sql => store.query(sql), v => store.hasView(v)),
      store.hasView("file_matrix") ? store.query<{ from: string; to: string; sharedCommits: number }>(`select "from", "to", git_co_changes as sharedCommits from file_matrix where git_co_changes > 0`) : Promise.resolve([]),
    ]);
    return { files, staticEdges: directedReferenceEdges(importEdges), gitEdges: undirectedSharedCommitEdges(gitRows) };
  }, [needFiles], { initial: EMPTY_FILES });

  const loading = computed(() => componentData.loading.value || (needFiles.value && fileData.loading.value));
  const error = computed(() => componentData.error.value ?? fileData.error.value);

  // ── Dimensions ──────────────────────────────────────────────────────────
  const dimensions = computed(() => groups.dimensions);
  const rollupDimension = computed(() => (opts.by.value && dimensions.value.includes(opts.by.value) ? opts.by.value : null));
  const lens = useLensStore();
  const colorDimension = computed(() => {
    const c = opts.color.value;
    if (c && dimensions.value.includes(c)) return c;
    return rollupDimension.value ?? lens.active ?? null;
  });
  // A group seen from component grain: the components it holds, whole or in
  // part. A component that sits in two groups of one dimension goes with the
  // group holding more of its files.
  const toRollup = (g: SavedGroup): RollupGroup => {
    const cov = groups.componentsOf(g);
    return { id: g.id, name: g.name, color: g.color, dimension: g.dimension, members: Array.from(cov.keys()), coverage: cov, files: groups.filesOf(g) };
  };
  const rollupGroups = computed<RollupGroup[]>(() => (rollupDimension.value ? groups.groups.filter(g => g.dimension === rollupDimension.value).map(toRollup) : []));
  const colorGroups = computed<RollupGroup[]>(() => (colorDimension.value ? groups.groups.filter(g => g.dimension === colorDimension.value).map(toRollup) : []));
  const bestGroupOf = (list: RollupGroup[]) => {
    const m = new Map<string, RollupGroup>();
    for (const g of list) for (const [c, cov] of g.coverage) {
      const cur = m.get(c);
      if (!cur || cov.files > (cur.coverage.get(c)?.files ?? 0)) m.set(c, g);
    }
    return m;
  };
  const componentOfFile = computed(() => {
    const m = new Map<string, string>();
    for (const [component, files] of store.componentFilesIndex as Map<string, string[]>) for (const f of files) m.set(f, component);
    return m;
  });
  const rollupOf = computed(() => bestGroupOf(rollupGroups.value));
  const colorOf = computed(() => bestGroupOf(colorGroups.value));

  // ── Tree ────────────────────────────────────────────────────────────────
  const filesByComponent = computed(() => {
    const m = new Map<string, FileRow[]>();
    for (const f of fileData.data.value.files) { if (!f.component) continue; m.set(f.component, [...(m.get(f.component) ?? []), f]); }
    return m;
  });
  const fileRows = computed(() => new Map(fileData.data.value.files.map(f => [f.name, f])));
  const componentRows = computed(() => new Map(componentData.data.value.components.map(c => [c.name, c])));

  const matchesQuery = (label: string) => { const q = opts.query.value.trim().toLowerCase(); return !q || label.toLowerCase().includes(q); };

  const scopedComponentIds = computed(() => componentData.data.value.components.map(c => c.name).filter(c => scope.componentInScope(c)));

  const allNodes = computed<CNode[]>(() => {
    const data = componentData.data.value;
    const scoped = new Set(scopedComponentIds.value);
    const groupsInScope = rollupGroups.value.map(g => ({ ...g, members: g.members.filter(m => scoped.has(m) && rollupOf.value.get(m) === g) })).filter(g => g.members.length > 0);
    return buildTreeNodes<RollupGroup>({
      groups: groupsInScope,
      componentIds: scopedComponentIds.value,
      filesOf: id => (filesByComponent.value.get(id) ?? []).map(f => f.name),
      openIds: opts.openIds.value,
      groupNode: g => ({
        id: g.id, label: g.name, kind: "group", color: g.color,
        // A partial component counts the lines of the files the group holds.
        // It was pro-rated by file count ("lines are only known per
        // component", which they are not): a median error of 16-21%, and
        // double the size one time in ten.
        lines: g.members.reduce((s, m) => {
          const cov = g.coverage.get(m);
          if (!cov || cov.full) return s + (componentRows.value.get(m)?.lines ?? 0);
          let held = 0;
          for (const f of g.files) if (componentOfFile.value.get(f) === m) held += data.fileLines.get(f) ?? 0;
          return s + held;
        }, 0),
        files: g.members.reduce((s, m) => { const cov = g.coverage.get(m); return s + (cov && !cov.full ? cov.files : (data.filesPerComponent.get(m) ?? 0)); }, 0),
      }),
      componentNode: (id, g) => {
        const c = componentRows.value.get(id);
        return {
          id, label: componentLabel(id, workspaces.active?.name), kind: "component", group: g?.name ?? colorOf.value.get(id)?.name, color: colorOf.value.get(id)?.color,
          lines: c?.lines ?? undefined, files: data.filesPerComponent.get(id), health: c?.health ?? undefined, hotspot: c?.hotspot ?? undefined,
        };
      },
      fileNode: (file, c) => {
        const f = fileRows.value.get(file);
        return { id: file, label: file, kind: "file", group: c, color: colorOf.value.get(c)?.color, lines: f?.lines ?? undefined, health: f?.health ?? undefined, hotspot: f?.hotspot ?? undefined };
      },
    });
  });

  const nodes = computed<CNode[]>(() => allNodes.value.filter(n => matchesQuery(n.label) && !opts.hidden.value.has(n.id)));
  /** Raw component-grain edges for the active source, scoped; the cross-cut reads these. */
  const componentEdges = computed<RawEdge[]>(() => {
    const scoped = new Set(scopedComponentIds.value);
    return rawFor(componentData.data.value).filter(e => scoped.has(e.from) && scoped.has(e.to));
  });
  const filesOfComponent = computed(() => {
    const m = new Map<string, string[]>();
    for (const c of scopedComponentIds.value) m.set(c, store.componentFilesIndex.get(c) ?? []);
    return m;
  });
  const visibleIds = computed(() => new Set(nodes.value.map(n => n.id)));
  const directed = computed(() => opts.source.value === "static");

  function rawFor(data: { staticEdges: RawEdge[]; gitEdges: RawEdge[] }): RawEdge[] {
    if (opts.source.value === "static") return data.staticEdges;
    if (opts.source.value === "git") return data.gitEdges;
    return [...data.staticEdges, ...data.gitEdges];
  }

  const edges = computed<CEdge[]>(() => {
    // Once any component is open, file-level rows carry the whole picture so
    // an open component's files and its closed neighbours share one source.
    const useFiles = needFiles.value && fileData.data.value.files.length > 0;
    // With a component open, file edges carry only the pairs that touch an
    // open component; pairs of closed components keep the engine's component
    // edges. Rebuilding every edge from file rows changed the weight of edges
    // nobody had opened -- doubling every one of them in a C# codebase.
    const isOpen = (component: string | null | undefined) => !!component && opts.openIds.value.has(component);
    const raw = useFiles
      ? [
          ...rawFor(componentData.data.value).filter(e => !isOpen(e.from) && !isOpen(e.to)),
          ...rawFor(fileData.data.value).filter(e => isOpen(fileRows.value.get(e.from)?.component) || isOpen(fileRows.value.get(e.to)?.component)),
        ]
      : rawFor(componentData.data.value);
    const resolve = treeResolver({
      groupOf: c => rollupOf.value.get(c)?.id ?? null,
      componentOf: f => fileRows.value.get(f)?.component ?? null,
      isFile: id => useFiles && fileRows.value.has(id),
      openIds: opts.openIds.value,
      visible: visibleIds.value,
    });
    return normalizeEdges(opts.source.value, reindexEdges(raw, resolve, directed.value));
  });

  // ── Cycles at the current level ─────────────────────────────────────────
  const cycleSets = computed<string[][]>(() => (directed.value ? stronglyConnectedSets(visibleIds.value, edges.value) : []));
  const cycleSetOf = computed(() => { const m = new Map<string, string[]>(); for (const set of cycleSets.value) for (const id of set) m.set(id, set); return m; });
  const markedSets = computed<string[][]>(() => {
    if (opts.cycles.value === "off") return [];
    if (opts.cycles.value === "all") return cycleSets.value;
    const focus = opts.selectedCycleId.value ?? opts.selectedId.value;
    const set = focus ? cycleSetOf.value.get(focus) : undefined;
    return set ? [set] : [];
  });
  const cycleKeys = computed(() => cycleEdgeKeys(edges.value, markedSets.value));
  const cycleNodes = computed(() => new Set(markedSets.value.flat()));

  // Cycles hidden inside closed nodes: for a closed group, the strongly
  // connected sets among its members under component edges.
  const componentCycleSets = computed(() => stronglyConnectedSets(componentIds.value, componentData.data.value.staticEdges));
  const badges = computed(() => {
    const m = new Map<string, number>();
    if (!directed.value || opts.cycles.value === "off") return m;
    for (const n of nodes.value) {
      if (n.kind !== "group") continue;
      const members = new Set(rollupGroups.value.find(g => g.id === n.id)?.members ?? []);
      const inside = componentCycleSets.value.filter(set => set.every(id => members.has(id))).length;
      if (inside > 0) m.set(n.id, inside);
    }
    return m;
  });

  // ── Hulls: open roll-up groups outline their visible members ───────────
  const hulls = computed<Hull[]>(() => {
    const out: Hull[] = [];
    for (const g of rollupGroups.value) {
      if (!opts.openIds.value.has(g.id)) continue;
      const members: string[] = [];
      for (const n of nodes.value) {
        const component = n.kind === "file" ? (n.group ?? "") : n.id;
        if (n.kind === "group") continue;
        if (n.kind === "file" ? g.files.has(n.id) : g.members.includes(component)) members.push(n.id);
      }
      if (members.length >= 2) out.push({ key: "g:" + g.id, name: g.name, color: g.color, members });
    }
    return out;
  });

  const rollupGroupIds = computed(() => rollupGroups.value.map(g => g.id));
  const level = computed<Level | null>(() => levelOf(opts.openIds.value, rollupGroupIds.value, scopedComponentIds.value));
  function openIdsForLevel(lvl: Level): Set<string> { return presetOpenIds(lvl, rollupGroupIds.value, scopedComponentIds.value); }

  const membershipsOf = (componentId: string): SavedGroup[] => groups.componentGroupIndex.get(componentId) ?? [];
  const coverageOf = (groupId: string, componentId: string): Coverage | null => {
    const g = groups.getGroupById(groupId);
    return g ? groups.coverage(g, componentId) : null;
  };

  return {
    nodes, edges, directed, loading, error, hasGit, componentEdges, filesOfComponent,
    dimensions, rollupDimension, colorDimension, rollupGroups, level, openIdsForLevel, componentIds, fileRows,
    cycleSets, cycleSetOf, cycleKeys, cycleNodes, badges, hulls, membershipsOf, coverageOf,
    reload: componentData.reload,
  };
}
