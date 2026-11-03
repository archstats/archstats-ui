import { HEALTH_THRESHOLDS, HOTSPOT_THRESHOLDS } from "~/features/metrics/useHealth";
import { metricsPath } from "~/features/metrics/link";
import { distinctTails } from "~/features/metrics/plotReading";
import { componentPath, filePath } from "~/features/navigation/routes";
import { composition, isCodePath, type FileRole } from "~/features/snapshot/languages";
import { formatDate } from "~/shared/time";
import { ARCHITECTURE_DETECTORS } from "./architectureFindings";
import { intlLocale, listOf, t } from "~/shared/i18n";

// Findings: the Overview's "where to look first". Every detector reads the
// same facts about the snapshot and either has nothing to say or returns one
// finding with a relevance between 0 and 1: how far out of the ordinary the
// thing it measures is. The Overview shows the most relevant first. Relevance
// orders the list; it is not a grade, and every finding states its evidence.

export interface FileFact {
  name: string;
  lines: number;
  role: FileRole;
  health: number | null;
  hotspot: number | null;
  component: string | null;
  commits: number | null;
}

export interface OverviewFacts {
  files: FileFact[];
  readings: Record<string, number | null>;
  components: Array<{ name: string; dependents: number | null; instability: number | null; abstractness?: number | null; dependencies?: number | null; betweenness?: number | null; lines?: number | null }>;
  tangles: Array<{ size: number; members: string[] }>;
  knowledge: Array<{ component: string; added: number; cover80: number; mainShare: number; mainLast?: string | null }>;
  rules: Array<{ component: string; n: number }>;
  /** First and last commit to files in the snapshot, and when the scan ran. */
  history: { first: string | null; last: string | null; scan: string | null };
  /** The day on which the most of today's lines first appeared, and how many. */
  arrival: { date: string; lines: number } | null;
  /** Commits in the last 90 days of history, by component. */
  recent: Array<{ component: string; n: number }>;
  shallow: boolean;
  /** What the architecture findings read; absent from snapshots that lack the tables. */
  arch?: ArchFacts;
}

/** Facts about the shape, data and change of the system, one per question the architecture findings ask. */
export interface ArchFacts {
  /** Runtime dependencies between components, one per pair. */
  edges: Array<[string, string]>;
  /** The build module each component's files belong to. */
  modules: Array<{ component: string; module: string }>;
  /** Components that declare an entry point (an endpoint, a main, a schedule, a listener). */
  entryComponents: string[];
  /** Component pairs that change together often without either importing the other. */
  coChange: Array<{ a: string; b: string; shared: number; share: number }>;
  /** Commits, and those that touched five components or more. */
  shotgun: { commits: number; wide: number } | null;
  /** Production lines, and those whose file has not changed in the two years before the last commit. */
  frozen: { total: number; frozen: number } | null;
  /** Net lines added per component in the last 180 days of history, most first. */
  growth: Array<{ component: string; lines: number }>;
  functions: { total: number; complex: number; long: number; complexFiles: Array<{ file: string; n: number }>; longFiles: Array<{ file: string; n: number }> } | null;
  /** Type names declared in three components or more. */
  sameNames: Array<{ name: string; components: number }>;
  /** Data entities by how many components read or write them. */
  entities: Array<{ entity: string; components: number }>;
  http: { endpoints: number; noAuth: number; documented: number; withData: string[] } | null;
  outbound: { calls: number; systems: number; components: number; resilient: number; top: Array<{ component: string; n: number }> } | null;
}

export interface Evidence { label: string; to: string; title?: string }

/**
 * The small figure beside a finding. `share`: one part of a whole, its value
 * written over a bar. `rank`: every item by value, largest first, the first
 * `hot` inked. `stat`: a number and what it counts.
 */
export type FindingFigure =
  | { kind: "share"; share: number; caption: string }
  | { kind: "rank"; values: number[]; hot: number }
  | { kind: "stat"; value: string; caption: string };

export interface Finding {
  id: string;
  relevance: number;
  title: string;
  body: string;
  figure: FindingFigure;
  evidence: Evidence[];
  open?: { label: string; to: string };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const n = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 0 });
const one = (v: number) => v.toLocaleString(intlLocale, { maximumFractionDigits: 1 });
export const pct = (v: number) => `${(v * 100).toLocaleString(intlLocale, { maximumFractionDigits: v > 0 && v < 0.1 ? 1 : 0 })}%`;
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const byDesc = (values: number[]) => values.filter((v) => v > 0).sort((a, b) => b - a);

/** Production code: written in a programming language, not a test, generated or vendored. */
export const isCode = (f: FileFact) => f.role === "production" && isCodePath(f.name);

// ── Shared readings of the facts ────────────────────────────────────────

/** Lines per role, over every file. */
export function roleLines(files: FileFact[]): Record<FileRole, number> {
  const out: Record<FileRole, number> = { production: 0, test: 0, generated: 0, third_party: 0, non_code: 0 };
  for (const f of files) out[f.role] += f.lines;
  return out;
}

export interface HealthReading {
  /** Mean code health of production code, weighted by lines. */
  mean: number | null;
  /**
   * Mean health where the work happens: weighted by lines times commits, so a
   * large file that changes all the time counts for far more than a data class
   * nobody touches. Null when the snapshot has no commit counts.
   */
  worked: number | null;
  /** Production lines in healthy, watch and alert files. */
  good: number; warn: number; bad: number;
  scored: number;
}

/** Code health over production code, by lines. Unscored files are left out. */
export function healthReading(files: FileFact[]): HealthReading {
  let good = 0, warn = 0, bad = 0, weighted = 0, work = 0, workWeighted = 0;
  for (const f of files) {
    if (!isCode(f) || f.health === null || f.health < 1 || f.lines <= 0) continue;
    weighted += f.health * f.lines;
    const effort = f.lines * (f.commits ?? 0);
    work += effort;
    workWeighted += f.health * effort;
    if (f.health >= HEALTH_THRESHOLDS.good) good += f.lines;
    else if (f.health >= HEALTH_THRESHOLDS.warn) warn += f.lines;
    else bad += f.lines;
  }
  const scored = good + warn + bad;
  return { mean: scored ? weighted / scored : null, worked: work ? workWeighted / work : null, good, warn, bad, scored };
}

export interface HealthDistribution {
  /** Half-point buckets from 1 to 10: the share of production lines, and of work (lines × commits), in each. */
  buckets: Array<{ from: number; code: number; work: number }>;
  /** The same shares per band: alert below 5, watch 5 to 8, healthy 8 and up. */
  bands: Record<"bad" | "warn" | "good", { code: number; work: number }>;
}

/** Where the code sits on the health scale, and where the work sits. */
export function healthDistribution(files: FileFact[], step = 0.5): HealthDistribution {
  const count = Math.round(9 / step);
  const code = Array.from({ length: count }, () => 0), work = Array.from({ length: count }, () => 0);
  const bands = { bad: { code: 0, work: 0 }, warn: { code: 0, work: 0 }, good: { code: 0, work: 0 } };
  let lines = 0, effort = 0;
  for (const f of files) {
    if (!isCode(f) || f.health === null || f.health < 1 || f.lines <= 0) continue;
    const i = Math.min(count - 1, Math.floor((f.health - 1) / step));
    const e = f.lines * (f.commits ?? 0);
    code[i] += f.lines; work[i] += e; lines += f.lines; effort += e;
    const band = f.health >= HEALTH_THRESHOLDS.good ? bands.good : f.health >= HEALTH_THRESHOLDS.warn ? bands.warn : bands.bad;
    band.code += f.lines; band.work += e;
  }
  const of = (v: number, total: number) => (total ? v / total : 0);
  for (const b of Object.values(bands)) { b.code = of(b.code, lines); b.work = of(b.work, effort); }
  return { buckets: code.map((c, i) => ({ from: 1 + i * step, code: of(c, lines), work: of(work[i], effort) })), bands };
}

export interface HealthDetail {
  /** Components by their mean health over production code, lowest first; small ones left out. */
  components: Array<{ component: string; health: number; lines: number }>;
  /** Production code files by health, lowest first; tiny ones left out. */
  files: FileFact[];
  /** Share of the unhealthy lines that sit in files changing often. */
  inHotspots: number | null;
}

/** The lowest-scoring components and files, and whether the unhealthy code changes. */
export function healthDetail(files: FileFact[], minComponentLines = 1000, minFileLines = 100): HealthDetail {
  const by = new Map<string, { weighted: number; lines: number }>();
  const scored: FileFact[] = [];
  let bad = 0, badHot = 0, anyHotspot = false;
  for (const f of files) {
    if (!isCode(f) || f.health === null || f.health < 1 || f.lines <= 0) continue;
    scored.push(f);
    if (f.component) {
      const row = by.get(f.component) ?? { weighted: 0, lines: 0 };
      row.weighted += f.health * f.lines; row.lines += f.lines;
      by.set(f.component, row);
    }
    if (f.hotspot !== null) anyHotspot = true;
    if (f.health >= HEALTH_THRESHOLDS.warn) continue;
    bad += f.lines;
    if ((f.hotspot ?? 0) >= HOTSPOT_THRESHOLDS.warn) badHot += f.lines;
  }
  const components = [...by.entries()].filter(([, r]) => r.lines >= minComponentLines)
    .map(([component, r]) => ({ component, health: r.weighted / r.lines, lines: r.lines }))
    .sort((a, b) => a.health - b.health || b.lines - a.lines);
  const low = scored.filter((f) => f.lines >= minFileLines).sort((a, b) => (a.health ?? 0) - (b.health ?? 0) || b.lines - a.lines);
  return { components, files: low, inHotspots: bad && anyHotspot ? badHot / bad : null };
}

/** Production code lines by component, largest first. */
function componentLines(files: FileFact[]): Array<{ name: string; lines: number; files: FileFact[] }> {
  const by = new Map<string, { name: string; lines: number; files: FileFact[] }>();
  for (const f of files) {
    if (!isCode(f) || !f.component) continue;
    const row = by.get(f.component) ?? { name: f.component, lines: 0, files: [] };
    row.lines += f.lines;
    row.files.push(f);
    by.set(f.component, row);
  }
  return [...by.values()].sort((a, b) => b.lines - a.lines);
}

// ── Detectors ───────────────────────────────────────────────────────────

/** How many of the largest values a ranked figure draws: the head is the story, a long tail draws as a flat line. */
const RANK_HEAD = 40;

/** Names as the evidence shows them: the shortest tail that tells them apart. */
export interface Names { file(f: FileFact, title?: string): Evidence; path(name: string, title?: string): Evidence; component(name: string, title?: string): Evidence }

export type Detector = (facts: OverviewFacts, names: Names) => Finding | null;

const shallow: Detector = (x) => !x.shallow ? null : {
  id: "shallow", relevance: 0.95,
  title: t("overview.findings.shallowTitle"), body: t("overview.findings.shallowBody"),
  figure: { kind: "stat", value: "--depth", caption: t("overview.findings.shallowCaption") },
  evidence: [], open: { label: t("overview.findings.snapshot"), to: "/views/snapshot" },
};

const noTests: Detector = (x) => {
  const roles = roleLines(x.files);
  if (roles.production < 2000) return null;
  const share = roles.test / (roles.production + roles.test);
  if (share >= 0.02) return null;
  return {
    id: "tests", relevance: roles.test === 0 ? 0.9 : 0.6,
    title: roles.test === 0 ? t("overview.findings.noTestsTitle") : t("overview.findings.fewTestsTitle"),
    body: t("overview.findings.testsBody", { test: t("common.count.line", { count: roles.test }), production: n(roles.production) }),
    figure: roles.test === 0
      ? { kind: "stat", value: "0", caption: t("overview.findings.testLines") }
      : { kind: "share", share, caption: t("overview.findings.ofLinesAreTests") },
    evidence: [], open: { label: t("overview.findings.snapshot"), to: "/views/snapshot" },
  };
};

const tangles: Detector = (x, names) => {
  const share = x.readings.app__lines_in_tangles_share;
  const largest = x.tangles[0];
  if (share == null || !largest || largest.size < 2) return null;
  return {
    id: "tangles", relevance: clamp((share - 0.05) / 0.45),
    title: t("overview.findings.tanglesTitle"),
    body: t("overview.findings.tanglesBody", { share: pct(share), size: largest.size, count: x.tangles.length }),
    figure: { kind: "share", share, caption: t("overview.findings.ofLines") },
    evidence: largest.members.slice(0, 3).map((m) => names.component(m)),
    open: { label: t("overview.findings.cycles"), to: "/views/components/cycles" },
  };
};

const hotspot: Detector = (x, names) => {
  const hot = x.files.filter((f) => isCode(f) && (f.hotspot ?? 0) > 0).sort((a, b) => (b.hotspot ?? 0) - (a.hotspot ?? 0));
  const top = hot[0];
  if (!top) return null;
  const commits = top.commits ?? 0;
  return {
    id: "hotspot", relevance: 0.85 * clamp(Math.log10(commits + 1) / 3) * clamp(top.lines / 2000),
    title: t("overview.findings.hotspotTitle"),
    body: t("overview.findings.hotspotBody", { name: names.file(top).label, lines: n(top.lines), commits: t("common.count.commit", { count: commits }) }),
    figure: { kind: "rank", values: hot.map((f) => f.hotspot ?? 0), hot: 1 },
    evidence: hot.slice(0, 3).map((f) => names.file(f)),
    open: { label: t("overview.findings.hotspots"), to: "/views/components/hotspots" },
  };
};

const concentration: Detector = (x, names) => {
  const comps = componentLines(x.files);
  const total = comps.reduce((s, c) => s + c.lines, 0);
  const top = comps[0];
  if (!top || !total || comps.length < 5) return null;
  const share = top.lines / total;
  if (share < 0.08) return null;
  // Very large files that hardly ever changed are usually generated.
  const big = top.files.filter((f) => f.lines >= 5000).sort((a, b) => b.lines - a.lines);
  const generated = big.length > 0 && big.every((f) => (f.commits ?? 0) <= 2);
  const body = t("overview.findings.concentrationBody", { component: names.component(top.name).label, share: pct(share), lines: n(top.lines), files: n(top.files.length) });
  return {
    id: "concentration", relevance: clamp((share - 0.05) / 0.25),
    title: t("overview.findings.concentrationTitle"),
    body: generated ? `${body} ${t("overview.findings.concentrationGenerated", { count: big.length })}` : body,
    figure: { kind: "rank", values: comps.map((c) => c.lines), hot: 1 },
    evidence: [names.component(top.name), ...big.slice(0, 2).map((f) => names.file(f))],
    open: { label: t("overview.findings.metrics"), to: metricsPath({ view: "table", sort: "complexity__lines", selected: [top.name] }) },
  };
};

const bigFiles: Detector = (x, names) => {
  const code = x.files.filter(isCode).sort((a, b) => b.lines - a.lines);
  const big = code.filter((f) => f.lines >= 5000);
  if (!big.length) return null;
  return {
    id: "bigFiles", relevance: 0.6 * clamp(big.length / 8),
    title: t("overview.findings.bigFilesTitle"),
    body: t("overview.findings.bigFilesBody", { count: big.length, name: names.file(big[0]).label, lines: n(big[0].lines) }),
    figure: { kind: "rank", values: code.map((f) => f.lines), hot: big.length },
    evidence: big.slice(0, 3).map((f) => names.file(f, t("overview.findings.linesEvidence", { name: f.name, lines: n(f.lines) }))),
    open: { label: t("overview.findings.metrics"), to: metricsPath({ grain: "files", view: "table", sort: "complexity__lines" }) },
  };
};

const hub: Detector = (x, names) => {
  const ranked = x.components.filter((c) => c.name !== "." && (c.dependents ?? 0) > 0).sort((a, b) => (b.dependents ?? 0) - (a.dependents ?? 0));
  const top = ranked[0];
  if (!top || x.components.length < 10) return null;
  const share = (top.dependents ?? 0) / (x.components.length - 1);
  const unstable = (top.instability ?? 0) > 0.5;
  const params = { component: names.component(top.name).label, count: top.dependents ?? 0, share: pct(share), instability: (top.instability ?? 0).toFixed(2) };
  return {
    id: "hub", relevance: clamp(share / 0.3) * (unstable ? 1 : 0.8),
    title: t("overview.findings.hubTitle"),
    body: unstable ? t("overview.findings.hubUnstable", params) : t("overview.findings.hubBody", params),
    figure: { kind: "rank", values: ranked.map((c) => c.dependents ?? 0), hot: 1 },
    evidence: ranked.slice(0, 3).map((c) => names.component(c.name, t("overview.findings.usedBy", { count: c.dependents ?? 0 }))),
    open: { label: t("overview.findings.connections"), to: "/views/connections" },
  };
};

const knowledge: Detector = (x, names) => {
  if (!x.knowledge.length) return null;
  const lines = new Map(componentLines(x.files).map((c) => [c.name, c.lines]));
  const total = [...lines.values()].reduce((s, v) => s + v, 0);
  const solo = x.knowledge.filter((k) => k.mainShare >= 0.9 && k.added >= 1000 && lines.has(k.component))
    .sort((a, b) => (lines.get(b.component) ?? 0) - (lines.get(a.component) ?? 0));
  if (!solo.length || !total) return null;
  const share = solo.reduce((s, k) => s + (lines.get(k.component) ?? 0), 0) / total;
  return {
    id: "knowledge", relevance: clamp(share / 0.6),
    title: t("overview.findings.knowledgeTitle"),
    body: t("overview.findings.knowledgeBody", { share: pct(share), count: solo.length }),
    figure: { kind: "share", share, caption: t("overview.findings.ofCodeLines") },
    evidence: solo.slice(0, 3).map((k) => names.component(k.component, t("overview.findings.mainShare", { share: pct(k.mainShare) }))),
    open: { label: t("overview.findings.authors"), to: "/views/git/authors?grain=components" },
  };
};

const arrival: Detector = (x) => {
  const total = x.files.reduce((s, f) => s + f.lines, 0);
  if (!x.arrival || !total || !x.history.first) return null;
  const share = x.arrival.lines / total;
  // The first commit of a repository is how every history starts; a bulk
  // arrival says something only when it came later.
  if (share < 0.25 || x.arrival.date.slice(0, 10) === x.history.first.slice(0, 10)) return null;
  return {
    id: "arrival", relevance: clamp((share - 0.15) / 0.5),
    title: t("overview.findings.arrivalTitle"),
    body: t("overview.findings.arrivalBody", { share: pct(share), date: formatDate(x.arrival.date) }),
    figure: { kind: "share", share, caption: t("overview.findings.ofLines") },
    evidence: [], open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
};

const dormant: Detector = (x) => {
  if (!x.history.last || !x.history.scan) return null;
  const gap = days(x.history.last, x.history.scan);
  if (gap < 180) return null;
  const months = Math.round(gap / 30.4);
  return {
    id: "dormant", relevance: 0.8 * clamp(gap / 900),
    title: t("overview.findings.dormantTitle"),
    body: t("overview.findings.dormantBody", { date: formatDate(x.history.last) }),
    figure: { kind: "stat", value: n(months), caption: t("overview.findings.monthsBeforeScan", { count: months }) },
    evidence: [], open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
};

const recentFocus: Detector = (x, names) => {
  const total = x.recent.reduce((s, r) => s + r.n, 0);
  const top = x.recent[0];
  if (!top || total < 20) return null;
  const share = top.n / total;
  if (share < 0.25) return null;
  return {
    id: "recentFocus", relevance: 0.7 * clamp((share - 0.15) / 0.5),
    title: t("overview.findings.recentTitle"),
    body: t("overview.findings.recentBody", { component: names.component(top.component).label, share: pct(share), total: n(total) }),
    figure: { kind: "rank", values: x.recent.map((r) => r.n), hot: 1 },
    evidence: x.recent.slice(0, 3).map((r) => names.component(r.component, t("common.count.commit", { count: r.n }))),
    open: { label: t("overview.findings.activity"), to: "/views/git/activity" },
  };
};

const rules: Detector = (x, names) => {
  const total = x.rules.reduce((s, r) => s + r.n, 0);
  if (!total) return null;
  return {
    id: "rules", relevance: 0.5 + 0.4 * clamp(total / 200),
    title: t("overview.findings.rulesTitle"),
    body: t("overview.findings.rulesBody", { count: total, components: listOf(x.rules.slice(0, 2).map((r) => names.component(r.component).label)) }),
    figure: { kind: "rank", values: x.rules.map((r) => r.n), hot: 1 },
    evidence: x.rules.slice(0, 3).map((r) => names.component(r.component, t("overview.findings.rulesValue", { count: r.n }))),
    open: { label: t("overview.findings.rules"), to: "/views/rules" },
  };
};

const propagation: Detector = (x) => {
  const pc = x.readings.app__propagation_cost;
  if (pc == null || pc < 0.15) return null;
  return {
    id: "propagation", relevance: clamp((pc - 0.1) / 0.4),
    title: t("overview.findings.propagationTitle"),
    body: t("overview.findings.propagationBody", { share: pct(pc) }),
    figure: { kind: "share", share: pc, caption: t("overview.findings.ofComponents") },
    evidence: [], open: { label: t("overview.findings.connections"), to: "/views/connections?rep=matrix&order=levels&level=components" },
  };
};

/** Every detector, in the order that breaks ties in relevance. */
export const DETECTORS: Detector[] = [shallow, noTests, tangles, hotspot, concentration, knowledge, hub, arrival, dormant, recentFocus, rules, propagation, bigFiles, ...ARCHITECTURE_DETECTORS];

function namer(facts: OverviewFacts): Names {
  const componentTails = distinctTails(facts.components.map((c) => c.name));
  // Files by name alone; the path is in the tooltip and the link.
  const base = (name: string) => name.split("/").pop() ?? name;
  return {
    file: (f, title) => ({ label: base(f.name), to: filePath(f.name), title: title ?? f.name }),
    path: (name, title) => ({ label: base(name), to: filePath(name), title: title ?? name }),
    component: (name, title) => ({ label: componentTails.get(name) ?? name, to: componentPath(name), title: title ?? name }),
  };
}

/** The findings these facts support, most relevant first. */
export function findings(facts: OverviewFacts): Finding[] {
  const names = namer(facts);
  const out: Finding[] = [];
  for (const detect of DETECTORS) {
    const f = detect(facts, names);
    if (f && f.relevance > 0) out.push({ ...f, figure: f.figure.kind === "rank" ? { ...f.figure, values: byDesc(f.figure.values).slice(0, RANK_HEAD) } : f.figure });
  }
  return out.sort((a, b) => b.relevance - a.relevance);
}

/** Programming languages of the project's own code by lines, the few largest by name and the rest as one. Data, markup, config, vendored and generated code are left out. */
export function languageShares(files: FileFact[], keep = 4): Array<{ language: string; lines: number; share: number; other?: number }> {
  const rows = composition(files.filter((f) => (f.role === "production" || f.role === "test") && isCodePath(f.name)));
  const total = rows.reduce((s, r) => s + r.lines, 0);
  if (!total) return [];
  const head = rows.slice(0, keep).map((r) => ({ language: r.language, lines: r.lines, share: r.lines / total }));
  const rest = rows.slice(keep);
  const restLines = rest.reduce((s, r) => s + r.lines, 0);
  return restLines ? [...head, { language: "", lines: restLines, share: restLines / total, other: rest.length }] : head;
}
