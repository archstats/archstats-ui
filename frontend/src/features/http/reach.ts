// What a route reaches in the code: the tables its own code changes and
// reads, the systems it waits on, and its path there as a tree. Code most
// routes reach (a base controller, a security service) is plumbing: walked
// into, not through, so a route reaches what its own code reaches.

import type { HttpModel, Route } from "./http"

// ---------------------------------------------------------------- facts

/** What a route's own code reaches, plumbing cut: what it changes and what it waits on. */
export interface RouteFacts {
  /** Tables its code is seen writing to. */
  writes: Set<string>
  reads: Set<string>
  /**
   * Tables a class it passes holds a repository for, where the function's
   * name says it writes (DeleteAffiliateAsync) but nothing says which of the
   * class's tables: it may change them.
   */
  mayWrite: Set<string>
  /** Systems it calls and waits for an answer from (HTTP, SOAP, gRPC, GraphQL). */
  waits: Set<string>
  /** Of those, the ones whose calls name no timeout or circuit breaker. */
  unguarded: Set<string>
  /** Other systems: messages sent, mail, storage, search. */
  other: Set<string>
  /** The handler was found as a function and walked. */
  followed: boolean
  /** Every class its code reaches, the handler's own included; true for plumbing, reached but not followed. */
  units: Map<string, boolean>
}

const WAITS = new Set(["http", "soap", "grpc", "graphql"])
const STORES = new Set(["sql", "nosql", "cache"])
const MAX_NODES = 400
const key = (unit: string, fn: string) => `${unit}\u0000${fn}`

export interface CodeIndex {
  out: Map<string, HttpModel["calls"]>
  data: Map<string, Array<{ table: string; access: string }>>
  systems: Map<string, Array<{ system: string; kind: string; guarded: boolean }>>
  componentOf: (unit: string) => string
  /** Components most routes reach (a base controller, a work context, caching): walked into, not through. */
  plumbing: Set<string>
}

/** The calls, data access and outbound calls by the function they start in. */
export function codeIndex(model: HttpModel): CodeIndex {
  const out = new Map<string, HttpModel["calls"]>()
  for (const c of model.calls) {
    const k = key(c.fromUnit, c.fromFunction)
    const list = out.get(k)
    if (list) list.push(c)
    else out.set(k, [c])
  }
  const data = new Map<string, Array<{ table: string; access: string }>>()
  // Where the code has an entity model, a raw SQL name that matches none of
  // its tables is more often a word in a string ("any", "Default") than a table.
  const modelled = model.access.some(a => a.entity)
  for (const a of model.access) {
    if (modelled && !a.entity && a.via === "sql") continue
    const table = a.entity || a.target
    if (!table) continue
    const k = key(a.unit, a.function)
    const list = data.get(k) ?? []
    list.push({ table, access: a.access })
    data.set(k, list)
  }
  const systems = new Map<string, Array<{ system: string; kind: string; guarded: boolean }>>()
  for (const o of model.outbound) {
    if (o.system === "self" || !o.unit || STORES.has(o.kind)) continue
    const k = key(o.unit, o.function)
    const list = systems.get(k) ?? []
    // An address the engine could not follow names a variable, not a system.
    list.push({ system: o.confidence === "unresolved" || !o.system ? `?${o.kind}` : o.system, kind: o.kind, guarded: /timeout|circuit_breaker/.test(o.resilience) })
    systems.set(k, list)
  }
  const componentOf = (unit: string) => model.units.get(unit)?.component || unit
  return { out, data, systems, componentOf, plumbing: new Set() }
}

// A function whose name says it changes something.
const WRITE_VERB = /^(insert|add|create|update|upsert|delete|remove|save|store|put|patch|set|clear|import|apply|assign|register|mark|cancel|approve|reset|change|edit|move|merge|persist|write|destroy|purge|increment|decrement)/i

/**
 * Whether an access writes. Most readers say read or write; a repository or
 * DbSet field says only that the class holds the table (read_write), and
 * then the name of the function using it decides: DeleteCategoryAsync
 * writes, GetCategoryByIdAsync reads.
 */
export function writes(access: string, fn: string): boolean {
  if (access === "write") return true
  if (access !== "read_write") return false
  const name = fn.slice(fn.lastIndexOf(".") + 1)
  const verb = WRITE_VERB.exec(name)?.[0]
  // The verb is a whole word: DeleteCategory and delete_category, not Settings.
  return !!verb && !/[a-z]/.test(name.charAt(verb.length))
}

/**
 * The tables one function touches. Its own rows say what it does; a row on
 * its class as a whole (a repository field) says only what the class holds,
 * so a writing name makes it a table the function may change, and a reading
 * name says nothing.
 */
export function touches(ix: CodeIndex, u: string, fn: string): { writes: string[]; reads: string[]; mayWrite: string[] } {
  const w = new Set<string>(), r = new Set<string>(), m = new Set<string>()
  for (const a of ix.data.get(key(u, fn)) ?? []) (writes(a.access, fn) ? w : r).add(a.table)
  for (const a of ix.data.get(key(u, "")) ?? []) {
    if (a.access === "write") w.add(a.table)
    else if (a.access === "read") r.add(a.table)
    else if (writes(a.access, fn)) m.add(a.table)
  }
  for (const x of w) { r.delete(x); m.delete(x) }
  return { writes: [...w], reads: [...r], mayWrite: [...m] }
}

/** Breadth first from a handler; `visit` sees each function once, with the call that reached it. */
export function walk(ix: CodeIndex, r: Route, visit: (unit: string, fn: string, depth: number, via: HttpModel["calls"][number] | null) => boolean) {
  if (!r.unit || !r.function) return
  const seen = new Set<string>([key(r.unit, r.function)])
  const queue: Array<[string, string, number, HttpModel["calls"][number] | null]> = [[r.unit, r.function, 0, null]]
  while (queue.length && seen.size < MAX_NODES) {
    const [u, f, d, via] = queue.shift()!
    if (!visit(u, f, d, via)) continue
    for (const c of ix.out.get(key(u, f)) ?? []) {
      if (!c.toUnit) continue
      const nk = key(c.toUnit, c.toFunction)
      if (!seen.has(nk)) { seen.add(nk); queue.push([c.toUnit, c.toFunction, d + 1, c]) }
    }
  }
}

/** Per route, what its own code changes and waits on. */
export function routeFacts(model: HttpModel, routes: Route[]): { facts: Map<number, RouteFacts>; index: CodeIndex } {
  const ix = codeIndex(model)
  const handlers = new Set(routes.map(r => r.component))
  if (routes.length >= 20) {
    const reachedBy = new Map<string, number>()
    for (const r of routes) {
      const comps = new Set<string>()
      walk(ix, r, u => { comps.add(ix.componentOf(u)); return true })
      for (const c of comps) reachedBy.set(c, (reachedBy.get(c) ?? 0) + 1)
    }
    for (const [c, n] of reachedBy) if (n > routes.length / 2 && !handlers.has(c)) ix.plumbing.add(c)
  }
  const facts = new Map<number, RouteFacts>()
  for (const r of routes) {
    const f: RouteFacts = { writes: new Set(), reads: new Set(), mayWrite: new Set(), waits: new Set(), unguarded: new Set(), other: new Set(), followed: !!(r.unit && r.function), units: new Map() }
    walk(ix, r, (u, fn, d) => {
      const plumbing = d > 0 && ix.plumbing.has(ix.componentOf(u))
      if (!f.units.has(u) || !plumbing) f.units.set(u, plumbing)
      if (plumbing) return false
      const t = touches(ix, u, fn)
      t.writes.forEach(x => f.writes.add(x))
      t.reads.forEach(x => f.reads.add(x))
      t.mayWrite.forEach(x => f.mayWrite.add(x))
      for (const s of ix.systems.get(key(u, fn)) ?? []) {
        if (WAITS.has(s.kind)) { f.waits.add(s.system); if (!s.guarded) f.unguarded.add(s.system) }
        else f.other.add(s.system)
      }
      return true
    })
    for (const t of f.writes) { f.reads.delete(t); f.mayWrite.delete(t) }
    facts.set(r.id, f)
  }
  return { facts, index: ix }
}

// ---------------------------------------------------------------- trace

export interface TraceStep {
  depth: number
  unit: string
  function: string
  component: string
  /** Shared code most routes reach: shown, not followed. */
  plumbing: boolean
  file: string
  line: number
  writes: string[]
  reads: string[]
  mayWrite: string[]
  systems: string[]
  children: TraceStep[]
}

/** The tree cut to the branches that end in data or a system; the root stays. */
export function pruneTrace(step: TraceStep): TraceStep | null {
  const children = step.children.map(pruneTrace).filter((c): c is TraceStep => !!c)
  const ends = step.writes.length + step.reads.length + step.mayWrite.length + step.systems.length > 0
  return ends || children.length || step.depth === 0 ? { ...step, children } : null
}

/** A route's path through the code as a tree, each function under the one that first called it. */
export function traceRoute(ix: CodeIndex, r: Route, limit = 80): { root: TraceStep | null; steps: number; cut: boolean } {
  const byKey = new Map<string, TraceStep>()
  let root: TraceStep | null = null
  let steps = 0
  let cut = false
  walk(ix, r, (u, fn, d, via) => {
    if (steps >= limit) { cut = true; return false }
    const plumbing = d > 0 && ix.plumbing.has(ix.componentOf(u))
    const data = plumbing ? { writes: [], reads: [], mayWrite: [] } : touches(ix, u, fn)
    const step: TraceStep = {
      depth: d, unit: u, function: fn, component: ix.componentOf(u), plumbing,
      file: via?.file ?? r.file, line: via?.line ?? r.line,
      writes: data.writes,
      reads: data.reads,
      mayWrite: data.mayWrite,
      systems: plumbing ? [] : [...new Set((ix.systems.get(key(u, fn)) ?? []).map(s => s.system))],
      children: [],
    }
    step.reads = step.reads.filter(t => !step.writes.includes(t))
    steps++
    byKey.set(key(u, fn), step)
    if (!via) root = step
    else byKey.get(key(via.fromUnit, via.fromFunction))?.children.push(step)
    return !plumbing
  })
  return { root, steps, cut }
}
