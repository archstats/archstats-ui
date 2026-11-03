import { metricsPath } from "~/features/metrics/link";
import { componentPath, filePath } from "~/features/navigation/routes";
import { intlLocale, listOf, t } from "~/shared/i18n";
import type { ArchFacts, Detector, Evidence, FileFact, Finding, Names, OverviewFacts } from "./findings";

// Findings about the architecture: how the components lean on each other,
// how they change together, what they share at runtime, and what the code
// carries that is not the team's own. Each reads the snapshot's facts and
// has nothing to say, or says one thing with its evidence and a relevance
// for the order. Types only come from findings.ts, which lists these.

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const n = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString(intlLocale, { maximumFractionDigits: v > 0 && v < 0.1 ? 1 : 0 })}%`;
const isCode = (f: FileFact) => f.role === "production";
const productionLines = (x: OverviewFacts) => x.files.reduce((s, f) => s + (isCode(f) ? f.lines : 0), 0);
const allLines = (x: OverviewFacts) => x.files.reduce((s, f) => s + f.lines, 0);
const pairEvidence = (names: Names, a: string, b: string, arrow: string, title?: string): Evidence =>
  ({ label: `${names.component(a).label} ${arrow} ${names.component(b).label}`, to: componentPath(a), title: title ?? `${a} ${arrow} ${b}` });

type Arch = (a: ArchFacts, x: OverviewFacts, names: Names) => Finding | null;
const withArch = (detect: Arch): Detector => (x, names) => (x.arch ? detect(x.arch, x, names) : null);

/** Lines per component from the production files. */
function linesByComponent(x: OverviewFacts): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of x.files) if (isCode(f) && f.component) out.set(f.component, (out.get(f.component) ?? 0) + f.lines);
  return out;
}

// ── Structure ───────────────────────────────────────────────────────────

/** Concrete, stable and depended on by many: every change to it is expensive (Martin's zone of pain). */
const zonePain: Detector = (x, names) => {
  const floor = Math.max(10, Math.round(x.components.length * 0.03));
  const rows = x.components
    .filter((c) => c.abstractness != null && c.instability != null && c.abstractness < 0.1 && c.instability < 0.3 && (c.dependents ?? 0) >= floor)
    .sort((a, b) => (b.dependents ?? 0) - (a.dependents ?? 0));
  if (!rows.length) return null;
  return {
    id: "zonePain", relevance: 0.3 + 0.5 * clamp(rows.length / 15),
    title: t("overview.architectureFindings.zonePainTitle"),
    body: t("overview.architectureFindings.zonePainBody", { count: rows.length, floor }),
    figure: { kind: "rank", values: rows.map((c) => c.dependents ?? 0), hot: rows.length },
    evidence: rows.slice(0, 3).map((c) => names.component(c.name, t("overview.architectureFindings.usedByInstability", { count: c.dependents ?? 0, instability: (c.instability ?? 0).toFixed(2) }))),
    open: { label: t("overview.findings.metrics"), to: metricsPath({ view: "plot", pair: ["modularity__instability", "modularity__abstractness"], selected: rows.map((c) => c.name) }) },
  };
};

/** Abstract and unstable: interfaces and base classes that little depends on. */
const zoneUseless: Detector = (x, names) => {
  const lines = linesByComponent(x);
  const rows = x.components.filter((c) => (c.abstractness ?? 0) > 0.6 && (c.instability ?? 0) > 0.7 && (lines.get(c.name) ?? 0) >= 200);
  if (!rows.length) return null;
  return {
    id: "zoneUseless", relevance: 0.1 + 0.25 * clamp(rows.length / 5),
    title: t("overview.architectureFindings.zoneUselessTitle"),
    body: t("overview.architectureFindings.zoneUselessBody", { count: rows.length }),
    figure: { kind: "stat", value: n(rows.length), caption: t("common.noun.component", { count: rows.length }) },
    evidence: rows.slice(0, 3).map((c) => names.component(c.name)),
    open: { label: t("overview.findings.metrics"), to: metricsPath({ view: "plot", pair: ["modularity__instability", "modularity__abstractness"], selected: rows.map((c) => c.name) }) },
  };
};

/** A stable component that many depend on, depending on one that changes easily (stable dependencies principle). */
const unstableDeps: Detector = withArch((a, x, names) => {
  const by = new Map(x.components.map((c) => [c.name, c]));
  const pairs = a.edges
    .map(([from, to]) => ({ from: by.get(from), to: by.get(to) }))
    .filter((p) => p.from && p.to && p.from.instability != null && p.to.instability != null && (p.from.dependents ?? 0) >= 5 && p.to.instability - p.from.instability > 0.3)
    .sort((p, q) => (q.from!.dependents ?? 0) - (p.from!.dependents ?? 0));
  if (!pairs.length) return null;
  return {
    id: "unstableDeps", relevance: 0.15 + 0.5 * clamp(pairs.length / 40),
    title: t("overview.architectureFindings.unstableDepsTitle"),
    body: t("overview.architectureFindings.unstableDepsBody", { count: pairs.length }),
    figure: { kind: "stat", value: n(pairs.length), caption: t("overview.architectureFindings.dependencies", { count: pairs.length }) },
    evidence: pairs.slice(0, 3).map((p) => pairEvidence(names, p.from!.name, p.to!.name, "→",
      t("overview.architectureFindings.instabilityPair", { from: (p.from!.instability ?? 0).toFixed(2), to: (p.to!.instability ?? 0).toFixed(2) }))),
    open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
});

/** Two components that import each other: neither can change, be tested or move alone. */
const mutualPairs: Detector = withArch((a, _x, names) => {
  const set = new Set(a.edges.map(([f, t]) => `${f}\u0000${t}`));
  const pairs = a.edges.filter(([f, t]) => f < t && set.has(`${t}\u0000${f}`));
  if (!pairs.length) return null;
  return {
    id: "mutualPairs", relevance: 0.2 + 0.5 * clamp(pairs.length / 40),
    title: t("overview.architectureFindings.mutualTitle"),
    body: t("overview.architectureFindings.mutualBody", { count: pairs.length }),
    figure: { kind: "stat", value: n(pairs.length), caption: t("overview.architectureFindings.pairs", { count: pairs.length }) },
    evidence: pairs.slice(0, 3).map(([f, t]) => pairEvidence(names, f, t, "⇄")),
    open: { label: t("overview.findings.cycles"), to: "/views/components/cycles" },
  };
});

/** One component that depends on a large share of the others: it changes whenever they do. */
const fanOut: Detector = (x, names) => {
  const ranked = x.components.filter((c) => (c.dependencies ?? 0) > 0).sort((a, b) => (b.dependencies ?? 0) - (a.dependencies ?? 0));
  const top = ranked[0];
  if (!top || x.components.length < 10) return null;
  const share = (top.dependencies ?? 0) / (x.components.length - 1);
  if (share < 0.05) return null;
  return {
    id: "fanOut", relevance: 0.7 * clamp(share / 0.25),
    title: t("overview.architectureFindings.fanOutTitle"),
    body: t("overview.architectureFindings.fanOutBody", { component: names.component(top.name).label, count: top.dependencies ?? 0, share: pct(share) }),
    figure: { kind: "rank", values: ranked.map((c) => c.dependencies ?? 0), hot: 1 },
    evidence: ranked.slice(0, 3).map((c) => names.component(c.name, t("overview.architectureFindings.dependsOn", { count: c.dependencies ?? 0 }))),
    open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
};

/** The component the most dependency paths run through: a change there travels furthest. */
const bottleneck: Detector = (x, names) => {
  const ranked = x.components.filter((c) => (c.betweenness ?? 0) > 0).sort((a, b) => (b.betweenness ?? 0) - (a.betweenness ?? 0));
  const total = ranked.reduce((s, c) => s + (c.betweenness ?? 0), 0);
  const top = ranked[0];
  if (!top || !total || ranked.length < 10) return null;
  const share = (top.betweenness ?? 0) / total;
  return {
    id: "bottleneck", relevance: 0.6 * clamp(share / 0.15),
    title: t("overview.architectureFindings.bottleneckTitle"),
    body: t("overview.architectureFindings.bottleneckBody", { component: names.component(top.name).label, share: pct(share) }),
    figure: { kind: "rank", values: ranked.map((c) => c.betweenness ?? 0), hot: 1 },
    evidence: ranked.slice(0, 3).map((c) => names.component(c.name)),
    open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
};

/** Components nothing imports and that declare no entry point: dead, or reached only by framework wiring. */
const orphans: Detector = withArch((a, x, names) => {
  const lines = linesByComponent(x);
  const entries = new Set(a.entryComponents);
  const rows = x.components
    .filter((c) => c.name !== "." && (c.dependents ?? 0) === 0 && !entries.has(c.name) && (lines.get(c.name) ?? 0) >= 50)
    .sort((p, q) => (lines.get(q.name) ?? 0) - (lines.get(p.name) ?? 0));
  const total = productionLines(x);
  if (!rows.length || !total) return null;
  const share = rows.reduce((s, c) => s + (lines.get(c.name) ?? 0), 0) / total;
  return {
    id: "orphans", relevance: 0.6 * clamp(share / 0.15),
    title: t("overview.architectureFindings.orphansTitle"),
    body: t("overview.architectureFindings.orphansBody", { count: rows.length, share: pct(share) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofProductionCode") },
    evidence: rows.slice(0, 3).map((c) => names.component(c.name, t("common.count.line", { count: lines.get(c.name) ?? 0 }))),
    open: { label: t("overview.findings.metrics"), to: metricsPath({ view: "table", sort: "complexity__lines", selected: rows.map((c) => c.name) }) },
  };
});

/** Build modules that depend on each other in a circle: they can only be built and released together. */
const moduleCycles: Detector = withArch((a) => {
  const moduleOf = new Map(a.modules.map((m) => [m.component, m.module]));
  const graph = new Map<string, Set<string>>();
  for (const [f, to] of a.edges) {
    const mf = moduleOf.get(f), mt = moduleOf.get(to);
    if (!mf || !mt || mf === mt) continue;
    if (!graph.has(mf)) graph.set(mf, new Set());
    graph.get(mf)!.add(mt);
  }
  const cycles = stronglyConnected(graph).filter((c) => c.length > 1).sort((p, q) => q.length - p.length);
  if (!cycles.length) return null;
  const largest = cycles[0];
  return {
    id: "moduleCycles", relevance: 0.55 + 0.3 * clamp(largest.length / 6),
    title: t("overview.architectureFindings.moduleCyclesTitle"),
    body: t("overview.architectureFindings.moduleCyclesBody", { count: cycles.length, size: largest.length, modules: listOf(largest.slice(0, 3)) }),
    figure: { kind: "stat", value: n(largest.length), caption: t("overview.architectureFindings.modulesInCircle") },
    evidence: [], open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
});

/** Tarjan's strongly connected components, iterative so deep graphs do not overflow the stack. */
function stronglyConnected(graph: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>();
  const stack: string[] = [], out: string[][] = [];
  let next = 0;
  const nodes = new Set<string>([...graph.keys(), ...[...graph.values()].flatMap((s) => [...s])]);
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; it: Iterator<string> }> = [];
    const open = (v: string) => { index.set(v, next); low.set(v, next); next++; stack.push(v); on.add(v); work.push({ node: v, it: (graph.get(v) ?? new Set<string>()).values() }); };
    open(root);
    while (work.length) {
      const top = work[work.length - 1];
      const step = top.it.next();
      if (!step.done) {
        const w = step.value;
        if (!index.has(w)) open(w);
        else if (on.has(w)) low.set(top.node, Math.min(low.get(top.node)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) low.set(work[work.length - 1].node, Math.min(low.get(work[work.length - 1].node)!, low.get(top.node)!));
      if (low.get(top.node) === index.get(top.node)) {
        const scc: string[] = [];
        let w: string;
        do { w = stack.pop()!; on.delete(w); scc.push(w); } while (w !== top.node);
        out.push(scc);
      }
    }
  }
  return out;
}

// ── Change ──────────────────────────────────────────────────────────────

/** Components that change in the same commits without importing each other: a dependency the code does not show. */
const hiddenCoupling: Detector = withArch((a, _x, names) => {
  if (!a.coChange.length) return null;
  return {
    id: "hiddenCoupling", relevance: 0.15 + 0.6 * clamp(a.coChange.length / 30),
    title: t("overview.architectureFindings.hiddenTitle"),
    body: t("overview.architectureFindings.hiddenBody", { count: a.coChange.length, a: names.component(a.coChange[0].a).label, b: names.component(a.coChange[0].b).label, shared: a.coChange[0].shared, share: pct(a.coChange[0].share) }),
    figure: { kind: "stat", value: n(a.coChange.length), caption: t("overview.architectureFindings.pairs", { count: a.coChange.length }) },
    evidence: a.coChange.slice(0, 3).map((p) => pairEvidence(names, p.a, p.b, "⇄", t("overview.architectureFindings.sharedCommits", { count: p.shared, share: pct(p.share) }))),
    open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
});

/** Commits that touch many components at once: one change, many places (shotgun surgery). */
const shotgun: Detector = withArch((a) => {
  if (!a.shotgun || a.shotgun.commits < 100) return null;
  const share = a.shotgun.wide / a.shotgun.commits;
  if (share < 0.05) return null;
  return {
    id: "shotgun", relevance: 0.6 * clamp((share - 0.03) / 0.2),
    title: t("overview.architectureFindings.shotgunTitle"),
    body: t("overview.architectureFindings.shotgunBody", { share: pct(share), wide: n(a.shotgun.wide), commits: n(a.shotgun.commits) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofCommits") },
    evidence: [], open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
});

/** Code whose main author has stopped committing: the knowledge left with them. */
const abandoned: Detector = (x, names) => {
  const end = x.history.last ? new Date(x.history.last).getTime() : 0;
  if (!end) return null;
  const lines = linesByComponent(x);
  const rows = x.knowledge
    .filter((r) => r.mainShare >= 0.5 && r.mainLast && (lines.get(r.component) ?? 0) >= 1000 && end - new Date(r.mainLast).getTime() > 365 * 86400000)
    .sort((p, q) => (lines.get(q.component) ?? 0) - (lines.get(p.component) ?? 0));
  const total = productionLines(x);
  if (!rows.length || !total) return null;
  const share = rows.reduce((s, r) => s + (lines.get(r.component) ?? 0), 0) / total;
  return {
    id: "abandoned", relevance: 0.7 * clamp(share / 0.4),
    title: t("overview.architectureFindings.abandonedTitle"),
    body: t("overview.architectureFindings.abandonedBody", { count: rows.length, share: pct(share) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofProductionCode") },
    evidence: rows.slice(0, 3).map((r) => names.component(r.component, t("overview.architectureFindings.mainShare", { share: pct(r.mainShare) }))),
    open: { label: t("overview.findings.authors"), to: "/views/git/authors?grain=components" },
  };
};

/** Code untouched for two years: stable, or nobody dares. Either way, nobody has it fresh in mind. */
const frozen: Detector = withArch((a) => {
  if (!a.frozen || !a.frozen.total) return null;
  const share = a.frozen.frozen / a.frozen.total;
  if (share < 0.25) return null;
  return {
    id: "frozen", relevance: 0.1 + 0.25 * clamp(share / 0.6),
    title: t("overview.architectureFindings.frozenTitle"),
    body: t("overview.architectureFindings.frozenBody", { share: pct(share) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofProductionCode") },
    evidence: [], open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
});

/** Where the code grew most lately: the part of the system being built now. */
const growth: Detector = withArch((a, _x, names) => {
  const rows = a.growth.filter((g) => g.lines > 0);
  const top = rows[0];
  if (!top || top.lines < 2000) return null;
  const total = rows.reduce((s, g) => s + g.lines, 0);
  return {
    id: "growth", relevance: 0.25 + 0.2 * clamp(top.lines / total),
    title: t("overview.architectureFindings.growthTitle"),
    body: t("overview.architectureFindings.growthBody", { component: names.component(top.component).label, lines: n(top.lines), share: pct(top.lines / total) }),
    figure: { kind: "rank", values: rows.map((g) => g.lines), hot: 1 },
    evidence: rows.slice(0, 3).map((g) => names.component(g.component, t("overview.architectureFindings.netLines", { lines: n(g.lines) }))),
    open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
});

// ── Code ────────────────────────────────────────────────────────────────

const fileEvidence = (rows: Array<{ file: string; n: number }>, names: Names) =>
  rows.slice(0, 3).map((r) => names.path(r.file, t("overview.architectureFindings.functionsInFile", { name: r.file, count: r.n })));

/** Functions too complex to hold in one head (cognitive complexity 25 or more). */
const complexFunctions: Detector = withArch((a, _x, names) => {
  const f = a.functions;
  if (!f || !f.complex) return null;
  const inTop = f.complexFiles.slice(0, 5).reduce((s, r) => s + r.n, 0);
  return {
    id: "complexFunctions", relevance: 0.6 * clamp(f.complex / 200),
    title: t("overview.architectureFindings.complexTitle"),
    body: t("overview.architectureFindings.complexBody", { count: f.complex, total: n(f.total), top: n(inTop) }),
    figure: { kind: "rank", values: f.complexFiles.map((r) => r.n), hot: 5 },
    evidence: fileEvidence(f.complexFiles, names),
    open: { label: t("overview.findings.hotspots"), to: "/views/components/hotspots" },
  };
});

/** Functions of 150 lines or more: several jobs in one place. */
const longFunctions: Detector = withArch((a, _x, names) => {
  const f = a.functions;
  if (!f || !f.long) return null;
  return {
    id: "longFunctions", relevance: 0.5 * clamp(f.long / 150),
    title: t("overview.architectureFindings.longTitle"),
    body: t("overview.architectureFindings.longBody", { count: f.long }),
    figure: { kind: "rank", values: f.longFiles.map((r) => r.n), hot: 3 },
    evidence: fileEvidence(f.longFiles, names),
    open: { label: t("overview.findings.hotspots"), to: "/views/components/hotspots" },
  };
});

/** Third-party code committed into the repository: it ages without updates. */
const vendored: Detector = (x) => {
  const total = allLines(x);
  const lines = x.files.reduce((s, f) => s + (f.role === "third_party" ? f.lines : 0), 0);
  if (!total || lines / total < 0.05) return null;
  const share = lines / total;
  const big = x.files.filter((f) => f.role === "third_party").sort((a, b) => b.lines - a.lines).slice(0, 3);
  return {
    id: "vendored", relevance: 0.7 * clamp(share / 0.3),
    title: t("overview.architectureFindings.vendoredTitle"),
    body: t("overview.architectureFindings.vendoredBody", { share: pct(share), lines: n(lines) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofAllLines") },
    evidence: big.map((f) => ({ label: f.name.split("/").pop() ?? f.name, to: filePath(f.name), title: f.name })),
    open: { label: t("overview.findings.snapshot"), to: "/views/snapshot" },
  };
};

/** Generated code committed: reviews, diffs and metrics read it as if someone wrote it. */
const generated: Detector = (x) => {
  const total = allLines(x);
  const lines = x.files.reduce((s, f) => s + (f.role === "generated" ? f.lines : 0), 0);
  if (!total || lines / total < 0.02) return null;
  const share = lines / total;
  return {
    id: "generated", relevance: 0.5 * clamp(share / 0.2),
    title: t("overview.architectureFindings.generatedTitle"),
    body: t("overview.architectureFindings.generatedBody", { share: pct(share), lines: n(lines) }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofAllLines") },
    evidence: [], open: { label: t("overview.findings.snapshot"), to: "/views/snapshot" },
  };
};

/** The same type name declared in many components: copies, or one idea with no home. */
const sameNames: Detector = withArch((a) => {
  if (a.sameNames.length < 10) return null;
  const top = a.sameNames[0];
  return {
    id: "sameNames", relevance: 0.5 * clamp(a.sameNames.length / 100),
    title: t("overview.architectureFindings.sameNamesTitle"),
    body: t("overview.architectureFindings.sameNamesBody", { count: a.sameNames.length, name: top.name, components: top.components }),
    figure: { kind: "rank", values: a.sameNames.map((r) => r.components), hot: 3 },
    evidence: a.sameNames.slice(0, 3).map((r) => ({ label: `${r.name} ×${r.components}`, to: `/views/units?q=${encodeURIComponent(r.name)}`, title: r.name })),
    open: { label: t("overview.findings.units"), to: "/views/units" },
  };
});

// ── Data and boundaries ─────────────────────────────────────────────────

/** One data entity read or written by many components: they are coupled through the database. */
const sharedEntities: Detector = withArch((a) => {
  const shared = a.entities.filter((e) => e.components >= 3);
  const top = shared[0];
  if (!top) return null;
  const short = (e: string) => e.split(".").pop() ?? e;
  return {
    id: "sharedEntities", relevance: 0.15 + 0.55 * clamp(top.components / 12),
    title: t("overview.architectureFindings.entitiesTitle"),
    body: t("overview.architectureFindings.entitiesBody", { entity: short(top.entity), components: top.components, count: shared.length }),
    figure: { kind: "rank", values: a.entities.map((e) => e.components), hot: shared.length },
    evidence: shared.slice(0, 3).map((e) => ({ label: `${short(e.entity)} ×${e.components}`, to: "/views/units", title: e.entity })),
    open: { label: t("overview.findings.units"), to: "/views/units" },
  };
});

/** Components that serve HTTP and read or write the database themselves: no layer between. */
const endpointsToData: Detector = withArch((a, _x, names) => {
  if (!a.http || !a.http.withData.length) return null;
  return {
    id: "endpointsToData", relevance: 0.3 + 0.4 * clamp(a.http.withData.length / 10),
    title: t("overview.architectureFindings.endpointsDataTitle"),
    body: t("overview.architectureFindings.endpointsDataBody", { count: a.http.withData.length }),
    figure: { kind: "stat", value: n(a.http.withData.length), caption: t("common.noun.component", { count: a.http.withData.length }) },
    evidence: a.http.withData.slice(0, 3).map((c) => names.component(c)),
    open: { label: t("overview.findings.http"), to: "/views/http" },
  };
});

/** Calls to outside systems with no retry, timeout or circuit breaker the scan could see. */
const outbound: Detector = withArch((a, _x, names) => {
  const o = a.outbound;
  if (!o || o.calls < 5 || o.components < 3) return null;
  const unprotected = o.resilient === 0;
  return {
    id: "outbound", relevance: unprotected ? 0.25 + 0.35 * clamp(o.components / 30) : 0.2 * clamp(o.components / 30),
    title: unprotected ? t("overview.architectureFindings.outboundUnprotectedTitle") : t("overview.architectureFindings.outboundTitle"),
    body: unprotected
      ? t("overview.architectureFindings.outboundUnprotectedBody", { calls: n(o.calls), systems: o.systems, components: o.components })
      : t("overview.architectureFindings.outboundBody", { calls: n(o.calls), systems: o.systems, components: o.components }),
    figure: { kind: "rank", values: o.top.map((r) => r.n), hot: 3 },
    evidence: o.top.slice(0, 3).map((r) => names.component(r.component, t("overview.architectureFindings.calls", { count: r.n }))),
    open: { label: t("overview.findings.http"), to: "/views/http" },
  };
});

/** HTTP endpoints that declare no access control in code: open, or guarded somewhere the scan cannot see. */
const openEndpoints: Detector = withArch((a) => {
  const h = a.http;
  if (!h || h.endpoints < 10 || !h.noAuth) return null;
  const share = h.noAuth / h.endpoints;
  return {
    id: "openEndpoints", relevance: share >= 0.1 ? 0.2 + 0.35 * clamp(share) : 0.2,
    title: t("overview.architectureFindings.openEndpointsTitle"),
    body: share === 1 ? t("overview.architectureFindings.openEndpointsAll", { count: h.endpoints }) : t("overview.architectureFindings.openEndpointsBody", { open: n(h.noAuth), count: h.endpoints }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofEndpoints") },
    evidence: [], open: { label: t("overview.findings.http"), to: "/views/http" },
  };
});

/** HTTP endpoints without documentation the scan could find (OpenAPI annotations or a spec). */
const undocumented: Detector = withArch((a) => {
  const h = a.http;
  if (!h || h.endpoints < 20) return null;
  const share = 1 - h.documented / h.endpoints;
  if (share < 0.8) return null;
  return {
    id: "undocumented", relevance: 0.2,
    title: t("overview.architectureFindings.undocumentedTitle"),
    body: t("overview.architectureFindings.undocumentedBody", { documented: n(h.documented), count: h.endpoints }),
    figure: { kind: "share", share, caption: t("overview.architectureFindings.ofEndpoints") },
    evidence: [], open: { label: t("overview.findings.http"), to: "/views/http" },
  };
});

export const ARCHITECTURE_DETECTORS: Detector[] = [
  moduleCycles, zonePain, unstableDeps, mutualPairs, hiddenCoupling, fanOut, bottleneck, orphans,
  abandoned, shotgun, frozen, growth,
  complexFunctions, longFunctions, vendored, generated, sameNames,
  sharedEntities, endpointsToData, outbound, openEndpoints, undocumented, zoneUseless,
];
