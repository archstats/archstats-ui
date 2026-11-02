// How a set of routes goes down the layers: the routes on top, then the
// classes their code passes on each of the framework's floors (the Units
// view's lanes), then the tables they touch and the systems they call. A link
// is a call, a write or read, or a call out, carrying the routes that make it.

import { shortName, type Route } from "./http"
import { touches, walk, type CodeIndex } from "./reach"

export type NodeKind = "route" | "class" | "table" | "system" | "more"

export interface DescentNode {
  id: string
  kind: NodeKind
  label: string
  /** The whole name: a class id, a table, a system, a route's method and path. */
  title: string
  /** The floor's lane for a class. */
  lane: string | null
  /** The routes that reach it. */
  routes: Set<number>
  /** Shared code most routes reach: shown, not followed. */
  plumbing: boolean
  /** For "more": the nodes folded into it. */
  members: string[]
  /** For a class: the functions the routes run in it. */
  functions: Set<string>
}

export type FloorKind = "routes" | "lane" | "data" | "outside"

export interface DescentFloor { id: string; kind: FloorKind; lane: string | null; nodes: DescentNode[]; total: number }

export type LinkKind = "call" | "write" | "may" | "read" | "out"

export interface DescentLink {
  from: string
  to: string
  kind: LinkKind
  routes: Set<number>
  /** Points up the floors: a lower layer calling a higher one. */
  up: boolean
  /** Where the first call of it is made. */
  site: { file: string; line: number } | null
}

export interface Descent {
  floors: DescentFloor[]
  links: DescentLink[]
  routes: number
  /** Every node met, the folded ones too, and the links between them as met. */
  nodes: Map<string, DescentNode>
  edges: DescentLink[]
}

export const OTHER = "other"
const STRENGTH: Record<LinkKind, number> = { write: 4, may: 3, read: 2, out: 1, call: 0 }

/**
 * The descent of a set of routes. `layers` is the framework's floors top
 * first; lanes met that are not among them come after, then classes no lane
 * claims. Each floor keeps its `perFloor` most travelled nodes and folds the
 * rest into one.
 */
export function descent(ix: CodeIndex, routes: Route[], laneOf: (unit: string) => string | null, layers: string[], perFloor = 14): Descent {
  const nodes = new Map<string, DescentNode>()
  const links = new Map<string, DescentLink>()
  const node = (id: string, kind: NodeKind, label: string, title: string, lane: string | null, plumbing = false) => {
    let n = nodes.get(id)
    if (!n) { n = { id, kind, label, title, lane, routes: new Set(), plumbing, members: [], functions: new Set() }; nodes.set(id, n) }
    return n
  }
  const link = (from: string, to: string, kind: LinkKind, route: number, site: DescentLink["site"] = null) => {
    if (from === to) return
    const k = `${from}\u0000${to}`
    let l = links.get(k)
    if (!l) { l = { from, to, kind, routes: new Set(), up: false, site }; links.set(k, l) }
    if (STRENGTH[kind] > STRENGTH[l.kind]) l.kind = kind
    l.routes.add(route)
  }
  const classId = (u: string) => `c:${u}`

  for (const r of routes) {
    const rid = `r:${r.id}`
    node(rid, "route", `${r.method || "ANY"} ${r.path}`, `${r.method || "ANY"} ${r.path}`, null).routes.add(r.id)
    walk(ix, r, (u, fn, d, via) => {
      const plumbing = d > 0 && ix.plumbing.has(ix.componentOf(u))
      const c = node(classId(u), "class", shortName(u), u, laneOf(u) ?? OTHER, plumbing)
      c.routes.add(r.id)
      c.functions.add(fn)
      link(via ? classId(via.fromUnit) : rid, classId(u), "call", r.id, via ? { file: via.file, line: via.line } : null)
      if (plumbing) return false
      const t = touches(ix, u, fn)
      for (const x of t.writes) { node(`t:${x}`, "table", shortName(x), x, null).routes.add(r.id); link(classId(u), `t:${x}`, "write", r.id) }
      for (const x of t.mayWrite) { node(`t:${x}`, "table", shortName(x), x, null).routes.add(r.id); link(classId(u), `t:${x}`, "may", r.id) }
      for (const x of t.reads) { node(`t:${x}`, "table", shortName(x), x, null).routes.add(r.id); link(classId(u), `t:${x}`, "read", r.id) }
      for (const s of ix.systems.get(`${u}\u0000${fn}`) ?? []) { node(`s:${s.system}`, "system", s.system, s.system, null).routes.add(r.id); link(classId(u), `s:${s.system}`, "out", r.id) }
      return true
    })
  }

  // Floors, top to bottom. Lanes outside the framework's layers (its
  // unclassified lane among them) go where their calls fit best.
  const met = new Set([...nodes.values()].filter(n => n.kind === "class").map(n => n.lane!))
  const extra = [...met].filter(l => !layers.includes(l) && l !== OTHER).sort()
  if (met.has(OTHER)) extra.push(OTHER)
  const lanes = place(layers.filter(l => met.has(l)), extra, nodes, links)
  const floorOf = (n: DescentNode) => (n.kind === "route" ? "routes" : n.kind === "table" ? "data" : n.kind === "system" ? "outside" : `lane:${n.lane}`)
  const order = ["routes", ...lanes.map(l => `lane:${l}`), "data", "outside"]
  const byFloor = new Map<string, DescentNode[]>(order.map(f => [f, []]))
  for (const n of nodes.values()) byFloor.get(floorOf(n))!.push(n)

  // What is named like its callers on the floors above ranks first: under
  // OrderController, OrderService before AddressService.
  const floorAt = new Map<string, number>()
  for (const n of nodes.values()) floorAt.set(n.id, order.indexOf(floorOf(n)))
  const callers = new Map<string, Set<string>>()
  for (const l of links.values()) {
    if (floorAt.get(l.from)! >= floorAt.get(l.to)!) continue
    const set = callers.get(l.to) ?? new Set<string>()
    for (const w of nodes.get(l.from)!.kind === "route" ? pathWords(nodes.get(l.from)!.title) : nameWords(nodes.get(l.from)!.label)) set.add(w)
    callers.set(l.to, set)
  }
  const likeness = (n: DescentNode) => {
    const own = nameWords(n.label)
    const above = callers.get(n.id)
    return own.length && above ? own.filter(w => above.has(w)).length / own.length : 0
  }

  // Each floor keeps its most travelled and most alike; the rest fold into one node.
  const alias = new Map<string, string>()
  const floors: DescentFloor[] = []
  for (const id of order) {
    const all = byFloor.get(id)!
    if (!all.length) continue
    const most = Math.max(...all.map(n => n.routes.size))
    const rank = new Map(all.map(n => [n, n.routes.size / most + likeness(n)]))
    all.sort((a, b) => rank.get(b)! - rank.get(a)! || Number(a.plumbing) - Number(b.plumbing) || a.label.localeCompare(b.label))
    const kept = all.length > perFloor ? all.slice(0, perFloor - 1) : all
    const rest = all.slice(kept.length)
    const lane = id.startsWith("lane:") ? id.slice(5) : null
    if (rest.length) {
      const more: DescentNode = { id: `more:${id}`, kind: "more", label: "", title: "", lane, routes: new Set(rest.flatMap(n => [...n.routes])), plumbing: false, members: rest.map(n => n.id), functions: new Set() }
      for (const n of rest) alias.set(n.id, more.id)
      kept.push(more)
    }
    floors.push({ id, kind: id === "routes" ? "routes" : id === "data" ? "data" : id === "outside" ? "outside" : "lane", lane, nodes: kept, total: all.length })
  }

  const level = new Map<string, number>()
  floors.forEach((f, i) => f.nodes.forEach(n => level.set(n.id, i)))
  const merged = new Map<string, DescentLink>()
  for (const l of links.values()) {
    const from = alias.get(l.from) ?? l.from, to = alias.get(l.to) ?? l.to
    if (from === to) continue
    const k = `${from}\u0000${to}`
    const m = merged.get(k)
    if (m) { for (const r of l.routes) m.routes.add(r); if (STRENGTH[l.kind] > STRENGTH[m.kind]) m.kind = l.kind; continue }
    merged.set(k, { from, to, kind: l.kind, routes: new Set(l.routes), up: (level.get(to) ?? 0) < (level.get(from) ?? 0), site: l.site })
  }
  for (const l of links.values()) l.up = floorAt.get(l.to)! < floorAt.get(l.from)!
  return { floors, links: [...merged.values()], routes: routes.length, nodes, edges: [...links.values()] }
}

/**
 * The layers with each extra lane put where the fewest calls would point up
 * the floors; with nothing to go by, below the first layer (the one routes
 * enter), never above it.
 */
function place(layers: string[], extra: string[], nodes: Map<string, DescentNode>, links: Map<string, DescentLink>): string[] {
  const seq = [...layers]
  const laneAt = (id: string) => nodes.get(id)?.kind === "class" ? nodes.get(id)!.lane : null
  for (const lane of extra) {
    let best = seq.length, cost = Infinity
    for (let slot = Math.min(1, seq.length); slot <= seq.length; slot++) {
      const at = (l: string | null) => (l === lane ? slot - 0.5 : l == null ? -1 : seq.indexOf(l))
      let up = 0
      for (const l of links.values()) {
        if (l.kind !== "call") continue
        const a = laneAt(l.from), b = laneAt(l.to)
        if (a !== lane && b !== lane) continue
        const from = at(a), to = at(b)
        if (from < 0 || to < 0 || from === to) continue
        if (to < from) up += l.routes.size
      }
      if (up < cost) { cost = up; best = slot }
    }
    seq.splice(best, 0, lane)
  }
  return seq
}

// Role words say what a class is, not what it is about.
const ROLE = new Set(["controller", "service", "impl", "factory", "model", "repository", "repo", "dao", "dto", "entity", "manager", "helper", "handler", "base", "provider", "api", "resource", "endpoint", "abstract", "default", "util", "mapper", "request", "response", "view", "component", "module", "command", "query", "data", "info", "record"])

/** The words a name is about: Pascal or camel parts, singular, less the role words. */
export function nameWords(name: string): string[] {
  const parts = name.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g) ?? []
  return [...new Set(parts.map(w => singular(w.toLowerCase())).filter(w => w.length > 1 && !ROLE.has(w)))]
}

/** The words of a route's path: its literal segments, not the parameters or the method. */
function pathWords(title: string): string[] {
  const path = title.slice(title.indexOf(" ") + 1)
  return path.split(/[/._-]+/).filter(s => s && !/^[{:<[%*]/.test(s)).flatMap(nameWords)
}

function singular(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y"
  if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1)
  return w
}

/** A class id's lane: members and nested declarations roll up to the type the anatomy knows. */
export function ownerLane(lanes: Map<string, string>): (unit: string) => string | null {
  return (unit: string) => {
    let x = unit
    for (let i = 0; i < 6; i++) {
      const l = lanes.get(x)
      if (l) return l
      const cut = Math.max(x.lastIndexOf("#"), x.lastIndexOf("$"))
      if (cut <= 0) break
      x = x.slice(0, cut)
    }
    return null
  }
}
