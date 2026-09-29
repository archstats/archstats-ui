import { describe, expect, it } from "vitest";
import { distinctTails, histogram, logTicks, median, placeLabels, quadrantOf, readPlot, splitName, suggestLog } from "./plotReading";

describe("suggestLog", () => {
  it("takes a log axis for a long-tailed count", () => {
    expect(suggestLog([1, 2, 3, 4, 5, 6, 8, 10, 12, 400])).toBe(true);
  });
  it("keeps scores and ratios linear", () => {
    expect(suggestLog([6.1, 7.2, 8, 9, 9.5, 10, 10, 10, 9.9])).toBe(false);
    expect(suggestLog([0, 0.2, 0.4, 0.5, 0.5, 0.8, 1, 1])).toBe(false);
  });
  it("falls back to the upper quartile when most values are zero", () => {
    expect(suggestLog([0, 0, 0, 0, 0, 1, 2, 3, 900])).toBe(true);
  });
});

describe("logTicks", () => {
  it("starts at zero and steps 1-2-5, thinned to fit", () => {
    expect(logTicks([0, 60])).toEqual([0, 1, 2, 5, 10, 20, 50]);
    expect(logTicks([0, 20000]).length).toBeLessThanOrEqual(9);
    expect(logTicks([0, 20000])[0]).toBe(0);
  });
});

describe("quadrants and medians", () => {
  it("counts the median itself as low", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(quadrantOf(2, 2, 2, 2)).toBe("bl");
    expect(quadrantOf(3, 3, 2, 2)).toBe("tr");
    expect(quadrantOf(3, 1, 2, 2)).toBe("br");
  });
});

describe("names", () => {
  it("splits a path into where it lives and its last segment", () => {
    expect(splitName("src/oscar/apps/catalogue")).toEqual({ head: "src/oscar/apps/", tail: "catalogue" });
    expect(splitName("org.acme.billing")).toEqual({ head: "org.acme.", tail: "billing" });
    expect(splitName("sandbox")).toEqual({ head: "", tail: "sandbox" });
    expect(splitName("src/oscar/apps/catalogue/abstract_models.py")).toEqual({ head: "src/oscar/apps/catalogue/", tail: "abstract_models.py" });
  });
  it("lengthens a tail only as far as it needs to stay distinct", () => {
    const t = distinctTails(["src/oscar/apps/catalogue", "src/oscar/apps/dashboard/catalogue", "src/oscar/apps/order"]);
    expect(t.get("src/oscar/apps/order")).toBe("order");
    expect(t.get("src/oscar/apps/catalogue")).toBe("apps/catalogue");
    expect(t.get("src/oscar/apps/dashboard/catalogue")).toBe("dashboard/catalogue");
  });
});

describe("histogram", () => {
  it("clamps the maximum into the last bin", () => {
    expect(histogram([0, 1, 5, 10], 2, 0, 10)).toEqual([2, 2]);
  });
});

describe("placeLabels", () => {
  it("drops a label whose every spot collides", () => {
    const cands = [
      { id: "a", x: 50, y: 50, r: 4, text: "alpha" },
      { id: "b", x: 50, y: 50, r: 4, text: "bravo" },
    ];
    const placed = placeLabels(cands, [], { width: 200, height: 200 });
    expect(placed.map((p) => p.id)).toEqual(["a", "b"]);
    const crowded = placeLabels([...cands, { id: "c", x: 50, y: 50, r: 4, text: "charlie" }, { id: "d", x: 50, y: 50, r: 4, text: "delta" }, { id: "e", x: 50, y: 50, r: 4, text: "echo" }], [], { width: 200, height: 200 });
    expect(crowded.length).toBe(4);
  });
  it("keeps labels inside the plot", () => {
    const placed = placeLabels([{ id: "a", x: 195, y: 100, r: 4, text: "longname" }], [], { width: 200, height: 200 });
    expect(placed[0].anchor).toBe("end");
  });
});

describe("readPlot", () => {
  const rows = [
    { name: "a", x: 1, y: 1 }, { name: "b", x: 2, y: 2 }, { name: "c", x: 3, y: 3 },
    { name: "d", x: 100, y: 1 }, { name: "e", x: 2, y: 9 },
  ];
  it("splits at the medians of every row and ranks the far ones first", () => {
    const r = readPlot(rows, rows, "x", "y");
    expect(r.mx).toBe(2);
    expect(r.my).toBe(2);
    expect(r.cells.find((c) => c.id === "br")!.names).toEqual(["d"]);
    expect(r.outliers[0]).toBe("d");
  });
  it("leaves out rows with no reading instead of plotting them at zero", () => {
    const withGap = [...rows, { name: "unscored", x: 50, y: null }];
    const r = readPlot(withGap, withGap, "x", "y");
    expect(r.missing).toBe(1);
    expect(r.outliers).not.toContain("unscored");
  });
  it("gives the median's ties to the empty side when the median is the maximum", () => {
    const health = [4, 6, 10, 10, 10, 10, 10].map((y, i) => ({ name: `f${i}`, x: i, y }));
    const r = readPlot(health, health, "x", "y");
    const top = [...r.cells.find((c) => c.id === "tl")!.names, ...r.cells.find((c) => c.id === "tr")!.names];
    expect(top.length).toBe(5);
  });
  it("reads Martin's zones on a main-sequence chart", () => {
    const ms = [{ name: "pain", i: 0.1, a: 0.1 }, { name: "ok", i: 0.5, a: 0.5 }, { name: "useless", i: 0.9, a: 0.9 }];
    const r = readPlot(ms, ms, "i", "a", { mainSequence: true });
    expect(r.cells.map((c) => [c.id, c.names])).toEqual([["pain", ["pain"]], ["useless", ["useless"]]]);
    expect(r.outliers.at(-1)).toBe("ok");
  });
});
