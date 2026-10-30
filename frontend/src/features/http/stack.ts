// The API as a stack: what the routes pass through on their way into the
// code, floor by floor. The top floor is the API, by the component that
// answers it (or, zoomed in to one, by its resources). Below it the code
// components the routes reach, each on the floor of how many calls in from
// the handler it usually sits; then the data they touch, by domain; then
// the systems they call. A band between two boxes is the routes that pass
// from one to the other, and its width is how many.

import { componentLabels, domainLabels, namespaceOf, resourceGroups, shortName, type HttpModel, type Route } from "./http"

export type FloorId = "api" | "near" | "mid" | "deep" | "data" | "outside"
export const FLOORS: FloorId[] = ["api", "near", "mid", "deep", "data", "outside"]

export type BoxKind = "area" | "resource" | "component" | "domain" | "system"

export interface StackBox {
  id: string
  floor: FloorId
  kind: BoxKind
  label: string
  /** The whole name: a component, a namespace, a resource's path, a system. */
  title: string
  /** The routes that pass through it. */
  routes: Set<number>
  /** Its classes (or, for data, its tables) and the routes that reach each. */
  parts: Map<string, Set<number>>
  /** Passed by most of the routes: plumbing, set aside. */
  shared: boolean
}

export interface StackBand {
  id: string
  from: string
  to: string
  routes: Set<number>
}

export interface StackFloor { id: FloorId; boxes: StackBox[]; shared: StackBox[] }

export interface ApiStack {
  floors: StackFloor[]
  bands: StackBand[]
  boxes: Map<string, StackBox>
  routes: Route[]
  /** Per route, the boxes it passes and, in each, the classes or tables. */
  paths: Map<number, Map<string, string[]>>
  /** Routes whose handler could not be followed. */
  untraced: number
}

const MAX_NODES = 400

/**
 * The stack for a set of routes. `top` says what the API floor's boxes are:
 * the components that answer the routes, or the resources of one of them.
 */
export function apiStack(model: HttpModel, routes: Route[], top: "component" | "resource" = "component"): ApiStack {
  const out = new Map<string, HttpModel["calls"]>()
  for (const c of model.calls) {
    const k = `${c.fromUnit}\u0000${c.fromFunction}`
    const list = out.get(k)
    if (list) list.push(c)
    else out.set(k, [c])
  }
  // What a function touches; a key with no function is what its unit touches as a whole.
  const tables = new Map<string, Set<string>>()
  for (const a of model.access) {
    const t = a.entity || a.target
    if (!t) continue
    const k = `${a.unit}\u0000${a.function}`
    const s = tables.get(k) ?? new Set<string>()
    s.add(t)
    tables.set(k, s)
  }
  const systems = new Map<string, Set<string>>()
  for (const o of model.outbound) {
    if (o.system === "self" || !o.unit) continue
    const k = `${o.unit}\u0000${o.function}`
    const s = systems.get(k) ?? new Set<string>()
    // An address the engine could not follow names a variable, not a system.
    s.add(o.confidence === "unresolved" || !o.system ? `?${o.kind}` : o.system)
    systems.set(k, s)
  }
  const componentOf = (unit: string) => model.units.get(unit)?.component || namespaceOf(unit) || unit
  const classOf = (unit: string) => model.units.get(unit)?.name || shortName(unit)

  const handlerComponents = new Set(routes.map(r => r.component))

  // Walk each route: the code it reaches, how many calls in, and what it
  // touches. Code most routes reach is plumbing (a base controller, a work
  // context, caching): it is walked into but not through, so a route
  // reaches what its own code reaches, not everything the plumbing does.
  interface Walk { depth: Map<string, number>; units: Map<string, Set<string>>; edges: Set<string>; data: Map<string, Set<string>>; out: Map<string, Set<string>> }
  const walk = (r: Route, through: (comp: string) => boolean): Walk => {
    const w: Walk = { depth: new Map(), units: new Map(), edges: new Set(), data: new Map(), out: new Map() }
    if (!r.unit || !r.function) return w
    const seen = new Set<string>([`${r.unit}\u0000${r.function}`])
    const queue: Array<[string, string, number]> = [[r.unit, r.function, 0]]
    while (queue.length && seen.size < MAX_NODES) {
      const [u, f, d] = queue.shift()!
      const comp = componentOf(u)
      if (!w.depth.has(comp) || w.depth.get(comp)! > d) w.depth.set(comp, d)
      const cls = w.units.get(comp) ?? new Set<string>()
      cls.add(classOf(u))
      w.units.set(comp, cls)
      if (d > 0 && !through(comp)) continue
      const k = `${u}\u0000${f}`
      for (const t of [...(tables.get(k) ?? []), ...(tables.get(`${u}\u0000`) ?? [])]) { const s = w.data.get(comp) ?? new Set<string>(); s.add(t); w.data.set(comp, s) }
      for (const s of systems.get(k) ?? []) { const x = w.out.get(comp) ?? new Set<string>(); x.add(s); w.out.set(comp, x) }
      for (const c of out.get(k) ?? []) {
        if (!c.toUnit) continue
        const to = componentOf(c.toUnit)
        if (to !== comp) w.edges.add(`${comp}\u0000${to}`)
        const nk = `${c.toUnit}\u0000${c.toFunction}`
        if (!seen.has(nk)) { seen.add(nk); queue.push([c.toUnit, c.toFunction, d + 1]) }
      }
    }
    return w
  }
  const reachedBy = new Map<string, number>()
  for (const r of routes) for (const comp of walk(r, () => true).depth.keys()) reachedBy.set(comp, (reachedBy.get(comp) ?? 0) + 1)
  const plumbing = new Set(routes.length >= 20 ? [...reachedBy].filter(([c, n]) => n > routes.length / 2 && !handlerComponents.has(c)).map(([c]) => c) : [])
  const walks = new Map<number, Walk>()
  let untraced = 0
  for (const r of routes) {
    if (!r.unit || !r.function) untraced++
    walks.set(r.id, walk(r, comp => !plumbing.has(comp)))
  }

  // A component's floor: the API when it answers routes, else how many calls
  // in it most often sits.
  const depthVotes = new Map<string, Map<number, number>>()
  for (const w of walks.values()) {
    for (const [comp, d] of w.depth) {
      const votes = depthVotes.get(comp) ?? new Map<number, number>()
      const b = Math.min(3, Math.max(1, d))
      votes.set(b, (votes.get(b) ?? 0) + 1)
      depthVotes.set(comp, votes)
    }
  }
  // A component that holds the mapped entities is data, whatever calls it.
  const dataSpaces = new Set<string>()
  for (const a of model.access) { const ns = namespaceOf(a.entity || a.target); if (ns) dataSpaces.add(ns) }
  const floorOf = (comp: string): FloorId => {
    if (handlerComponents.has(comp)) return "api"
    if (dataSpaces.has(comp)) return "data"
    const votes = [...(depthVotes.get(comp) ?? new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    return (["near", "near", "mid", "deep"] as const)[votes[0]?.[0] ?? 1]
  }

  // Data domains: many tables in a few namespaces read best by namespace.
  const allTables = new Set<string>()
  for (const w of walks.values()) for (const s of w.data.values()) s.forEach(t => allTables.add(t))
  const spaces = new Set([...allTables].map(namespaceOf).filter(Boolean))
  const byDomain = allTables.size > 24 && spaces.size >= 3
  const domainOf = (t: string) => (byDomain ? namespaceOf(t) || t : t)
  const domainNames = byDomain ? domainLabels([...spaces]) : new Map<string, string>()

  const boxes = new Map<string, StackBox>()
  const box = (id: string, floor: FloorId, kind: BoxKind, label: string, title: string) => {
    let b = boxes.get(id)
    if (!b) { b = { id, floor, kind, label, title, routes: new Set(), parts: new Map(), shared: false }; boxes.set(id, b) }
    return b
  }
  const part = (b: StackBox, name: string, route: number) => {
    const s = b.parts.get(name) ?? new Set<number>()
    s.add(route)
    b.parts.set(name, s)
    b.routes.add(route)
  }
  const bands = new Map<string, StackBand>()
  const band = (from: string, to: string, route: number) => {
    if (from === to) return
    const id = `${from}>${to}`
    const b = bands.get(id) ?? { id, from, to, routes: new Set<number>() }
    b.routes.add(route)
    bands.set(id, b)
  }
  // One naming for every component in the stack, so two never read the same.
  const codeLabels = componentLabels([...new Set([...depthVotes.keys(), ...handlerComponents])])
  // The top floor's box for each route.
  const topOf = new Map<number, { id: string; title: string; label: string; kind: BoxKind }>()
  if (top === "resource") {
    for (const g of resourceGroups(routes)) {
      for (const r of g.routes) topOf.set(r.route.id, { id: `res:${g.key}`, title: g.key || "/", label: g.resource ? "/" + g.resource : g.key || "/", kind: "resource" })
    }
  } else {
    for (const r of routes) topOf.set(r.id, { id: `area:${r.component}`, title: r.component || "—", label: codeLabels.get(r.component) || r.component || "—", kind: "area" })
  }
  const compBox = (comp: string) => box(`comp:${comp}`, floorOf(comp), "component", codeLabels.get(comp) || shortName(comp), comp)
  const paths = new Map<number, Map<string, string[]>>()
  const dataBox = (d: string) => box(`data:${d}`, "data", "domain", byDomain ? domainNames.get(d) || shortName(d) : shortName(d), d)

  for (const r of routes) {
    const w = walks.get(r.id)!
    const path = new Map<string, string[]>()
    const tb = topOf.get(r.id)!
    const topBox = box(tb.id, "api", tb.kind, tb.label, tb.title)
    part(topBox, `${r.method} ${r.path}`, r.id)
    path.set(topBox.id, [shortName(r.function || r.handler || r.unit)])
    // The handler's own component is the top box itself; another component
    // that answers routes is its own box on the API floor.
    const boxFor = (comp: string) => {
      if (comp === r.component) return topBox
      if (top === "component" && handlerComponents.has(comp)) return box(`area:${comp}`, "api", "area", codeLabels.get(comp) || comp, comp)
      if (byDomain && dataSpaces.has(comp)) return dataBox(comp)
      return compBox(comp)
    }
    for (const [comp, classes] of w.units) {
      const b = boxFor(comp)
      if (b !== topBox) { for (const c of classes) part(b, c, r.id); path.set(b.id, [...new Set([...(path.get(b.id) ?? []), ...classes])]) }
    }
    for (const e of w.edges) {
      const [a, z] = e.split("\u0000")
      band(boxFor(a).id, boxFor(z).id, r.id)
    }
    for (const [comp, ts] of w.data) {
      const from = boxFor(comp)
      for (const t of ts) {
        const b = dataBox(domainOf(t))
        part(b, t, r.id)
        path.set(b.id, [...(path.get(b.id) ?? []), shortName(t)].filter((x, i, xs) => xs.indexOf(x) === i))
        band(from.id, b.id, r.id)
      }
    }
    for (const [comp, ss] of w.out) {
      const from = boxFor(comp)
      for (const s of ss) {
        const b = box(`sys:${s}`, "outside", "system", s, s)
        part(b, s, r.id)
        path.set(b.id, [s])
        band(from.id, b.id, r.id)
      }
    }
    paths.set(r.id, path)
  }

  // Plumbing: code most routes pass through says how the code is laid, not
  // where a route goes. It stands aside on its floor, its bands left out.
  if (routes.length >= 20) {
    for (const b of boxes.values()) if (b.kind === "component" && plumbing.has(b.title) || b.kind === "domain" && b.routes.size > routes.length / 2) b.shared = true
  }
  const shown = (id: string) => { const b = boxes.get(id); return !!b && !b.shared }
  const rank = (f: FloorId) => FLOORS.indexOf(f)
  // A band runs down the stack; a call back up a floor is not drawn.
  const bandList = [...bands.values()].filter(b => shown(b.from) && shown(b.to) && rank(boxes.get(b.from)!.floor) < rank(boxes.get(b.to)!.floor))

  const floors: StackFloor[] = FLOORS.map(id => {
    const on = [...boxes.values()].filter(b => b.floor === id)
    return { id, boxes: on.filter(b => !b.shared).sort((a, b) => b.routes.size - a.routes.size || a.label.localeCompare(b.label)), shared: on.filter(b => b.shared).sort((a, b) => b.routes.size - a.routes.size) }
  }).filter(f => f.boxes.length || f.shared.length)

  return { floors, bands: bandList, boxes, routes, paths, untraced }
}

/** The boxes and bands a set of routes passes, to light them. */
export function litBy(stack: ApiStack, routes: ReadonlySet<number>): { boxes: Map<string, number>; bands: Map<string, number> } {
  const count = (s: Set<number>) => { let n = 0; for (const r of s) if (routes.has(r)) n++; return n }
  const boxes = new Map<string, number>()
  for (const b of stack.boxes.values()) { const n = count(b.routes); if (n) boxes.set(b.id, n) }
  const bands = new Map<string, number>()
  for (const b of stack.bands) { const n = count(b.routes); if (n) bands.set(b.id, n) }
  return { boxes, bands }
}

/**
 * A stack that fits: each floor keeps its biggest boxes and folds the rest
 * into one "more" box, with their bands merged into its own.
 */
export function foldStack(stack: ApiStack, keep: (floor: FloorId) => number): ApiStack {
  const into = new Map<string, string>()
  const boxes = new Map(stack.boxes)
  const floors = stack.floors.map(f => {
    const k = Math.max(1, keep(f.id))
    if (f.boxes.length <= k) return f
    const kept = f.boxes.slice(0, k - 1)
    const rest = f.boxes.slice(k - 1)
    const more: StackBox = { id: `more:${f.id}`, floor: f.id, kind: rest[0].kind, label: "", title: "", routes: new Set(), parts: new Map(), shared: false }
    for (const b of rest) {
      into.set(b.id, more.id)
      b.routes.forEach(r => more.routes.add(r))
      more.parts.set(b.id, b.routes)
    }
    boxes.set(more.id, more)
    return { ...f, boxes: [...kept, more] }
  })
  if (!into.size) return stack
  const bands = new Map<string, StackBand>()
  for (const b of stack.bands) {
    const from = into.get(b.from) ?? b.from, to = into.get(b.to) ?? b.to
    if (from === to) continue
    const id = `${from}>${to}`
    const m = bands.get(id) ?? { id, from, to, routes: new Set<number>() }
    b.routes.forEach(r => m.routes.add(r))
    bands.set(id, m)
  }
  return { ...stack, floors, boxes, bands: [...bands.values()] }
}
