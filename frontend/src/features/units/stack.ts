import type { Floor, Flow as StackFlow } from "~/features/checks/components/StackDiagram.vue"
import { stackOrder } from "~/features/checks/folderTree"
import { laneShade, type LaneColor } from "~/features/frameworks/frameworkProfiles"
import type { LaneFlow } from "./graph"

export interface LaneBand { id: string; label: string; color: LaneColor; count: number }

/**
 * The lanes as floors, stacked so that most references run down, and the
 * references between them as the stack's links.
 *
 * A profile lists its lanes in the order a request travels (Django: views,
 * models, forms), which is not the order they depend in: forms use models.
 * Lanes that are not layers sit at the bottom, outside the stack's argument.
 */
export function laneStack(lanes: LaneBand[], flows: LaneFlow[], notLayers: string[]): { floors: Floor[]; flows: StackFlow[] } {
  const outside = new Set(notLayers)
  const layers = lanes.filter((l) => !outside.has(l.id))
  const pairs = flows.map((f) => ({ from: f.from, to: f.to, count: f.count }))
  const byId = new Map(lanes.map((l) => [l.id, l]))
  const ordered = [...stackOrder(layers.map((l) => l.id), pairs).map((id) => byId.get(id)!), ...lanes.filter((l) => outside.has(l.id))]
  const floors = ordered.map((l) => ({
    id: l.id, label: l.label, weight: l.count, color: laneShade(l.color),
    sub: `${l.count.toLocaleString()} module${l.count === 1 ? "" : "s"}`,
  }))
  const label = (id: string) => byId.get(id)?.label ?? id
  // laneFlows lists each direction once, carrying the other direction's
  // count. Red is what Units has always called wrong: the smaller direction
  // of a pair that leans both ways, between two lanes that are layers.
  const links = flows.filter((f) => f.count > 0).map((f): StackFlow => {
    const minority = f.reverse > f.count || (f.reverse === f.count && f.from > f.to)
    const bad = minority && !outside.has(f.from) && !outside.has(f.to)
    return {
      key: `${f.from}>${f.to}`, from: f.from, to: f.to, count: f.count, bad,
      title: `${label(f.from)} uses ${label(f.to)}: ${f.count.toLocaleString()} reference${f.count === 1 ? "" : "s"}${bad ? ", against the grain" : ""}`,
    }
  })
  return { floors, flows: links }
}
