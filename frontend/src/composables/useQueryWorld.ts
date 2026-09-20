import { computed } from "vue";
import { useDataStore } from "~/stores/data";
import { useGroupsStore, type UnitKind } from "~/stores/groups";
import { useScopeStore } from "~/stores/scope";
import { parseQuery, runQuery, type QueryWorld } from "~/utils/query";
import type { AssistWorld } from "~/utils/queryAssist";
import { detectSeparator } from "~/utils/studio";

// Everything a query editor needs to know, assembled once.
//
// Three places edit a query — the toolbar, the groups manager and the
// builder's group panel — and each was assembling the same snapshot,
// separator, metric lookup and suggestion sources for itself. Three copies of
// one answer is three chances for them to drift apart, which is how the
// toolbar ended up with completions and the other two with a plain textarea.

export function useQueryWorld() {
  const data = useDataStore();
  const groups = useGroupsStore();
  const scope = useScopeStore();

  const components = computed(() => Array.from(data.componentFilesIndex.keys()));
  const files = computed(() => Array.from(data.fileComponentIndex.keys()));
  const sep = computed(() => detectSeparator(components.value));

  /** One number about one unit, through the snapshot's own metric names. */
  const metric = computed(() => {
    const m = groups.metrics;
    if (!m) return undefined;
    return (kind: UnitKind, id: string, name: string): number | undefined => {
      const row = (kind === "component" ? m.components : m.files).get(id);
      if (!row) return undefined;
      const v = row[m.alias.get(name.toLowerCase()) ?? name];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };
  });

  const world = computed<QueryWorld>(() => ({
    components: components.value,
    files: files.value,
    componentSep: sep.value,
    metric: metric.value,
  }));

  /**
   * What the suggestions may know: the snapshot, and what has been asked
   * before. Metric names come from `_metric_definitions`, so an extension
   * that adds a metric extends the suggestions without anyone wiring it.
   */
  const assistWorld = computed<AssistWorld>(() => {
    const m = groups.metrics;
    return {
      components: components.value,
      files: files.value,
      sep: sep.value,
      metrics: m ? Array.from(new Set(m.alias.values())).map(id => ({ id: shortest(id, m.alias), label: readable(id) })) : [],
      valuesOf: (name, kind) => {
        if (!m) return [];
        const column = m.alias.get(name.toLowerCase()) ?? name;
        const out: number[] = [];
        for (const row of (kind === "component" ? m.components : m.files).values()) {
          const v = row[column];
          if (typeof v === "number" && Number.isFinite(v)) out.push(v);
        }
        return out;
      },
      recents: scope.recents,
      saved: groups.groups.filter(g => g.query).map(g => ({ name: g.name, query: g.query! })),
    };
  });

  /** What a query comes to, for a caller that has no scope to read. */
  function countOf(text: string): { components: number; files: number } {
    if (!text.trim()) return { components: 0, files: 0 };
    const r = runQuery(parseQuery(text), world.value);
    return { components: r.components.length, files: r.files.length };
  }

  /** Load the numbers a `where` clause and its thresholds both ask for. */
  function ready(): void {
    void groups.ensureMetrics();
  }

  return { components, files, sep, world, assistWorld, countOf, ready };
}

/** The shortest unambiguous alias for a column, which is what people type. */
function shortest(id: string, alias: Map<string, string>): string {
  let best = id;
  for (const [short, column] of alias) if (column === id && short.length < best.length) best = short;
  return best;
}

function readable(id: string): string {
  return id.split("__").slice(-1)[0].replace(/_/g, " ");
}
