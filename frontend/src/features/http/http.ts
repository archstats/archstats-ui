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

export interface Access { unit: string; function: string; target: string; entity: string; access: string; via: string }

export interface UnitInfo { id: string; name: string; component: string; markers: string; file: string; line: number }

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
    pick("data_access", `SELECT unit, function, target, entity, access, via FROM data_access`, r => ({ unit: str(r.unit), function: str(r.function), target: str(r.target), entity: str(r.entity), access: str(r.access), via: str(r.via) })),
    pick("units", `SELECT id, name, component, markers, file, line FROM units WHERE id IN (SELECT unit FROM entry_points UNION SELECT from_unit FROM calls UNION SELECT to_unit FROM calls UNION SELECT entity FROM data_access)`, r => ({ id: str(r.id), name: str(r.name), component: str(r.component), markers: str(r.markers), file: str(r.file), line: num(r.line) })),
  ])
  return {
    routes, operations, findings, outbound, systems, calls, targets, access, complete,
    reach: new Map(reach.map(r => [r.entry, r])),
    units: new Map(units.map(u => [u.id, u])),
  }
}

// ---------------------------------------------------------------- routes

// An API is read by its resources, not its path segments: /ActivityLog
// with its seven routes, /api/v1/orders with its five. A group names its
// controller and its access once; a route row keeps only what differs.

export interface GroupedRoute {
  route: Route
  /** The path after the group's resource: "/{id}/cancel", "" for the resource itself. */
  rest: string
  /** The handler without the group's controller: "cancel", or "OtherClass.cancel". */
  member: string
  access: string | null
}

export interface ResourceGroup {
  /** The path up to and including the resource: "/api/v1/orders". */
  key: string
  /** The part before the resource every route shares or that only versions it: "/api/v1". */
  base: string
  resource: string
  routes: GroupedRoute[]
  /** The class most of its routes are handled in. */
  controller: string
  /** The access every route shares, or null when none says or they differ. */
  access: string | null
  accessMixed: boolean
  /** The furthest any route reaches, and what all of them reach together. */
  units: number
  tables: number
  outbound: number
  traced: boolean
}

const VERSION = /^v\d+(\.\d+)?$/i
const PARAM = /^(\{.*\}|:.+|<.+>|\[.+\]|\*+)$/

/**
 * How many leading segments every route shares: the API's base, not a
 * resource. A single-resource API keeps its resource.
 */
export function sharedDepth(routes: Route[]): number {
  const segsOf = routes.map(r => r.path.split("/").filter(Boolean))
  let shared = 0
  if (segsOf.length > 1) {
    const min = Math.min(...segsOf.map(s => s.length))
    while (shared < min - 1 && segsOf.every(s => s[shared] === segsOf[0][shared] && !PARAM.test(s[shared]))) shared++
  }
  return shared
}

/** The routes by resource, in path order, with what each group shares said once. */
export function resourceGroups(routes: Route[], reach: Map<number, Reach> = new Map(), targets: Target[] = [], base = sharedDepth(routes)): ResourceGroup[] {
  const segsOf = routes.map(r => r.path.split("/").filter(Boolean))
  const shared = base
  const reached = new Map<number, { tables: Set<string>; out: Set<string> }>()
  for (const t of targets) {
    const r = reached.get(t.entry) ?? { tables: new Set<string>(), out: new Set<string>() }
    ;(t.kind === "table" ? r.tables : r.out).add(t.target)
    reached.set(t.entry, r)
  }
  const groups = new Map<string, ResourceGroup & { tableSet: Set<string>; outSet: Set<string> }>()
  routes.forEach((route, n) => {
    const segs = segsOf[n]
    let i = 0
    while (i < segs.length && (i < shared || /^api$/i.test(segs[i]) || VERSION.test(segs[i]))) i++
    const head = i < segs.length && !PARAM.test(segs[i]) ? i + 1 : i
    const key = "/" + segs.slice(0, head).join("/")
    let g = groups.get(key)
    if (!g) {
      g = { key, base: head > 0 ? "/" + segs.slice(0, head - 1).join("/") : "", resource: head > 0 ? segs[head - 1] : "", routes: [], controller: "", access: null, accessMixed: false, units: 0, tables: 0, outbound: 0, traced: false, tableSet: new Set(), outSet: new Set() }
      if (g.base === "/") g.base = ""
      groups.set(key, g)
    }
    g.routes.push({ route, rest: segs.length > head ? "/" + segs.slice(head).join("/") : "", member: "", access: accessLabel(route.auth) })
    const rr = reach.get(route.id)
    if (rr) {
      g.traced = true
      g.units = Math.max(g.units, rr.units)
    }
    const t = reached.get(route.id)
    t?.tables.forEach(x => g!.tableSet.add(x))
    t?.out.forEach(x => g!.outSet.add(x))
  })
  const out: ResourceGroup[] = []
  for (const g of groups.values()) {
    const classes = new Map<string, number>()
    for (const r of g.routes) {
      const c = handlerClass(r.route)
      if (c) classes.set(c, (classes.get(c) ?? 0) + 1)
    }
    g.controller = [...classes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ""
    for (const r of g.routes) {
      const h = handlerName(r.route)
      r.member = g.controller && h.startsWith(g.controller + ".") ? h.slice(g.controller.length + 1) : h
    }
    const labels = new Set(g.routes.map(r => r.access ?? ""))
    g.accessMixed = labels.size > 1
    g.access = labels.size === 1 ? g.routes[0].access : null
    g.routes.sort((a, b) => a.rest.localeCompare(b.rest) || methodRank(a.route.method) - methodRank(b.route.method))
    g.tables = g.tableSet.size
    g.outbound = g.outSet.size
    const { tableSet: _t, outSet: _o, ...plain } = g
    out.push(plain)
  }
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/** The handler as a person reads it: Class.method, or the function. */
export function handlerName(r: Route): string {
  const h = r.function || r.handler
  if (h) return h
  return r.unit ? shortName(r.unit) : ""
}

function handlerClass(r: Route): string {
  const h = handlerName(r)
  const i = h.lastIndexOf(".")
  return i > 0 ? h.slice(0, i) : ""
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY", "WS"]
function methodRank(m: string): number {
  const i = METHODS.indexOf(m.split(",")[0])
  return i < 0 ? METHODS.length : i
}

const NOISE = new Set(["ALL_FUNCTIONS", "ALL_FUNCTIONS_READ", "ALL_FUNCTIONS_WRITE"])

/**
 * What an access rule says, in the word that tells two apart:
 * CheckPermission(StandardPermission.Customers.ACTIVITY_LOG_DELETE) is
 * ACTIVITY_LOG_DELETE, PreAuthorize("hasRole('ADMIN')") is hasRole ADMIN,
 * Authorize(Roles = "Clerk") is Authorize Clerk. A mark with no argument is
 * its name. The full rule stays one hover away.
 */
export function accessLabel(auth: string): string | null {
  const a = auth.trim()
  if (!a) return null
  const first = a.split(/[,(]/)[0].trim()
  const doubled = [...a.matchAll(/"([^"]+)"/g)].map(m => m[1])
  const quoted = doubled.length ? doubled : [...a.matchAll(/'([^']+)'/g)].map(m => m[1])
  const inner = quoted.flatMap(q => [...q.matchAll(/(\w+)\s*\(\s*'?([\w-]+)'?/g)].map(m => `${m[1]} ${m[2]}`))
  if (inner.length) return inner.join(", ")
  const constants = [...a.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map(m => m[1]).filter(c => !NOISE.has(c))
  const words = quoted.filter(q => /^[\w.:-]+$/.test(q))
  const pick = constants.length ? constants[constants.length - 1] : words.length ? words.join(", ") : ""
  if (!pick) return a.includes("(") ? `${first}(…)` : first
  return /^(CheckPermission|hasAnyAuthority|hasAuthority|Secured|RolesAllowed|IsGranted|RequiresPermissions)$/.test(first) ? pick : `${first} ${pick}`
}

/**
 * What kind of thing an access rule asks for, read from its words: a named
 * role, permission or policy; only that the caller is signed in; that anyone
 * may call (AllowAnonymous, permitAll, a public store); something else
 * (a rate limiter read as middleware); or nothing at all.
 */
export type AccessClass = "rule" | "signedIn" | "open" | "other" | "none"
export const ACCESS_CLASSES: AccessClass[] = ["rule", "signedIn", "open", "other", "none"]

export function accessClass(auth: string): AccessClass {
  const a = auth.trim()
  if (!a) return "none"
  if (/anonymous|permitall|allowany|public|optional/i.test(a)) return "open"
  if (/role|admin|authorit|permission(?!_classes)|polic|scope|claim|staff|superuser|secured|granted|access\(|IsOwner/i.test(a)) return "rule"
  if (/auth|login|jwt|oauth|token|session|guard|user|signed/i.test(a)) return "signedIn"
  return "other"
}

const ENTITY_TAIL = /^(domain|domains|model|models|entity|entities|data|core|po|pojo|orm|schema|schemas|repository|repositories)$/i

/** A table's namespace: everything before its last name. */
export function namespaceOf(table: string): string {
  const i = Math.max(table.lastIndexOf("."), table.lastIndexOf("\\"), table.lastIndexOf("/"))
  return i > 0 ? table.slice(0, i) : ""
}

/**
 * Data namespaces as a reader tells them apart: by their last meaningful
 * word (Nop.Core.Domain.Catalog is Catalog, Nop.Plugin.Tax.Avalara.Domain
 * is Avalara), with the word before it where two would read the same.
 */
export function domainLabels(spaces: string[]): Map<string, string> {
  const words = spaces.map(c => c.split(/[./\\]/).filter(x => x && !ENTITY_TAIL.test(x)))
  const label = (i: number, n: number) => (words[i].length ? words[i].slice(-n).join(".") : spaces[i])
  const take = spaces.map(() => 1)
  for (let round = 0; round < 4; round++) {
    const seen = new Map<string, number[]>()
    spaces.forEach((_, i) => { const l = label(i, take[i]); seen.set(l, [...(seen.get(l) ?? []), i]) })
    let changed = false
    for (const idx of seen.values()) if (idx.length > 1) for (const i of idx) if (take[i] < words[i].length) { take[i]++; changed = true }
    if (!changed) break
  }
  return new Map(spaces.map((c, i) => [c, label(i, take[i])]))
}

const TAIL = /^(controllers?|api|apis|routes?|router|views?|endpoints?|handlers?|resources?|rest)$/i

/** Components as a reader tells them apart: what they share in front and the word every one ends in left off. */
export function componentLabels(components: string[]): Map<string, string> {
  const parts = components.map(c => {
    let p = c.split(/[./\\]/).filter(Boolean)
    while (p.length > 1 && TAIL.test(p[p.length - 1])) p = p.slice(0, -1)
    return p
  })
  let lead = 0
  if (parts.length > 1) {
    const min = Math.min(...parts.map(p => p.length))
    while (lead < min - 1 && parts.every(p => p[lead] === parts[0][lead])) lead++
  }
  const labels = components.map((c, i) => parts[i].slice(lead).join("."))
  // Two that read the same keep the word they end in.
  const count = new Map<string, number>()
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1)
  return new Map(components.map((c, i) => [c, (count.get(labels[i])! > 1 ? c.split(/[./\\]/).filter(Boolean).slice(lead) : parts[i].slice(lead)).join(".")]))
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
