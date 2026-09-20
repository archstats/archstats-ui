import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { componentMembers, fileMembers, parseGroups, units, useGroupsStore } from "./groups";
import { useDataStore } from "./data";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
    data,
  };
}

const SNAPSHOT_FILES = [
  { name: "audit/AuditController.java", component: "audit" },
  { name: "audit/AuditService.java", component: "audit" },
  { name: "audit/AuditRepo.java", component: "audit" },
  { name: "billing/BillingController.java", component: "billing" },
  { name: "billing/BillingService.java", component: "billing" },
  { name: "README.md", component: null },
];

describe("groups store", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    setActivePinia(createPinia());
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const data = useDataStore();
    (data as any)._fileComponents = SNAPSHOT_FILES;
  });

  it("migrates the old two-list shape into typed members", () => {
    const groups = parseGroups({
      componentGroups: [{ id: "a", name: "Audits", members: ["audit"], color: "hsl(1, 1%, 1%)", createdAt: 1 }],
      fileGroups: [{ id: "b", name: "Controllers", members: ["audit/AuditController.java"], color: "hsl(2, 2%, 2%)", createdAt: 2, dimension: "Layer" }],
    });
    expect(groups.map(g => g.id)).toEqual(["a", "b"]);
    expect(componentMembers(groups[0])).toEqual(["audit"]);
    expect(fileMembers(groups[1])).toEqual(["audit/AuditController.java"]);
    expect(groups[0].dimension).toBe("Ad hoc");
    expect(groups[1].dimension).toBe("Layer");
  });

  it("persists in the new shape and reloads it", () => {
    const store = useGroupsStore();
    store.initForProject("p1");
    store.createGroup("Mixed", [...units("component", ["audit"]), ...units("file", ["billing/BillingController.java"])], "Domain");
    const raw = JSON.parse(storage.data["archstats-groups-p1"]);
    expect(raw.version).toBe(4);
    expect(raw.groups[0].members).toEqual([
      { kind: "component", name: "audit" },
      { kind: "file", name: "billing/BillingController.java" },
    ]);
    setActivePinia(createPinia());
    (useDataStore() as any)._fileComponents = SNAPSHOT_FILES;
    const again = useGroupsStore();
    again.initForProject("p1");
    expect(again.groups).toHaveLength(1);
    expect(again.groups[0].dimension).toBe("Domain");
  });

  it("resolves a mixed group to files and to components with coverage", () => {
    const store = useGroupsStore();
    store.initForProject("p2");
    const g = store.createGroup("Mixed", [...units("component", ["audit"]), ...units("file", ["billing/BillingController.java", "README.md"])]);
    expect(Array.from(store.filesOf(g)).sort()).toEqual([
      "README.md",
      "audit/AuditController.java",
      "audit/AuditRepo.java",
      "audit/AuditService.java",
      "billing/BillingController.java",
    ]);
    const cov = store.componentsOf(g);
    expect(cov.get("audit")).toEqual({ files: 3, total: 3, full: true });
    expect(cov.get("billing")).toEqual({ files: 1, total: 2, full: false });
    expect(store.componentGroupIndex.get("billing")?.map(x => x.id)).toEqual([g.id]);
    expect(store.fileGroupIndex.get("audit/AuditRepo.java")?.map(x => x.id)).toEqual([g.id]);
    expect(store.directGroupsOf("component", "billing")).toEqual([]);
    expect(store.directGroupsOf("file", "README.md").map(x => x.id)).toEqual([g.id]);
  });

  it("treats every file of a component listed one by one as full coverage", () => {
    const store = useGroupsStore();
    store.initForProject("p3");
    const g = store.createGroup("All of billing", units("file", ["billing/BillingController.java", "billing/BillingService.java"]));
    expect(store.coverage(g, "billing")).toEqual({ files: 2, total: 2, full: true });
  });

  it("adds and removes members without duplicates", () => {
    const store = useGroupsStore();
    store.initForProject("p4");
    const g = store.createGroup("G", units("component", ["audit"]));
    store.addMembersToGroup(g.id, [...units("component", ["audit", "billing"]), ...units("file", ["README.md"])]);
    expect(store.getGroupById(g.id)!.members).toHaveLength(3);
    store.removeMembersFromGroup(g.id, units("component", ["audit"]));
    expect(componentMembers(store.getGroupById(g.id)!)).toEqual(["billing"]);
    expect(fileMembers(store.getGroupById(g.id)!)).toEqual(["README.md"]);
  });

  it("buckets groups by dimension with the default first", () => {
    const store = useGroupsStore();
    store.initForProject("p5");
    store.createGroup("Layer A", [], "Layer");
    store.createGroup("Plain", []);
    expect(store.groupsByDimension.map(b => b.dimension)).toEqual(["Layer", "Ad hoc"]);
    expect(store.dimensions).toEqual(["Layer", "Ad hoc"]);
  });

  it("keeps dimensions as records with their own colour cursor and cut", () => {
    const store = useGroupsStore();
    store.initForProject("p6");
    const a = store.createGroup("A1", [], "Domain");
    const b = store.createGroup("B1", [], "Layer");
    expect(store.dimensionOf("Domain")?.order).toBe(0);
    expect(store.dimensionOf("Layer")?.order).toBe(1);
    // Two dimensions start on different hues, so their first groups differ.
    expect(a.color).not.toBe(b.color);
    store.updateDimension("Layer", { cut: "horizontal" });
    expect(store.dimensionOf("Layer")?.cut).toBe("horizontal");
    store.renameDimension("Layer", "Layers");
    expect(store.dimensions).toEqual(["Domain", "Layers"]);
    expect(store.getGroupById(b.id)?.dimension).toBe("Layers");
    store.deleteDimension("Domain");
    expect(store.dimensions).toEqual(["Layers"]);
    expect(store.getGroupById(a.id)).toBeUndefined();
    const raw = JSON.parse(storage.data["archstats-groups-p6"]);
    expect(raw.version).toBe(4);
    expect(raw.dimensions.map((d: any) => d.name)).toEqual(["Layers"]);
  });

  it("renaming a dimension onto another merges them", () => {
    const store = useGroupsStore();
    store.initForProject("p7");
    store.createGroup("A", [], "Domain");
    store.createGroup("B", [], "Domains");
    store.renameDimension("Domains", "Domain");
    expect(store.dimensions).toEqual(["Domain"]);
    expect(store.groups.every(g => g.dimension === "Domain")).toBe(true);
  });

  // ── Groups defined by a query ───────────────────────────────────────

  it("a live group is the answer to its query, not a list", () => {
    const store = useGroupsStore();
    store.initForProject("q1");
    const g = store.createGroup("Audit", [], "Domain");
    store.setQuery(g.id, "audit", "live");
    expect(componentMembers(store.getGroupById(g.id)!)).toEqual([]);
    // Membership comes from the snapshot, so it survives being written down wrong.
    expect(Array.from(store.componentsOf(store.getGroupById(g.id)!).keys())).toEqual(["audit"]);
    expect(store.filesOf(store.getGroupById(g.id)!).size).toBe(3);
  });

  it("a live group follows the snapshot when a rename moves things", () => {
    const store = useGroupsStore();
    store.initForProject("q2");
    const g = store.createGroup("Everything", [], "Domain");
    store.setQuery(g.id, "**", "live");
    expect(Array.from(store.componentsOf(store.getGroupById(g.id)!).keys()).sort()).toEqual(["audit", "billing"]);
  });

  it("a fixed group keeps its members and its provenance", () => {
    const store = useGroupsStore();
    store.initForProject("q3");
    const g = store.createGroup("God Components", units("component", ["audit"]), "Hotspots");
    store.setQuery(g.id, "components where lines > 2000", "fixed");
    const saved = store.getGroupById(g.id)!;
    expect(saved.mode).toBe("fixed");
    expect(saved.foundBy?.query).toBe("components where lines > 2000");
    // The query is a watchlist, not the definition: membership did not move.
    expect(componentMembers(saved)).toEqual(["audit"]);
  });

  it("carries a query across a save and a reload", () => {
    const store = useGroupsStore();
    store.initForProject("q4");
    const g = store.createGroup("Audit", [], "Domain");
    store.setQuery(g.id, "audit", "live");
    const fresh = useGroupsStore();
    fresh.$reset();
    fresh.initForProject("q4");
    const back = fresh.groups.find(x => x.name === "Audit")!;
    expect(back.query).toBe("audit");
    expect(back.mode).toBe("live");
  });

  it("reads a group written before queries existed as fixed, and keeps the old payload", () => {
    const old = JSON.stringify({
      version: 3,
      groups: [{ id: "g1", name: "Audit", members: [{ kind: "component", name: "audit" }], color: "hsl(1,1%,1%)", createdAt: 1, dimension: "Domain" }],
      dimensions: [{ name: "Domain", cut: "free", order: 0, hue: 0, description: "", createdAt: 1 }],
    });
    storage.data["archstats-groups-q5"] = old;
    const store = useGroupsStore();
    store.initForProject("q5");
    const g = store.groups[0];
    // We do not know how it was made, so inventing a query for it would
    // silently rewrite a decision somebody took.
    expect(g.mode).toBe("fixed");
    expect(g.query).toBeUndefined();
    expect(componentMembers(g)).toEqual(["audit"]);
    expect(storage.data["archstats-groups-q5-v3"]).toBe(old);
  });

  // ── What a lens is worth ────────────────────────────────────────────

  it("reports a query that has stopped matching instead of quietly shrinking", () => {
    const store = useGroupsStore();
    store.initForProject("h1");
    const g = store.createGroup("Audit", [], "Domain");
    // What a rename looks like on the next scan.
    store.setQuery(g.id, "audit\nshipping_docs", "live");
    const health = store.lensHealth("Domain");
    expect(health.silent).toHaveLength(1);
    expect(health.silent[0].lines).toEqual([2]);
  });

  it("names the components two groups both claim, without stopping either", () => {
    const store = useGroupsStore();
    store.initForProject("h2");
    const a = store.createGroup("All", [], "Domain");
    const b = store.createGroup("Audit", [], "Domain");
    store.setQuery(a.id, "**", "live");
    store.setQuery(b.id, "audit", "live");
    const health = store.lensHealth("Domain");
    expect(health.overlaps.map(o => o.id)).toEqual(["audit"]);
    expect(health.overlaps[0].groups.sort()).toEqual(["All", "Audit"]);
    // Both groups still exist and still hold what they hold.
    expect(health.groups).toBe(2);
  });

  it("offers what a frozen group's query would catch now, and adds nothing", () => {
    const store = useGroupsStore();
    store.initForProject("h3");
    const g = store.createGroup("Audit", units("component", ["audit"]), "Domain");
    // A watchlist wider than what was agreed to.
    store.setQuery(g.id, "**", "fixed");
    store.updateGroup(g.id, { members: units("component", ["audit"]) });
    const health = store.lensHealth("Domain");
    expect(health.candidates).toHaveLength(1);
    expect(health.candidates[0].extra).toBe(1);
    expect(componentMembers(store.getGroupById(g.id)!)).toEqual(["audit"]);
  });
});
