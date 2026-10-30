import type { Floor, Flow as StackFlow } from "~/features/checks/components/StackDiagram.vue"
import { stackOrder } from "~/features/checks/folderTree"
import { laneShade, type LaneColor } from "~/features/frameworks/frameworkProfiles"
import type { LaneFlow } from "./graph"
import { t, intlLocale } from "~/shared/i18n"

export interface LaneBand { id: string; label: string; color: LaneColor; count: number }

/**
 * The lanes as floors, stacked so that the fewest references point up, and
 * the references between them as the stack's links.
 *
 * A profile lists its lanes in the order a request travels (Django: views,
 * models, forms), which is not the order they depend in: forms use models.
 * Lanes that are not layers break no rule. Of those, wiring and what matched
 * nothing stand beside the stack, with their references counted rather than
 * drawn: at its foot every reference into them read as "uses below", and
 * Broadleaf's 1,877 unclassified modules drew a fan of arcs over the rest.
 */
export function laneStack(lanes: LaneBand[], flows: LaneFlow[], notLayers: string[], beside: string[] = []): { floors: Floor[]; flows: StackFlow[] } {
  const outside = new Set(notLayers)
  const aside = new Set(beside)
  const stacked = lanes.filter((l) => !aside.has(l.id))
  const pairs = flows.map((f) => ({ from: f.from, to: f.to, count: f.count }))
  const byId = new Map(lanes.map((l) => [l.id, l]))
  const ordered = [...stackOrder(stacked.map((l) => l.id), pairs).map((id) => byId.get(id)!), ...lanes.filter((l) => aside.has(l.id))]
  const into = new Map<string, number>(), from = new Map<string, number>()
  for (const f of flows) {
    if (f.from === f.to) continue
    if (aside.has(f.to) && !aside.has(f.from)) into.set(f.to, (into.get(f.to) ?? 0) + f.count)
    if (aside.has(f.from) && !aside.has(f.to)) from.set(f.from, (from.get(f.from) ?? 0) + f.count)
  }
  const fmt = (x: number) => x.toLocaleString(intlLocale)
  const floors = ordered.map((l): Floor => {
    const modules = t("common.count.module", { count: l.count })
    if (!aside.has(l.id)) return { id: l.id, label: l.label, weight: l.count, color: laneShade(l.color), sub: t("units.stack.text", { modules }) }
    return {
      id: l.id, label: l.label, weight: l.count, color: laneShade(l.color), aside: true,
      sub: t("units.stack.asideSub", { modules, into: fmt(into.get(l.id) ?? 0), out: fmt(from.get(l.id) ?? 0) }),
    }
  })
  const label = (id: string) => byId.get(id)?.label ?? id
  // laneFlows lists each direction once, carrying the other direction's
  // count. Red is what Units has always called wrong: the smaller direction
  // of a pair that leans both ways, between two lanes that are layers.
  const links = flows.filter((f) => f.count > 0 && !aside.has(f.from) && !aside.has(f.to)).map((f): StackFlow => {
    const minority = f.reverse > f.count || (f.reverse === f.count && f.from > f.to)
    const bad = minority && !outside.has(f.from) && !outside.has(f.to)
    return {
      key: `${f.from}>${f.to}`, from: f.from, to: f.to, count: f.count, bad,
      title: t("units.stack.uses", { from: label(f.from), to: label(f.to), references: t("common.count.reference", { count: f.count }), value: bad ? t("units.stack.againstGrain") : "" }),
    }
  })
  return { floors, flows: links }
}
