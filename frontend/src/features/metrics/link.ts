// Links into Metrics that open already set up. A finding, a row of Extremes or
// a metric's definition means one question: the view, the pair on its axes,
// the ranges brushed, the metric sorted on and the rows selected ride in the
// link. Without them every link landed on the Summary and the reader had to
// set the question up again.

import type { Brushes } from "./lab";
import type { Go } from "./summary";

export type MetricsGrain = "components" | "files" | "directories";

export type MetricsLink = Partial<Go> & { grain?: MetricsGrain };

export function metricsPath(link: MetricsLink = {}): string {
  const q = new URLSearchParams();
  if (link.grain && link.grain !== "components") q.set("grain", link.grain);
  if (link.view) q.set("view", link.view);
  if (link.preset) q.set("preset", link.preset);
  if (link.pair) {
    q.set("x", link.pair[0]);
    q.set("y", link.pair[1]);
  }
  if (link.sort) q.set("sort", link.sort);
  if (link.brushes && Object.keys(link.brushes).length) q.set("brush", JSON.stringify(link.brushes));
  // Selection travels the way Show in sends it, so both arrive the same way.
  if (link.selected?.length) q.set("hl", JSON.stringify(link.selected));
  const s = q.toString();
  return s ? `/views/metrics?${s}` : "/views/metrics";
}

/** The set-up a link carried beyond grain, view and preset: read once on arrival. */
export interface Arrival {
  pair?: [string, string];
  sort?: string;
  brushes?: Brushes;
}

export const ARRIVAL_KEYS = ["x", "y", "sort", "brush"] as const;

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export function arrivalFrom(query: Record<string, unknown>): Arrival | null {
  const out: Arrival = {};
  const x = one(query.x), y = one(query.y), sort = one(query.sort), brush = one(query.brush);
  if (typeof x === "string" && x && typeof y === "string" && y) out.pair = [x, y];
  if (typeof sort === "string" && sort) out.sort = sort;
  if (typeof brush === "string" && brush) {
    try {
      const parsed = JSON.parse(brush);
      const brushes: Brushes = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, range] of Object.entries(parsed)) {
          if (Array.isArray(range) && range.length === 2 && range.every((n) => typeof n === "number" && Number.isFinite(n))) {
            brushes[key] = [Math.min(range[0], range[1]), Math.max(range[0], range[1])];
          }
        }
      }
      if (Object.keys(brushes).length) out.brushes = brushes;
    } catch { /* a hand-edited link: ignore the brushes, keep the rest */ }
  }
  return Object.keys(out).length ? out : null;
}
