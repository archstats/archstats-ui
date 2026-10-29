// HTTP: the routes a system offers, what each one reaches in the code, the
// contracts it publishes or calls, and the systems it goes out to. Read from
// engine revision 17's tables; a snapshot from revision 13 on has routes and
// nothing else, and says so.

export interface Route {
  id: number
  kind: string
  method: string
  path: string
  template: string
  framework: string
  handler: string
  unit: string
  function: string
  component: string
  auth: string
  documented: string
  file: string
  line: number
}

export interface Reach {
  entry: number
  callSites: number
  resolved: number
  unknown: number
  units: number
  functions: number
  tables: number
  outbound: number
  depth: number
}

export interface Operation {
  spec: string
  title: string
  version: string
  method: string
  path: string
  template: string
  operationId: string
  tag: string
  summary: string
  deprecated: boolean
  security: string
  side: string
  entry: number
  line: number
}

export interface Finding {
  rule: string
  severity: string
  subject: string
  entry: number
  spec: string
  method: string
  path: string
  detail: string
  file: string
  line: number
}

export interface Outbound {
  id: number
  kind: string
  client: string
  method: string
  path: string
  template: string
  target: string
  system: string
  host: string
  confidence: string
  resolvedVia: string
  configKey: string
  entry: number
  consumer: number
  resilience: string
  unit: string
  function: string
  component: string
  file: string
  line: number
}

export interface SystemRow {
  system: string
  kind: string
  environment: string
  host: string
  source: string
  configKey: string
  file: string
  line: number
}

export interface Call {
  fromUnit: string
  fromFunction: string
  toUnit: string
  toFunction: string
  via: string
  file: string
  line: number
}

export interface Target { entry: number; kind: string; target: string; depth: number }

export interface Access { unit: string; function: string; target: string; entity: string; access: string }

export interface UnitInfo { id: string; name: string; component: string; markers: string }

export interface HttpModel {
  routes: Route[]
  reach: Map<number, Reach>
  operations: Operation[]
  findings: Finding[]
  outbound: Outbound[]
  systems: SystemRow[]
  calls: Call[]
  targets: Target[]
  access: Access[]
  units: Map<string, UnitInfo>
  /** Revision 17 or later: contracts, traces and outbound calls were read. */
  complete: boolean
}

export const EMPTY_MODEL: HttpModel = {
  routes: [], reach: new Map(), operations: [], findings: [], outbound: [], systems: [], calls: [], targets: [], access: [], units: new Map(), complete: false,
}

type Query = (sql: string) => Promise<any[]>

const num = (v: unknown) => Number(v) || 0
const str = (v: unknown) => (v == null ? "" : String(v))

/** Reads the HTTP tables of the open snapshot. */
export async function loadModel(query: Query, hasView: (v: string) => boolean): Promise<HttpModel> {
  if (!hasView("entry_points")) return EMPTY_MODEL
  const complete = hasView("outbound_calls")
  const pick = async <T>(view: string, sql: string, map: (r: any) => T): Promise<T[]> => (hasView(view) ? (await query(sql)).map(map) : [])
  const [routes, reach, operations, findings, outbound, systems, calls, targets, access, units] = await Promise.all([
    pick("entry_points", complete
      ? `SELECT id, kind, method, path, template, framework, handler, unit, function, component, auth, documented, file, line FROM entry_points WHERE kind = 'http'`
      : `SELECT rowid AS id, kind, method, path, path AS template, framework, handler, unit, function, component, '' AS auth, '' AS documented, file, line FROM entry_points WHERE kind = 'http'`,
    r => ({ id: num(r.id), kind: str(r.kind), method: str(r.method), path: str(r.path), template: str(r.template), framework: str(r.framework), handler: str(r.handler), unit: str(r.unit), function: str(r.function), component: str(r.component), auth: str(r.auth), documented: str(r.documented), file: str(r.file), line: num(r.line) })),
    pick("route_reach", `SELECT * FROM route_reach`, r => ({ entry: num(r.entry), callSites: num(r.call_sites), resolved: num(r.resolved), unknown: num(r.unknown), units: num(r.units), functions: num(r.functions), tables: num(r.tables), outbound: num(r.outbound), depth: num(r.depth) })),
    pick("api_operations", `SELECT * FROM api_operations`, r => ({ spec: str(r.spec), title: str(r.title), version: str(r.version), method: str(r.method), path: str(r.path), template: str(r.template), operationId: str(r.operation_id), tag: str(r.tag), summary: str(r.summary), deprecated: num(r.deprecated) === 1, security: str(r.security), side: str(r.side), entry: num(r.entry), line: num(r.line) })),
    pick("api_findings", `SELECT * FROM api_findings`, r => ({ rule: str(r.rule), severity: str(r.severity), subject: str(r.subject), entry: num(r.entry), spec: str(r.spec), method: str(r.method), path: str(r.path), detail: str(r.detail), file: str(r.file), line: num(r.line) })),
    pick("outbound_calls", `SELECT * FROM outbound_calls`, r => ({ id: num(r.id), kind: str(r.kind), client: str(r.client), method: str(r.method), path: str(r.path), template: str(r.template), target: str(r.target), system: str(r.system), host: str(r.host), confidence: str(r.confidence), resolvedVia: str(r.resolved_via), configKey: str(r.config_key), entry: num(r.entry), consumer: num(r.consumer), resilience: str(r.resilience), unit: str(r.unit), function: str(r.function), component: str(r.component), file: str(r.file), line: num(r.line) })),
    pick("outbound_systems", `SELECT * FROM outbound_systems`, r => ({ system: str(r.system), kind: str(r.kind), environment: str(r.environment), host: str(r.host), source: str(r.source), configKey: str(r.config_key), file: str(r.file), line: num(r.line) })),
    pick("calls", `SELECT from_unit, from_function, to_unit, to_function, via, file, line FROM calls`, r => ({ fromUnit: str(r.from_unit), fromFunction: str(r.from_function), toUnit: str(r.to_unit), toFunction: str(r.to_function), via: str(r.via), file: str(r.file), line: num(r.line) })),
    pick("route_targets", `SELECT entry, kind, target, depth FROM route_targets`, r => ({ entry: num(r.entry), kind: str(r.kind), target: str(r.target), depth: num(r.depth) })),
    pick("data_access", `SELECT unit, function, target, entity, access FROM data_access`, r => ({ unit: str(r.unit), function: str(r.function), target: str(r.target), entity: str(r.entity), access: str(r.access) })),
    pick("units", `SELECT id, name, component, markers FROM units WHERE id IN (SELECT unit FROM entry_points UNION SELECT from_unit FROM calls UNION SELECT to_unit FROM calls)`, r => ({ id: str(r.id), name: str(r.name), component: str(r.component), markers: str(r.markers) })),
  ])
  return {
    routes, operations, findings, outbound, systems, calls, targets, access, complete,
    reach: new Map(reach.map(r => [r.entry, r])),
    units: new Map(units.map(u => [u.id, u])),
  }
}

// ---------------------------------------------------------------- routes

export interface RouteNode {
  /** The path up to and including this segment: "/api/v1/orders". */
  prefix: string
  segment: string
  depth: number
  routes: Route[]
  children: RouteNode[]
  /** Routes at or below this node. */
  count: number
}

/**
 * The routes as a tree of path segments, the HTTP version of a folder tree.
 * A chain of segments with one child each is folded into one node, so
 * `/api/v1/orders` is one row, not three.
 */
export function routeTree(routes: Route[]): RouteNode {
  const root: RouteNode = { prefix: "", segment: "", depth: 0, routes: [], children: [], count: 0 }
  for (const r of routes) {
    let node = root
    const segs = r.path.split("/").filter(Boolean)
    for (const seg of segs) {
      let child = node.children.find(c => c.segment === seg)
      if (!child) {
        child = { prefix: `${node.prefix}/${seg}`, segment: seg, depth: node.depth + 1, routes: [], children: [], count: 0 }
        node.children.push(child)
      }
      node = child
    }
    node.routes.push(r)
  }
  const finish = (n: RouteNode): number => {
    n.children.sort((a, b) => a.segment.localeCompare(b.segment))
    n.routes.sort((a, b) => methodRank(a.method) - methodRank(b.method))
    n.count = n.routes.length + n.children.reduce((s, c) => s + finish(c), 0)
    return n.count
  }
  finish(root)
  const fold = (n: RouteNode): RouteNode => {
    n.children = n.children.map(fold)
    if (n !== root && n.routes.length === 0 && n.children.length === 1) {
      const only = n.children[0]
      return { ...only, segment: `${n.segment}/${only.segment}`, depth: n.depth }
    }
    return n
  }
  const folded = fold(root)
  const depths = (n: RouteNode, d: number) => { n.depth = d; n.children.forEach(c => depths(c, d + 1)) }
  depths(folded, 0)
  return folded
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY", "WS"]
function methodRank(m: string): number {
  const i = METHODS.indexOf(m.split(",")[0])
  return i < 0 ? METHODS.length : i
}

export type TreeRow =
  | { kind: "node"; node: RouteNode; open: boolean }
  | { kind: "route"; route: Route; depth: number }

/** The rows a tree shows, given which prefixes are closed. */
export function treeRows(root: RouteNode, closed: Set<string>): TreeRow[] {
  const out: TreeRow[] = []
  const walk = (n: RouteNode) => {
    for (const r of n.routes) out.push({ kind: "route", route: r, depth: n.depth })
    for (const c of n.children) {
      const open = !closed.has(c.prefix)
      out.push({ kind: "node", node: c, open })
      if (open) walk(c)
    }
  }
  walk(root)
  return out
}

/** Routes whose path starts with a prefix, segment by segment. */
export function underPrefix(routes: Route[], prefix: string): Route[] {
  if (!prefix) return routes
  return routes.filter(r => r.path === prefix || r.path.startsWith(prefix + "/"))
}

// ---------------------------------------------------------------- contracts

export interface Contract {
  spec: string
  title: string
  version: string
  side: string
  operations: Operation[]
  matched: number
  /** Operations no route answers. */
  specOnly: Operation[]
  /** Routes in the components this contract covers that it does not describe. */
  codeOnly: Route[]
  findings: Finding[]
}

/** Every contract with what matched, what is missing on either side, and its findings. */
export function contracts(model: HttpModel): Contract[] {
  const bySpec = new Map<string, Operation[]>()
  for (const op of model.operations) {
    const list = bySpec.get(op.spec) ?? []
    list.push(op)
    bySpec.set(op.spec, list)
  }
  const routeById = new Map(model.routes.map(r => [r.id, r]))
  const out: Contract[] = []
  for (const [spec, ops] of bySpec) {
    const matchedIds = new Set(ops.filter(o => o.entry > 0).map(o => o.entry))
    const components = new Set([...matchedIds].map(id => routeById.get(id)?.component).filter((c): c is string => !!c))
    const covered = new Set(model.operations.filter(o => o.entry > 0).map(o => o.entry))
    out.push({
      spec, title: ops[0].title, version: ops[0].version, side: ops[0].side, operations: ops,
      matched: matchedIds.size,
      specOnly: ops[0].side === "consumed" ? [] : ops.filter(o => o.entry === 0),
      codeOnly: model.routes.filter(r => components.has(r.component) && !covered.has(r.id)),
      findings: model.findings.filter(f => f.spec === spec || f.file === spec),
    })
  }
  return out.sort((a, b) => b.operations.length - a.operations.length || a.spec.localeCompare(b.spec))
}

/** Findings on routes, not on a contract. */
export function routeFindings(model: HttpModel): Finding[] {
  return model.findings.filter(f => f.subject === "route")
}

/**
 * How a route stands against the contracts: described, missing from the one
 * that covers its component, or not covered by any.
 */
export function contractState(route: Route, all: Contract[]): "described" | "missing" | "none" {
  if (route.documented === "spec") return "described"
  if (all.some(c => c.codeOnly.some(r => r.id === route.id))) return "missing"
  return "none"
}

// ---------------------------------------------------------------- outbound

export interface SystemSummary {
  system: string
  kind: string
  /** Calls whose address could not be followed, collected per kind: no system to name. */
  unresolved: boolean
  /** Host per environment, "" being every environment. */
  hosts: Array<{ environment: string; host: string }>
  calls: Outbound[]
  clients: string[]
  confidence: Record<string, number>
  resilience: string[]
  /** Routes whose trace reaches one of its calls. */
  routes: number[]
  configKeys: string[]
  /** Only configured: no call in the code was found. */
  configOnly: boolean
}

/** One row per system the workspace reaches, from the calls and the configuration. */
export function systemSummaries(model: HttpModel): SystemSummary[] {
  const by = new Map<string, SystemSummary>()
  const get = (name: string, kind: string) => {
    let s = by.get(name)
    if (!s) {
      s = { system: name, kind, unresolved: name.startsWith("?"), hosts: [], calls: [], clients: [], confidence: {}, resilience: [], routes: [], configKeys: [], configOnly: true }
      by.set(name, s)
    }
    return s
  }
  const reachers = new Map<number, Set<number>>()
  for (const t of model.targets) {
    if (t.kind !== "outbound") continue
    const id = Number(t.target)
    const set = reachers.get(id) ?? new Set<number>()
    set.add(t.entry)
    reachers.set(id, set)
  }
  for (const o of model.outbound) {
    if (o.system === "self") continue
    const s = get(o.system || `?${o.kind}`, o.kind)
    s.configOnly = false
    s.calls.push(o)
    if (o.client && !s.clients.includes(o.client)) s.clients.push(o.client)
    s.confidence[o.confidence] = (s.confidence[o.confidence] ?? 0) + 1
    for (const r of o.resilience.split(",").filter(Boolean)) if (!s.resilience.includes(r)) s.resilience.push(r)
    if (o.configKey && !s.configKeys.includes(o.configKey)) s.configKeys.push(o.configKey)
    for (const e of reachers.get(o.id) ?? []) if (!s.routes.includes(e)) s.routes.push(e)
  }
  for (const row of model.systems) {
    const s = get(row.system, row.kind)
    if (row.host && !s.hosts.some(h => h.environment === row.environment && h.host === row.host)) s.hosts.push({ environment: row.environment, host: row.host })
    if (row.configKey && !s.configKeys.includes(row.configKey)) s.configKeys.push(row.configKey)
  }
  for (const s of by.values()) s.hosts.sort((a, b) => envRank(a.environment) - envRank(b.environment) || a.environment.localeCompare(b.environment))
  return [...by.values()].sort((a, b) => Number(a.configOnly) - Number(b.configOnly) || Number(a.unresolved) - Number(b.unresolved) || b.calls.length - a.calls.length || a.system.localeCompare(b.system))
}

const ENVS = ["prod", "", "acc", "test", "dev", "local"]
export function envRank(e: string): number {
  const i = ENVS.indexOf(e)
  return i < 0 ? ENVS.length : i
}

/** Calls into this workspace's own routes: a frontend's fetch, a service calling another scanned one. */
export function selfCalls(model: HttpModel): Outbound[] {
  return model.outbound.filter(o => o.entry > 0)
}

// ---------------------------------------------------------------- flow

export type Lane = "routes" | "handlers" | "services" | "data" | "systems"
export const LANES: Lane[] = ["routes", "handlers", "services", "data", "systems"]

export interface FlowNode {
  id: string
  lane: Lane
  label: string
  /** A unit id, a table, a system name or a route id, by lane. */
  ref: string
  component: string
  /** How many of the chosen routes reach it. */
  routes: number
}

export interface FlowEdge { from: string; to: string; kind: "handles" | "call" | "implementation" | "table" | "system" }

export interface Flow {
  lanes: Record<Lane, FlowNode[]>
  edges: FlowEdge[]
  /** Nodes left out of each lane to keep it readable. */
  hidden: Record<Lane, number>
  components: string[]
}

const DATA_NAME = /(Repository|Repo|Dao|DAO|Mapper|Store|Gateway|DbContext|Context|Client|Api|Proxy)$/

/**
 * What a set of routes reaches, laid out in lanes: the routes, the units
 * that handle them, the units they call, the units that hold data or call
 * out, and the tables and systems at the end. A unit's lane is read from
 * what it does (it touches data or calls out) and its name, never from
 * where it sits alone.
 */
export function flow(model: HttpModel, routeIds: number[], perLane = 24): Flow {
  const wanted = new Set(routeIds)
  const routes = model.routes.filter(r => wanted.has(r.id))
  const out = new Map<string, Call[]>()
  for (const c of model.calls) {
    const k = `${c.fromUnit}\u0000${c.fromFunction}`
    const list = out.get(k) ?? []
    list.push(c)
    out.set(k, list)
  }
  const touchesData = new Set(model.access.map(a => a.unit))
  const callsOut = new Set(model.outbound.filter(o => o.system !== "self").map(o => o.unit))
  const tablesOf = new Map<string, Set<string>>()
  for (const a of model.access) {
    const set = tablesOf.get(a.unit) ?? new Set<string>()
    set.add(a.entity ? shortName(a.entity) : a.target)
    tablesOf.set(a.unit, set)
  }
  const systemsOf = new Map<string, Set<string>>()
  for (const o of model.outbound) {
    if (o.system === "self" || !o.unit) continue
    const set = systemsOf.get(o.unit) ?? new Set<string>()
    set.add(o.system || o.client)
    systemsOf.set(o.unit, set)
  }

  const reached = new Map<string, Set<number>>() // node id -> routes
  const nodes = new Map<string, FlowNode>()
  const edges = new Map<string, FlowEdge>()
  const handlerUnits = new Set(routes.map(r => r.unit).filter(Boolean))
  const laneOf = (unit: string): Lane => {
    if (handlerUnits.has(unit)) return "handlers"
    const name = model.units.get(unit)?.name ?? shortName(unit)
    if (touchesData.has(unit) || callsOut.has(unit) || DATA_NAME.test(name)) return "data"
    return "services"
  }
  const node = (lane: Lane, ref: string, label: string, component: string, route: number) => {
    const id = `${lane}:${ref}`
    if (!nodes.has(id)) nodes.set(id, { id, lane, label, ref, component, routes: 0 })
    const set = reached.get(id) ?? new Set<number>()
    set.add(route)
    reached.set(id, set)
    return id
  }
  const edge = (from: string, to: string, kind: FlowEdge["kind"]) => {
    if (from === to) return
    edges.set(`${from}>${to}`, { from, to, kind })
  }
  const unitNode = (unit: string, route: number) => {
    const u = model.units.get(unit)
    return node(laneOf(unit), unit, u?.name ?? shortName(unit), u?.component ?? "", route)
  }

  // Routes under one prefix are told apart by what follows it.
  const shared = commonPrefix(routes.map(r => r.path))
  for (const r of routes) {
    const rn = node("routes", String(r.id), `${r.method} ${shared ? "…" + r.path.slice(shared.length) : r.path}`, r.component, r.id)
    if (!r.unit) continue
    const hn = unitNode(r.unit, r.id)
    edge(rn, hn, "handles")
    const seen = new Set<string>()
    const queue: Array<[string, string]> = [[r.unit, r.function]]
    const units = new Set<string>([r.unit])
    while (queue.length) {
      const [u, f] = queue.shift()!
      const k = `${u}\u0000${f}`
      if (seen.has(k) || seen.size > 400) continue
      seen.add(k)
      for (const c of out.get(k) ?? []) {
        if (!c.toUnit) continue
        units.add(c.toUnit)
        if (c.toUnit !== u) edge(unitNode(u, r.id), unitNode(c.toUnit, r.id), c.via === "implementation" ? "implementation" : "call")
        queue.push([c.toUnit, c.toFunction])
      }
    }
    for (const u of units) {
      const from = unitNode(u, r.id)
      for (const t of tablesOf.get(u) ?? []) edge(from, node("systems", `table:${t}`, t, "", r.id), "table")
      for (const s of systemsOf.get(u) ?? []) edge(from, node("systems", `system:${s}`, s, "", r.id), "system")
    }
  }

  for (const [id, n] of nodes) n.routes = reached.get(id)?.size ?? 0
  const lanes = Object.fromEntries(LANES.map(l => [l, [] as FlowNode[]])) as Record<Lane, FlowNode[]>
  const hidden = Object.fromEntries(LANES.map(l => [l, 0])) as Record<Lane, number>
  for (const n of nodes.values()) lanes[n.lane].push(n)
  for (const l of LANES) {
    lanes[l].sort((a, b) => b.routes - a.routes || a.label.localeCompare(b.label))
    if (lanes[l].length > perLane) {
      hidden[l] = lanes[l].length - perLane
      lanes[l] = lanes[l].slice(0, perLane)
    }
  }
  const shown = new Set(LANES.flatMap(l => lanes[l].map(n => n.id)))
  const components = [...new Set([...nodes.values()].filter(n => n.lane !== "routes" && n.lane !== "systems" && n.component).map(n => n.component))].sort()
  return { lanes, hidden, components, edges: [...edges.values()].filter(e => shown.has(e.from) && shown.has(e.to)) }
}

/** The longest whole-segment path prefix several paths share, "" for one path or none. */
export function commonPrefix(paths: string[]): string {
  if (paths.length < 2) return ""
  let segs = paths[0].split("/")
  for (const p of paths.slice(1)) {
    const other = p.split("/")
    let i = 0
    while (i < segs.length && i < other.length - 1 && segs[i] === other[i]) i++
    segs = segs.slice(0, i)
  }
  const prefix = segs.join("/")
  return prefix.length > 1 ? prefix : ""
}

/** The last part of a qualified name: com.acme.OrderService is OrderService. */
export function shortName(id: string): string {
  const hash = id.lastIndexOf("#")
  const rest = hash >= 0 ? id.slice(hash + 1) : id
  return rest.slice(Math.max(rest.lastIndexOf("."), rest.lastIndexOf("\\"), rest.lastIndexOf("/")) + 1) || rest
}

/** The share of a route's call sites the trace could follow, 0..1, or null with none. */
export function traced(reach: Reach | undefined): number | null {
  if (!reach || reach.callSites === 0) return null
  return reach.resolved / reach.callSites
}
