// Shared logic behind the three Metrics overviews (matrix, strips,
// profiles): which metrics they show, how a metric maps onto a 0–1 axis,
// range brushes, and rank correlation. No store reads, so it is testable.

import * as d3 from "d3";
import { metricValue, suggestLog } from "./plotReading";
import { t } from "~/shared/i18n";

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
  // A loop, not Math.min(...values): spreading tens of thousands of files overflows the stack.
  let lo = values.length ? Infinity : 0;
  let hi = values.length ? -Infinity : 1;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
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

// ─── Indexes ───
// A view that reads the same metrics many times (every pair, every redraw)
// reads them once into arrays by row index instead of walking the rows.

/** Every row's reading for a metric, by row index; NaN where it has none. */
export function readings(rows: Row[], key: string): Float64Array {
  const out = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) out[i] = metricValue(rows[i], key);
  return out;
}

/** The row indexes that have a reading, in ascending order of it: sorted once, walked for every pair. */
export function rankOrder(values: Float64Array): Int32Array {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) idx.push(i);
  idx.sort((a, b) => values[a] - values[b]);
  return Int32Array.from(idx);
}

// ─── Correlation ───
/** Average 1-based ranks of the rows in `keep`, walking a metric's order; ties share their mean rank. */
function ranksAlong(values: Float64Array, order: Int32Array, keep: Uint8Array, n: number): Float64Array {
  const kept = new Int32Array(n);
  let m = 0;
  for (let k = 0; k < order.length; k++) if (keep[order[k]]) kept[m++] = order[k];
  const out = new Float64Array(values.length);
  for (let i = 0; i < m;) {
    let j = i;
    while (j + 1 < m && values[kept[j + 1]] === values[kept[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[kept[k]] = rank;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman's rank correlation from two metrics' readings and rank orders
 * (see readings and rankOrder), over the rows that have both. Each metric is
 * sorted once however many pairs it joins; a pair only walks the orders.
 */
export function spearmanOf(xs: Float64Array, ys: Float64Array, ox: Int32Array, oy: Int32Array): { rho: number; n: number } {
  const keep = new Uint8Array(xs.length);
  let n = 0;
  for (let i = 0; i < xs.length; i++) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { keep[i] = 1; n++; }
  }
  if (n < 5) return { rho: NaN, n };
  const rx = ranksAlong(xs, ox, keep, n), ry = ranksAlong(ys, oy, keep, n);
  const mean = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    if (!keep[i]) continue;
    const u = rx[i] - mean, v = ry[i] - mean;
    num += u * v; dx += u * u; dy += v * v;
  }
  return { rho: dx && dy ? num / Math.sqrt(dx * dy) : NaN, n };
}

/**
 * Spearman's rank correlation over the rows that have both readings: how
 * consistently one metric rises with the other, whatever the shape. NaN when
 * fewer than five rows qualify or either metric is constant.
 */
export function spearman(rows: Row[], a: string, b: string): { rho: number; n: number } {
  const xs = readings(rows, a), ys = readings(rows, b);
  return spearmanOf(xs, ys, rankOrder(xs), rankOrder(ys));
}

/** Plain words for a correlation's strength, the way the Reading panel says it. */
export function strengthWord(rho: number): string {
  const a = Math.abs(rho);
  if (!Number.isFinite(a)) return t("metrics.lab.noReading");
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
