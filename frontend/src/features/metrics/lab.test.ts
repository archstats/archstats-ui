import { describe, expect, it } from "vitest";
import { jitter, metricScale, overviewMetrics, passes, spearman, strengthWord } from "./lab";

describe("overviewMetrics", () => {
  it("keeps reading order and falls back to file-reference coupling", () => {
    expect(overviewMetrics(["modularity__coupling__afferent", "complexity__lines", "codesmells__code_health"]))
      .toEqual(["complexity__lines", "codesmells__code_health", "modularity__coupling__afferent"]);
  });
  it("stops at the limit", () => {
    expect(overviewMetrics(["complexity__lines", "git__commits__total", "git__authors__total"], 2)).toHaveLength(2);
  });
});

describe("passes", () => {
  it("needs every brushed metric inside its range, and a reading to test", () => {
    const b = { a: [1, 5] as [number, number], b: [0, 1] as [number, number] };
    expect(passes({ name: "x", a: 3, b: 0.5 }, b)).toBe(true);
    expect(passes({ name: "x", a: 6, b: 0.5 }, b)).toBe(false);
    expect(passes({ name: "x", a: 3, b: null }, b)).toBe(false);
  });
});

describe("spearman", () => {
  const rows = [1, 2, 3, 4, 5, 6].map((v) => ({ name: `r${v}`, a: v, b: v * v, c: -v, d: v % 2 }));
  it("reads monotone as perfect, whatever the curve", () => {
    expect(spearman(rows, "a", "b").rho).toBeCloseTo(1);
    expect(spearman(rows, "a", "c").rho).toBeCloseTo(-1);
  });
  it("refuses fewer than five pairs", () => {
    expect(spearman(rows.slice(0, 4), "a", "b").rho).toBeNaN();
  });
  it("names strength in words", () => {
    expect(strengthWord(0.82)).toBe("strong");
    expect(strengthWord(-0.45)).toBe("moderate");
    expect(strengthWord(0.05)).toBe("none");
  });
});

describe("metricScale", () => {
  it("maps into 0..1 and back, with a log axis for a long tail", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 8, 900].map((v, i) => ({ name: `r${i}`, v }));
    const s = metricScale(rows, "v");
    expect(s.log).toBe(true);
    expect(s.at(0)).toBe(0);
    expect(s.at(900)).toBe(1);
    expect(s.invert(s.at(8))).toBeCloseTo(8);
  });
});

describe("jitter", () => {
  it("is stable and in range", () => {
    expect(jitter("a/b")).toBe(jitter("a/b"));
    expect(jitter("a/b")).toBeGreaterThanOrEqual(0);
    expect(jitter("a/b")).toBeLessThan(1);
  });
});
