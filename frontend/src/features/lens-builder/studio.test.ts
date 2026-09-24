import { describe, expect, it } from "vitest";
import { EMPTY_SOURCES, buildSuggestInput, presetById, type SignalSources } from "./suggest";
import { GRAIN, READS, WAYS, affinityIndex, domainBasisOf, affinityTo, bestLayerKeying, bundleFor, bundleUnplaced, closestGroup, commonName, detectSeparator, nameForQuery, fitnessOf, wayById, packageTree, pathStyle, rankCandidates, rankGroups, splitBundle, titleFromPrefix, underPath } from "./studio";

function sources(over: Partial<SignalSources>): SignalSources {
  return { ...EMPTY_SOURCES, ...over };
}

const COMPONENTS = [
  "com.acme.core.order.domain", "com.acme.core.order.service", "com.acme.core.order.web",
  "com.acme.core.catalog.domain", "com.acme.core.catalog.service",
  "com.acme.common.util",
];
const REFS = [
  { from: "com.acme.core.order.web", to: "com.acme.core.order.service", references: 20 },
  { from: "com.acme.core.order.service", to: "com.acme.core.order.domain", references: 18 },
  { from: "com.acme.core.catalog.service", to: "com.acme.core.catalog.domain", references: 15 },
  { from: "com.acme.core.order.service", to: "com.acme.common.util", references: 2 },
];
const input = buildSuggestInput(sources({ components: COMPONENTS, componentRefs: REFS }), "component");

describe("titleFromPrefix", () => {
  it("names a bundle after the last thing in its path", () => {
    expect(titleFromPrefix("com.acme.core.order")).toBe("Order");
    expect(titleFromPrefix("com.acme.core.shipping_labels")).toBe("Shipping labels");
  });
});

describe("bundleUnplaced", () => {
  it("bundles package siblings and puts the heaviest question first", () => {
    const lines = new Map([["com.acme.core.order.domain", 900], ["com.acme.core.order.service", 800], ["com.acme.core.order.web", 300], ["com.acme.core.catalog.domain", 200], ["com.acme.core.catalog.service", 100], ["com.acme.common.util", 50]]);
    const bundles = bundleUnplaced(COMPONENTS, id => lines.get(id) ?? 0);
    expect(bundles[0].name).toBe("Order");
    expect(bundles[0].members).toHaveLength(3);
    expect(bundles[0].reason).toBe("all under com.acme.core.order");
    expect(bundles[1].name).toBe("Catalog");
    expect(bundles[2].members).toEqual(["com.acme.common.util"]);
    expect(bundles[2].reason).toBe("on its own");
  });

  it("cuts a sibling set too large to judge at a glance", () => {
    const wide = Array.from({ length: 14 }, (_, i) => `com.acme.big.${i < 7 ? "left" : "right"}.m${i}`);
    const bundles = bundleUnplaced(wide, () => 1, 10);
    expect(bundles.length).toBeGreaterThan(1);
    expect(bundles.every(b => b.members.length <= 10)).toBe(true);
  });
});

describe("affinity", () => {
  const index = affinityIndex(input);

  it("measures one component against a set and names the strongest reason", () => {
    const tie = affinityTo("com.acme.core.order.web", ["com.acme.core.order.service"], index);
    expect(tie.weight).toBeGreaterThan(0);
    expect(["references", "path", "names"]).toContain(tie.signal);
  });

  it("finds the group a bundle is closest to", () => {
    const groups = [
      { key: "g1", name: "Orders", members: ["com.acme.core.order.service", "com.acme.core.order.domain"] },
      { key: "g2", name: "Catalog", members: ["com.acme.core.catalog.domain"] },
    ];
    const best = closestGroup(["com.acme.core.order.web"], groups, index);
    expect(best?.group.key).toBe("g1");
  });

  it("ranks what a group should take next and never offers a refusal", () => {
    const pool = ["com.acme.core.order.web", "com.acme.common.util", "com.acme.core.catalog.service"];
    const ranked = rankCandidates(["com.acme.core.order.service"], pool, index);
    expect(ranked[0].id).toBe("com.acme.core.order.web");
    const without = rankCandidates(["com.acme.core.order.service"], pool, index, new Set(["com.acme.core.order.web"]));
    expect(without.some(c => c.id === "com.acme.core.order.web")).toBe(false);
  });
});

describe("packageTree", () => {
  it("collapses single-child runs and counts what is under each step", () => {
    const tree = packageTree(COMPONENTS, () => 10);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe("com.acme");
    expect(tree[0].count).toBe(6);
    const labels = tree[0].children.map(c => c.label);
    expect(labels).toContain("core");
    expect(labels).toContain("common.util");
  });

  it("takes everything under a path in one act", () => {
    expect(underPath("com.acme.core.order", COMPONENTS)).toEqual([
      "com.acme.core.order.domain", "com.acme.core.order.service", "com.acme.core.order.web",
    ]);
  });

  it("prefers a tight small group over a large one that simply has more edges", () => {
    const index = affinityIndex(input);
    const groups = [
      // Everything leans on this one, so its raw sum is the largest.
      { key: "big", name: "Common", members: ["com.acme.common.util", "com.acme.core.catalog.domain", "com.acme.core.catalog.service"] },
      { key: "small", name: "Orders", members: ["com.acme.core.order.service"] },
    ];
    const best = closestGroup(["com.acme.core.order.web"], groups, index);
    expect(best?.group.key).toBe("small");
  });
});

describe("the delimiter a codebase actually uses", () => {
  it("reads a dot from Java packages", () => {
    expect(detectSeparator(COMPONENTS)).toBe(".");
  });

  it("reads a backslash from PHP namespaces", () => {
    expect(detectSeparator(["App\\Http\\Controllers", "App\\Domain\\Order"])).toBe("\\");
  });

  it("reads a slash from a file tree, and keeps extensions whole", () => {
    const ids = ["src/app/order/service.ts", "src/app/order/model.ts", "src/app/catalog/model.ts"];
    const style = pathStyle(ids);
    expect(style.sep).toBe("/");
    expect(style.split("src/app/order/service.ts")).toEqual(["src", "app", "order", "service.ts"]);
    expect(underPath("src/app/order", ids, style)).toEqual(["src/app/order/model.ts", "src/app/order/service.ts"]);
  });

  it("reads a double colon from Rust paths", () => {
    expect(detectSeparator(["crate::order::domain", "crate::catalog::domain"])).toBe("::");
  });

  it("names and bundles in the codebase's own spelling", () => {
    const ids = ["App\\Domain\\Order\\Handler", "App\\Domain\\Order\\Repository", "App\\Domain\\Catalog\\Handler"];
    const style = pathStyle(ids);
    const bundles = bundleUnplaced(ids, () => 1, 10, style);
    expect(bundles[0].prefix).toBe("App\\Domain\\Order");
    expect(bundles[0].name).toBe("Order");
    expect(bundles[0].sep).toBe("\\");
  });

  it("never takes a branch by text alone", () => {
    // "core.orders" starts with "core.order" as text but is not under it.
    const ids = ["com.acme.core.order.web", "com.acme.core.orders.web"];
    expect(underPath("com.acme.core.order", ids)).toEqual(["com.acme.core.order.web"]);
  });
});

describe("splitting a question that is too coarse", () => {
  it("cuts a bundle into its branches", () => {
    const ids = ["com.acme.core.order.web", "com.acme.core.order.api", "com.acme.core.catalog.web", "com.acme.core.catalog.api"];
    const whole = { key: "k", groupKey: "com.acme.core", members: ids, prefix: "com.acme.core", name: "Core", reason: "", lines: 0, sep: ".", depth: 3 };
    const parts = splitBundle(whole, () => 1);
    expect(parts.map(p => p.name).sort()).toEqual(["Catalog", "Order"]);
    expect(parts[0].members.length).toBe(2);
  });

  it("descends past levels that would return the question unchanged", () => {
    const ids = ["com.acme.core.order.web", "com.acme.core.order.api"];
    const whole = { key: "k", groupKey: "com", members: ids, prefix: "com", name: "Com", reason: "", lines: 0, sep: ".", depth: 1 };
    const parts = splitBundle(whole, () => 1);
    expect(parts.length).toBe(2);
    expect(parts.every(p => p.members.length === 1)).toBe(true);
  });
});

describe("naming a hand-picked set", () => {
  it("names it after the deepest path they share", () => {
    expect(commonName(["com.acme.core.order.web", "com.acme.core.order.api"])).toBe("Order");
  });

  it("names a lone component after itself, not its package", () => {
    expect(commonName(["com.acme.core.order.web"])).toBe("Web");
  });

  it("names a branch after the branch, not the package above it", () => {
    // The branch node itself is in the take, so its parent must not win.
    const ids = ["org.acme.common.web", "org.acme.common.web.form", "org.acme.common.web.controller"];
    expect(commonName(ids)).toBe("Web");
  });

  it("falls back when they share nothing", () => {
    expect(commonName(["alpha.one", "beta.two"])).toBe("One");
  });
});

describe("the runners-up", () => {
  it("ranks every group a set could join, best first", () => {
    const index = affinityIndex(input);
    const groups = [
      { key: "order", name: "Order", members: ["com.acme.core.order.service"] },
      { key: "catalog", name: "Catalog", members: ["com.acme.core.catalog.domain"] },
    ];
    const ranked = rankGroups(["com.acme.core.order.web"], groups, index);
    expect(ranked[0].group.key).toBe("order");
    expect(ranked.length).toBeGreaterThan(0);
  });
})

describe("the way a dimension is cut", () => {
  function ctxOf(over: Partial<SignalSources>, ids: string[]) {
    const input = buildSuggestInput(sources(over), "component");
    const style = pathStyle(ids);
    return {
      units: new Map(input.units.map(u => [u.id, u])),
      laneLabels: input.laneLabels,
      index: affinityIndex(input),
      linesOf: () => 1,
      style,
    };
  }

  it("cuts by the role each thing plays when the framework says so", () => {
    const ids = ["com.acme.order.web", "com.acme.order.svc", "com.acme.catalog.web", "com.acme.catalog.svc"];
    const files = ids.map(c => ({ name: c + ".File", component: c }));
    const laneOfFile = new Map(files.map(f => [f.name, f.component!.endsWith(".web") ? "controller" : "service"]));
    const ctx = ctxOf({ components: ids, files, laneOfFile, laneLabels: { controller: "Controller", service: "Service" } }, ids);
    const bundles = bundleFor(wayById("lanes"), ids, ctx);
    expect(bundles.map(b => b.name).sort()).toEqual(["Controller", "Service"]);
    expect(bundles[0].members.length).toBe(2);
    expect(bundles[0].reason).toContain("role");
  });

  it("falls back to the word that turns up in many packages, not the one that names a domain", () => {
    const ids = ["com.acme.order.controller", "com.acme.order.model", "com.acme.catalog.controller", "com.acme.catalog.model"];
    const ctx = ctxOf({ components: ids, files: ids.map(c => ({ name: c + ".File", component: c })) }, ids);
    const bundles = bundleFor(wayById("role"), ids, ctx);
    // "order" lives in one package; "controller" spans two, so it is the role.
    expect(bundles.map(b => b.name).sort()).toEqual(["Controller", "Model"]);
  });

  it("cuts by the hands in the history when asked for ownership", () => {
    const ids = ["com.acme.order.web", "com.acme.catalog.web"];
    const files = ids.map(c => ({ name: c + ".File", component: c }));
    const authorsOfFile = new Map([[files[0].name, ["Ada"]], [files[1].name, ["Ada"]]]);
    const ctx = ctxOf({ components: ids, files, authorsOfFile }, ids);
    const bundles = bundleFor(wayById("authors"), ids, ctx);
    expect(bundles[0].name).toBe("Ada");
    expect(bundles[0].members.length).toBe(2);
  });

  it("refuses a basis that drops nearly everything in one bucket", () => {
    // Every component is "other" to the framework, but their names still
    // divide them: the lane basis says nothing, so the name basis must win.
    const ids = ["com.acme.order.controller", "com.acme.order.model", "com.acme.catalog.controller", "com.acme.catalog.model", "com.acme.billing.controller", "com.acme.billing.model"];
    const files = ids.map(c => ({ name: c + ".File", component: c }));
    const laneOfFile = new Map(files.map(f => [f.name, "other"]));
    const ctx = ctxOf({ components: ids, files, laneOfFile, laneLabels: { other: "Services & Other" } }, ids);
    expect(bestLayerKeying(ids, ctx)?.basis).toBe("names");
    expect(bundleFor(wayById("role"), ids, ctx).map(b => b.name).sort()).toEqual(["Controller", "Model"]);
  });

  it("prefers a basis whose groups have names over one that only has numbers", () => {
    // Three chains, so depth divides as evenly as the names do. A layer called
    // "Controller" is worth more to a person than one called "2 hops in".
    const ids = [
      "com.acme.order.controller", "com.acme.order.service", "com.acme.order.model",
      "com.acme.catalog.controller", "com.acme.catalog.service", "com.acme.catalog.model",
      "com.acme.billing.controller", "com.acme.billing.service", "com.acme.billing.model",
    ];
    const componentRefs = ["order", "catalog", "billing"].flatMap(d => [
      { from: `com.acme.${d}.controller`, to: `com.acme.${d}.service`, references: 5 },
      { from: `com.acme.${d}.service`, to: `com.acme.${d}.model`, references: 5 },
    ]);
    const ctx = ctxOf({ components: ids, files: ids.map(c => ({ name: c + ".File", component: c })), componentRefs }, ids);
    expect(bestLayerKeying(ids, ctx)?.basis).toBe("names");
    expect(bundleFor(wayById("role"), ids, ctx).map(b => b.name).sort()).toEqual(["Controller", "Model", "Service"]);
  });

  it("says plainly when a snapshot cannot support a way", () => {
    const ids = ["com.acme.order.web"];
    const ctx = ctxOf({ components: ids, files: ids.map(c => ({ name: c + ".File", component: c })) }, ids);
    const owner = fitnessOf(wayById("authors"), ctx.units, false);
    expect(owner.ok).toBe(false);
    expect(owner.why).toContain("git history");
    expect(fitnessOf(wayById("subject"), ctx.units, false).ok).toBe(true);
  });

  it("means something different by close for each way", () => {
    expect(wayById("lanes").weights.references).toBeLessThan(0);
    expect(wayById("lanes").weights.lanes).toBeGreaterThan(0);
    expect(wayById("authors").weights.authors).toBeGreaterThan(wayById("subject").weights.authors ?? 0);
  });
})

describe("questions worth asking", () => {
  it("does not cut a flat package into a question per component", () => {
    // Forty siblings directly under one package: splitting by the next segment
    // would make forty questions of one, which is no better than a list.
    const ids = Array.from({ length: 40 }, (_, i) => `com.elepy.thing${i}`);
    const bundles = bundleUnplaced(ids, () => 1, 10);
    expect(bundles.length).toBe(1);
    expect(bundles[0].members.length).toBe(40);
    expect(bundles[0].name).toBe("Elepy");
    // It can still be cut apart deliberately.
    expect(splitBundle(bundles[0], () => 1).length).toBe(40);
  });

  it("still cuts a package that has real branches", () => {
    const ids = [
      ...Array.from({ length: 6 }, (_, i) => `com.acme.order.a${i}`),
      ...Array.from({ length: 6 }, (_, i) => `com.acme.catalog.b${i}`),
    ];
    const bundles = bundleUnplaced(ids, () => 1, 10);
    expect(bundles.map(b => b.name).sort()).toEqual(["Catalog", "Order"]);
  });
})

describe("what a group pulls in", () => {
  it("divides a flat namespace by its ties when the path cannot", () => {
    // Twenty siblings directly under one package, tied in pairs.
    const ids = Array.from({ length: 20 }, (_, i) => `com.flat.p${i}`);
    const componentRefs = [];
    for (let i = 0; i < 20; i += 2) componentRefs.push({ from: ids[i], to: ids[i + 1], references: 9 });
    const built = buildSuggestInput(sources({ components: ids, files: ids.map(c => ({ name: c + ".File", component: c })), componentRefs }), "component");
    const ctx = { units: new Map(built.units.map(u => [u.id, u])), laneLabels: {}, index: affinityIndex(built), linesOf: () => 1, style: pathStyle(ids) };
    const bundles = bundleFor(wayById("subject"), ids, ctx);
    expect(bundles.length).toBeGreaterThan(1);
    expect(Math.max(...bundles.map(b => b.members.length))).toBeLessThanOrEqual(12);
  });
})

describe("what each way is made of", () => {
  it("lets only a horizontal reading divide a package", () => {
    // A package belongs to one domain, one team and one release train, so
    // dividing it there would be a lie about the codebase. Cutting across is
    // the one question a single package answers two ways at once: it
    // routinely holds a controller and the repository that controller calls.
    // Three readings ask that question -- the role in the name, the framework
    // role, and distance from the entry points -- and no other may.
    const divide = WAYS.filter(w => w.grain === "file").map(w => w.id).sort();
    expect(divide).toEqual(["depth", "lanes", "role"]);
    for (const w of WAYS) {
      expect(w.grain === "file").toBe(w.cut === "horizontal");
    }
  });

  it("says both grains in the architect's words, not the model's", () => {
    for (const g of ["component", "file"] as const) {
      expect(GRAIN[g].label.length).toBeGreaterThan(0);
      // The consequence is what makes the choice legible, so neither may be
      // left to the reader to infer from the label.
      expect(GRAIN[g].consequence.length).toBeGreaterThan(20);
    }
  });
});

describe("naming a group made from a query", () => {
  const IDS = [
    "org.broadleafcommerce.core.catalog.controller",
    "org.broadleafcommerce.core.order.controller",
    "org.broadleafcommerce.openadmin.web.controller",
  ];

  it("names a suffix pattern after the suffix, not after what the members share", () => {
    // commonName answers with the shared head, which for these is the whole
    // company: seven controllers filed under "Broadleafcommerce".
    expect(commonName(IDS)).toBe("Broadleafcommerce");
    expect(nameForQuery("**.controller", IDS)).toBe("Controller");
  });

  it("still names a branch after the branch", () => {
    expect(nameForQuery("com.fedex.qp.embargo.**", ["com.fedex.qp.embargo.a"])).toBe("Embargo");
  });

  it("asks the members when the query is more than one plain pattern", () => {
    expect(nameForQuery("**.controller\n**.rest", IDS)).toBe("Broadleafcommerce");
    expect(nameForQuery("**.controller where lines > 100", IDS)).toBe("Broadleafcommerce");
    expect(nameForQuery("**", IDS)).toBe("Broadleafcommerce");
  });
});

describe("the domain cut reads how the codebase is laid out", () => {
  // Layer-first: every layer holds a slice of every domain, so no prefix
  // means "catalog" and the only thing the domains share is a word that
  // moves. This is nopCommerce's shape, and Sylius's, and django-oscar's.
  const LAYERED = [
    "Nop.Core.Domain.Catalog", "Nop.Services.Catalog", "Nop.Web.Areas.Admin.Models.Catalog",
    "Nop.Core.Domain.Orders", "Nop.Services.Orders", "Nop.Web.Areas.Admin.Models.Orders",
    "Nop.Core.Domain.Shipping", "Nop.Services.Shipping", "Nop.Web.Areas.Admin.Models.Shipping",
  ];
  const layeredRefs = [
    { from: "Nop.Services.Catalog", to: "Nop.Core.Domain.Catalog", references: 30 },
    { from: "Nop.Web.Areas.Admin.Models.Catalog", to: "Nop.Services.Catalog", references: 25 },
    { from: "Nop.Services.Orders", to: "Nop.Core.Domain.Orders", references: 28 },
    { from: "Nop.Web.Areas.Admin.Models.Orders", to: "Nop.Services.Orders", references: 22 },
    { from: "Nop.Services.Shipping", to: "Nop.Core.Domain.Shipping", references: 20 },
  ];
  function ctxFor(components: string[], componentRefs: SignalSources["componentRefs"]) {
    const built = buildSuggestInput(sources({ components, componentRefs }), "component");
    const refs = affinityIndex(built, { references: 1 });
    return { units: new Map(built.units.map(u => [u.id, u])), laneLabels: {}, index: refs, refs, linesOf: () => 1, style: pathStyle(components) };
  }

  it("groups a layer-first codebase by the subject, across the layers", () => {
    const ctx = ctxFor(LAYERED, layeredRefs);
    const bundles = bundleFor(wayById("subject"), LAYERED, ctx);
    const names = bundles.map(b => b.name).sort();
    expect(names).toEqual(["Catalog", "Orders", "Shipping"]);
    // The point of the whole thing: one group holds all three layers.
    const catalog = bundles.find(b => b.name === "Catalog")!;
    expect(catalog.members).toEqual(["Nop.Core.Domain.Catalog", "Nop.Services.Catalog", "Nop.Web.Areas.Admin.Models.Catalog"]);
  });

  it("says it read the names, and where the word was found", () => {
    const ctx = ctxFor(LAYERED, layeredRefs);
    const catalog = bundleFor(wayById("subject"), LAYERED, ctx).find(b => b.name === "Catalog")!;
    expect(catalog.reason).toContain("all named catalog");
    expect(catalog.reason).toContain("different places in the tree");
    expect(domainBasisOf(LAYERED, ctx).basis).toBe("subject");
  });

  // Domain-first: the tree already holds the domains and it is the roles
  // that move instead, so reading the names for a floating word finds the
  // layers. This is the FedEx microservice workspace's shape.
  const DOMAIN_FIRST = [
    "com.fedex.qp.booking.service", "com.fedex.qp.booking.dao", "com.fedex.qp.booking.dto",
    "com.fedex.qp.rates.service", "com.fedex.qp.rates.dao", "com.fedex.qp.rates.dto",
    "com.fedex.qp.audit.service", "com.fedex.qp.audit.dao", "com.fedex.qp.audit.dto",
  ];
  const domainFirstRefs = [
    { from: "com.fedex.qp.booking.service", to: "com.fedex.qp.booking.dao", references: 40 },
    { from: "com.fedex.qp.booking.dao", to: "com.fedex.qp.booking.dto", references: 38 },
    { from: "com.fedex.qp.rates.service", to: "com.fedex.qp.rates.dao", references: 36 },
    { from: "com.fedex.qp.rates.dao", to: "com.fedex.qp.rates.dto", references: 34 },
    { from: "com.fedex.qp.audit.service", to: "com.fedex.qp.audit.dao", references: 32 },
    { from: "com.fedex.qp.audit.dao", to: "com.fedex.qp.audit.dto", references: 30 },
  ];

  it("keeps the package tree when the tree already holds the domains", () => {
    const ctx = ctxFor(DOMAIN_FIRST, domainFirstRefs);
    // Detection is what offers a default now that the architect picks the
    // reading, so it is asked directly.
    expect(domainBasisOf(DOMAIN_FIRST, ctx).basis).toBe("tree");
    const names = bundleFor(wayById("tree"), DOMAIN_FIRST, ctx).map(b => b.name).sort();
    // Not Service, Dao and Dto, which is what reading the names would give.
    expect(names).toEqual(["Audit", "Booking", "Rates"]);
  });

  it("reads one subject out of two spellings of it", () => {
    // Sylius calls the same domain Order in one tree and OrderBundle in
    // another. Split on the case change they are one subject; left whole
    // they are two that never meet.
    const ids = [
      "Sylius.Component.Order.Model", "Sylius.Component.Order.Repository",
      "Sylius.Bundle.OrderBundle.Form", "Sylius.Bundle.ApiBundle.Shop.Order",
      "Sylius.Component.Payment.Model", "Sylius.Bundle.PaymentBundle.Form",
      "Sylius.Bundle.ApiBundle.Shop.Payment",
    ];
    const refs = [
      { from: "Sylius.Bundle.OrderBundle.Form", to: "Sylius.Component.Order.Model", references: 20 },
      { from: "Sylius.Bundle.ApiBundle.Shop.Order", to: "Sylius.Component.Order.Repository", references: 18 },
      { from: "Sylius.Bundle.PaymentBundle.Form", to: "Sylius.Component.Payment.Model", references: 15 },
      { from: "Sylius.Bundle.ApiBundle.Shop.Payment", to: "Sylius.Component.Payment.Model", references: 12 },
    ];
    const ctx = ctxFor(ids, refs);
    const order = bundleFor(wayById("subject"), ids, ctx).find(b => b.name === "Order")!;
    expect(order.members).toContain("Sylius.Component.Order.Model");
    expect(order.members).toContain("Sylius.Bundle.OrderBundle.Form");
  });
});

describe("the readings on offer", () => {
  it("names each one for the evidence it reads, not the result hoped for", () => {
    // "Domain" and "Layer" named an outcome and hid the method, which is how
    // one label came to cover two opposite readings and pick between them in
    // silence. No reading may be named after what it is hoped to produce.
    const outcomes = ["domain", "layer", "module", "team", "free"];
    for (const way of WAYS) {
      expect(outcomes).not.toContain(way.label.toLowerCase());
      expect(way.hint.length).toBeGreaterThan(20);
    }
  });

  it("gives every reading its own settings, so none is an alias of another", () => {
    const presets = WAYS.map(w => w.preset);
    expect(new Set(presets).size).toBe(WAYS.length);
    for (const way of WAYS) expect(presetById(way.preset).id).toBe(way.preset);
  });

  it("groups them by what they go on", () => {
    for (const way of WAYS) expect(READS[way.reads]).toBeTruthy();
    // Every heading offered must have something under it.
    const used = new Set(WAYS.map(w => w.reads));
    for (const reads of Object.keys(READS)) expect(used.has(reads as keyof typeof READS)).toBe(true);
  });

  it("offers both name readings, because a codebase needs one or the other", () => {
    // The tree holds the domains in one codebase and the layers in the next;
    // reading the names finds the subject in the second and the layers in the
    // first. Both have to be reachable by hand.
    expect(WAYS.map(w => w.id)).toContain("tree");
    expect(WAYS.map(w => w.id)).toContain("subject");
    expect(wayById("tree").reads).toBe("names");
    expect(wayById("subject").reads).toBe("names");
  });
});
