// What the workspace builds and ships, read from the snapshot's deployable
// tables (engine revision 5). Everything here is a fact the engine recorded
// with its file and line; nothing is scored. A quantum is not computed here:
// the architect draws it as a group, and `proposeLens` only offers a cut.

export interface Deployable {
  id: string
  name: string
  kind: "image" | "app" | "function" | string
  repository: string
  file: string
  line: number
  built_by: string
  context: string
  base_image: string
  runtime: string
  /** For a mobile app (revision 7): android, ios, flutter or react-native. */
  platform?: string
  files: number
  components: number
}

export interface Content { deployable: string; path: string; pattern: string; module: string; file: string; line: number; resolution: string }
export interface DeployableComponent { deployable: string; component: string; files: number }
export interface Link { from: string; to: string; to_kind: string; kind: string; mode: string; via: string; file: string; line: number; resolution: string }
export interface Unresolved { from: string; ref: string; file: string; line: number; reason: string }
export interface Pipeline {
  id: string; name: string; system: string; file: string; repository: string; parsed: string
  triggers: string; paths: string; stages: string; tools: string
  delegates_to: string; delegates_ref: string; environments: string; deployables: number
}
export interface PipelineLink { pipeline: string; deployable: string; action: string; file: string; line: number; resolution: string }
export interface Environment { deployable: string; environment: string; kind: string; source: string; file: string; line: number }
export interface EnvValue { deployable: string; environment: string; source: string; key: string; value: string; secret: number; file: string; line: number }
export interface Dependency { deployable: string; ecosystem: string; name: string; version: string; role: string; source: string; file: string; line: number }

export interface DeployableModel {
  deployables: Deployable[]
  contents: Content[]
  components: DeployableComponent[]
  links: Link[]
  unresolved: Unresolved[]
  pipelines: Pipeline[]
  pipelineLinks: PipelineLink[]
  environments: Environment[]
  values: EnvValue[]
  dependencies: Dependency[]
}

export const EMPTY_MODEL: DeployableModel = {
  deployables: [], contents: [], components: [], links: [], unresolved: [], pipelines: [],
  pipelineLinks: [], environments: [], values: [], dependencies: [],
}

type Query = <T>(sql: string) => Promise<T[]>

/** Reads every deployable table the snapshot has; a table it lacks reads as empty. */
export async function loadModel(query: Query, hasView: (v: string) => boolean): Promise<DeployableModel> {
  const read = <T>(view: string, sql: string) => (hasView(view) ? query<T>(sql) : Promise.resolve([] as T[]))
  const [deployables, contents, components, links, unresolved, pipelines, pipelineLinks, environments, values, dependencies] = await Promise.all([
    read<Deployable>("deployables", "SELECT * FROM deployables ORDER BY id"),
    read<Content>("deployable_contents", "SELECT deployable, path, pattern, module, file, line, resolution FROM deployable_contents"),
    read<DeployableComponent>("deployable_components", "SELECT deployable, component, files FROM deployable_components"),
    read<Link>("deployable_links", "SELECT `from`, `to`, to_kind, kind, mode, via, file, line, resolution FROM deployable_links"),
    read<Unresolved>("deployable_unresolved", "SELECT `from`, ref, file, line, reason FROM deployable_unresolved"),
    read<Pipeline>("pipelines", "SELECT id, name, system, file, repository, parsed, triggers, paths, stages, tools, delegates_to, delegates_ref, environments, deployables FROM pipelines ORDER BY id"),
    read<PipelineLink>("pipeline_deployables", "SELECT pipeline, deployable, action, file, line, resolution FROM pipeline_deployables"),
    read<Environment>("deployable_environments", "SELECT deployable, environment, kind, source, file, line FROM deployable_environments"),
    read<EnvValue>("deployable_environment_values", "SELECT deployable, environment, source, key, value, secret, file, line FROM deployable_environment_values"),
    read<Dependency>("deployable_dependencies", "SELECT deployable, ecosystem, name, version, role, source, file, line FROM deployable_dependencies"),
  ])
  return { deployables, contents, components, links, unresolved, pipelines, pipelineLinks, environments, values, dependencies }
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const KIND_LABEL: Record<string, string> = { image: "Image", app: "App", function: "Function", mobile_app: "Mobile app" }
export const PLATFORM_LABEL: Record<string, string> = { android: "Android", ios: "iOS", flutter: "Flutter", "react-native": "React Native" }

export const BUILT_BY_LABEL: Record<string, string> = {
  skaffold: "Skaffold", jib: "Jib", buildpacks: "Buildpacks", ko: "ko", bazel: "Bazel", pipeline: "a pipeline",
  compose: "Compose", "maven-docker": "a Maven plugin", "spring-boot": "Spring Boot", "dotnet-publish": "dotnet publish",
  dockerfile: "a Dockerfile only", maven: "Maven", gradle: "Gradle", dotnet: ".NET", aspire: "the Aspire app host",
  xcode: "Xcode", flutter: "Flutter", "react-native": "React Native", expo: "Expo",
  sam: "SAM", serverless: "Serverless", delegated: "a template outside this workspace",
}

/** How a join was made, in words, strongest first. The last three are weaker and drawn dashed. */
export const RESOLUTION_LABEL: Record<string, string> = {
  declared: "Named outright",
  path: "A path, resolved",
  build_output: "A build output, traced to its module",
  module_dependency: "A manifest dependency",
  repository: "The only one in its repository",
  paths: "What the pipeline's path filter watches",
  name: "Joined by name",
  shared_config: "From a ConfigMap several services load",
}
export const WEAK_RESOLUTIONS = new Set(["name", "shared_config", "paths"])

export const LINK_LABEL: Record<string, string> = {
  calls: "Calls", messages: "Messages", uses_datastore: "Uses datastore",
  shares_datastore: "Shares a database with", shares_module: "Carries", depends_on: "Starts after",
}

export const UNRESOLVED_LABEL: Record<string, string> = {
  not_built_here: "Not built in this workspace",
  external: "A public image",
  interpolated: "Named by a variable",
  ambiguous: "Could be more than one thing",
  not_found: "Named, but nothing here answers to it",
}

export const STAGES = ["build", "test", "scan", "package", "publish", "deploy", "approve"] as const
export const STAGE_LABEL: Record<string, string> = {
  build: "Build", test: "Test", scan: "Scan", package: "Package", publish: "Publish", deploy: "Deploy", approve: "Approve",
}

export const SYSTEM_LABEL: Record<string, string> = {
  github_actions: "GitHub Actions", gitlab: "GitLab CI", jenkins: "Jenkins", azure_pipelines: "Azure Pipelines",
  circleci: "CircleCI", travis: "Travis CI", bitbucket: "Bitbucket Pipelines", cloud_build: "Cloud Build", other: "Other",
}

/** Splits a comma list the engine wrote into one column. */
export function list(s: string | null | undefined): string[] {
  return (s ?? "").split(",").map(x => x.trim()).filter(Boolean)
}

/** The stage strip: each stage, and whether the pipeline does it. */
export function stageStrip(stages: string): Array<{ stage: string; label: string; on: boolean }> {
  const have = new Set(list(stages))
  return STAGES.map(s => ({ stage: s, label: STAGE_LABEL[s], on: have.has(s) }))
}

/** A delegation pinned to a branch moves under the pipeline; one pinned to a commit does not. */
export function pinOf(ref: string): "commit" | "tag" | "branch" | "none" {
  if (!ref) return "none"
  if (/^[0-9a-f]{40}$/.test(ref)) return "commit"
  if (/^(main|master|develop|dev|trunk|release)$/.test(ref)) return "branch"
  return "tag"
}

// ---------------------------------------------------------------------------
// One deployable
// ---------------------------------------------------------------------------

export interface TalksTo {
  sync: Link[]
  async: Link[]
  data: Link[]
  modules: Link[]
  startup: Link[]
  /** Names in its configuration that nothing in this workspace answers to. */
  outside: Unresolved[]
}

export function talksTo(m: DeployableModel, id: string): TalksTo {
  const own = m.links.filter(l => l.from === id)
  // shares_datastore is written once per pair, from the alphabetically first.
  const shared = m.links.filter(l => l.kind === "shares_datastore" && l.to === id).map(l => ({ ...l, from: id, to: l.from }))
  const messagesIn = m.links.filter(l => l.kind === "messages" && l.to_kind === "deployable" && l.to === id && l.mode === "async").map(l => ({ ...l, from: id, to: l.from }))
  const byTo = (a: Link, b: Link) => a.to.localeCompare(b.to) || a.via.localeCompare(b.via)
  return {
    sync: own.filter(l => l.kind === "calls").sort(byTo),
    async: [...own.filter(l => l.kind === "messages"), ...messagesIn].sort(byTo),
    data: [...own.filter(l => l.kind === "uses_datastore" || l.kind === "shares_datastore"), ...shared].sort(byTo),
    modules: own.filter(l => l.kind === "shares_module").sort(byTo),
    startup: own.filter(l => l.kind === "depends_on").sort(byTo),
    outside: m.unresolved.filter(u => u.from === id).sort((a, b) => a.ref.localeCompare(b.ref)),
  }
}

/** Who calls or messages a deployable. */
export function calledBy(m: DeployableModel, id: string): Link[] {
  return m.links.filter(l => l.to === id && l.to_kind === "deployable" && l.kind === "calls").sort((a, b) => a.from.localeCompare(b.from))
}

export function pipelinesOf(m: DeployableModel, id: string): Array<{ pipeline: Pipeline; actions: PipelineLink[] }> {
  const byId = new Map(m.pipelines.map(p => [p.id, p]))
  const grouped = new Map<string, PipelineLink[]>()
  for (const pl of m.pipelineLinks) {
    if (pl.deployable !== id) continue
    grouped.set(pl.pipeline, [...(grouped.get(pl.pipeline) ?? []), pl])
  }
  return [...grouped.entries()]
    .filter(([p]) => byId.has(p))
    .map(([p, actions]) => ({ pipeline: byId.get(p)!, actions: actions.sort((a, b) => a.action.localeCompare(b.action)) }))
    .sort((a, b) => a.pipeline.id.localeCompare(b.pipeline.id))
}

/** Environments, one row per name, each with every source that named it. */
export function environmentsOf(m: DeployableModel, id: string): Array<{ environment: string; kind: string; sources: Environment[] }> {
  const by = new Map<string, Environment[]>()
  for (const e of m.environments) if (e.deployable === id) by.set(e.environment, [...(by.get(e.environment) ?? []), e])
  return [...by.entries()]
    .map(([environment, sources]) => ({ environment, kind: sources.some(s => s.kind === "pattern") ? "pattern" : "enumerated", sources }))
    .sort((a, b) => (a.kind === b.kind ? envOrder(a.environment) - envOrder(b.environment) || a.environment.localeCompare(b.environment) : a.kind === "enumerated" ? -1 : 1))
}

const ENV_ORDER = ["local", "dev", "develop", "development", "test", "testing", "qa", "int", "uat", "stage", "staging", "preprod", "prod", "production"]
/** Sorts environments the way they are promoted: dev before test before prod. */
export function envOrder(name: string): number {
  const lower = name.toLowerCase()
  let best = ENV_ORDER.length
  ENV_ORDER.forEach((e, i) => { if (lower === e || lower.endsWith("-" + e) || lower.endsWith("_" + e) || lower.startsWith(e + "-")) best = i })
  return best
}

export interface EnvDiffRow {
  key: string
  secret: boolean
  /** Value per environment; undefined where the environment does not set the key. */
  values: Record<string, string | undefined>
  lines: Record<string, { file: string; line: number }>
}

/**
 * How one deployable's environments differ, from values files of one kind
 * only: a Helm values file per environment is comparable key by key, and
 * nothing else is. Keys every environment sets alike are left out.
 */
export function envDiff(values: EnvValue[], deployable: string, source = "helm_values"): { environments: string[]; rows: EnvDiffRow[]; same: number } {
  const mine = values.filter(v => v.deployable === deployable && v.source === source)
  const environments = [...new Set(mine.map(v => v.environment))].sort((a, b) => envOrder(a) - envOrder(b) || a.localeCompare(b))
  const byKey = new Map<string, EnvDiffRow>()
  for (const v of mine) {
    const row = byKey.get(v.key) ?? { key: v.key, secret: false, values: {}, lines: {} }
    row.values[v.environment] = v.secret ? "" : v.value
    row.secret = row.secret || v.secret === 1
    row.lines[v.environment] = { file: v.file, line: v.line }
    byKey.set(v.key, row)
  }
  const rows: EnvDiffRow[] = []
  let same = 0
  for (const row of byKey.values()) {
    const vals = environments.map(e => row.values[e])
    const differs = vals.some(v => v === undefined) || new Set(vals).size > 1
    if (differs && !row.secret) rows.push(row)
    else if (differs && row.secret && vals.some(v => v === undefined)) rows.push(row)
    else same++
  }
  rows.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
  return { environments, rows, same }
}

// ---------------------------------------------------------------------------
// Technology
// ---------------------------------------------------------------------------

export interface TechRow {
  deployable: string
  runtime: string
  frameworks: string[]
  baseImage: string
  internal: string[]
  libraries: number
}

export function technology(m: DeployableModel): TechRow[] {
  return m.deployables.map(d => {
    const deps = m.dependencies.filter(x => x.deployable === d.id)
    const base = deps.find(x => x.role === "base_image")
    return {
      deployable: d.id,
      runtime: d.runtime,
      frameworks: deps.filter(x => x.role === "framework").map(x => (x.version ? `${x.name} ${x.version}` : x.name)).sort(),
      baseImage: base ? (base.version ? `${base.name}:${base.version.split("@")[0]}` : base.name) : "",
      internal: [...new Set(deps.filter(x => x.role === "internal").map(x => x.name))].sort(),
      libraries: deps.filter(x => x.role === "library").length,
    }
  })
}

/** How a value spreads across deployables: `java 8` on 27 of 28. */
export function spread(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Internal modules carried by more than one deployable, widest first. */
export function sharedModules(m: DeployableModel): Array<{ module: string; deployables: string[] }> {
  const by = new Map<string, Set<string>>()
  for (const l of m.links) if (l.kind === "shares_module") by.set(l.to, (by.get(l.to) ?? new Set()).add(l.from))
  return [...by.entries()].map(([module, ds]) => ({ module, deployables: [...ds].sort() })).sort((a, b) => b.deployables.length - a.deployables.length || a.module.localeCompare(b.module))
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** The deployables a component ships in, most of it first. */
export function shipsIn(m: DeployableModel, component: string): Array<{ deployable: Deployable; files: number }> {
  const byId = new Map(m.deployables.map(d => [d.id, d]))
  return m.components
    .filter(c => c.component === component && byId.has(c.deployable))
    .map(c => ({ deployable: byId.get(c.deployable)!, files: c.files }))
    .sort((a, b) => b.files - a.files || a.deployable.id.localeCompare(b.deployable.id))
}

export function componentsOf(m: DeployableModel, id: string): DeployableComponent[] {
  return m.components.filter(c => c.deployable === id).sort((a, b) => b.files - a.files || a.component.localeCompare(b.component))
}

// ---------------------------------------------------------------------------
// From how it ships: a lens the architect can take
// ---------------------------------------------------------------------------

export interface ProposedGroup {
  name: string
  deployables: string[]
  components: string[]
  /** Links that joined deployables into this group, when merging. */
  joinedBy: Link[]
  /** Deployables built from exactly the same code: eight functions from one folder. */
  sameCode: boolean
}

export interface Proposal {
  groups: ProposedGroup[]
  /** In more than one deployable: one group per component per lens, so they sit apart. */
  shared: string[]
  /** In no deployable. */
  unshipped: number
}

/**
 * One group per deployable, holding the components it ships. With `merge`,
 * deployables joined by a synchronous call or a shared database fall into
 * one group -- the quantum reading -- and the links that did it are kept, so
 * the proposal says what it went on. Messaging never merges: two services
 * that only exchange messages deploy and fail apart.
 */
export function proposeLens(m: DeployableModel, allComponents: string[], merge: boolean): Proposal {
  const ids = m.deployables.map(d => d.id)
  const parent = new Map(ids.map(id => [id, id]))
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r }
  const joins: Link[] = []
  // Deployables built from exactly the same code are one codebase shipped
  // several ways, and always one group: otherwise every component they hold
  // is "shared" and the proposal is empty.
  const codeOf = new Map<string, string>()
  for (const id of ids) codeOf.set(id, m.components.filter(c => c.deployable === id).map(c => c.component).sort().join("\n"))
  const sameCodeRoots = new Set<string>()
  const byCode = new Map<string, string>()
  for (const id of ids) {
    const code = codeOf.get(id)!
    if (!code) continue
    const first = byCode.get(code)
    if (first === undefined) { byCode.set(code, id); continue }
    const a = find(first), b = find(id)
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
    sameCodeRoots.add(first)
  }
  if (merge) {
    for (const l of m.links) {
      const joining = l.to_kind === "deployable" && (l.kind === "calls" || l.kind === "shares_datastore" || l.kind === "uses_datastore")
      if (!joining || !parent.has(l.from) || !parent.has(l.to)) continue
      const a = find(l.from), b = find(l.to)
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
      joins.push(l)
    }
  }
  const members = new Map<string, Set<string>>()
  for (const c of m.components) {
    if (!parent.has(c.deployable)) continue
    members.set(c.component, (members.get(c.component) ?? new Set()).add(find(c.deployable)))
  }
  const shared = [...members.entries()].filter(([, roots]) => roots.size > 1).map(([c]) => c).sort()
  const byRoot = new Map<string, ProposedGroup>()
  for (const id of ids) {
    const root = find(id)
    const g = byRoot.get(root) ?? { name: root, deployables: [], components: [], joinedBy: [], sameCode: false }
    g.deployables.push(id)
    byRoot.set(root, g)
  }
  for (const [component, roots] of members) {
    if (roots.size !== 1) continue
    byRoot.get([...roots][0])!.components.push(component)
  }
  for (const l of joins) {
    const g = byRoot.get(find(l.from))
    if (g && !g.joinedBy.some(x => x.from === l.from && x.to === l.to && x.kind === l.kind)) g.joinedBy.push(l)
  }
  for (const first of sameCodeRoots) {
    const g = byRoot.get(find(first))
    if (g) g.sameCode = true
  }
  // A merged group goes by its biggest deployable, the one most of its code
  // ships in, rather than whichever sorts first.
  const size = new Map(m.deployables.map(d => [d.id, d.files]))
  const lead = (ds: string[]) => [...ds].sort((a, b) => (size.get(b) ?? 0) - (size.get(a) ?? 0) || a.localeCompare(b))[0]
  const groups = [...byRoot.values()]
    .map(g => ({ ...g, name: g.deployables.length > 1 ? `${lead(g.deployables)} +${g.deployables.length - 1}` : g.deployables[0], components: g.components.sort() }))
    .filter(g => g.components.length > 0)
    .sort((a, b) => b.components.length - a.components.length || a.name.localeCompare(b.name))
  const shipped = new Set(members.keys())
  return { groups, shared, unshipped: allComponents.filter(c => !shipped.has(c)).length }
}

// ---------------------------------------------------------------------------
// The map: deployables in columns by how far they sit from what calls in
// ---------------------------------------------------------------------------

export interface MapNode { id: string; external: boolean; column: number; row: number }
export interface MapEdge { from: string; to: string; kind: string; weak: boolean; link: Link }

/**
 * Lays deployables out left to right: a deployable nothing calls sits in the
 * first column, and each callee one column right of its furthest caller.
 * Cycles are broken by visiting order. Externals take the last column, so
 * the map reads from the entry points to what the system rests on.
 */
export function layoutMap(m: DeployableModel, kinds = new Set(["calls", "messages", "uses_datastore"])): { nodes: MapNode[]; edges: MapEdge[]; columns: number } {
  const edges: MapEdge[] = []
  const internal = new Set(m.deployables.map(d => d.id))
  const external = new Set<string>()
  for (const l of m.links) {
    if (!kinds.has(l.kind) || !internal.has(l.from)) continue
    if (l.to_kind === "deployable" && !internal.has(l.to)) continue
    if (l.to_kind !== "deployable") external.add(l.to)
    if (edges.some(e => e.from === l.from && e.to === l.to && e.kind === l.kind)) continue
    edges.push({ from: l.from, to: l.to, kind: l.kind, weak: WEAK_RESOLUTIONS.has(l.resolution), link: l })
  }
  const out = new Map<string, string[]>()
  for (const e of edges) if (internal.has(e.to)) out.set(e.from, [...(out.get(e.from) ?? []), e.to])
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const visit = (id: string, d: number) => {
    if (visiting.has(id) || (depth.get(id) ?? -1) >= d) return
    depth.set(id, d)
    visiting.add(id)
    for (const next of (out.get(id) ?? []).slice().sort()) visit(next, d + 1)
    visiting.delete(id)
  }
  const called = new Set(edges.filter(e => internal.has(e.to)).map(e => e.to))
  const roots = [...internal].filter(id => !called.has(id)).sort()
  for (const r of roots) visit(r, 0)
  for (const id of [...internal].sort()) if (!depth.has(id)) visit(id, 0)
  const lastInternal = Math.max(0, ...depth.values())
  const columnsOf = new Map<number, string[]>()
  for (const [id, d] of depth) columnsOf.set(d, [...(columnsOf.get(d) ?? []), id])
  const nodes: MapNode[] = []
  for (const [col, ids] of [...columnsOf.entries()].sort((a, b) => a[0] - b[0])) {
    ids.sort().forEach((id, row) => nodes.push({ id, external: false, column: col, row }))
  }
  const extCol = external.size ? lastInternal + 1 : lastInternal
  ;[...external].sort().forEach((id, row) => nodes.push({ id, external: true, column: extCol, row }))
  return { nodes, edges, columns: extCol + 1 }
}

export interface ArrangedMap {
  /** Node ids per column, left to right, each column ordered to keep lines short. */
  columns: string[][]
  edges: MapEdge[]
  /** Built here, but no drawn line touches them: they go on a shelf, not the map. */
  isolated: string[]
  /** Named in configuration, not built here, by what the links say they are. */
  external: Map<string, "data" | "broker" | "service">
}

/**
 * The map's final arrangement: `layoutMap`'s columns, without the deployables
 * nothing links to, each column sorted by where its neighbours sit (a few
 * barycentre sweeps), so lines cross as little as a cheap pass allows.
 */
export function arrangeMap(m: DeployableModel, kinds = new Set(["calls", "messages", "uses_datastore"])): ArrangedMap {
  const base = layoutMap(m, kinds)
  const touched = new Set(base.edges.flatMap(e => [e.from, e.to]))
  const isolated = base.nodes.filter(n => !n.external && !touched.has(n.id)).map(n => n.id).sort()
  const kept = base.nodes.filter(n => n.external || touched.has(n.id))
  const cols = [...new Set(kept.map(n => n.column))].sort((a, b) => a - b)
  const colIndex = new Map(cols.map((c, i) => [c, i]))
  const columns: string[][] = cols.map(() => [])
  const colOf = new Map<string, number>()
  for (const n of kept.slice().sort((a, b) => a.row - b.row)) {
    const c = colIndex.get(n.column)!
    columns[c].push(n.id)
    colOf.set(n.id, c)
  }
  const nbrs = new Map<string, string[]>()
  for (const e of base.edges) {
    nbrs.set(e.from, [...(nbrs.get(e.from) ?? []), e.to])
    nbrs.set(e.to, [...(nbrs.get(e.to) ?? []), e.from])
  }
  const pos = new Map<string, number>()
  const place = () => columns.forEach(col => col.forEach((id, i) => pos.set(id, i - (col.length - 1) / 2)))
  place()
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let c = 0; c < columns.length; c++) {
      const bary = (id: string) => {
        const ns = (nbrs.get(id) ?? []).filter(x => colOf.get(x) !== c && pos.has(x))
        return ns.length ? ns.reduce((s, x) => s + pos.get(x)!, 0) / ns.length : pos.get(id)!
      }
      const b = new Map(columns[c].map(id => [id, bary(id)]))
      columns[c].sort((x, y) => b.get(x)! - b.get(y)! || x.localeCompare(y))
      place()
    }
  }
  const external = new Map<string, "data" | "broker" | "service">()
  for (const n of kept) {
    if (!n.external) continue
    const into = base.edges.filter(e => e.to === n.id).map(e => e.kind)
    external.set(n.id, into.includes("uses_datastore") ? "data" : into.includes("messages") ? "broker" : "service")
  }
  return { columns, edges: base.edges, isolated, external }
}

/** What each environment runs, in promotion order: dev before prod. */
export function environmentRoster(m: DeployableModel): Array<{ environment: string; pattern: boolean; deployables: string[] }> {
  const by = new Map<string, { pattern: boolean; deployables: Set<string> }>()
  for (const e of m.environments) {
    const row = by.get(e.environment) ?? { pattern: false, deployables: new Set<string>() }
    row.pattern = row.pattern || e.kind === "pattern"
    row.deployables.add(e.deployable)
    by.set(e.environment, row)
  }
  return [...by.entries()]
    .map(([environment, r]) => ({ environment, pattern: r.pattern, deployables: [...r.deployables].sort() }))
    .sort((a, b) => Number(a.pattern) - Number(b.pattern) || envOrder(a.environment) - envOrder(b.environment) || a.environment.localeCompare(b.environment))
}

/** Pipelines with what they do to which deployable, busiest first; the rest are counted apart. */
export function pipelineRoster(m: DeployableModel): { acting: Array<{ pipeline: Pipeline; actions: Map<string, string[]> }>; idle: Pipeline[] } {
  const by = new Map<string, Map<string, string[]>>()
  for (const pl of m.pipelineLinks) {
    const acts = by.get(pl.pipeline) ?? new Map<string, string[]>()
    acts.set(pl.action, [...new Set([...(acts.get(pl.action) ?? []), pl.deployable])])
    by.set(pl.pipeline, acts)
  }
  const size = (a: Map<string, string[]>) => new Set([...a.values()].flat()).size
  const acting = m.pipelines.filter(p => by.has(p.id)).map(p => ({ pipeline: p, actions: by.get(p.id)! }))
    .sort((a, b) => size(b.actions) - size(a.actions) || a.pipeline.name.localeCompare(b.pipeline.name))
  return { acting, idle: m.pipelines.filter(p => !by.has(p.id)) }
}
