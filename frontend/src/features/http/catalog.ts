// The endpoint catalogue: every route as a reader looks one up, grouped the
// way Swagger groups by tag (the class that answers them), each with what it
// does in the code: who may call it, whether a contract describes it, the
// tables it changes and reads, the systems it calls.

import { accessClass, accessLabel, contractState, handlerName, shortName, type AccessClass, type Contract, type Route } from "./http"
import type { RouteFacts } from "./reach"

export type ContractState = "spec" | "generated" | "missing" | "none"

export interface Endpoint {
  route: Route
  methods: string[]
  handler: string
  access: AccessClass
  /** The access rule in the words that tell two apart, or null when nothing says. */
  accessText: string | null
  contract: ContractState
  /** Tables, by their short names. */
  changes: string[]
  /** Tables a service it passes holds and a writing method may change. */
  mayChange: string[]
  reads: string[]
  /** Systems it calls; `unguarded` those it waits on with no timeout at the call. */
  calls: string[]
  unguarded: string[]
  followed: boolean
}

export interface EndpointGroup {
  /** The class that answers them, or the file where there is none. */
  key: string
  /** The path its endpoints share. */
  path: string
  owner: string
  component: string
  endpoints: Endpoint[]
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

/** The methods a route answers; one that names none answers any. */
export function methodsOf(r: Route): string[] {
  const ms = r.method.split(",").map(m => m.trim().toUpperCase()).filter(Boolean)
  return ms.length ? ms : ["ANY"]
}

/** The whole segments every path starts with, "/" when none. */
export function sharedPath(paths: string[]): string {
  let segs = paths[0]?.split("/").filter(Boolean) ?? []
  for (const p of paths.slice(1)) {
    const other = p.split("/").filter(Boolean)
    let i = 0
    while (i < segs.length && i < other.length && segs[i] === other[i]) i++
    segs = segs.slice(0, i)
  }
  return "/" + segs.join("/")
}

export function endpoint(r: Route, f: RouteFacts | undefined, all: Contract[], systemName: (key: string) => string): Endpoint {
  const names = (tables: Iterable<string>) => [...new Set([...tables].map(shortName))].sort((a, b) => a.localeCompare(b))
  const contract: ContractState = r.documented === "spec" ? "spec" : r.documented ? "generated" : contractState(r, all) === "missing" ? "missing" : "none"
  return {
    route: r,
    methods: methodsOf(r),
    handler: handlerName(r),
    access: accessClass(r.auth),
    accessText: accessLabel(r.auth),
    contract,
    changes: f ? names(f.writes) : [],
    mayChange: f ? names(f.mayWrite).filter(x => !names(f.writes).includes(x)) : [],
    reads: f ? names(f.reads) : [],
    calls: f ? [...new Set([...f.waits, ...f.other].map(systemName))].sort((a, b) => a.localeCompare(b)) : [],
    unguarded: f ? [...f.unguarded].map(systemName) : [],
    followed: !!f?.followed,
  }
}

/** Every endpoint, by the class that answers it, in path order. */
export function catalog(routes: Route[], facts: Map<number, RouteFacts>, all: Contract[], systemName: (key: string) => string): EndpointGroup[] {
  const groups = new Map<string, EndpointGroup>()
  for (const r of routes) {
    const key = r.unit || r.file || r.path
    let g = groups.get(key)
    if (!g) {
      g = { key, path: "", owner: r.unit ? shortName(r.unit) : (r.file.split("/").pop() ?? ""), component: r.component, endpoints: [] }
      groups.set(key, g)
    }
    g.endpoints.push(endpoint(r, facts.get(r.id), all, systemName))
  }
  const rank = (m: string) => { const i = METHODS.indexOf(m); return i < 0 ? METHODS.length : i }
  for (const g of groups.values()) {
    g.endpoints.sort((a, b) => a.route.path.localeCompare(b.route.path) || rank(a.methods[0]) - rank(b.methods[0]))
    g.path = sharedPath(g.endpoints.map(e => e.route.path))
  }
  return [...groups.values()].sort((a, b) => a.path.localeCompare(b.path) || a.owner.localeCompare(b.owner))
}

// ---------------------------------------------------------------- finding and filtering

/** Everything a search matches: method, path, handler, class, access rule, tables, systems. */
export function haystack(e: Endpoint): string {
  return [e.methods.join(" "), e.route.path, e.handler, e.route.unit, e.route.component, e.route.auth, ...e.changes, ...e.mayChange, ...e.reads, ...e.calls].join(" ").toLowerCase()
}

/** Every word must match somewhere. */
export function matches(e: Endpoint, hay: string, words: string[]): boolean {
  return words.every(w => hay.includes(w))
}

export type FilterId = "changes" | "noRule" | "open" | "calls" | "noTimeout" | "undocumented" | "notFollowed"
export const FILTERS: FilterId[] = ["changes", "noRule", "open", "calls", "noTimeout", "undocumented", "notFollowed"]

export const FILTER_TEST: Record<FilterId, (e: Endpoint) => boolean> = {
  changes: e => e.changes.length > 0 || e.mayChange.length > 0,
  noRule: e => e.access === "none",
  open: e => e.access === "open",
  calls: e => e.calls.length > 0,
  noTimeout: e => e.unguarded.length > 0,
  undocumented: e => e.contract === "none" || e.contract === "missing",
  notFollowed: e => !e.followed,
}

/** A path's segments, parameters marked, for drawing: /orders/{id} is [orders, {id}]. */
export function pathParts(path: string): Array<{ text: string; param: boolean }> {
  return path.split("/").filter(Boolean).map(s => ({ text: s, param: /^(\{.*\}|:.+|<.+>|\[.+\]|\*+|%.+%)$/.test(s) }))
}

/** One endpoint as Markdown, to paste into a report or a ticket. */
export function endpointMarkdown(e: Endpoint, labels: { handler: string; access: string; contract: string; changes: string; mayChange: string; reads: string; calls: string; noTimeout: string; nothingSays: string; none: string; contractWords: string }): string {
  const list = (xs: string[]) => (xs.length ? xs.map(x => `\`${x}\``).join(", ") : labels.none)
  return [
    `### \`${e.methods.join(", ")} ${e.route.path}\``,
    "",
    `- **${labels.handler}:** \`${e.handler || e.route.unit}\` (${e.route.file}:${e.route.line})`,
    `- **${labels.access}:** ${e.route.auth ? `\`${e.route.auth}\`` : labels.nothingSays}`,
    `- **${labels.contract}:** ${labels.contractWords}`,
    `- **${labels.changes}:** ${list(e.changes)}`,
    ...(e.mayChange.length ? [`- **${labels.mayChange}:** ${list(e.mayChange)}`] : []),
    `- **${labels.reads}:** ${list(e.reads)}`,
    `- **${labels.calls}:** ${list(e.calls)}${e.unguarded.length ? ` (${labels.noTimeout}: ${e.unguarded.join(", ")})` : ""}`,
  ].join("\n")
}
