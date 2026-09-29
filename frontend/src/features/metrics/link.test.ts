import { describe, expect, it } from "vitest";
import { arrivalFrom, metricsPath } from "./link";
import { incomingIds } from "~/features/navigation/showIn";

// Read a path back the way the router hands it to the page.
const queryOf = (path: string) => Object.fromEntries(new URLSearchParams(path.split("?")[1] ?? ""));

describe("metricsPath", () => {
  it("is the bare view when nothing is set up", () => {
    expect(metricsPath()).toBe("/views/metrics");
    expect(metricsPath({ grain: "components" })).toBe("/views/metrics");
  });

  it("carries the view, pair, sort, brushes and selection", () => {
    const q = queryOf(metricsPath({
      grain: "files", view: "strips", pair: ["a", "b"], sort: "c",
      brushes: { modularity__instability: [0.5, 1] }, selected: ["x.y", "z w"],
    }));
    expect(q.grain).toBe("files");
    expect(q.view).toBe("strips");
    expect(arrivalFrom(q)).toEqual({ pair: ["a", "b"], sort: "c", brushes: { modularity__instability: [0.5, 1] } });
    expect(incomingIds(q.hl)).toEqual(["x.y", "z w"]);
  });
});

describe("arrivalFrom", () => {
  it("is null for a link that only picks the view", () => {
    expect(arrivalFrom({ view: "plot", preset: "dms" })).toBeNull();
  });

  it("needs both axes for a pair", () => {
    expect(arrivalFrom({ x: "a" })).toBeNull();
  });

  it("drops malformed brushes and orders each range", () => {
    expect(arrivalFrom({ brush: "{\"a\":[1,0],\"b\":[\"x\",1],\"c\":[1]}" })).toEqual({ brushes: { a: [0, 1] } });
    expect(arrivalFrom({ brush: "not json", sort: "s" })).toEqual({ sort: "s" });
  });
});
