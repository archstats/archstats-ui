import { componentPath, filePath, searchPath } from "./routes"
import { focusText } from "./focusSpec"

// "Show in…": one list of places a component, a file, a pair or a selection
// can be looked at next, the same wherever it is offered. A selection travels
// as `?hl=` (a JSON list of ids) and arrives selected; a place that answers
// by narrowing rather than selecting sets the focus first.

export type ShowInKind = "component" | "file"

export interface ShowInTarget {
  id: string
  label: string
  icon: string
  to: string
  /** Focus text to set before going, for places that show "only these". */
  focus?: string
}

const hl = (ids: string[]) => `hl=${encodeURIComponent(JSON.stringify(ids))}`

export function showInTargets(kind: ShowInKind, ids: string[]): ShowInTarget[] {
  if (ids.length === 0) return []
  const one = ids.length === 1 ? ids[0] : null
  const out: ShowInTarget[] = []
  if (kind === "component") {
    if (one) out.push({ id: "detail", label: "Component page", icon: "external-link", to: componentPath(one) })
    out.push({
      id: "connections", label: "Connections", icon: "network",
      to: one ? `/views/connections?level=components&sel=${encodeURIComponent(one)}` : `/views/connections?level=components&${hl(ids)}`,
    })
    out.push({ id: "matrix", label: "Dependency matrix", icon: "table", to: `/views/connections?rep=matrix&level=components&${hl(ids)}` })
    if (one) out.push({ id: "cochange", label: "Changes with it (co-change)", icon: "git-commit", to: `/views/connections?source=git&level=components&sel=${encodeURIComponent(one)}` })
    if (one) out.push({ id: "cycles", label: "Its cycles", icon: "refresh", to: `/views/components/cycles?component=${encodeURIComponent(one)}` })
    out.push({ id: "metrics", label: "Metrics table", icon: "table", to: `/views/metrics?${hl(ids)}` })
    out.push({ id: "hotspots", label: "Hotspots", icon: "flame", to: `/views/components/hotspots?${hl(ids)}` })
    out.push({
      id: "files", label: one ? "Its files" : "Their files", icon: "file-code", to: "/views/metrics?grain=files",
      focus: focusText({ op: "only", anchors: ids, depth: null }),
    })
    if (one) out.push({ id: "search", label: "Find it in code", icon: "search-code", to: searchPath(one) })
  } else {
    if (one) out.push({ id: "detail", label: "File page", icon: "external-link", to: filePath(one) })
    out.push({ id: "metrics", label: "Metrics table", icon: "table", to: `/views/metrics?grain=files&${hl(ids)}` })
    out.push({ id: "hotspots", label: "Hotspots", icon: "flame", to: `/views/components/hotspots?grain=files&${hl(ids)}` })
  }
  return out
}

/** Where an edge between two components can be looked at. */
export function showPairTargets(from: string, to: string): ShowInTarget[] {
  const sel = encodeURIComponent(`${from}→${to}`)
  return [
    { id: "imports", label: "The imports between them", icon: "network", to: `/views/connections?level=components&sel=${sel}` },
    { id: "cochange", label: "Their co-change", icon: "git-commit", to: `/views/connections?source=git&level=components&sel=${sel}` },
    { id: "matrix", label: "Dependency matrix", icon: "table", to: `/views/connections?rep=matrix&level=components&${hl([from, to])}` },
    {
      id: "files", label: "Files of both", icon: "file-code", to: "/views/metrics?grain=files",
      focus: focusText({ op: "only", anchors: [from, to], depth: null }),
    },
  ]
}

/** The ids a link carried in `?hl=`, or null when it carried none. */
export function incomingIds(value: unknown): string[] | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string" || !raw) return null
  try {
    const ids = JSON.parse(raw)
    return Array.isArray(ids) ? ids.filter((x: unknown): x is string => typeof x === "string") : null
  } catch {
    return null
  }
}
