// What stands out in a snapshot's metrics, as facts in words: the entry
// page of Metrics. Every finding carries the rows behind it, a small figure,
// and the view that answers it best, opened already set up. Evidence, never
// verdicts: a finding says what the numbers do, not what to think of them.

import { formatReading } from "~/shared/format";
import { finiteSorted, metricValue, quantile, readPlot, splitName } from "./plotReading";
import { spearman, strengthWord, type Brushes } from "./lab";

type Row = { name: string; [key: string]: any };

export type Lens = "table" | "plot" | "matrix" | "strips" | "profiles";

/** Where a finding sends the reader, and how that view should open. */
export interface Go {
  view: Lens;
  pair?: [string, string];
  preset?: string;
  brushes?: Brushes;
  selected?: string[];
  sort?: string;
}

export type Figure =
  | { kind: "bars"; values: number[]; hot: number }
  | { kind: "scatter"; x: string; y: string; hot: string[] }
  | { kind: "profiles"; keys: string[]; hot: string[] }
  | { kind: "hbars"; items: Array<{ name: string; value: number }>; median: number };

export interface Finding {
  id: string;
  title: string;
  text: string;
  /** Further lines of the same finding, one fact each. */
  more?: string[];
  names: string[];
  figure: Figure;
  action: { label: string; go: Go };
}

const COMMITS = "git__commits__total";
const HEALTH = "codesmells__code_health";
const HOTSPOT = "codesmells__hotspot_score";
const DEPENDENTS = "modularity__coupling__dependents";

const pct = (x: number) => `${Math.round(x * 100)}%`;

// Pairs related by how the engine computes them: instability is built from
// the coupling counts, the hotspot score from change, size and health. That
// they correlate is arithmetic, not a finding.
const COUPLING = ["modularity__coupling__dependents", "modularity__coupling__dependencies", "modularity__coupling__afferent", "modularity__coupling__efferent"];
const BY_DEFINITION: Array<[string, string[]]> = [
  ["modularity__instability", COUPLING],
  ["codesmells__hotspot_score", ["git__commits__total", "complexity__lines", "codesmells__code_health"]],
];
const definitional = (a: string, b: string) =>
  BY_DEFINITION.some(([k, list]) => (a === k && list.includes(b)) || (b === k && list.includes(a)));
const tail = (name: string) => splitName(name).tail;
export { definitional };
const rho2 = (r: number) => (r < 0 ? `−${Math.abs(r).toFixed(2)}` : r.toFixed(2));

export function summarize(
  rows: Row[],
  metrics: string[],
  opts: { niceName: (key: string) => string; noun: string; one: string },
): Finding[] {
  const { niceName, noun, one } = opts;
  const has = (k: string) => metrics.includes(k) && rows.some((r) => Number.isFinite(metricValue(r, k)));
  const count = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? one : noun}`;
  const out: Finding[] = [];

  // 1. How concentrated change is.
  if (has(COMMITS) && rows.length >= 10) {
    const ranked = rows
      .map((r) => ({ name: r.name, v: metricValue(r, COMMITS) }))
      .filter((p) => Number.isFinite(p.v))
      .sort((a, b) => b.v - a.v);
    const total = ranked.reduce((s, p) => s + p.v, 0);
    if (total > 0) {
      const top = Math.max(1, Math.round(ranked.length * 0.1));
      const share = ranked.slice(0, top).reduce((s, p) => s + p.v, 0) / total;
      out.push({
        id: "concentration",
        title: share >= 0.4 ? "Change concentrates" : "Change is spread out",
        text: `The busiest ${count(top)} of ${ranked.length.toLocaleString("en-US")} carry ${pct(share)} of all commits.`,
        names: ranked.slice(0, 3).map((p) => p.name),
        figure: { kind: "bars", values: ranked.map((p) => p.v), hot: top },
        action: { label: "Show them in Strips", go: { view: "strips", sort: COMMITS, brushes: { [COMMITS]: [ranked[top - 1].v, ranked[0].v] } } },
      });
    }
  }

  // 2 and 3. Which metrics move together, and which pull apart.
  const pairs: Array<{ a: string; b: string; rho: number }> = [];
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      if (definitional(metrics[i], metrics[j])) continue;
      const { rho } = spearman(rows, metrics[i], metrics[j]);
      if (Number.isFinite(rho)) pairs.push({ a: metrics[i], b: metrics[j], rho });
    }
  }
  const together = pairs.filter((p) => p.rho >= 0.4).sort((x, y) => y.rho - x.rho);
  if (together.length) {
    const [first, ...rest] = together;
    out.push({
      id: "together",
      title: "Metrics that move together",
      text: `${niceName(first.a)} and ${niceName(first.b)} rise together: ρ ${rho2(first.rho)}, ${strengthWord(first.rho)}, by rank.`,
      more: rest.slice(0, 2).map((p) => `${niceName(p.a)} and ${niceName(p.b)}: ρ ${rho2(p.rho)}`),
      names: [],
      figure: { kind: "scatter", x: first.a, y: first.b, hot: [] },
      action: { label: "Compare every pair", go: { view: "matrix", pair: [first.a, first.b] } },
    });
  }
  const apart = pairs.filter((p) => p.rho <= -0.3).sort((x, y) => x.rho - y.rho)[0];
  if (apart) {
    out.push({
      id: "apart",
      title: "Pulling opposite ways",
      text: `As ${niceName(apart.a)} rises, ${niceName(apart.b)} falls: ρ ${rho2(apart.rho)}, ${strengthWord(apart.rho)}, by rank.`,
      names: [],
      figure: { kind: "scatter", x: apart.a, y: apart.b, hot: [] },
      action: { label: "Open the plot", go: { view: "plot", pair: [apart.a, apart.b] } },
    });
  }

  // 4. Changing often while scoring lower on health.
  if (has(COMMITS) && has(HEALTH)) {
    const r = readPlot(rows, rows, COMMITS, HEALTH);
    const br = r.cells.find((c) => c.id === "br")?.names ?? [];
    if (br.length) {
      const byHeat = [...br].sort((a, b) => {
        const ra = rows.find((q) => q.name === a)!, rb = rows.find((q) => q.name === b)!;
        return (metricValue(rb, HOTSPOT) || 0) - (metricValue(ra, HOTSPOT) || 0);
      });
      out.push({
        id: "churn-health",
        title: "Changing often, lower health",
        text: `${count(br.length)} have more commits than the median (${formatReading(r.mx)}) and a Code Health below it (${formatReading(r.my)}).`,
        names: byHeat.slice(0, 3),
        figure: { kind: "scatter", x: COMMITS, y: HEALTH, hot: br },
        action: { label: "Read the plot", go: { view: "plot", preset: "churn-health", selected: br } },
      });
    }
  }

  // 5. Far out on several metrics at once.
  if (metrics.length >= 4 && rows.length >= 20) {
    const edges = new Map(metrics.map((k) => {
      const s = finiteSorted(rows.map((r) => metricValue(r, k)));
      // Health's extreme is its low end; every other metric's is its high end.
      return [k, k === HEALTH ? { low: true, at: quantile(s, 0.05) } : { low: false, at: quantile(s, 0.95) }] as const;
    }));
    const hits = rows.map((r) => {
      let n = 0;
      for (const [k, e] of edges) {
        const v = metricValue(r, k);
        if (!Number.isFinite(v)) continue;
        if (e.low ? v <= e.at : v >= e.at && v > 0) n++;
      }
      return { name: r.name, n };
    }).sort((a, b) => b.n - a.n);
    const need = hits.filter((h) => h.n >= 3).length >= 1 ? 3 : 2;
    const far = hits.filter((h) => h.n >= need);
    if (far.length) {
      out.push({
        id: "far-out",
        title: "Far out on several metrics",
        text: `${count(far.length)} sit in the outer 5% on ${need} or more of these ${metrics.length} metrics.`,
        names: far.slice(0, 3).map((h) => h.name),
        figure: { kind: "profiles", keys: metrics, hot: far.slice(0, 8).map((h) => h.name) },
        action: { label: "Compare their profiles", go: { view: "profiles", selected: far.map((h) => h.name) } },
      });
    }
  }

  // 6. What the most code depends on.
  if (has(DEPENDENTS)) {
    const ranked = rows
      .map((r) => ({ name: r.name, value: metricValue(r, DEPENDENTS) }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => b.value - a.value);
    const med = quantile(finiteSorted(ranked.map((p) => p.value)), 0.5);
    if (ranked.length && ranked[0].value > 0) {
      out.push({
        id: "hubs",
        title: "Most depended on",
        text: `${tail(ranked[0].name)} is used by ${ranked[0].value.toLocaleString("en-US")} other ${noun}; the median ${one} by ${formatReading(med)}.`,
        names: ranked.slice(0, 3).map((p) => p.name),
        figure: { kind: "hbars", items: ranked.slice(0, 5), median: med },
        action: { label: "See where they stand", go: { view: "strips", sort: DEPENDENTS, selected: ranked.slice(0, 5).map((p) => p.name) } },
      });
    }
  }

  return out;
}
