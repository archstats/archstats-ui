import { describe, expect, it } from "vitest";
import { measureCut, measureMembers, readModularity } from "./cutQuality";

const TWO_CLIQUES = [
  { from: "a1", to: "a2" }, { from: "a2", to: "a3" }, { from: "a3", to: "a1" },
  { from: "b1", to: "b2" }, { from: "b2", to: "b3" }, { from: "b3", to: "b1" },
  { from: "a1", to: "b1" },
];

describe("measuring a cut", () => {
  it("scores the obvious partition well and the scrambled one badly", () => {
    const right = measureCut([
      { key: "A", name: "A", members: ["a1", "a2", "a3"] },
      { key: "B", name: "B", members: ["b1", "b2", "b3"] },
    ], TWO_CLIQUES, 6);
    const wrong = measureCut([
      { key: "A", name: "A", members: ["a1", "b2", "a3"] },
      { key: "B", name: "B", members: ["b1", "a2", "b3"] },
    ], TWO_CLIQUES, 6);
    expect(right.modularity).toBeGreaterThan(0.3);
    expect(right.modularity).toBeGreaterThan(wrong.modularity);
    expect(right.kept).toBeCloseTo(6 / 7, 5);
    expect(right.crossing).toBe(1);
  });

  it("counts what was never placed", () => {
    const q = measureCut([{ key: "A", name: "A", members: ["a1", "a2"] }], TWO_CLIQUES, 6);
    expect(q.placed).toBe(2);
    expect(q.orphans).toBe(4);
  });

  it("names the groups a group leans on", () => {
    const q = measureCut([
      { key: "A", name: "Alpha", members: ["a1", "a2", "a3"] },
      { key: "B", name: "Beta", members: ["b1", "b2", "b3"] },
    ], TWO_CLIQUES, 6);
    const alpha = q.groups.find(g => g.name === "Alpha")!;
    expect(alpha.leans[0].name).toBe("Beta");
    expect(alpha.kept).toBeLessThan(1);
  });

  it("flags a cut that is one giant group and a pile of singletons", () => {
    const q = measureCut([
      { key: "A", name: "A", members: ["a1", "a2", "a3", "b1"] },
      { key: "B", name: "B", members: ["b2"] },
      { key: "C", name: "C", members: ["b3"] },
    ], TWO_CLIQUES, 6);
    expect(q.singletons).toBe(2);
    expect(q.biggest).toBeCloseTo(4 / 6, 5);
  });

  it("says nothing when there is nothing to say", () => {
    expect(measureCut([], TWO_CLIQUES, 6).modularity).toBe(0);
    expect(readModularity(0.45, 6).tone).toBe("good");
    expect(readModularity(0.02, 6).tone).toBe("poor");
    // Two groups cannot score high however good they are, so it says so.
    expect(readModularity(0.1, 2).word).toContain("too few groups");
  });
});

describe("what kept inside means", () => {
  it("gives a group that holds all of its references the whole scale", () => {
    // Degree counts an internal edge from both ends, so measured against it
    // this group scored 0.5 — and no cut in any codebase could beat it.
    const sealed = measureCut([
      { key: "A", name: "A", members: ["a1", "a2", "a3"] },
      { key: "B", name: "B", members: ["b1", "b2", "b3"] },
    ], [
      { from: "a1", to: "a2" }, { from: "a2", to: "a3" },
      { from: "b1", to: "b2" }, { from: "b2", to: "b3" },
    ], 6);
    expect(sealed.groups.every(g => g.kept === 1)).toBe(true);
  });

  it("explains a group that is only ever referenced by others", () => {
    // Its crossing weight arrives from outside, so the group it leans on was
    // listed under the other group and this one scored badly with no reason.
    const [b] = measureCut([
      { key: "B", name: "Beta", members: ["b1"] },
      { key: "A", name: "Alpha", members: ["a1", "a2"] },
    ], [{ from: "a1", to: "b1" }, { from: "a1", to: "a2" }], 3).groups.filter(g => g.key === "B");
    expect(b.kept).toBe(0);
    expect(b.leans[0]?.name).toBe("Alpha");
  });
});

describe("measuring the members of one group", () => {
  const GROUPS = [
    { key: "A", name: "Alpha", members: ["a1", "a2", "a3"] },
    { key: "B", name: "Beta", members: ["b1", "b2", "b3"] },
  ];

  it("tells a member that holds the group together from one only filed there", () => {
    const rows = measureMembers("A", GROUPS, [
      { from: "a1", to: "a2" }, { from: "a2", to: "a3" },
      // a3 talks to Beta twice as much as it talks home.
      { from: "a3", to: "b1" }, { from: "a3", to: "b2" },
    ]);
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(by.a1.kept).toBe(1);
    expect(by.a1.pullsAway).toBe(false);
    expect(by.a3.kept).toBeCloseTo(1 / 3);
    expect(by.a3.pullsAway).toBe(true);
    expect(by.a3.leans?.name).toBe("Beta");
  });

  it("agrees with the group number it is the breakdown of", () => {
    const rows = measureMembers("A", GROUPS, TWO_CLIQUES);
    const group = measureCut(GROUPS, TWO_CLIQUES, 6).groups.find(g => g.key === "A")!;
    // A group's kept is its members' weight rolled up, so the two cannot
    // drift. An edge inside the group is seen by both of its ends.
    const seen = rows.reduce((n, r) => n + r.inside, 0);
    const crossing = rows.reduce((n, r) => n + r.degree, 0) - seen;
    expect(seen / 2 / (seen / 2 + crossing)).toBeCloseTo(group.kept);
  });

  it("keeps a member nothing has been placed around at zero rather than perfect", () => {
    const rows = measureMembers("A", GROUPS, [{ from: "a1", to: "nowhere" }]);
    expect(rows.find(r => r.id === "a1")!.kept).toBe(0);
    expect(rows.find(r => r.id === "a1")!.degree).toBe(0);
  });
});
