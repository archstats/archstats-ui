import { describe, expect, it } from "vitest"
import { baseFamilies, builtInto, EMPTY_MODEL, envOrder, imageRows, indexModel, listGroups, pinOfImage, silhouette, snapshotState, triggerChips, type CicdModel, type Job, type Step } from "./cicd"
import { layoutPipeline, needsOf } from "./layout"
import { groupFlags } from "./flags"
import { proposeLens } from "./lens"
import { historySql, readHistory } from "./history"

const job = (pipeline: string, id: string, depth: number, needs: string[] = [], line = 1): Job => ({
  pipeline, id, name: id, group: "", depth, needs: needs.join(", "), runner: "", matrix: 0, environment: "", gate: "", condition: "", file: pipeline, line,
})
const step = (pipeline: string, jobId: string, index: number, verb: string): Step => ({
  pipeline, job: jobId, index, name: "", verb, tool: "", target: "", text: verb, file: pipeline, line: index,
})

function model(over: Partial<CicdModel>): CicdModel {
  return { ...EMPTY_MODEL, ...over }
}

const ci = model({
  pipelines: [
    { id: "repo-a/.gitlab-ci.yml", name: ".gitlab-ci.yml", system: "gitlab", kind: "pipeline", repository: "repo-a", file: "repo-a/.gitlab-ci.yml", line: 1, read: "full", jobs: 3, steps: 4, stages: "build,test,deploy" },
    { id: "repo-a/ci/tpl.yml", name: "tpl.yml", system: "gitlab", kind: "template", repository: "repo-a", file: "repo-a/ci/tpl.yml", line: 1, read: "full", jobs: 0, steps: 0, stages: "" },
    { id: "./Jenkinsfile", name: "Jenkinsfile", system: "jenkins", kind: "pipeline", repository: "shop", file: "./Jenkinsfile", line: 1, read: "partial", jobs: 1, steps: 1, stages: "build" },
  ],
  jobs: [job("repo-a/.gitlab-ci.yml", "build", 0), job("repo-a/.gitlab-ci.yml", "test", 1, ["build"]), job("repo-a/.gitlab-ci.yml", "deploy", 2, ["test"]), job("./Jenkinsfile", "Build", 0)],
  steps: [
    step("repo-a/.gitlab-ci.yml", "build", 1, "checkout"), step("repo-a/.gitlab-ci.yml", "build", 2, "build"),
    step("repo-a/.gitlab-ci.yml", "test", 1, "test"), step("repo-a/.gitlab-ci.yml", "deploy", 1, "deploy"), step("./Jenkinsfile", "Build", 1, "build"),
  ],
  triggers: [
    { pipeline: "repo-a/.gitlab-ci.yml", event: "pull_request", filter: "merge requests", file: "", line: 2 },
    { pipeline: "repo-a/.gitlab-ci.yml", event: "push", filter: "default branch", file: "", line: 3 },
  ],
  outputs: [
    { pipeline: "repo-a/.gitlab-ci.yml", job: "build", step: 2, kind: "image", platform: "", environment: "", target: "web", artifact: "web", server: "", context: "", file: "", line: 5, resolution: "declared" },
    { pipeline: "repo-a/.gitlab-ci.yml", job: "deploy", step: 1, kind: "deploy", platform: "rancher", environment: "prd", target: "k8s", artifact: "web", server: "$S", context: "$P", file: "", line: 9, resolution: "path" },
    { pipeline: "repo-a/.gitlab-ci.yml", job: "deploy", step: 1, kind: "deploy", platform: "rancher", environment: "dev", target: "k8s", artifact: "web", server: "$S", context: "$D", file: "", line: 9, resolution: "path" },
  ],
  artifacts: [{ id: "web", name: "web", kind: "image", platform: "", repository: "repo-a", dockerfile: "repo-a/Dockerfile", context: "repo-a", module: "", built_by: "dockerfile", base: "nginx:latest", runtime: "", files: 4, components: 2, file: "repo-a/Dockerfile", line: 1 }],
  components: [{ artifact: "web", component: "src/ui", files: 3 }, { artifact: "web", component: "src/api", files: 1 }],
  dockerfiles: [
    { file: "repo-a/Dockerfile", repository: "repo-a", stages: 2, final_base: "nginx:latest", final_user: "", ports: "80", entrypoint: "", healthcheck: 0, dockerignore: 0 },
    { file: "b/Dockerfile", repository: "b", stages: 1, final_base: "docker.io/library/nginx:1.27", final_user: "app", ports: "", entrypoint: "", healthcheck: 1, dockerignore: 1 },
    { file: "c/Dockerfile", repository: "c", stages: 1, final_base: "eclipse-temurin:17@sha256:abc", final_user: "app", ports: "", entrypoint: "", healthcheck: 0, dockerignore: 1 },
  ],
  flags: [
    { rule: "push_latest_only", subject_kind: "pipeline", subject: "repo-a/.gitlab-ci.yml", detail: "web", file: "repo-a/.gitlab-ci.yml", line: 5 },
    { rule: "runs_as_root", subject_kind: "dockerfile", subject: "repo-a/Dockerfile", detail: "no USER", file: "repo-a/Dockerfile", line: 6 },
    { rule: "base_unpinned_tag", subject_kind: "dockerfile", subject: "repo-a/Dockerfile", detail: "nginx:latest", file: "repo-a/Dockerfile", line: 6 },
  ],
})

describe("snapshot state", () => {
  it("is old until the snapshot has the revision-16 views", () => {
    expect(snapshotState(v => v === "pipelines")).toBe("old")
    expect(snapshotState(() => true)).toBe("ready")
  })
})

describe("the pipeline list", () => {
  const ix = indexModel(ci)
  it("groups by repository, pipelines before what they use", () => {
    const g = listGroups(ci, ix, "")
    expect(g.map(x => x.repository)).toEqual(["repo-a", "shop"])
    expect(g[0].rows.map(r => r.pipeline.name)).toEqual([".gitlab-ci.yml"])
    expect(g[0].used.map(r => r.pipeline.name)).toEqual(["tpl.yml"])
    expect(g[0].rows[0].flags).toBe(1)
    expect(g[0].rows[0].delivers).toBe(true)
  })
  it("searches jobs, steps and outputs", () => {
    expect(listGroups(ci, ix, "deploy").flatMap(g => g.rows).map(r => r.pipeline.id)).toEqual(["repo-a/.gitlab-ci.yml"])
    expect(listGroups(ci, ix, "nothing-like-this")).toEqual([])
  })
  it("draws a silhouette of verbs in run order, without checkout and setup", () => {
    expect(silhouette(ix, "repo-a/.gitlab-ci.yml")).toEqual(["build", "test", "deploy"])
  })
  it("orders trigger chips push first", () => {
    expect(triggerChips(ci.triggers).map(c => c.event)).toEqual(["push", "pull_request"])
  })
})

describe("images", () => {
  const ix = indexModel(ci)
  it("says who builds and deploys each artifact, environments in delivery order", () => {
    const [r] = imageRows(ci, ix)
    expect(r.builtBy).toEqual(["repo-a/.gitlab-ci.yml"])
    expect(r.deployedBy).toEqual(["repo-a/.gitlab-ci.yml"])
    expect(r.environments).toEqual(["dev", "prd"])
    expect(r.pinned).toBe("floating")
  })
  it("pins", () => {
    expect(pinOfImage("node:20@sha256:abc")).toBe("digest")
    expect(pinOfImage("registry:5000/node:20")).toBe("tag")
    expect(pinOfImage("registry:5000/node")).toBe("floating")
    expect(pinOfImage("")).toBe("none")
  })
  it("groups base images by family and version", () => {
    const f = baseFamilies(ci)
    expect(f[0]).toMatchObject({ family: "nginx", total: 2 })
    expect(f[0].versions.map(v => v.version).sort()).toEqual(["1.27", "latest"])
    expect(f[1]).toMatchObject({ family: "eclipse-temurin", total: 1 })
  })
  it("knows what a component is built into", () => {
    const b = builtInto(ci, ix, "src/ui")
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ files: 3, pipelines: ["repo-a/.gitlab-ci.yml"] })
  })
  it("orders environments the way changes travel", () => {
    expect(["prod", "zz", "dev", "acc"].sort(envOrder)).toEqual(["dev", "acc", "prod", "zz"])
  })
})

describe("layout", () => {
  it("puts jobs in columns by depth, outputs after them, and draws needs", () => {
    const ix = indexModel(ci)
    const l = layoutPipeline(ix, "repo-a/.gitlab-ci.yml")
    const x = (id: string) => l.cards.find(c => c.job.id === id)!.x
    expect(x("build")).toBeLessThan(x("test"))
    expect(x("test")).toBeLessThan(x("deploy"))
    expect(l.outputs.every(o => o.x > x("deploy"))).toBe(true)
    expect(l.edges.filter(e => e.kind === "needs")).toHaveLength(2)
    expect(l.edges.filter(e => e.kind === "start").map(e => e.to)).toEqual(["build"])
  })

  it("never overlaps cards, up to 60 jobs with many steps", () => {
    const p = "big"
    const jobs: Job[] = []
    const steps: Step[] = []
    for (let i = 0; i < 60; i++) {
      const depth = i % 5
      const needs = depth > 0 ? [`j${i - 1}`] : []
      jobs.push(job(p, `j${i}`, depth, needs, i))
      for (let s = 1; s <= (i % 13); s++) steps.push(step(p, `j${i}`, s, "build"))
    }
    const m = model({ pipelines: [{ id: p, name: p, system: "gitlab", kind: "pipeline", repository: "r", file: p, line: 1, read: "full", jobs: 60, steps: steps.length, stages: "" }], jobs, steps })
    const l = layoutPipeline(indexModel(m), p)
    expect(l.cards).toHaveLength(60)
    for (const a of l.cards) for (const b of l.cards) {
      if (a === b) continue
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
      expect(apart, `${a.job.id} overlaps ${b.job.id}`).toBe(true)
    }
    expect(l.cards.every(c => c.steps.length <= 8)).toBe(true)
    expect(l.cards.find(c => c.job.id === "j12")!.more).toBe(4)
  })

  it("places an unread region after the job written before it", () => {
    const m = model({
      jobs: [job("p", "a", 0, [], 1), job("p", "b", 1, ["a"], 20)],
      unread: [{ pipeline: "p", from_line: 10, to_line: 15, reason: "dynamic_stages", file: "p" }],
    })
    const l = layoutPipeline(indexModel(m), "p")
    expect(l.placeholders).toHaveLength(1)
    expect(l.placeholders[0].x).toBe(l.cards.find(c => c.job.id === "b")!.x)
  })

  it("splits needs", () => {
    expect(needsOf(job("p", "x", 1, ["a", "b"]))).toEqual(["a", "b"])
    expect(needsOf(job("p", "x", 0))).toEqual([])
  })
})

describe("flags", () => {
  it("groups by rule, images first", () => {
    const g = groupFlags(ci)
    expect(g.map(x => x.rule)).toEqual(["base_unpinned_tag", "runs_as_root", "push_latest_only"])
    expect(groupFlags(ci, "latest").map(x => x.rule)).toEqual(["base_unpinned_tag", "push_latest_only"])
  })
})

describe("lens", () => {
  it("proposes one group per artifact", () => {
    const p = proposeLens(ci, ["src/ui", "src/api", "src/other"])
    expect(p.groups).toEqual([{ name: "web", components: ["src/api", "src/ui"] }])
    expect(p.unshipped).toBe(1)
    expect(p.shared).toEqual([])
  })
})

describe("history", () => {
  it("matches the file with and without ./", () => {
    const sql = historySql("./Jenkinsfile", "julianday('2026-10-01')")
    expect(sql).toContain("'Jenkinsfile', './Jenkinsfile'")
    expect(readHistory({ changes: 3, last: "2026-09-01", authors: "b,a" })).toEqual({ changes: 3, last: "2026-09-01", authors: ["a", "b"] })
  })
})
