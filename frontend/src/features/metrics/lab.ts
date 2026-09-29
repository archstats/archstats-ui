// Shared logic behind the three Metrics overviews (matrix, strips,
// profiles): which metrics they show, how a metric maps onto a 0–1 axis,
// range brushes, and rank correlation. No store reads, so it is testable.

import * as d3 from "d3";
import { metricValue, suggestLog } from "./plotReading";

type Row = { name: string; [key: string]: any };

/** The overview's metrics, in reading order: size, change, quality, coupling, position. */
export const OVERVIEW_METRICS = [
  "complexity__lines",
  "git__commits__total",
  "git__authors__total",
  "codesmells__code_health",
  "codesmells__hotspot_score",
  "modularity__coupling__dependents",
  "modularity__coupling__dependencies",
  "modularity__instability",
  "graph__betweenness",
  "git__last_change_age_in_days",
];

// Older snapshots lack the component counts; the file-reference counts stand in.
const FALLBACK: Record<string, string> = {
  modularity__coupling__dependents: "modularity__coupling__afferent",
  modularity__coupling__dependencies: "modularity__coupling__efferent",
};

export function overviewMetrics(available: Iterable<string>, limit = Infinity): string[] {
  const have = new Set(available);
  const out: string[] = [];
  for (const key of OVERVIEW_METRICS) {
    const pick = have.has(key) ? key : FALLBACK[key] && have.has(FALLBACK[key]) ? FALLBACK[key] : null;
    if (pick && !out.includes(pick)) out.push(pick);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Brushes ───
/** A closed range per metric; a row passes when every brushed metric falls inside. */
export type Brushes = Record<string, [number, number]>;

export function passes(row: Row, brushes: Brushes): boolean {
  for (const key in brushes) {
    const [lo, hi] = brushes[key];
    const v = metricValue(row, key);
    if (!Number.isFinite(v) || v < lo || v > hi) return false;
  }
  return true;
}

export function brushCount(brushes: Brushes): number {
  return Object.keys(brushes).length;
}

// ─── Scales ───
export interface MetricScale {
  key: string;
  log: boolean;
  domain: [number, number];
  /** Value to 0..1 along the axis; NaN for a missing reading. */
  at: (v: number) => number;
  /** 0..1 back to a value. */
  invert: (t: number) => number;
  ticks: number[];
}

/**
 * One axis per metric, shared by every overview so a component sits at the
 * same relative place on every drawing. Long-tailed counts take a symlog axis
 * (zero stays at the origin); everything else is linear from zero or its minimum.
 */
export function metricScale(rows: Row[], key: string): MetricScale {
  const values = rows.map((r) => metricValue(r, key)).filter((v) => Number.isFinite(v));
  const log = suggestLog(values);
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (lo > 0) lo = 0;
  if (hi <= lo) hi = lo + 1;
  const s = (log ? d3.scaleSymlog().constant(1) : d3.scaleLinear()).domain([lo, hi]).range([0, 1]).clamp(true);
  const ticks = log ? symlogTicks(hi) : (d3.scaleLinear().domain([lo, hi]).ticks(4) as number[]);
  return {
    key, log, domain: [lo, hi],
    at: (v) => (Number.isFinite(v) ? s(v) : NaN),
    invert: (t) => s.invert(Math.max(0, Math.min(1, t))),
    ticks,
  };
}

function symlogTicks(hi: number): number[] {
  const out = [0];
  for (let v = 1; v <= hi; v *= 10) out.push(v);
  return out;
}

// ─── Correlation ───
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman's rank correlation over the rows that have both readings: how
 * consistently one metric rises with the other, whatever the shape. NaN when
 * fewer than five rows qualify or either metric is constant.
 */
export function spearman(rows: Row[], a: string, b: string): { rho: number; n: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const r of rows) {
    const x = metricValue(r, a), y = metricValue(r, b);
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
  const n = xs.length;
  if (n < 5) return { rho: NaN, n };
  const rx = ranks(xs), ry = ranks(ys);
  const mean = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const u = rx[i] - mean, v = ry[i] - mean;
    num += u * v; dx += u * u; dy += v * v;
  }
  return { rho: dx && dy ? num / Math.sqrt(dx * dy) : NaN, n };
}

/** Plain words for a correlation's strength, the way the Reading panel says it. */
export function strengthWord(rho: number): string {
  const a = Math.abs(rho);
  if (!Number.isFinite(a)) return "no reading";
  if (a >= 0.7) return "strong";
  if (a >= 0.4) return "moderate";
  if (a >= 0.2) return "weak";
  return "none";
}

/** A stable 0..1 offset per name, so a dot never jumps between redraws. */
export function jitter(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}
