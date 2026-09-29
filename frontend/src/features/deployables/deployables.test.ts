import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import {
  EMPTY_MODEL, arrangeMap, environmentRoster, pipelineRoster, envDiff, environmentsOf, envOrder, layoutMap, loadModel, pinOf, proposeLens, sharedModules, shipsIn,
  spread, stageStrip, talksTo, technology, type DeployableModel, type EnvValue, type Link,
  buildingBlocks, codeShare, pipelineKind, shipRows, startsOnItsOwn, type Pipeline,
} from "./deployables"

const link = (from: string, to: string, kind: string, extra: Partial<Link> = {}): Link => ({
  from, to, kind, to_kind: "deployable", mode: kind === "calls" ? "sync" : kind === "messages" ? "async" : "", via: to, file: "k8s.yaml", line: 1, resolution: "name", ...extra,
})

function model(partial: Partial<DeployableModel>): DeployableModel {
  return { ...EMPTY_MODEL, ...partial }
}

const shop = model({
  deployables: ["checkout", "cart", "payment", "frontend"].map(id => ({ id, name: id, kind: "image", repository: "shop", file: `src/${id}/Dockerfile`, line: 1, built_by: "skaffold", context: `src/${id}`, base_image: "", runtime: id === "frontend" ? "go 1.22" : "java 17", files: 3, components: 1 })),
  components: [
    { deployable: "frontend", component: "web", files: 10 },
    { deployable: "checkout", component: "checkout", files: 8 },
    { deployable: "cart", component: "cart", files: 4 },
    { deployable: "payment", component: "payment", files: 4 },
    { deployable: "checkout", component: "common", files: 2 },
    { deployable: "payment", component: "common", files: 2 },
  ],
  links: [
    link("frontend", "checkout", "calls"),
    link("frontend", "cart", "calls"),
    link("checkout", "cart", "calls"),
    link("checkout", "payment", "messages", { via: "payments" }),
    link("cart", "payment", "shares_datastore", { via: "db/shop" }),
    link("cart", "redis", "calls", { to_kind: "external" }),
    link("checkout", "common", "shares_module", { to_kind: "module", via: "2 deployables" }),
    link("payment", "common", "shares_module", { to_kind: "module", via: "2 deployables" }),
  ],
  unresolved: [{ from: "checkout", ref: "fraud-api", file: "k8s.yaml", line: 9, reason: "not_found" }],
})

describe("talksTo", () => {
  it("sorts a deployable's links by what they mean", () => {
    const t = talksTo(shop, "cart")
    expect(t.sync.map(l => l.to)).toEqual(["redis"])
    expect(t.data.map(l => `${l.kind}:${l.to}`)).toEqual(["shares_datastore:payment"])
  })
  it("reads a pair written once from both ends", () => {
    expect(talksTo(shop, "payment").data.map(l => l.to)).toEqual(["cart"])
    expect(talksTo(shop, "payment").async.map(l => l.to)).toEqual(["checkout"])
  })
  it("keeps what nothing here answers to", () => {
    expect(talksTo(shop, "checkout").outside.map(u => u.ref)).toEqual(["fraud-api"])
  })
})

describe("stageStrip and pins", () => {
  it("shows every stage, on or off, in order", () => {
    expect(stageStrip("deploy,build").filter(s => s.on).map(s => s.stage)).toEqual(["build", "deploy"])
    expect(stageStrip("").every(s => !s.on)).toBe(true)
  })
  it("tells a branch from a commit", () => {
    expect(pinOf("main")).toBe("branch")
    expect(pinOf("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0")).toBe("commit")
    expect(pinOf("v3")).toBe("tag")
    expect(pinOf("")).toBe("none")
  })
})

describe("environments", () => {
  it("orders them the way they are promoted", () => {
    const names = ["prod", "nonprod-test", "nonprod-dev", "nonprod-staging", "sandbox"]
    expect([...names].sort((a, b) => envOrder(a) - envOrder(b) || a.localeCompare(b))).toEqual(["nonprod-dev", "nonprod-test", "nonprod-staging", "prod", "sandbox"])
  })
  it("puts patterns after the environments it can list", () => {
    const m = model({ environments: [
      { deployable: "web", environment: "per pull request", kind: "pattern", source: "workflow", file: "w.yml", line: 1 },
      { deployable: "web", environment: "prod", kind: "enumerated", source: "helm_values", file: "values-prod.yaml", line: 1 },
      { deployable: "web", environment: "prod", kind: "enumerated", source: "workflow", file: "w.yml", line: 3 },
      { deployable: "web", environment: "dev", kind: "enumerated", source: "helm_values", file: "values-dev.yaml", line: 1 },
    ] })
    const envs = environmentsOf(m, "web")
    expect(envs.map(e => e.environment)).toEqual(["dev", "prod", "per pull request"])
    expect(envs[1].sources.map(s => s.source)).toEqual(["helm_values", "workflow"])
  })
})

describe("envDiff", () => {
  const v = (environment: string, key: string, value: string, secret = 0, source = "helm_values"): EnvValue => ({ deployable: "booking", environment, source, key, value, secret, file: `helm-release/${environment}.yaml`, line: 1 })
  const values = [
    v("prod", "replicaCount", "3"), v("nonprod-dev", "replicaCount", "1"),
    v("prod", "clusterId", "prod"), v("nonprod-dev", "clusterId", "nonprod"),
    v("prod", "image.pullPolicy", "Always"), v("nonprod-dev", "image.pullPolicy", "Always"),
    v("prod", "resources.limits.cpu", "2"),
    v("prod", "db.password", "", 1), v("nonprod-dev", "db.password", "", 1),
    v("prod", "ingress.host", "a", 0, "kustomize_overlay"),
  ]
  it("keeps only the keys that differ, environments in promotion order", () => {
    const d = envDiff(values, "booking")
    expect(d.environments).toEqual(["nonprod-dev", "prod"])
    expect(d.rows.map(r => r.key)).toEqual(["clusterId", "replicaCount", "resources.limits.cpu"])
    expect(d.rows.find(r => r.key === "resources.limits.cpu")!.values["nonprod-dev"]).toBeUndefined()
    expect(d.same).toBe(2)
  })
  it("never compares files of another kind", () => {
    expect(envDiff(values, "booking").rows.some(r => r.key === "ingress.host")).toBe(false)
  })
  it("never shows a secret's value, and does not call two hidden values different", () => {
    expect(envDiff(values, "booking").rows.some(r => r.key === "db.password")).toBe(false)
    const d = envDiff([v("prod", "db.password", "", 1)], "booking")
    expect(d.rows).toEqual([])
  })
})

describe("technology", () => {
  it("counts how a runtime spreads", () => {
    expect(spread(["java 8", "java 8", "java 17", ""])).toEqual([{ value: "java 8", count: 2 }, { value: "java 17", count: 1 }])
  })
  it("reads runtime, framework, base image and internal modules per deployable", () => {
    const m = model({ deployables: shop.deployables.slice(0, 1), dependencies: [
      { deployable: "checkout", ecosystem: "maven", name: "spring-boot", version: "2.3.3.RELEASE", role: "framework", source: "manifest", file: "pom.xml", line: 3 },
      { deployable: "checkout", ecosystem: "container", name: "eclipse-temurin", version: "8-jre@sha256:abc", role: "base_image", source: "dockerfile", file: "Dockerfile", line: 1 },
      { deployable: "checkout", ecosystem: "maven", name: "qp-common", version: "1.0", role: "internal", source: "manifest", file: "pom.xml", line: 9 },
      { deployable: "checkout", ecosystem: "maven", name: "x:y", version: "1", role: "library", source: "manifest", file: "pom.xml", line: 10 },
    ] })
    expect(technology(m)[0]).toEqual({ deployable: "checkout", runtime: "java 17", frameworks: ["spring-boot 2.3.3.RELEASE"], baseImage: "eclipse-temurin:8-jre", internal: ["qp-common"], libraries: 1 })
  })
  it("lists shared modules widest first", () => {
    expect(sharedModules(shop)).toEqual([{ module: "common", deployables: ["checkout", "payment"] }])
  })
})

describe("shipsIn", () => {
  it("names every deployable a component is in, most of it first", () => {
    expect(shipsIn(shop, "common").map(s => s.deployable.id)).toEqual(["checkout", "payment"])
    expect(shipsIn(shop, "nowhere")).toEqual([])
  })
})

describe("proposeLens", () => {
  const all = ["web", "checkout", "cart", "payment", "common", "docs"]
  it("gives each deployable its own group, and sets shared components apart", () => {
    const p = proposeLens(shop, all, false)
    expect(p.groups.map(g => g.name).sort()).toEqual(["cart", "checkout", "frontend", "payment"])
    expect(p.shared).toEqual(["common"])
    expect(p.unshipped).toBe(1)
  })
  it("merges on synchronous calls and shared data, never on messages, and says which links did it", () => {
    const p = proposeLens(shop, all, true)
    expect(p.groups).toHaveLength(1)
    const g = p.groups[0]
    expect(g.deployables.sort()).toEqual(["cart", "checkout", "frontend", "payment"])
    expect(g.joinedBy.map(l => l.kind).sort()).toEqual(["calls", "calls", "calls", "shares_datastore"])
    expect(p.shared).toEqual([])
  })
  it("keeps deployables built from the same code together", () => {
    const fns = model({
      deployables: ["add", "list", "checkout"].map(id => ({ ...shop.deployables[0], id, name: id, kind: "function" })),
      components: ["add", "list", "checkout"].map(d => ({ deployable: d, component: "cart-service", files: 9 })),
    })
    const p = proposeLens(fns, ["cart-service"], false)
    expect(p.groups).toHaveLength(1)
    expect(p.groups[0].sameCode).toBe(true)
    expect(p.groups[0].deployables.sort()).toEqual(["add", "checkout", "list"])
    expect(p.shared).toEqual([])
  })
  it("keeps apart what only exchanges messages", () => {
    const m = model({ ...shop, links: [link("checkout", "payment", "messages")] })
    expect(proposeLens(m, all, true).groups.map(g => g.deployables.length)).toEqual([1, 1, 1, 1])
  })
})

describe("layoutMap", () => {
  it("reads from the entry points to what the system rests on", () => {
    const { nodes, columns } = layoutMap(shop)
    const col = Object.fromEntries(nodes.map(n => [n.id, n.column]))
    expect(col.frontend).toBe(0)
    expect(col.checkout).toBe(1)
    expect(col.cart).toBe(2)
    expect(col.payment).toBe(2)
    expect(col.redis).toBe(3)
    expect(columns).toBe(4)
  })
  it("survives a cycle", () => {
    const m = model({ ...shop, links: [link("frontend", "cart", "calls"), link("cart", "frontend", "calls")] })
    expect(layoutMap(m).nodes.length).toBe(4)
  })
})

// Opt-in: a real snapshot written by engine revision 5, e.g.
//   SNAP=/path/dep-microservices-demo.db npx vitest run src/features/deployables
const snap = process.env.SNAP
describe.runIf(!!snap)("a real snapshot", () => {
  it("loads every table and finds the call graph", async () => {
    const require = createRequire(import.meta.url)
    const { DatabaseSync } = require("node:sqlite")
    const db = new DatabaseSync(snap)
    const views = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as Array<{ name: string }>).map(r => r.name))
    const m = await loadModel(async <T>(sql: string) => db.prepare(sql).all() as T[], v => views.has(v))
    expect(m.deployables.length).toBeGreaterThan(0)
    const { nodes, edges } = layoutMap(m)
    expect(nodes.length).toBeGreaterThanOrEqual(m.deployables.length)
    // A set of functions with nothing between them is a real answer.
    if (m.links.some(l => ["calls", "messages", "uses_datastore"].includes(l.kind))) expect(edges.length).toBeGreaterThan(0)
    for (const d of m.deployables) {
      // every deployable's talks-to, pipelines and technology read without throwing
      talksTo(m, d.id)
      envDiff(m.values, d.id)
    }
    expect(technology(m).length).toBe(m.deployables.length)
    const p = proposeLens(m, [...new Set(m.components.map(c => c.component))], true)
    expect(p.groups.length).toBeGreaterThan(0)
  })
})

describe("arrangeMap", () => {
  const dep = (id: string) => ({ id, name: id, kind: "image", repository: "", file: "", line: 0, built_by: "", context: "", base_image: "", runtime: "", files: 1, components: 1 })
  const link = (from: string, to: string, kind = "calls", to_kind = "deployable") => ({ from, to, to_kind, kind, mode: "", via: "", file: "f", line: 1, resolution: "declared" })
  it("shelves what no line touches and names externals by their links", () => {
    const m = { ...EMPTY_MODEL, deployables: ["web", "api", "db-migrate"].map(dep), links: [link("web", "api"), link("api", "pg", "uses_datastore", "external"), link("api", "kafka", "messages", "external")] }
    const a = arrangeMap(m)
    expect(a.isolated).toEqual(["db-migrate"])
    expect(a.columns[0]).toEqual(["web"])
    expect(a.columns[1]).toEqual(["api"])
    expect(a.external.get("pg")).toBe("data")
    expect(a.external.get("kafka")).toBe("broker")
  })
})

describe("rosters", () => {
  it("orders environments the way they are promoted and counts idle pipelines apart", () => {
    const env = (deployable: string, environment: string) => ({ deployable, environment, kind: "enumerated", source: "", file: "", line: 0 })
    const m = { ...EMPTY_MODEL, environments: [env("a", "production"), env("a", "dev"), env("b", "dev")],
      pipelines: [{ id: "p1", name: "Build" }, { id: "p2", name: "Stale" }] as any,
      pipelineLinks: [{ pipeline: "p1", deployable: "a", action: "builds", file: "", line: 0, resolution: "" }, { pipeline: "p1", deployable: "b", action: "builds", file: "", line: 0, resolution: "" }] }
    expect(environmentRoster(m).map(e => [e.environment, e.deployables.length])).toEqual([["dev", 2], ["production", 1]])
    const r = pipelineRoster(m)
    expect(r.acting[0].actions.get("builds")).toEqual(["a", "b"])
    expect(r.idle.map(p => p.id)).toEqual(["p2"])
  })
})

const pipe = (id: string, extra: Partial<Pipeline> = {}): Pipeline => ({
  id, name: id, system: "github_actions", file: id, repository: "", parsed: "full", triggers: "push", paths: "", stages: "build,test",
  tools: "", delegates_to: "", delegates_ref: "", environments: "", deployables: 0, ...extra,
})

describe("codeShare", () => {
  it("credits each production file to what ships its component", () => {
    const m = { ...shop, files: [
      { file: "web/a.go", component: "web", lines: 100 },
      { file: "common/x.java", component: "common", lines: 30 },
      { file: "tools/gen.py", component: "tools", lines: 5 },
      { file: "cart/c.java", component: "cart", lines: 40 },
    ] }
    const s = codeShare(m)
    expect(s.ownerOf.get("common/x.java")).toEqual(["checkout", "payment"])
    expect(s.ownerOf.get("tools/gen.py")).toEqual([])
    expect(s.slices.map(x => [x.id, x.lines])).toEqual([["frontend", 100], ["cart", 40], ["several", 30], ["none", 5]])
    expect(s.lines).toBe(175)
  })
})

describe("shipRows and buildingBlocks", () => {
  const m = model({
    pipelines: [
      pipe("a/ci.yml", { name: "CI", calls: ".github/actions/setup/action.yml" }),
      pipe("b/ci.yml", { name: "CI" }),
      pipe("release.yml", { name: "Release", stages: "build,package,publish", triggers: "push, workflow_dispatch" }),
      pipe("build.yml", { kind: "reusable_workflow", triggers: "workflow_call" }),
      pipe("both.yml", { kind: "reusable_workflow", triggers: "workflow_call, schedule" }),
      pipe(".github/actions/setup/action.yml", { name: "Set up", kind: "composite_action", triggers: "", stages: "build" }),
      pipe("Jenkinsfile", { system: "jenkins", kind: "pipeline", triggers: "" }),
    ],
    pipelineLinks: [{ pipeline: "release.yml", deployable: "app", action: "builds", file: "release.yml", line: 3, resolution: "repository" }],
  })
  it("groups pipelines that do the same thing, and puts what ships first", () => {
    const rows = shipRows(m)
    expect(rows[0].name).toBe("Release")
    expect(rows[0].actions.get("builds")).toEqual(["app"])
    const ci = rows.find(r => r.name === "CI")!
    expect(ci.pipelines.map(p => p.id)).toEqual(["a/ci.yml", "b/ci.yml"])
    expect(ci.uses).toEqual([".github/actions/setup/action.yml"])
    // Called only: a building block, not a row; called and scheduled: both.
    expect(rows.some(r => r.pipelines.some(p => p.id === "build.yml"))).toBe(false)
    expect(rows.find(r => r.pipelines.some(p => p.id === "both.yml"))!.triggers).toEqual(["schedule"])
    expect(rows.some(r => r.system === "jenkins")).toBe(true)
  })
  it("lists actions and reusable workflows with what uses them", () => {
    const blocks = buildingBlocks(m)
    expect(blocks[0]).toMatchObject({ kind: "composite_action", usedBy: ["a/ci.yml"] })
    expect(blocks.map(b => b.pipeline.id).sort()).toEqual([".github/actions/setup/action.yml", "both.yml", "build.yml"])
  })
  it("reads kinds from triggers on snapshots before revision 9", () => {
    expect(pipelineKind(pipe("x", { triggers: "workflow_call" }))).toBe("reusable_workflow")
    expect(startsOnItsOwn(pipe("x", { triggers: "workflow_call" }))).toBe(false)
    expect(pipelineKind(pipe("x", { system: "gitlab" }))).toBe("pipeline")
  })
})
