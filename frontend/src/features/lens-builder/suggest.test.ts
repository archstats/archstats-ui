import { describe, expect, it } from "vitest";
import { EMPTY_SOURCES, PRESETS, buildSuggestInput, componentDepths, placeRest, presetById, suggest, tokensOf, weightsOf, worthProposing, type SignalSources, type Suggestion, type SuggestInput, type SuggestSettings } from "./suggest";

function sources(over: Partial<SignalSources>): SignalSources {
  return { ...EMPTY_SOURCES, ...over };
}
/**
 * These fixtures are miniatures — three components make a feature here, where
 * a real one has thirty — so they test the clustering MECHANISM with the
 * proposal policy stood down. What the engine is willing to stand behind on
 * a real codebase is a different question, and has its own tests below.
 */
const settingsOf = (id: string, over: Partial<SuggestSettings> = {}): SuggestSettings =>
  ({ ...presetById(id).settings, minSize: 2, minKept: 0, ...over });

describe("tokensOf", () => {
  it("splits packages, camel case and file names and drops stop words", () => {
    expect(tokensOf("com.acme.audit.AuditController")).toEqual(["acme", "audit", "controller"]);
    expect(tokensOf("src/main/java/com/acme/billing/InvoiceService.java")).toEqual(["acme", "billing", "invoice", "service"]);
  });
});

describe("componentDepths", () => {
  it("measures the longest path from the entry points and ignores untouched components", () => {
    const d = componentDepths(["web", "svc", "repo", "lonely"], [
      { from: "web", to: "svc", references: 1 }, { from: "svc", to: "repo", references: 1 }, { from: "web", to: "repo", references: 1 },
    ]);
    expect(d.get("web")).toBe(0);
    expect(d.get("svc")).toBe(1);
    expect(d.get("repo")).toBe(2);
    expect(d.get("lonely")).toBeNull();
  });
});

describe("suggest", () => {
  const components = ["audit.web", "audit.svc", "audit.repo", "ship.web", "ship.svc", "ship.repo"];
  const refs = [
    { from: "audit.web", to: "audit.svc", references: 8 }, { from: "audit.svc", to: "audit.repo", references: 6 },
    { from: "ship.web", to: "ship.svc", references: 8 }, { from: "ship.svc", to: "ship.repo", references: 6 },
    { from: "audit.svc", to: "ship.repo", references: 1 },
  ];

  it("clusters two features at component grain and names them by their rare token", () => {
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const out = suggest(input, settingsOf("references"));
    expect(out).toHaveLength(2);
    const names = out.map(s => s.name).sort();
    expect(names).toEqual(["Audit", "Ship"]);
    const audit = out.find(s => s.name === "Audit")!;
    expect(audit.components.sort()).toEqual(["audit.repo", "audit.svc", "audit.web"]);
    expect(audit.parts.every(p => p.files === null)).toBe(true);
    expect(audit.reasons[0].signal).toBe("references");
    expect(audit.reasons.map(r => r.signal)).toContain("path");
  });

  it("splits a component whose files belong to two features", () => {
    const files = [
      { name: "audit/A1.java", component: "audit" }, { name: "audit/A2.java", component: "audit" }, { name: "audit/A3.java", component: "audit" },
      { name: "ship/S1.java", component: "ship" }, { name: "ship/S2.java", component: "ship" }, { name: "ship/S3.java", component: "ship" },
      { name: "common/C1.java", component: "common" }, { name: "common/C2.java", component: "common" },
      { name: "common/C3.java", component: "common" }, { name: "common/C4.java", component: "common" },
    ];
    const fileRefs = [
      { from: "audit/A1.java", to: "audit/A2.java", references: 5 }, { from: "audit/A2.java", to: "audit/A3.java", references: 5 }, { from: "audit/A1.java", to: "audit/A3.java", references: 5 },
      { from: "ship/S1.java", to: "ship/S2.java", references: 5 }, { from: "ship/S2.java", to: "ship/S3.java", references: 5 }, { from: "ship/S1.java", to: "ship/S3.java", references: 5 },
      // C1, C2 belong with audit; C3, C4 with ship
      { from: "audit/A1.java", to: "common/C1.java", references: 6 }, { from: "audit/A2.java", to: "common/C2.java", references: 6 }, { from: "common/C1.java", to: "common/C2.java", references: 4 },
      { from: "ship/S1.java", to: "common/C3.java", references: 6 }, { from: "ship/S2.java", to: "common/C4.java", references: 6 }, { from: "common/C3.java", to: "common/C4.java", references: 4 },
    ];
    const input = buildSuggestInput(sources({ components: ["audit", "ship", "common"], files, fileRefs }), "file");
    const out = suggest(input, settingsOf("references", { splitFiles: true, keepSharedApart: false, weights: weightsOf({ references: 2 }) }));
    expect(out).toHaveLength(2);
    const audit = out.find(s => s.parts.some(p => p.component === "audit"))!;
    const commonPart = audit.parts.find(p => p.component === "common")!;
    expect(commonPart.files).toEqual(["common/C1.java", "common/C2.java"]);
    expect(commonPart.total).toBe(4);
    expect(audit.parts.find(p => p.component === "audit")!.files).toBeNull();
    expect(audit.split).toBe(1);
    // "common" is drawn in exactly one hull
    const drawn = out.flatMap(s => s.components).filter(c => c === "common");
    expect(drawn).toHaveLength(1);
  });

  it("keeps a whole component together when splitting is off", () => {
    const files = [
      { name: "a/A1.java", component: "a" }, { name: "a/A2.java", component: "a" },
      { name: "b/B1.java", component: "b" }, { name: "b/B2.java", component: "b" },
    ];
    const fileRefs = [{ from: "a/A1.java", to: "a/A2.java", references: 3 }, { from: "b/B1.java", to: "b/B2.java", references: 3 }, { from: "a/A2.java", to: "b/B1.java", references: 3 }];
    const input = buildSuggestInput(sources({ components: ["a", "b"], files, fileRefs }), "file");
    const out = suggest(input, settingsOf("references", { splitFiles: false, granularity: 1 }));
    expect(out.every(s => s.parts.every(p => p.files === null))).toBe(true);
  });

  it("bands files by lane for the Layers preset and labels the bands", () => {
    const files = [
      { name: "a/AController.java", component: "a" }, { name: "a/AService.java", component: "a" }, { name: "a/ARepo.java", component: "a" },
      { name: "b/BController.java", component: "b" }, { name: "b/BService.java", component: "b" }, { name: "b/BRepo.java", component: "b" },
    ];
    const laneOfFile = new Map<string, string>([
      ["a/AController.java", "controllers"], ["b/BController.java", "controllers"],
      ["a/AService.java", "services"], ["b/BService.java", "services"],
      ["a/ARepo.java", "repositories"], ["b/BRepo.java", "repositories"],
    ]);
    const input = buildSuggestInput(sources({ components: ["a", "b"], files, laneOfFile, laneLabels: { controllers: "Controllers", services: "Services & Other", repositories: "Repositories" } }), "file");
    const out = suggest(input, settingsOf("lanes"));
    expect(out.map(s => s.name).sort()).toEqual(["Controllers", "Repositories", "Services & Other"]);
    const controllers = out.find(s => s.name === "Controllers")!;
    expect(controllers.parts.map(p => p.files)).toEqual([["a/AController.java"], ["b/BController.java"]]);
    expect(controllers.reasons[0].text).toBe("same lane Controllers");
  });

  it("groups by the subject even when references are silent", () => {
    const components = ["audit.web", "audit.jobs", "ship.web", "ship.jobs"];
    const files = components.map(c => ({ name: c + "/Main.java", component: c }));
    const entityImports = new Map<string, string[]>([
      ["audit.web/Main.java", ["entities/Audit.java"]], ["audit.jobs/Main.java", ["entities/Audit.java"]],
      ["ship.web/Main.java", ["entities/Shipment.java"]], ["ship.jobs/Main.java", ["entities/Shipment.java"]],
    ]);
    const componentCochange = [{ from: "audit.web", to: "audit.jobs", count: 12 }, { from: "ship.web", to: "ship.jobs", count: 9 }];
    const input = buildSuggestInput(sources({ components, files, entityImports, componentCochange }), "component");
    const out = suggest(input, settingsOf("subject", { splitFiles: false }));
    expect(out).toHaveLength(2);
    const audit = out.find(s => s.components.includes("audit.web"))!;
    expect(audit.components.sort()).toEqual(["audit.jobs", "audit.web"]);
    // The domain cut reads names now rather than clustering the affinity
    // graph, so it says what actually decided the grouping. Here `audit`
    // sits at the front of both its names and never moves, so it is the tree
    // that separates these two and the reason says so. Co-change and shared
    // types still count -- they are what a floating word has to be confirmed
    // by -- but they are no longer what does the grouping.
    expect(audit.reasons.map(r => r.signal)).toEqual(["path"]);
  });

  it("keeps a hub apart as Shared and never reuses a taken name", () => {
    const components = ["util", ...Array.from({ length: 12 }, (_, i) => `f${i}`)];
    const refs = components.slice(1).map(c => ({ from: c, to: "util", references: 3 }));
    refs.push({ from: "f0", to: "f1", references: 5 }, { from: "f1", to: "f2", references: 5 }, { from: "f3", to: "f4", references: 5 }, { from: "f4", to: "f5", references: 5 });
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    expect(input.hubs.has("util")).toBe(true);
    const out = suggest(input, settingsOf("references"), new Set(["Group A"]));
    const shared = out.find(s => s.name === "Shared")!;
    expect(shared.components).toEqual(["util"]);
    expect(out.some(s => s.name === "Group A")).toBe(false);
  });

  it("every preset carries a weight for every signal", () => {
    for (const p of PRESETS) expect(Object.keys(p.settings.weights)).toHaveLength(9);
  });

  it("limits the units to an include filter, for scoped views", () => {
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component", c => c.startsWith("audit"));
    expect(input.units.map(u => u.id).sort()).toEqual(["audit.repo", "audit.svc", "audit.web"]);
  });

  it("merges clusters that would carry the same name, so one domain is one group", () => {
    // Two auth pairs never reference each other, but both are "auth".
    const components = ["auth.web", "auth.jobs", "auth.api", "auth.cli", "pay.web", "pay.svc", "ship.web", "ship.svc"];
    const refs = [
      { from: "auth.web", to: "auth.jobs", references: 5 }, { from: "auth.api", to: "auth.cli", references: 5 },
      { from: "pay.web", to: "pay.svc", references: 5 }, { from: "ship.web", to: "ship.svc", references: 5 },
    ];
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const out = suggest(input, settingsOf("references", { weights: weightsOf({ references: 2 }), balance: false }));
    expect(out.map(s => s.name).sort()).toEqual(["Auth", "Pay", "Ship"]);
    expect(out.find(s => s.name === "Auth")!.components.sort()).toEqual(["auth.api", "auth.cli", "auth.jobs", "auth.web"]);
  });

  it("folds a dwarf cluster into its neighbour when balancing", () => {
    // Three groups of five plus one lonely pair weakly attached to the first group.
    const components: string[] = [];
    const refs: Array<{ from: string; to: string; references: number }> = [];
    for (const g of ["alpha", "beta", "gamma"]) {
      const ids = [1, 2, 3, 4, 5].map(i => `${g}.c${i}`);
      components.push(...ids);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) refs.push({ from: ids[i], to: ids[j], references: 4 });
    }
    components.push("x.one", "x.two");
    refs.push({ from: "x.one", to: "x.two", references: 4 }, { from: "x.one", to: "alpha.c1", references: 1 });
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const balanced = suggest(input, settingsOf("references", { weights: weightsOf({ references: 2 }), balance: true, minSize: 1 }));
    const loose = suggest(input, settingsOf("references", { weights: weightsOf({ references: 2 }), balance: false, minSize: 1 }));
    expect(loose.some(s => s.components.includes("x.one") && s.components.length === 2)).toBe(true);
    const alpha = balanced.find(s => s.components.includes("alpha.c1"))!;
    expect(alpha.components).toContain("x.one");
    expect(alpha.components).toContain("x.two");
  });

  it("reshuffles around a draft: locked groups keep their members and names, free units flow", () => {
    const components = ["auth.web", "auth.svc", "auth.repo", "pay.web", "pay.svc", "pay.repo", "loose"];
    const refs = [
      { from: "auth.web", to: "auth.svc", references: 5 }, { from: "auth.svc", to: "auth.repo", references: 5 },
      { from: "pay.web", to: "pay.svc", references: 5 }, { from: "pay.svc", to: "pay.repo", references: 5 },
      { from: "loose", to: "pay.repo", references: 4 },
      // the architect moved auth.repo into the Pay group and locked it
      { from: "auth.repo", to: "auth.web", references: 5 },
    ];
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const placed = new Map<string, string>([["auth.web", "g1"], ["auth.svc", "g1"], ["auth.repo", "g2"], ["pay.web", "g2"], ["pay.svc", "g2"], ["pay.repo", "g2"]]);
    const out = suggest(input, settingsOf("references", { weights: weightsOf({ references: 2 }), balance: false }), new Set(), { placed, locked: new Set(["g2"]), names: new Map([["g1", "Authentication"], ["g2", "Payments"]]) });
    const pay = out.find(s => s.key === "g2")!;
    expect(pay.name).toBe("Payments");
    expect(pay.components).toContain("auth.repo");
    expect(pay.components).toContain("loose");
    const auth = out.find(s => s.key === "g1")!;
    expect(auth.name).toBe("Authentication");
    expect(auth.components.sort()).toEqual(["auth.svc", "auth.web"]);
  });

  it("places the rest by strongest affinity without moving what is placed", () => {
    const components = ["a1", "a2", "b1", "b2", "x", "y"];
    const refs = [
      { from: "a1", to: "a2", references: 5 }, { from: "b1", to: "b2", references: 5 },
      { from: "x", to: "a1", references: 3 }, { from: "x", to: "b1", references: 1 },
      { from: "y", to: "b2", references: 2 },
    ];
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const placed = new Map<string, string>([["a1", "A"], ["a2", "A"], ["b1", "B"], ["b2", "B"]]);
    const out = placeRest(input, settingsOf("references", { weights: weightsOf({ references: 2 }) }), placed);
    expect(out.get("x")?.key).toBe("A");
    expect(out.get("y")?.key).toBe("B");
    expect(out.has("a1")).toBe(false);
  });

  it("never names a group after a word most of the codebase carries", () => {
    const components = ["elepy.auth.web", "elepy.auth.svc", "elepy.pay.web", "elepy.pay.svc"];
    const refs = [{ from: "elepy.auth.web", to: "elepy.auth.svc", references: 5 }, { from: "elepy.pay.web", to: "elepy.pay.svc", references: 5 }];
    const input = buildSuggestInput(sources({ components, componentRefs: refs }), "component");
    const out = suggest(input, settingsOf("references", { weights: weightsOf({ references: 2 }), balance: false }));
    expect(out.map(s => s.name).sort()).toEqual(["Auth", "Pay"]);
  });
});

describe("codebases that are not Java", () => {
  it("reads Rust and C++ namespaces", () => {
    expect(tokensOf("crate::billing::invoice")).toContain("billing");
    expect(tokensOf("crate::billing::invoice")).toContain("invoice");
  });

  it("reads PHP namespaces and their file names", () => {
    const t = tokensOf("App\\Domain\\Order\\OrderHandler.php");
    expect(t).toContain("order");
    expect(t).toContain("handler");
    expect(t).not.toContain("php");
  });

  it("strips the extensions of languages beyond the JVM", () => {
    for (const [id, word] of [["src/app/cart.rs", "cart"], ["lib/checkout.php", "checkout"], ["ui/Basket.vue", "basket"], ["core/ledger.cpp", "ledger"]] as const) {
      const t = tokensOf(id);
      expect(t).toContain(word);
      expect(t.some(x => ["php", "vue", "cpp"].includes(x))).toBe(false);
    }
  });

  it("scores a pair the same however the language spells a namespace", () => {
    const dots = ["a.b.order", "a.b.orders", "a.c.cart", "a.c.carts"];
    const cols = dots.map(d => d.replace(/\./g, "::"));
    const pathOf = (ids: string[]) => {
      const input = buildSuggestInput(sources({ components: ids, files: ids.map(c => ({ name: c + ".File", component: c })) }), "component");
      const pair = input.pairs.find(p => [p.a, p.b].every(x => x === ids[0] || x === ids[1]));
      return pair?.v.path ?? 0;
    };
    expect(pathOf(dots)).toBeGreaterThan(0);
    expect(pathOf(cols)).toBeCloseTo(pathOf(dots), 5);
  });
})

describe("package proximity is information, not segment count", () => {
  const flat = ["com.elepy.aws.s3", "com.elepy.sparkjava", "com.elepy.javalin", "com.elepy.uploads", "com.elepy.http", "com.elepy.query.parser", "com.elepy.query.cql"];

  it("gives no credit for the root everything shares", () => {
    const input = buildSuggestInput(sources({ components: flat, files: flat.map(c => ({ name: c + ".File", component: c })) }), "component");
    const pair = input.pairs.find(p => [p.a, p.b].sort().join("|") === ["com.elepy.sparkjava", "com.elepy.javalin"].sort().join("|"));
    // They share only "com.elepy", which every component shares.
    expect(pair?.v.path ?? 0).toBeLessThan(0.05);
  });

  it("still rewards a prefix only a few share", () => {
    const input = buildSuggestInput(sources({ components: flat, files: flat.map(c => ({ name: c + ".File", component: c })) }), "component");
    const near = input.pairs.find(p => [p.a, p.b].sort().join("|") === ["com.elepy.query.parser", "com.elepy.query.cql"].sort().join("|"));
    const far = input.pairs.find(p => [p.a, p.b].sort().join("|") === ["com.elepy.sparkjava", "com.elepy.javalin"].sort().join("|"));
    expect(near?.v.path ?? 0).toBeGreaterThan(0.5);
    expect(near!.v.path!).toBeGreaterThan(far?.v.path ?? 0);
  });
})

describe("what the engine is willing to stand behind", () => {
  // The policy is tested as a policy: hand it finished suggestions and a
  // known graph and ask which ones it will put its name to. Driving it
  // through the clustering would be testing louvain, which has its own tests
  // above and its own reasons for merging things.
  const say = (key: string, components: string[]): Suggestion => ({
    key, name: key, parts: components.map(c => ({ component: c, files: null, total: 1 })),
    components, reasons: [], units: components.length, split: 0,
  });

  /** Four that talk to each other, four that only ever talk outward. */
  function graph(): SuggestInput {
    const tight = ["a1", "a2", "a3", "a4"];
    const loose = ["b1", "b2", "b3", "b4"];
    const componentRefs: Array<{ from: string; to: string; references: number }> = [];
    for (const x of tight) for (const y of tight) if (x !== y) componentRefs.push({ from: x, to: y, references: 5 });
    for (const x of loose) for (const y of tight) componentRefs.push({ from: x, to: y, references: 5 });
    for (const x of loose) componentRefs.push({ from: x, to: "b1", references: 1 });
    return buildSuggestInput({
      ...EMPTY_SOURCES,
      components: [...tight, ...loose],
      files: [...tight, ...loose].map(c => ({ name: c + ".File", component: c })),
      componentRefs,
    }, "component");
  }

  const policy = (over: Partial<SuggestSettings> = {}) => settingsOf("references", { minSize: 4, minKept: 0.15, ...over });

  it("keeps a group that holds its own work and refuses one that does not", () => {
    const input = graph();
    const out = worthProposing([say("g1", ["a1", "a2", "a3", "a4"]), say("g2", ["b1", "b2", "b3", "b4"])], input, policy());
    // The four that reference each other keep all of it inside; the four that
    // only reach out keep almost none, and are handed back rather than
    // dressed up as a group.
    expect(out.map(s => s.key)).toEqual(["g1"]);
  });

  it("refuses a group too small to be a structure", () => {
    const input = graph();
    const out = worthProposing([say("g1", ["a1", "a2", "a3"])], input, policy());
    expect(out).toEqual([]);
  });

  it("places everything when nothing is demanded of it, which is the old behaviour", () => {
    const input = graph();
    const all = [say("g1", ["a1", "a2", "a3", "a4"]), say("g2", ["b1", "b2", "b3", "b4"])];
    expect(worthProposing(all, input, policy({ minSize: 1, minKept: 0 }))).toHaveLength(2);
  });

  it("never takes away a group someone has already touched", () => {
    const input = graph();
    const mine = new Map([["b1", "g2"]]);
    const out = worthProposing(
      [say("g2", ["b1", "b2"])], input, policy(),
      { placed: mine, locked: new Set(["g2"]), names: new Map([["g2", "Mine"]]) },
    );
    // Two components, well under the floor, kept because a person put them
    // there. The gate refuses proposals, never decisions.
    expect(out).toHaveLength(1);
  });

  it("judges a group with nothing to go on by size alone", () => {
    const input = buildSuggestInput({
      ...EMPTY_SOURCES,
      components: ["x1", "x2", "x3", "x4"],
      files: ["x1", "x2", "x3", "x4"].map(c => ({ name: c + ".File", component: c })),
    }, "component");
    // No references anywhere: silence is not evidence of a bad group.
    expect(worthProposing([say("g", ["x1", "x2", "x3", "x4"])], input, policy())).toHaveLength(1);
  });

  it("lets a word be struck out of the domain vocabulary", () => {
    // Where a project repeats its layer structure inside every plugin,
    // "controllers" moves through the names exactly as freely as a real
    // subject does and no measurement separates them. The reading offers its
    // best; the architect takes a word out and it re-measures.
    const components = [
      // "controllers" sits at depth 4 inside the plugins and depth 2 in the
      // web tree, so it floats exactly as a subject would. This is
      // nopCommerce's shape, and it is why no measurement settles it.
      "app.plugin.feed.chat.controllers",
      "app.plugin.misc.azure.controllers",
      "app.web.controllers",
      "app.core.domain.billing", "app.services.billing",
      "app.core.domain.shipping", "app.services.shipping",
    ];
    const componentRefs = [
      { from: "app.services.billing", to: "app.core.domain.billing", references: 9 },
      { from: "app.services.shipping", to: "app.core.domain.shipping", references: 8 },
      { from: "app.plugin.feed.chat.controllers", to: "app.web.controllers", references: 7 },
      { from: "app.plugin.misc.azure.controllers", to: "app.web.controllers", references: 6 },
    ];
    const input = buildSuggestInput(sources({ components, componentRefs }), "component");
    const base = settingsOf("subject");

    const before = suggest(input, base).map(g => g.name);
    const after = suggest(input, { ...base, struckSubjects: ["controllers"] }).map(g => g.name);

    // Without this the test proves nothing: the word has to be there to go.
    expect(before).toContain("Controllers");
    expect(after).not.toContain("Controllers");
    // Striking takes one word out of the vocabulary and leaves the rest of
    // the reading alone: the real subjects are still there, holding exactly
    // what they held. What the struck word was carrying falls to the package
    // tree, and whatever the tree cannot make a group of is left unplaced
    // for the architect rather than forced somewhere it does not belong.
    const membersOf = (out: ReturnType<typeof suggest>, name: string) =>
      out.find(g => g.name === name)?.components.slice().sort() ?? [];
    const full = suggest(input, base);
    const without = suggest(input, { ...base, struckSubjects: ["controllers"] });
    for (const domain of ["Billing", "Shipping"]) {
      expect(membersOf(without, domain)).toEqual(membersOf(full, domain));
      expect(membersOf(without, domain).length).toBeGreaterThan(0);
    }
  });

  it("does not answer the framework question with depth", () => {
    // "What the framework makes it" and "distance from the entry points" are
    // two different readings, and they returned identical cuts on all six
    // codebases measured because a file with no framework role was quietly
    // given its depth band instead. A file the framework says nothing about
    // is now left for the architect.
    const ids = ["a.web", "a.svc", "b.web", "b.svc"];
    const files = ids.map(c => ({ name: c + ".File", component: c }));
    const componentRefs = [
      { from: "a.web", to: "a.svc", references: 5 },
      { from: "b.web", to: "b.svc", references: 5 },
    ];
    // Nothing carries a lane.
    const blind = buildSuggestInput(sources({ components: ids, files, componentRefs }), "component");
    expect(suggest(blind, settingsOf("lanes"))).toHaveLength(0);
    // Depth still has plenty to say about the same codebase.
    expect(suggest(blind, settingsOf("depth", { minSize: 1 })).length).toBeGreaterThan(0);

    // With lanes, it answers its own question.
    const laneOfFile = new Map(files.map(f => [f.name, f.component!.endsWith(".web") ? "controller" : "service"]));
    const seeing = buildSuggestInput(sources({ components: ids, files, componentRefs, laneOfFile, laneLabels: { controller: "Controller", service: "Service" } }), "component");
    expect(suggest(seeing, settingsOf("lanes", { minSize: 1 })).map(g => g.name).sort()).toEqual(["Controller", "Service"]);
  });

  it("asks nothing of cohesion where cohesion is the wrong question", () => {
    // A layer's members do not reference each other — that is what makes it a
    // layer — so the horizontal preset carries no minKept at all.
    expect(presetById("lanes").settings.minKept).toBeUndefined();
    // Nor does the domain cut, and for a reason worth stating: a core domain
    // keeps very little of its traffic inside precisely because the rest of
    // the codebase uses it. Measured across four commerce platforms, cohesion
    // ranked `Caching` above `Catalog`, so gating domains on it throws away
    // the real ones first.
    expect(presetById("subject").settings.minKept).toBeUndefined();
    // The rule, stated once: a reading is gated on how much of a group's
    // references stay inside only when references are what it read. The
    // history readings are not, and gating them threw away most of their
    // answer -- Sakai placed 318 of 1,271 components by commit with the gate
    // on and 1,228 with it off.
    for (const id of ["commits", "authors"]) {
      expect(presetById(id).settings.minKept).toBeUndefined();
    }
    for (const id of ["references", "blend"]) {
      expect(presetById(id).settings.minKept).toBeGreaterThan(0);
    }
  });
});
