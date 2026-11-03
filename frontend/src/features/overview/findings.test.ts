import { describe, expect, it } from "vitest";
import { findings, healthDetail, healthDistribution, healthReading, languageShares, type FileFact, type OverviewFacts } from "./findings";

const file = (name: string, lines: number, more: Partial<FileFact> = {}): FileFact =>
  ({ name, lines, role: "production", health: 9, hotspot: 1, component: name.split("/")[1] ?? null, commits: 10, ...more });

const empty: OverviewFacts = {
  files: [], readings: {}, components: [], tangles: [], knowledge: [], rules: [],
  history: { first: null, last: null, scan: null }, arrival: null, recent: [], shallow: false,
};

// Six components; "dto" is half the code in two huge files committed once.
const files: FileFact[] = [
  file("src/dto/A.java", 20000, { commits: 1, health: 3 }),
  file("src/dto/B.java", 12000, { commits: 2, health: 3 }),
  file("src/svc/Quote.java", 6000, { commits: 545, hotspot: 100, health: 4 }),
  ...["web", "dao", "util", "api"].map((c) => file(`src/${c}/X.java`, 4000)),
  file("README.md", 50, { role: "non_code", health: null, component: null }),
];

describe("findings", () => {
  it("says nothing about a snapshot it knows nothing about", () => {
    expect(findings(empty)).toEqual([]);
  });

  it("puts the most out-of-the-ordinary first and says what it rests on", () => {
    const out = findings({
      ...empty,
      files,
      readings: { app__lines_in_tangles_share: 0.34, app__propagation_cost: 0.05 },
      tangles: [{ size: 23, members: ["dto", "svc", "util"] }, { size: 2, members: ["web", "api"] }],
      history: { first: "2019-08-16T10:00:00Z", last: "2025-03-03T09:00:00Z", scan: "2026-10-30T10:48:00Z" },
    });
    const ids = out.map((f) => f.id);
    expect(ids.slice(0, 3)).toContain("tests");
    expect(ids).toContain("tangles");
    expect(ids).toContain("dormant");
    // Propagation cost of 5% is ordinary: no finding.
    expect(ids).not.toContain("propagation");
    for (let i = 1; i < out.length; i++) expect(out[i - 1].relevance).toBeGreaterThanOrEqual(out[i].relevance);
    expect(out.find((f) => f.id === "tangles")!.evidence.map((e) => e.label)).toEqual(["dto", "svc", "util"]);
  });

  it("reads huge files that never changed as probably generated", () => {
    const c = findings({ ...empty, files }).find((f) => f.id === "concentration")!;
    expect(c.body).toMatch(/generated/);
    expect(c.evidence[0].label).toBe("dto");
  });

  it("leaves out an arrival that is only the first commit", () => {
    const facts = { ...empty, files, history: { first: "2024-05-13T08:00:00Z", last: "2025-01-01T00:00:00Z", scan: "2025-01-02T00:00:00Z" } };
    expect(findings({ ...facts, arrival: { date: "2024-05-13", lines: 40000 } }).map((f) => f.id)).not.toContain("arrival");
    expect(findings({ ...facts, arrival: { date: "2024-07-24", lines: 40000 } }).map((f) => f.id)).toContain("arrival");
  });
});

describe("healthReading", () => {
  it("weights health by lines over scored production files", () => {
    const h = healthReading(files);
    expect(h.bad).toBe(38000);
    expect(h.good).toBe(16000);
    expect(h.mean).toBeCloseTo((3 * 32000 + 4 * 6000 + 9 * 16000) / 54000);
    // Where the work happens: Quote.java's 545 commits outweigh everything else.
    const effort = (lines: number, commits: number) => lines * commits;
    const work = effort(20000, 1) + effort(12000, 2) + effort(6000, 545) + 4 * effort(4000, 10);
    expect(h.worked).toBeCloseTo((3 * effort(20000, 1) + 3 * effort(12000, 2) + 4 * effort(6000, 545) + 9 * 4 * effort(4000, 10)) / work);
  });
});

describe("languageShares", () => {
  it("names the largest languages and folds the rest into one", () => {
    const rows = languageShares([file("a.java", 70), file("b.ts", 20), file("c.py", 6), file("d.go", 3), file("e.rb", 1)], 2);
    expect(rows.map((r) => r.language)).toEqual(["Java", "TypeScript", ""]);
    expect(rows[2]).toMatchObject({ lines: 10, other: 3 });
  });
});

describe("healthDetail", () => {
  it("lists the lowest-scoring components and files, and how much of the unhealthy code changes often", () => {
    const d = healthDetail([
      file("src/dto/A.java", 3000, { health: 3, hotspot: 80 }),
      file("src/dto/B.java", 1000, { health: 9 }),
      file("src/svc/C.java", 1000, { health: 4, hotspot: 10 }),
      file("src/svc/D.java", 50, { health: 1 }),
    ], 1000, 100);
    expect(d.components.map((c) => c.component)).toEqual(["svc", "dto"]);
    expect(d.components[1].health).toBeCloseTo((3 * 3000 + 9 * 1000) / 4000);
    expect(d.files.map((f) => f.name)).toEqual(["src/dto/A.java", "src/svc/C.java", "src/dto/B.java"]);
    expect(d.inHotspots).toBeCloseTo(3000 / 4050);
  });
});

describe("architecture findings", () => {
  const comps = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, dependents: 1, instability: 0.5, abstractness: 0.2 }));
  const arch = {
    edges: [["c0", "c1"], ["c1", "c0"], ["c2", "c3"]] as Array<[string, string]>,
    modules: [{ component: "c0", module: "A" }, { component: "c1", module: "B" }, { component: "c2", module: "B" }, { component: "c3", module: "C" }],
    entryComponents: [], coChange: [{ a: "c4", b: "c5", shared: 30, share: 0.8 }], shotgun: null, frozen: null, growth: [],
    functions: null, sameNames: [], entities: [{ entity: "x.Customer", components: 12 }], http: null, outbound: null,
  };
  const ids = (extra: Partial<OverviewFacts> = {}) => findings({ ...empty, components: comps, arch, ...extra }).map((f) => f.id);

  it("finds pairs that import each other, modules in a circle, hidden coupling and shared data", () => {
    const found = ids();
    expect(found).toEqual(expect.arrayContaining(["mutualPairs", "moduleCycles", "hiddenCoupling", "sharedEntities"]));
  });

  it("finds concrete, stable code that many depend on", () => {
    const pain = comps.map((c, i) => (i === 0 ? { ...c, abstractness: 0, instability: 0.1, dependents: 11 } : c));
    expect(ids({ components: pain })).toContain("zonePain");
    expect(ids()).not.toContain("zonePain");
  });

  it("says nothing about what a snapshot did not record", () => {
    expect(findings({ ...empty, components: comps }).map((f) => f.id)).not.toContain("hiddenCoupling");
  });
});

describe("healthDistribution", () => {
  it("places the code and the work on the health scale, per bucket and per band", () => {
    const d = healthDistribution([
      file("src/a/A.java", 900, { health: 9, commits: 1 }),
      file("src/b/B.java", 100, { health: 2.2, commits: 81 }),
    ]);
    expect(d.buckets).toHaveLength(18);
    expect(d.buckets.find((b) => b.from === 2)!.code).toBeCloseTo(0.1);
    expect(d.buckets.find((b) => b.from === 2)!.work).toBeCloseTo(8100 / 9000);
    expect(d.bands.good).toEqual({ code: 0.9, work: 0.1 });
    expect(d.bands.bad.work).toBeCloseTo(0.9);
  });
});
