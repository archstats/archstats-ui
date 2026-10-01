// A focus is a query: the text every scope-aware view already knows how to
// answer. This module is the structured side of it -- what the menus build,
// what the chip reads back, and what + and - step through -- so nothing has
// to string-edit a query to widen it by one hop.

import { t } from "~/shared/i18n"

/**
 * around / dependencies / dependents walk `depth` hops (null: all the way);
 * between keeps every route, path only the shortest; tangle is the cycle.
 */
export type GraphOp = "around" | "dependencies" | "dependents" | "between" | "path" | "tangle"

export type FocusOp = GraphOp | "only"

export interface FocusSpec {
  op: FocusOp
  anchors: string[]
  /** Hops for around / dependencies / dependents; null walks all the way. */
  depth: number | null
  to?: string[]
}

/** A graph line as text again, the way the parser reads it back. */
export function graphLine(op: GraphOp, anchors: string[], opts: { depth?: number | null; to?: string[] } = {}): string {
  const names = (list: string[]) => list.map(n => (/[\s,"]/.test(n) ? `"${n.replace(/"/g, "")}"` : n)).join(", ")
  const depth = opts.depth === undefined || opts.depth === 1 ? "" : ` depth ${opts.depth === null ? "all" : opts.depth}`
  switch (op) {
    case "around": return `around ${names(anchors)}${depth}`
    case "dependencies": return `dependencies of ${names(anchors)}${depth}`
    case "dependents": return `dependents of ${names(anchors)}${depth}`
    case "between": return opts.to?.length ? `between ${names(anchors)} and ${names(opts.to)}` : `between ${names(anchors)}`
    case "path": return `path from ${names(anchors)} to ${names(opts.to ?? [])}`
    case "tangle": return `tangle of ${names(anchors)}`
  }
}

/** The query text for a focus. "Only" is the names themselves, one a line. */
export function focusText(spec: FocusSpec): string {
  if (spec.op === "only") return spec.anchors.map(a => (/[\s,"]/.test(a) ? `"${a.replace(/"/g, "")}"` : a)).join("\n")
  return graphLine(spec.op, spec.anchors, { depth: spec.depth, to: spec.to })
}

/** Whether + and - mean anything for this focus. */
export function hasDepth(spec: FocusSpec): boolean {
  return spec.op === "around" || spec.op === "dependencies" || spec.op === "dependents" || spec.op === "only"
}

/**
 * One hop wider or narrower. "Only" widens into "around"; one hop of
 * "around" narrows back into "only", so - after + returns where you were.
 * "All the way" narrows to the deepest finite step anyone would type.
 */
export function stepDepth(spec: FocusSpec, delta: 1 | -1): FocusSpec | null {
  if (!hasDepth(spec)) return null
  if (spec.op === "only") return delta > 0 ? { op: "around", anchors: spec.anchors, depth: 1 } : null
  if (spec.depth === null) return delta < 0 ? { ...spec, depth: 5 } : null
  const depth = spec.depth + delta
  if (depth < 1) return spec.op === "around" ? { op: "only", anchors: spec.anchors, depth: null } : null
  return { ...spec, depth }
}

/**
 * The end of a long name, whole segments only: `…common.file.service` for
 * `org.broadleafcommerce.common.file.service`. A codebase that mixes Java
 * packages with JS folders has no common prefix to strip, and the start of a
 * name is the part every component shares.
 */
export function shortName(id: string, max = 28): string {
  if (id.length <= max) return id
  const parts = id.split(/(?<=[./\\:])/)
  let out = ""
  for (let i = parts.length - 1; i >= 0; i--) {
    if (out && out.length + parts[i].length > max) break
    out = parts[i] + out
  }
  return out === id ? id : `…${out}`
}

/** What the chip says: "Around billing · 2 hops". */
export function describeFocus(spec: FocusSpec | null, text: string, label: (id: string) => string = id => id): string {
  if (!spec) return text.split("\n").filter(Boolean).join(", ")
  const names = (list: string[]) => (list.length <= 2 ? list.map(label).join(", ") : t("navigation.focusSpec.more", { value: label(list[0]), value2: list.length - 1 }))
  const hops = spec.depth === null ? t("navigation.focusSpec.allWay") : t("navigation.focusSpec.text", { hops: t("common.count.hop", { count: spec.depth }) })
  switch (spec.op) {
    case "only": return names(spec.anchors)
    case "around": return `Around ${names(spec.anchors)} · ${hops}`
    case "dependencies": return spec.depth === null ? t("navigation.focusSpec.everythingReaches", { anchors: names(spec.anchors) }) : t("navigation.focusSpec.whatUses", { anchors: names(spec.anchors), hops })
    case "dependents": return spec.depth === null ? t("navigation.focusSpec.everythingReaches2", { anchors: names(spec.anchors) }) : t("navigation.focusSpec.whatUses2", { anchors: names(spec.anchors), hops })
    case "between": return spec.to?.length ? t("navigation.focusSpec.between3", { anchors: names(spec.anchors), to: names(spec.to) }) : t("navigation.focusSpec.between4", { anchors: names(spec.anchors) })
    case "path": return `Path ${names(spec.anchors)} → ${names(spec.to ?? [])}`
    case "tangle": return t("navigation.focusSpec.tangle2", { anchors: names(spec.anchors) })
  }
}
