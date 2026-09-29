// Pure helpers behind the Metrics plot and table: medians and quadrants,
// the log-axis suggestion, distinct short names, histograms and label
// placement. Nothing here reads a store, so every rule is testable.

export type Quadrant = "tl" | "tr" | "bl" | "br";

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function finiteSorted(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = toNumber(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** A reading as a number, NaN when absent: Number(null) is 0, and a missing score is not a zero. */
export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  return Number(v);
}

/**
 * A row's reading for a metric, NaN when it has none. Code health's scale
 * starts at 1: older snapshots stored an unscored file as 0 (see useHealth).
 */
export function metricValue(row: Record<string, any>, key: string): number {
  const n = toNumber(row[key]);
  if (key === "codesmells__code_health" && n < 1) return NaN;
  return n;
}

export function median(values: unknown[]): number {
  return quantile(finiteSorted(values), 0.5);
}

/**
 * A log axis earns its place when a few values dwarf the typical one: counts
 * of lines, commits or references, where a linear axis crushes most of the
 * codebase against zero. Scores and ratios (health, instability) never qualify.
 */
export function suggestLog(values: unknown[]): boolean {
  const s = finiteSorted(values);
  if (s.length < 8 || s[0] < 0) return false;
  const max = s[s.length - 1];
  const typical = quantile(s, 0.5) > 0 ? quantile(s, 0.5) : quantile(s, 0.75);
  return typical > 0 && max >= 20 && max / typical >= 10;
}

/** Ticks for a symlog axis: 0 and the 1-2-5 steps, thinned until they fit. */
export function logTicks(domain: [number, number], maxTicks = 9): number[] {
  const [lo, hi] = domain;
  const all: number[] = [];
  if (lo <= 0 && hi >= 0) all.push(0);
  for (let e = 0; e <= 12; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v > hi) break;
      if (v >= lo) all.push(v);
    }
  }
  let ticks = all;
  if (ticks.length > maxTicks) ticks = all.filter((v) => v === 0 || !/^2/.test(String(v)));
  if (ticks.length > maxTicks) ticks = all.filter((v) => v === 0 || /^1/.test(String(v)));
  return ticks;
}

/**
 * Above the median is "high"; the median itself and below is "low", unless
 * `tiesHigh` says the median's ties belong above (see readPlot).
 */
export function quadrantOf(x: number, y: number, mx: number, my: number, tiesHigh: { x?: boolean; y?: boolean } = {}): Quadrant {
  const right = tiesHigh.x ? x >= mx : x > mx;
  const top = tiesHigh.y ? y >= my : y > my;
  return top ? (right ? "tr" : "tl") : right ? "br" : "bl";
}

/**
 * Where a median's ties go. When most values share the median (code health
 * is 10 for most files, so the median is the maximum), "above the median"
 * would be empty; the ties join whichever side leaves the split closer to even.
 */
export function tiesGoHigh(sorted: number[], m: number): boolean {
  let below = 0, above = 0;
  for (const v of sorted) { if (v < m) below++; else if (v > m) above++; }
  // Ties low leaves `above` high; ties high leaves `below` low. Pick the more even split.
  const n = sorted.length;
  return Math.abs(n - 2 * below) < Math.abs(n - 2 * above);
}

// Paths split on slashes only (a file's dot starts its extension); package
// names like org.acme.billing or App\Billing split on dots and backslashes too.
const PATH_SEPARATOR = /(\/)/;
const NAME_SEPARATOR = /(::|[/\\.])/;
const separatorFor = (name: string) => (name.includes("/") ? PATH_SEPARATOR : NAME_SEPARATOR);

/** Splits a name into the path it lives under and its last segment. */
export function splitName(name: string): { head: string; tail: string } {
  const parts = name.split(separatorFor(name));
  if (parts.length < 3) return { head: "", tail: name };
  const tail = parts[parts.length - 1];
  if (!tail) return { head: "", tail: name };
  return { head: parts.slice(0, -1).join(""), tail };
}

/**
 * The shortest tail of each name that no other name in the set shares:
 * `catalogue` alone when it is unique, `dashboard/catalogue` when two
 * components end in the same segment.
 */
export function distinctTails(names: string[]): Map<string, string> {
  const split = new Map(names.map((n) => [n, n.split(separatorFor(n))] as const));
  const depth = new Map(names.map((n) => [n, 1]));
  const tailOf = (n: string) => {
    const parts = split.get(n)!;
    const keep = Math.min(parts.length, depth.get(n)! * 2 - 1);
    return parts.slice(parts.length - keep).join("");
  };
  for (let round = 0; round < 12; round++) {
    const byTail = new Map<string, string[]>();
    for (const n of names) {
      const t = tailOf(n);
      const list = byTail.get(t);
      if (list) list.push(n);
      else byTail.set(t, [n]);
    }
    let changed = false;
    for (const list of byTail.values()) {
      if (list.length < 2) continue;
      for (const n of list) {
        if (depth.get(n)! * 2 - 1 < split.get(n)!.length) {
          depth.set(n, depth.get(n)! + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return new Map(names.map((n) => [n, tailOf(n) || n]));
}

/** Equal-width bins over [lo, hi]; values outside are clamped into the end bins. */
export function histogram(values: number[], bins: number, lo: number, hi: number): number[] {
  const out = new Array(bins).fill(0);
  const span = hi - lo || 1;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / span) * bins)));
    out[i]++;
  }
  return out;
}

export function binOf(value: number, bins: number, lo: number, hi: number): number {
  const span = hi - lo || 1;
  return Math.min(bins - 1, Math.max(0, Math.floor(((value - lo) / span) * bins)));
}

// ─── Label placement ───
export interface LabelCandidate { id: string; x: number; y: number; r: number; text: string }
export interface PlacedLabel { id: string; x: number; y: number; anchor: "start" | "end"; text: string }
export type Box = { x0: number; y0: number; x1: number; y1: number };

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy placement in priority order: each label tries right, left, above
 * and below its mark, takes the spot that covers the fewest other marks,
 * and is dropped when every spot collides with a label already placed or
 * leaves the plot. Candidates come ordered most-important first.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  marks: Array<{ x: number; y: number; r: number }>,
  bounds: { width: number; height: number },
  opts: { measure?: (text: string) => number; lineHeight?: number; limit?: number; obstacles?: Box[] } = {},
): PlacedLabel[] {
  const measure = opts.measure ?? ((t: string) => t.length * 6);
  const lh = opts.lineHeight ?? 12;
  const limit = opts.limit ?? Infinity;
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [...(opts.obstacles ?? [])];
  for (const c of candidates) {
    if (placed.length >= limit) break;
    const w = measure(c.text);
    const gap = c.r + 3;
    const spots: Array<{ box: Box; x: number; y: number; anchor: "start" | "end" }> = [
      { box: { x0: c.x + gap, y0: c.y - lh / 2, x1: c.x + gap + w, y1: c.y + lh / 2 }, x: c.x + gap, y: c.y, anchor: "start" },
      { box: { x0: c.x - gap - w, y0: c.y - lh / 2, x1: c.x - gap, y1: c.y + lh / 2 }, x: c.x - gap, y: c.y, anchor: "end" },
      { box: { x0: c.x - 2, y0: c.y - gap - lh, x1: c.x - 2 + w, y1: c.y - gap }, x: c.x - 2, y: c.y - gap - lh / 2, anchor: "start" },
      { box: { x0: c.x - 2, y0: c.y + gap, x1: c.x - 2 + w, y1: c.y + gap + lh }, x: c.x - 2, y: c.y + gap + lh / 2, anchor: "start" },
    ];
    let best: (typeof spots)[number] | null = null;
    let bestCost = Infinity;
    for (const s of spots) {
      if (s.box.x0 < 0 || s.box.x1 > bounds.width || s.box.y0 < 0 || s.box.y1 > bounds.height) continue;
      if (boxes.some((b) => overlaps(b, s.box))) continue;
      let cost = 0;
      for (const m of marks) {
        if (m.x + m.r > s.box.x0 && m.x - m.r < s.box.x1 && m.y + m.r > s.box.y0 && m.y - m.r < s.box.y1) cost++;
      }
      if (cost < bestCost) { best = s; bestCost = cost; }
      if (cost === 0) break;
    }
    if (!best || bestCost > 3) continue;
    boxes.push(best.box);
    placed.push({ id: c.id, x: best.x, y: best.y, anchor: best.anchor, text: c.text });
  }
  return placed;
}

// ─── The plot's reading ───
export interface PlotCell { id: "tl" | "tr" | "bl" | "br" | "pain" | "useless"; names: string[] }
export interface PlotReading {
  kind: "medians" | "main-sequence";
  /** Medians over every row of the grain, so a scope or search never moves the lines. */
  mx: number;
  my: number;
  cells: PlotCell[];
  /** Names ordered furthest from the typical row first. */
  outliers: string[];
  /** Visible rows with no reading on one of the axes: not drawn. */
  missing: number;
}

type Row = { name: string; [key: string]: any };

const lift = (v: number, log: boolean) => (log ? Math.sign(v) * Math.log1p(Math.abs(v)) : v);

/**
 * Splits the visible rows into quadrants at the medians, or on a main-sequence
 * chart into the two zones Martin named: distance above 0.5 below the line
 * (stable and concrete) and above it (abstract and unused). Outliers are
 * ranked by a robust distance: each axis measured in interquartile ranges
 * from its median, on the log scale when the axis is logged; on a
 * main-sequence chart, by distance from the line.
 */
export function readPlot(
  rows: Row[], allRows: Row[], x: string, y: string,
  opts: { mainSequence?: boolean; xLog?: boolean; yLog?: boolean } = {},
): PlotReading {
  const pts = rows
    .map((r) => ({ name: String(r.name), x: metricValue(r, x), y: metricValue(r, y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const xs = finiteSorted(allRows.map((r) => metricValue(r, x)));
  const ys = finiteSorted(allRows.map((r) => metricValue(r, y)));
  const mx = quantile(xs, 0.5);
  const my = quantile(ys, 0.5);

  if (opts.mainSequence) {
    const pain = pts.filter((p) => p.x + p.y < 0.5).map((p) => p.name);
    const useless = pts.filter((p) => p.x + p.y > 1.5).map((p) => p.name);
    const outliers = [...pts].sort((a, b) => Math.abs(b.x + b.y - 1) - Math.abs(a.x + a.y - 1)).map((p) => p.name);
    return { kind: "main-sequence", mx, my, cells: [{ id: "pain", names: pain }, { id: "useless", names: useless }], outliers, missing: rows.length - pts.length };
  }

  const cells: Record<"tl" | "tr" | "bl" | "br", string[]> = { tl: [], tr: [], bl: [], br: [] };
  const ties = { x: tiesGoHigh(xs, mx), y: tiesGoHigh(ys, my) };
  for (const p of pts) cells[quadrantOf(p.x, p.y, mx, my, ties)].push(p.name);

  const spread = (s: number[], log: boolean) => {
    const t = s.map((v) => lift(v, log));
    const iqr = quantile(t, 0.75) - quantile(t, 0.25);
    return iqr > 0 ? iqr : (t[t.length - 1] - t[0]) || 1;
  };
  const sx = spread(xs, !!opts.xLog);
  const sy = spread(ys, !!opts.yLog);
  const cx = lift(mx, !!opts.xLog);
  const cy = lift(my, !!opts.yLog);
  const dist = (p: { x: number; y: number }) => Math.hypot((lift(p.x, !!opts.xLog) - cx) / sx, (lift(p.y, !!opts.yLog) - cy) / sy);
  const outliers = [...pts].sort((a, b) => dist(b) - dist(a)).map((p) => p.name);

  return {
    kind: "medians", mx, my, outliers, missing: rows.length - pts.length,
    cells: (["tl", "tr", "bl", "br"] as const).map((id) => ({ id, names: cells[id] })),
  };
}
