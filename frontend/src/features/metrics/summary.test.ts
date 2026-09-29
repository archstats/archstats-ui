import { describe, expect, it } from "vitest";
import { summarize } from "./summary";

const niceName = (k: string) => k;
const opts = { niceName, noun: "components", one: "component" };

// 40 rows: commits concentrate in the first few, health falls as commits rise.
const rows = Array.from({ length: 40 }, (_, i) => ({
  name: `app/c${i}`,
  git__commits__total: i < 4 ? 500 - i * 10 : 10 + (i % 5),
  codesmells__code_health: i < 4 ? 4 + i * 0.1 : 9 + (i % 3) * 0.3,
  codesmells__hotspot_score: i < 4 ? 90 - i : 5,
  complexity__lines: i < 4 ? 5000 - i * 100 : 200 + (i % 5) * 20,
  modularity__coupling__dependents: i === 7 ? 30 : i % 4,
}));
const metrics = ["complexity__lines", "git__commits__total", "codesmells__code_health", "codesmells__hotspot_score", "modularity__coupling__dependents"];

describe("summarize", () => {
  const f = summarize(rows, metrics, opts);
  const byId = (id: string) => f.find((x) => x.id === id);

  it("says how concentrated change is, and opens Strips brushed to the busiest", () => {
    const c = byId("concentration")!;
    expect(c.title).toBe("Change concentrates");
    expect(c.text).toMatch(/busiest 4 components of 40/);
    expect(c.action.go.view).toBe("strips");
    expect(c.action.go.brushes!.git__commits__total[0]).toBe(470);
  });
  it("names metrics that move together and ones that pull apart", () => {
    expect(byId("together")!.action.go.view).toBe("matrix");
    expect(byId("apart")!.text).toMatch(/falls/);
  });
  it("finds the busy, lower-health corner and selects it on the plot", () => {
    const c = byId("churn-health")!;
    expect(c.action.go.selected).toEqual(expect.arrayContaining(["app/c0", "app/c3"]));
    expect(c.action.go.preset).toBe("churn-health");
  });
  it("names the most depended-on", () => {
    expect(byId("hubs")!.text).toMatch(/^c7 is used by 30/);
  });
  it("says nothing it cannot back: no commits, no concentration", () => {
    const bare = summarize(rows.map(({ git__commits__total, ...r }) => r), metrics, opts);
    expect(bare.find((x) => x.id === "concentration")).toBeUndefined();
  });
});

import { definitional } from "./summary";
describe("definitional pairs", () => {
  it("skips pairs the engine computes from each other", () => {
    expect(definitional("modularity__coupling__dependents", "modularity__instability")).toBe(true);
    expect(definitional("git__commits__total", "codesmells__hotspot_score")).toBe(true);
    expect(definitional("git__commits__total", "git__authors__total")).toBe(false);
  });
});
