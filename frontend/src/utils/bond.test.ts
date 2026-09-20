import { describe, expect, it } from "vitest";
import { EMPTY_SOURCES, buildSuggestInput, type SignalSources } from "./suggest";
import { bandBonds, bondsTo, buildCouplings, cohesionOf, elsewhere } from "./bond";
import { STUDIO_WEIGHTS } from "./studio";

function sources(over: Partial<SignalSources>): SignalSources {
  return { ...EMPTY_SOURCES, ...over };
}

function couplings(over: Partial<SignalSources>, weights = STUDIO_WEIGHTS) {
  const components = over.components ?? [];
  const files = over.files ?? components.map(c => ({ name: c + ".File", component: c }));
  return buildCouplings(buildSuggestInput(sources({ ...over, components, files }), "component"), weights);
}

describe("association beats volume", () => {
  it("prefers the pair that is most of both ends' coupling", () => {
    // "pair" references the group once and nothing else; "busy" references the
    // group twice but also references six other things.
    const components = ["g", "pair", "busy", "o1", "o2", "o3", "o4", "o5", "o6"];
    const componentRefs = [
      { from: "pair", to: "g", references: 1 },
      { from: "busy", to: "g", references: 2 },
      ...["o1", "o2", "o3", "o4", "o5", "o6"].map(o => ({ from: "busy", to: o, references: 3 })),
    ];
    const c = couplings({ components, componentRefs });
    const bonds = bondsTo(["g"], components, c);
    const rank = bonds.map(b => b.id);
    expect(rank.indexOf("pair")).toBeLessThan(rank.indexOf("busy"));
  });

  it("discounts a component coupled to a great many others", () => {
    const others = Array.from({ length: 30 }, (_, i) => `n${i}`);
    const components = ["g", "hub", "quiet", ...others];
    const componentRefs = [
      { from: "hub", to: "g", references: 4 },
      { from: "quiet", to: "g", references: 4 },
      ...others.map(o => ({ from: "hub", to: o, references: 4 })),
    ];
    const c = couplings({ components, componentRefs });
    const bonds = bondsTo(["g"], components, c);
    const hub = bonds.find(b => b.id === "hub");
    const quiet = bonds.find(b => b.id === "quiet");
    expect(quiet!.value).toBeGreaterThan(hub!.value);
    expect(hub!.hub).toBe(true);
  });
});

describe("both couplings count", () => {
  it("finds a bond through commits alone, with no references at all", () => {
    const components = ["a", "b", "far"];
    const files = components.map(c => ({ name: c + ".File", component: c }));
    const componentCochange = [{ from: "a", to: "b", count: 12 }];
    const c = couplings({ components, files, componentCochange });
    const bonds = bondsTo(["a"], components, c);
    const b = bonds.find(x => x.id === "b");
    expect(b).toBeTruthy();
    expect(b!.channel).toBe("cochange");
    expect(b!.parts.cochange).toBeGreaterThan(0);
  });

  it("names references when references carry it", () => {
    const components = ["a", "b"];
    const c = couplings({ components, componentRefs: [{ from: "a", to: "b", references: 9 }] });
    const bond = bondsTo(["a"], components, c)[0];
    expect(bond.channel).toBe("static");
  });
});

describe("one hop counts, at half weight", () => {
  it("reaches a component through a go-between outside the group", () => {
    const components = ["g", "mid", "far", "x"];
    const componentRefs = [
      { from: "mid", to: "g", references: 8 },
      { from: "far", to: "mid", references: 8 },
      { from: "x", to: "x2", references: 1 },
    ];
    const c = couplings({ components: [...components, "x2"], componentRefs });
    const bonds = bondsTo(["g"], components, c);
    const far = bonds.find(b => b.id === "far");
    expect(far).toBeTruthy();
    expect(far!.indirect).toBeGreaterThan(0);
    // The direct neighbour still outranks the one reached through it.
    expect(bonds[0].id).toBe("mid");
  });
});

describe("bands measured against the group's own grip", () => {
  it("calls a candidate strong only if it binds like a member does", () => {
    // A tight trio, plus a component with one weak thread to it.
    const components = ["a", "b", "c", "weak"];
    const componentRefs = [
      { from: "a", to: "b", references: 20 },
      { from: "b", to: "c", references: 20 },
      { from: "a", to: "c", references: 20 },
      { from: "weak", to: "a", references: 1 },
      { from: "weak", to: "z1", references: 9 },
      { from: "weak", to: "z2", references: 9 },
    ];
    const c = couplings({ components: [...components, "z1", "z2"], componentRefs });
    const cohesion = cohesionOf(["a", "b", "c"], c);
    expect(cohesion).toBeGreaterThan(0);
    const bands = bandBonds(bondsTo(["a", "b", "c"], ["weak"], c), cohesion);
    expect(bands[0].items[0].id).toBe("weak");
    expect(bands[0].id).not.toBe("strong");
  });

  it("falls back to the strongest candidate while a group is still one thing", () => {
    const components = ["a", "b"];
    const c = couplings({ components, componentRefs: [{ from: "a", to: "b", references: 5 }] });
    expect(cohesionOf(["a"], c)).toBe(0);
    const bands = bandBonds(bondsTo(["a"], components, c), 0);
    expect(bands[0].id).toBe("strong");
    expect(bands[0].hint).toContain("too small to measure");
  });
});

describe("the channels compete on equal terms", () => {
  it("does not let kinship drown a real reference", () => {
    // Two candidates: one referenced hard by the group, one merely named alike.
    const components = ["auth.core", "auth.token", "billing.engine"];
    const componentRefs = [{ from: "billing.engine", to: "auth.core", references: 40 }];
    const c = couplings({ components, componentRefs });
    const bonds = bondsTo(["auth.core"], ["auth.token", "billing.engine"], c);
    const byRef = bonds.find(b => b.id === "billing.engine")!;
    const byName = bonds.find(b => b.id === "auth.token")!;
    expect(byRef.channel).toBe("static");
    // Kinship must not be so inflated that a pure name match outweighs a
    // codebase-wide reference concentration.
    expect(byRef.parts.static).toBeGreaterThan(byName.parts.kinship * 0.5);
  });

  it("keeps every channel on the same 0..1 scale", () => {
    const components = ["a.one", "a.two"];
    const c = couplings({ components, componentRefs: [{ from: "a.one", to: "a.two", references: 3 }] });
    const k = c.kin.get("a.one")?.get("a.two") ?? 0;
    const r = c.ref.get("a.one")?.get("a.two") ?? 0;
    expect(k).toBeLessThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(1);
  });
})

describe("where else it could go", () => {
  const components = ["auth.core", "auth.token", "cart.core", "shared.thing"];
  const componentRefs = [
    { from: "auth.token", to: "auth.core", references: 3 },
    { from: "shared.thing", to: "auth.core", references: 2 },
    { from: "shared.thing", to: "cart.core", references: 30 },
  ];

  it("names the group a candidate leans to harder", () => {
    const c = couplings({ components, componentRefs });
    const mine = bondsTo(["auth.core"], components, c);
    const rivals = [{ name: "Cart", bonds: bondsTo(["cart.core"], components, c) }];
    const leaning = elsewhere({ size: 1, bonds: mine }, rivals.map(r => ({ ...r, size: 1 })));
    expect(leaning.get("shared.thing")?.name).toBe("Cart");
    // Something with no rival keeps its place.
    expect(leaning.has("auth.token")).toBe(false);
  });

  it("refuses to call it strongly related when its place is elsewhere", () => {
    const c = couplings({ components, componentRefs });
    const mine = bondsTo(["auth.core"], components, c);
    const leaning = elsewhere({ size: 1, bonds: mine }, [{ name: "Cart", size: 1, bonds: bondsTo(["cart.core"], components, c) }]);
    const withRivals = bandBonds(mine, 0, leaning);
    const strong = withRivals.find(b => b.id === "strong");
    expect(strong?.items.some(i => i.id === "shared.thing")).toBeFalsy();
    // Without the rival it would have been top of the strong band.
    const alone = bandBonds(bondsTo(["auth.core"], ["shared.thing"], c), 0);
    expect(alone[0].id).toBe("strong");
  });
})

describe("a big group does not win by being big", () => {
  it("sees that a candidate belongs to the small group it actually leans on", () => {
    // Eight loosely-connected components in one group, two tight ones in the
    // other. The candidate is bound hard to the pair and barely to the crowd.
    const crowd = Array.from({ length: 8 }, (_, i) => `big.part${i}`);
    const components = [...crowd, "small.one", "small.two", "candidate.thing"];
    const componentRefs = [
      ...crowd.map(c => ({ from: "candidate.thing", to: c, references: 1 })),
      { from: "candidate.thing", to: "small.one", references: 9 },
      { from: "candidate.thing", to: "small.two", references: 9 },
      { from: "small.one", to: "small.two", references: 9 },
    ];
    const c = couplings({ components, componentRefs });
    const mineBonds = bondsTo(crowd, ["candidate.thing"], c);
    const rival = { name: "Small", size: 2, bonds: bondsTo(["small.one", "small.two"], ["candidate.thing"], c) };
    // Raw sums would hand it to the crowd: eight members outweigh two.
    expect(mineBonds[0].value).toBeGreaterThan(rival.bonds[0].value);
    // Measured by density, its real home is named.
    const leaning = elsewhere({ size: crowd.length, bonds: mineBonds }, [rival]);
    expect(leaning.get("candidate.thing")?.name).toBe("Small");
  });
});

describe("a refusal is evidence, not just a skip", () => {
  // Two worlds that barely touch. The group is in one; the candidate is bound
  // to the other, through things the architect has already turned down.
  const mine = ["mine.a", "mine.b"];
  const theirs = ["theirs.x", "theirs.y"];
  const components = [...mine, ...theirs, "suspect.thing", "quiet.thing"];
  const componentRefs = [
    { from: "mine.a", to: "mine.b", references: 9 },
    { from: "theirs.x", to: "theirs.y", references: 9 },
    { from: "suspect.thing", to: "theirs.x", references: 9 },
    { from: "suspect.thing", to: "theirs.y", references: 9 },
    { from: "suspect.thing", to: "mine.a", references: 3 },
    { from: "quiet.thing", to: "mine.a", references: 3 },
  ];

  it("pushes down whatever leans on what was already refused", () => {
    const c = couplings({ components, componentRefs });
    const value = (bonds: ReturnType<typeof bondsTo>, id: string) => bonds.find(b => b.id === id)?.value ?? 0;

    const before = bondsTo(mine, ["suspect.thing", "quiet.thing"], c);
    const after = bondsTo(mine, ["suspect.thing", "quiet.thing"], c, theirs);

    // The quiet one is untouched: it leans on nothing that was refused.
    expect(value(after, "quiet.thing")).toBeCloseTo(value(before, "quiet.thing"), 10);
    // The suspect is not: two of the three things it leans on were turned down.
    expect(value(after, "suspect.thing")).toBeLessThan(value(before, "suspect.thing"));
    // And the gap between them widens because of it.
    const gap = (b: ReturnType<typeof bondsTo>) => value(b, "quiet.thing") - value(b, "suspect.thing");
    expect(gap(after)).toBeGreaterThan(gap(before));
  });

  it("ignores a refusal of something already in the group", () => {
    const c = couplings({ components, componentRefs });
    const plain = bondsTo(mine, ["quiet.thing"], c);
    const odd = bondsTo(mine, ["quiet.thing"], c, ["mine.a"]);
    expect(odd[0].value).toBeCloseTo(plain[0].value, 10);
  });
});

describe("the strong band is a short one", () => {
  it("never invites more questions than the ranking can answer", () => {
    // Forty candidates all bound to the group about equally: without a cap
    // every one of them would be called strongly related.
    const members = ["core.a", "core.b"];
    const many = Array.from({ length: 40 }, (_, i) => `sat.thing${i}`);
    const componentRefs = [
      { from: "core.a", to: "core.b", references: 5 },
      ...many.map(m => ({ from: m, to: "core.a", references: 5 })),
    ];
    const c = couplings({ components: [...members, ...many], componentRefs });
    const bonds = bondsTo(members, many, c);
    const strong = bandBonds(bonds, 0).find(b => b.id === "strong");
    expect(bonds.length).toBeGreaterThan(20);
    expect(strong!.items.length).toBeLessThanOrEqual(8);
  });
});
