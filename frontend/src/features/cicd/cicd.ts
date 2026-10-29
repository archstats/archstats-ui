// How the workspace builds and ships, read from the snapshot's CI/CD tables
// (engine revision 16): pipelines read the way they run, the artifacts they
// build, Dockerfiles, and the hygiene facts a reviewer would flag. Every row
// carries the file and line it was read from; nothing here is scored.

export interface Pipeline {
  id: string
  name: string
  system: string
  kind: string
  repository: string
  file: string
  line: number
  read: "full" | "partial" | "none" | string
  jobs: number
  steps: number
  stages: string
}
export interface Unread { pipeline: string; from_line: number; to_line: number; reason: string; file: string }
export interface Trigger { pipeline: string; event: string; filter: string; file: string; line: number }
export interface Job {
  pipeline: string; id: string; name: string; group: string; depth: number; needs: string
  runner: string; matrix: number; environment: string; gate: string; condition: string; file: string; line: number
}
export interface Step { pipeline: string; job: string; index: number; name: string; verb: string; tool: string; target: string; text: string; file: string; line: number }
export interface Handoff { pipeline: string; job: string; kind: string; target: string; ref: string; pinned: string; via: string; local_pipeline: string; file: string; line: number }
export interface Output {
  pipeline: string; job: string; step: number; kind: string; platform: string; environment: string; target: string
  artifact: string; server: string; context: string; file: string; line: number; resolution: string
}
export interface Artifact {
  id: string; name: string; kind: string; platform: string; repository: string; dockerfile: string; context: string; module: string
  built_by: string; base: string; runtime: string; files: number; components: number; file: string; line: number
}
export interface ArtifactContent { artifact: string; path: string; pattern: string; module: string; file: string; line: number; resolution: string }
export interface ArtifactComponent { artifact: string; component: string; files: number }
export interface Dockerfile { file: string; repository: string; stages: number; final_base: string; final_user: string; ports: string; entrypoint: string; healthcheck: number; dockerignore: number }
export interface DockerStage { file: string; index: number; name: string; from: string; from_kind: string; image: string; tag: string; digest: string; user: string; line: number }
export interface Flag { rule: string; subject_kind: string; subject: string; detail: string; file: string; line: number }
export interface Unresolved { from: string; ref: string; file: string; line: number; reason: string }

export interface CicdModel {
  pipelines: Pipeline[]
  unread: Unread[]
  triggers: Trigger[]
  jobs: Job[]
  steps: Step[]
  handoffs: Handoff[]
  outputs: Output[]
  artifacts: Artifact[]
  contents: ArtifactContent[]
  components: ArtifactComponent[]
  dockerfiles: Dockerfile[]
  stages: DockerStage[]
  flags: Flag[]
  unresolved: Unresolved[]
}

export const EMPTY_MODEL: CicdModel = {
  pipelines: [], unread: [], triggers: [], jobs: [], steps: [], handoffs: [], outputs: [], artifacts: [],
  contents: [], components: [], dockerfiles: [], stages: [], flags: [], unresolved: [],
}

/** The views a snapshot needs for CI/CD; a snapshot from before revision 16 has none of the new ones. */
export const CICD_VIEWS = ["pipeline_jobs", "artifacts"] as const

/** ready: the snapshot was read with CI/CD; old: it predates it; */
export type SnapshotState = "ready" | "old"

export function snapshotState(hasView: (v: string) => boolean): SnapshotState {
  return CICD_VIEWS.every(hasView) ? "ready" : "old"
}

type Query = <T>(sql: string) => Promise<T[]>

/** Reads every CI/CD table the snapshot has; a table it lacks reads as empty. */
export async function loadModel(query: Query, hasView: (v: string) => boolean): Promise<CicdModel> {
  const read = <T>(view: string, sql: string) => (hasView(view) ? query<T>(sql) : Promise.resolve([] as T[]))
  const [pipelines, unread, triggers, jobs, steps, handoffs, outputs, artifacts, contents, components, dockerfiles, stages, flags, unresolved] = await Promise.all([
    read<Pipeline>("pipelines", "SELECT * FROM pipelines ORDER BY id"),
    read<Unread>("pipeline_unread", "SELECT * FROM pipeline_unread"),
    read<Trigger>("pipeline_triggers", "SELECT * FROM pipeline_triggers"),
    read<Job>("pipeline_jobs", "SELECT * FROM pipeline_jobs"),
    read<Step>("pipeline_steps", "SELECT * FROM pipeline_steps ORDER BY pipeline, job, \"index\""),
    read<Handoff>("pipeline_handoffs", "SELECT * FROM pipeline_handoffs"),
    read<Output>("pipeline_outputs", "SELECT * FROM pipeline_outputs"),
    read<Artifact>("artifacts", "SELECT * FROM artifacts ORDER BY id"),
    read<ArtifactContent>("artifact_contents", "SELECT * FROM artifact_contents"),
    read<ArtifactComponent>("artifact_components", "SELECT * FROM artifact_components"),
    read<Dockerfile>("dockerfiles", "SELECT * FROM dockerfiles ORDER BY file"),
    read<DockerStage>("dockerfile_stages", "SELECT * FROM dockerfile_stages ORDER BY file, \"index\""),
    read<Flag>("cicd_flags", "SELECT * FROM cicd_flags"),
    read<Unresolved>("cicd_unresolved", "SELECT * FROM cicd_unresolved"),
  ])
  return { pipelines, unread, triggers, jobs, steps, handoffs, outputs, artifacts, contents, components, dockerfiles, stages, flags, unresolved }
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

export interface CicdIndex {
  pipeline: Map<string, Pipeline>
  jobsOf: Map<string, Job[]>
  stepsOf: Map<string, Step[]> // key: pipeline \u0000 job
  handoffsOf: Map<string, Handoff[]>
  outputsOf: Map<string, Output[]>
  triggersOf: Map<string, Trigger[]>
  unreadOf: Map<string, Unread[]>
  flagsOfFile: Map<string, Flag[]>
  artifact: Map<string, Artifact>
  /** The outputs that name each artifact: who builds and deploys it. */
  outputsOfArtifact: Map<string, Output[]>
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

export const stepKey = (pipeline: string, job: string) => `${pipeline}\u0000${job}`

export function indexModel(m: CicdModel): CicdIndex {
  const ix: CicdIndex = {
    pipeline: new Map(m.pipelines.map(p => [p.id, p])),
    jobsOf: new Map(), stepsOf: new Map(), handoffsOf: new Map(), outputsOf: new Map(), triggersOf: new Map(),
    unreadOf: new Map(), flagsOfFile: new Map(), artifact: new Map(m.artifacts.map(a => [a.id, a])), outputsOfArtifact: new Map(),
  }
  for (const j of m.jobs) push(ix.jobsOf, j.pipeline, j)
  for (const s of m.steps) push(ix.stepsOf, stepKey(s.pipeline, s.job), s)
  for (const h of m.handoffs) push(ix.handoffsOf, h.pipeline, h)
  for (const o of m.outputs) {
    push(ix.outputsOf, o.pipeline, o)
    if (o.artifact) push(ix.outputsOfArtifact, o.artifact, o)
  }
  for (const t of m.triggers) push(ix.triggersOf, t.pipeline, t)
  for (const u of m.unread) push(ix.unreadOf, u.pipeline, u)
  for (const f of m.flags) push(ix.flagsOfFile, f.file, f)
  for (const list of ix.stepsOf.values()) list.sort((a, b) => a.index - b.index)
  return ix
}

// ---------------------------------------------------------------------------
// The pipeline list
// ---------------------------------------------------------------------------

/** Kinds that run when something starts them; the rest are used by others. */
const RUNS_ON_ITS_OWN = new Set(["workflow", "pipeline", "gitops"])

export function runsOnItsOwn(p: Pipeline): boolean {
  return RUNS_ON_ITS_OWN.has(p.kind)
}

export interface ListRow {
  pipeline: Pipeline
  triggers: Trigger[]
  /** The verbs its steps reach, in the order they first appear. */
  silhouette: string[]
  flags: number
  /** Builds or deploys something. */
  delivers: boolean
}

export interface ListGroup { repository: string; rows: ListRow[]; used: ListRow[] }

const VERB_ORDER = ["checkout", "setup", "build", "test", "scan", "package", "publish", "deploy", "approve"]

/** The verbs a pipeline's steps reach, job by job in layout order, once each. */
export function silhouette(ix: CicdIndex, pipeline: string): string[] {
  const jobs = [...(ix.jobsOf.get(pipeline) ?? [])].sort((a, b) => a.depth - b.depth || a.line - b.line)
  const seen = new Set<string>()
  for (const j of jobs) {
    for (const s of ix.stepsOf.get(stepKey(pipeline, j.id)) ?? []) {
      if (s.verb !== "other" && s.verb !== "checkout" && s.verb !== "setup") seen.add(s.verb)
    }
  }
  return VERB_ORDER.filter(v => seen.has(v))
}

/** One row per pipeline, grouped by repository: pipelines that start on their own first, then what they use. */
export function listGroups(m: CicdModel, ix: CicdIndex, search: string): ListGroup[] {
  const q = search.trim().toLowerCase()
  const groups = new Map<string, ListGroup>()
  for (const p of m.pipelines) {
    if (q && !pipelineMatches(ix, p, q)) continue
    const row: ListRow = {
      pipeline: p,
      triggers: ix.triggersOf.get(p.id) ?? [],
      silhouette: silhouette(ix, p.id),
      flags: (ix.flagsOfFile.get(p.file) ?? []).length,
      delivers: (ix.outputsOf.get(p.id) ?? []).length > 0,
    }
    let g = groups.get(p.repository)
    if (!g) groups.set(p.repository, (g = { repository: p.repository, rows: [], used: [] }))
    ;(runsOnItsOwn(p) ? g.rows : g.used).push(row)
  }
  const byName = (a: ListRow, b: ListRow) => a.pipeline.file.localeCompare(b.pipeline.file)
  for (const g of groups.values()) {
    g.rows.sort(byName)
    g.used.sort(byName)
  }
  return [...groups.values()].sort((a, b) => a.repository.localeCompare(b.repository))
}

/** Search covers the pipeline, its jobs, its step text, what it produces and its file. */
export function pipelineMatches(ix: CicdIndex, p: Pipeline, q: string): boolean {
  const has = (s: string | undefined) => !!s && s.toLowerCase().includes(q)
  if (has(p.name) || has(p.file) || has(p.system)) return true
  for (const j of ix.jobsOf.get(p.id) ?? []) {
    if (has(j.name) || has(j.runner) || has(j.environment)) return true
    for (const s of ix.stepsOf.get(stepKey(p.id, j.id)) ?? []) if (has(s.text) || has(s.target) || has(s.name)) return true
  }
  for (const o of ix.outputsOf.get(p.id) ?? []) if (has(o.target) || has(o.artifact)) return true
  for (const h of ix.handoffsOf.get(p.id) ?? []) if (has(h.target)) return true
  return false
}

/** The trigger chips a list row shows: one per event, the first filter beside it. */
export function triggerChips(triggers: Trigger[]): Array<{ event: string; filter: string }> {
  const out = new Map<string, string>()
  for (const t of triggers) if (!out.has(t.event)) out.set(t.event, t.filter)
  const order = ["push", "pull_request", "tag", "schedule", "manual", "upstream", "called", "other"]
  return [...out.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([event, filter]) => ({ event, filter }))
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface ImageRow {
  artifact: Artifact
  dockerfile: Dockerfile | null
  /** Pipelines that build it, and those that deploy it. */
  builtBy: string[]
  deployedBy: string[]
  environments: string[]
  pinned: "digest" | "tag" | "floating" | "none"
}

/** Pins a base image reference: by digest, by a version tag, floating (latest or no tag), or nothing to pin. */
export function pinOfImage(ref: string): ImageRow["pinned"] {
  if (!ref) return "none"
  if (ref.includes("@sha256:")) return "digest"
  const last = ref.slice(ref.lastIndexOf("/") + 1)
  const tag = last.includes(":") ? last.slice(last.indexOf(":") + 1) : ""
  return !tag || tag === "latest" ? "floating" : "tag"
}

export function imageRows(m: CicdModel, ix: CicdIndex, search = ""): ImageRow[] {
  const df = new Map(m.dockerfiles.map(d => [d.file, d]))
  const q = search.trim().toLowerCase()
  const rows: ImageRow[] = []
  for (const a of m.artifacts) {
    if (q && ![a.id, a.name, a.base, a.runtime, a.dockerfile, a.repository].some(s => s?.toLowerCase().includes(q))) continue
    const outs = ix.outputsOfArtifact.get(a.id) ?? []
    const builtBy = [...new Set(outs.filter(o => o.kind !== "deploy").map(o => o.pipeline))].sort()
    const deployedBy = [...new Set(outs.filter(o => o.kind === "deploy").map(o => o.pipeline))].sort()
    const environments = [...new Set(outs.filter(o => o.kind === "deploy" && o.environment).map(o => o.environment))].sort(envOrder)
    rows.push({ artifact: a, dockerfile: df.get(a.dockerfile) ?? null, builtBy, deployedBy, environments, pinned: pinOfImage(a.base) })
  }
  return rows
}

const ENV_RANK = ["dev", "develop", "development", "test", "tst", "qa", "uat", "acc", "acceptance", "stg", "stage", "staging", "preprod", "non-production", "prd", "prod", "production", "live"]
/** Environments in the order changes travel through them; unknown names after, alphabetically. */
export function envOrder(a: string, b: string): number {
  const ra = ENV_RANK.indexOf(a.toLowerCase())
  const rb = ENV_RANK.indexOf(b.toLowerCase())
  if (ra >= 0 && rb >= 0) return ra - rb
  if (ra >= 0) return -1
  if (rb >= 0) return 1
  return a.localeCompare(b)
}

export interface BaseFamily { family: string; versions: Array<{ version: string; count: number; files: string[] }>; total: number }

/** Base images by family and version, across every Dockerfile's final stage: how far apart the images are. */
export function baseFamilies(m: CicdModel): BaseFamily[] {
  const byFamily = new Map<string, Map<string, string[]>>()
  for (const d of m.dockerfiles) {
    if (!d.final_base || d.final_base === "scratch") continue
    const ref = d.final_base.split("@")[0]
    const slash = ref.lastIndexOf("/")
    const colon = ref.lastIndexOf(":")
    const name = colon > slash ? ref.slice(0, colon) : ref
    const version = colon > slash ? ref.slice(colon + 1) : "latest"
    const family = name.slice(name.lastIndexOf("/") + 1)
    let v = byFamily.get(family)
    if (!v) byFamily.set(family, (v = new Map()))
    push(v, version, d.file)
  }
  return [...byFamily.entries()]
    .map(([family, vs]) => ({
      family,
      versions: [...vs.entries()].map(([version, files]) => ({ version, count: files.length, files })).sort((a, b) => b.count - a.count || a.version.localeCompare(b.version)),
      total: [...vs.values()].reduce((n, f) => n + f.length, 0),
    }))
    .sort((a, b) => b.total - a.total || a.family.localeCompare(b.family))
}

/** What a component is built into: the artifacts holding its files, and the pipelines that build or deploy them. */
export function builtInto(m: CicdModel, ix: CicdIndex, component: string): Array<{ artifact: Artifact; files: number; pipelines: string[] }> {
  const out: Array<{ artifact: Artifact; files: number; pipelines: string[] }> = []
  for (const c of m.components) {
    if (c.component !== component) continue
    const a = ix.artifact.get(c.artifact)
    if (!a) continue
    const pipelines = [...new Set((ix.outputsOfArtifact.get(a.id) ?? []).map(o => o.pipeline))].sort()
    out.push({ artifact: a, files: c.files, pipelines })
  }
  return out.sort((a, b) => b.files - a.files || a.artifact.id.localeCompare(b.artifact.id))
}

/** The short form of a file for a narrow rail: the last two segments. */
export function shortFile(file: string): string {
  const parts = file.replace(/^\.\//, "").split("/")
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/")
}

/** A file column as a path the file view opens. */
export function cleanFile(file: string): string {
  return file.replace(/^\.\//, "")
}
