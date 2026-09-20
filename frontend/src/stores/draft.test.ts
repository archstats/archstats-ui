import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDraftStore } from "./draft";
import { useDataStore } from "./data";
import { componentMembers, fileMembers, units, useGroupsStore } from "./groups";
import { wayById } from "~/utils/studio";

const FILES = [
  { name: "audit/A1.java", component: "audit" }, { name: "audit/A2.java", component: "audit" }, { name: "audit/A3.java", component: "audit" },
  { name: "pay/P1.java", component: "pay" }, { name: "pay/P2.java", component: "pay" },
];

describe("draft store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const mem: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    (useDataStore() as any)._fileComponents = FILES;
    useGroupsStore().initForProject("p");
  });

  it("moves whole components and splits on file moves, then makes them whole again", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.setGrain("file");
    draft.fromSuggestions("Domain", [
      { key: "a", name: "Audits", parts: [{ component: "audit", files: null, total: 3 }], components: ["audit"], reasons: [], units: 3, split: 0 },
      { key: "b", name: "Payments", parts: [{ component: "pay", files: null, total: 2 }], components: ["pay"], reasons: [], units: 2, split: 0 },
    ]);
    draft.move("audit", ["audit/A3.java"], "b");
    expect(draft.groupByKey("a")!.parts).toEqual([{ component: "audit", files: ["audit/A1.java", "audit/A2.java"], standing: "confirmed" }]);
    expect(draft.groupByKey("b")!.parts).toEqual([
      { component: "pay", files: null, standing: "proposed" },
      { component: "audit", files: ["audit/A3.java"], standing: "confirmed" },
    ]);
    expect(draft.splitCount).toBe(1);
    draft.move("audit", ["audit/A1.java", "audit/A2.java"], "b");
    expect(draft.groupByKey("a")!.parts).toEqual([]);
    expect(draft.groupByKey("b")!.parts.find(p => p.component === "audit")).toEqual({ component: "audit", files: null, standing: "confirmed" });
    draft.move("pay", null, null);
    expect(draft.partsOfComponent.has("pay")).toBe(false);
    expect(draft.dirty).toBe(true);
  });

  it("draws a split component in the group holding most of it and reports placed units per grain", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.setGrain("file");
    draft.fromSuggestions("Domain", [
      { key: "a", name: "A", parts: [{ component: "audit", files: ["audit/A1.java", "audit/A2.java"], total: 3 }], components: ["audit"], reasons: [], units: 2, split: 1 },
      { key: "b", name: "B", parts: [{ component: "audit", files: ["audit/A3.java"], total: 3 }, { component: "pay", files: null, total: 2 }], components: ["pay"], reasons: [], units: 3, split: 1 },
    ]);
    expect(draft.drawComponents.get("a")).toEqual(["audit"]);
    expect(draft.drawComponents.get("b")).toEqual(["pay"]);
    expect(draft.placedUnits("component").get("audit")).toBe("a");
    const files = draft.placedUnits("file");
    expect(files.get("audit/A3.java")).toBe("b");
    expect(files.get("pay/P1.java")).toBe("b");
  });

  it("saves the draft as groups, updating loaded ones and deleting dropped ones", () => {
    const groups = useGroupsStore();
    const old = groups.createGroup("Old audits", units("component", ["audit"]), "Domain");
    const gone = groups.createGroup("Gone", units("component", ["pay"]), "Domain");
    const draft = useDraftStore();
    draft.load("ws");
    draft.fromDimension("Domain");
    draft.setGrain("file");
    expect(draft.groups.map(g => g.name)).toEqual(["Old audits", "Gone"]);
    draft.rename("g:" + old.id, "Audits");
    draft.dropGroup("g:" + gone.id);
    const key = draft.addGroup("Payments");
    draft.move("pay", ["pay/P1.java"], key);
    draft.commit();
    expect(draft.isOpen).toBe(false);
    const audits = groups.getGroupById(old.id)!;
    expect(audits.name).toBe("Audits");
    expect(componentMembers(audits)).toEqual(["audit"]);
    expect(groups.getGroupById(gone.id)).toBeUndefined();
    const payments = groups.groups.find(g => g.name === "Payments")!;
    expect(payments.dimension).toBe("Domain");
    expect(fileMembers(payments)).toEqual(["pay/P1.java"]);
  });

  it("keeps locks across a refresh from suggestions and survives a reload", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.fromSuggestions("Domain", [{ key: "a", name: "A", parts: [{ component: "audit", files: null, total: 3 }], components: ["audit"], reasons: ["r"], units: 3, split: 0 }]);
    draft.toggleLock("a");
    draft.fromSuggestions("Domain", [{ key: "a", name: "A again", parts: [{ component: "audit", files: null, total: 3 }], components: ["audit"], reasons: [], units: 3, split: 0 }]);
    expect(draft.groupByKey("a")!.locked).toBe(true);
    setActivePinia(createPinia());
    (useDataStore() as any)._fileComponents = FILES;
    const again = useDraftStore();
    again.load("ws");
    expect(again.isOpen).toBe(true);
    expect(again.groupByKey("a")!.name).toBe("A again");
  });

  it("sorts by assigning, refusing and parking, and can always step back", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.startNew("Domain");
    const a = draft.addGroup("Audits");
    draft.assign(["audit", "pay"], a);
    expect(draft.groupByKey(a)!.parts.map(p => p.component)).toEqual(["audit", "pay"]);
    expect(draft.standingCounts).toEqual({ confirmed: 2, proposed: 0 });

    draft.refuse(["pay"], a);
    expect(draft.groupByKey(a)!.parts.map(p => p.component)).toEqual(["audit"]);
    expect(draft.refusedFor(a).has("pay")).toBe(true);

    draft.park(["pay"], "out");
    expect(draft.out).toEqual(["pay"]);
    expect(draft.parked.has("pay")).toBe(true);

    draft.undo();
    expect(draft.out).toEqual([]);
    draft.undo();
    expect(draft.groupByKey(a)!.parts.map(p => p.component)).toEqual(["audit", "pay"]);
  });

  it("counts what the engine proposed against what a person stood behind", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.fromSuggestions("Domain", [
      { key: "s1", name: "A", parts: [{ component: "audit", files: null, total: 3 }], components: ["audit"], reasons: [], units: 3, split: 0 },
    ]);
    expect(draft.standingCounts).toEqual({ confirmed: 0, proposed: 1 });
    draft.confirmStanding();
    expect(draft.standingCounts).toEqual({ confirmed: 1, proposed: 0 });
  });
});

describe("the lap", () => {
  it("turns over, counts the lap, and survives a reload", () => {
    const draft = useDraftStore();
    draft.load("lap-test");
    draft.startNew("Domain");
    draft.park(["a", "b"], "later");
    expect(draft.round).toBe(1);
    expect(draft.reshuffle()).toBe(2);
    expect(draft.later).toEqual([]);
    expect(draft.round).toBe(2);

    // A fresh store reading the same key sees the same lap.
    const reloaded = useDraftStore();
    reloaded.load("lap-test");
    expect(reloaded.round).toBe(2);
  });

  it("reshuffles nothing when nothing was set aside", () => {
    const draft = useDraftStore();
    draft.load("lap-empty");
    draft.startNew("Domain");
    expect(draft.reshuffle()).toBe(0);
    expect(draft.round).toBe(1);
  });
})

describe("merging groups, the commonest edit after a first pass", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const mem: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } });
    (useDataStore() as any)._fileComponents = FILES;
    useGroupsStore().initForProject("p");
  });

  it("folds members in, keeps the name someone chose, and steps back in one", () => {
    const draft = useDraftStore();
    draft.load("m1");
    draft.startNew("Domain");
    const a = draft.addGroup("Group A");
    const b = draft.addGroup("Payments");
    draft.assign(["audit"], a);
    draft.assign(["pay"], b);

    draft.merge([a, b], a);
    // Merged into the placeholder, but a name a person chose outranks one the
    // engine reached for — otherwise a first pass's "Group A" would swallow
    // every real name it touched.
    expect(draft.groups).toHaveLength(1);
    expect(draft.groupByKey(a)!.name).toBe("Payments");
    expect(draft.groupByKey(a)!.parts.map(p => p.component).sort()).toEqual(["audit", "pay"]);

    draft.undo();
    expect(draft.groups.map(g => g.name).sort()).toEqual(["Group A", "Payments"]);
  });

  it("keeps the name that was chosen, even when the other side is bigger", () => {
    // The target is the architect's answer to "keep which name?", so nothing
    // may overrule it. Payments holds every member and Audits holds none, and
    // the merge is still called Audits, because that is what was asked for.
    const draft = useDraftStore();
    draft.load("m2");
    draft.startNew("Domain");
    const a = draft.addGroup("Audits");
    const b = draft.addGroup("Payments");
    draft.assign(["audit", "pay"], b);
    draft.merge([a, b], a);
    expect(draft.groupByKey(a)!.name).toBe("Audits");
    expect(draft.groupByKey(a)!.parts).toHaveLength(2);
  });

  it("leaves a way back, because a merge is an edit like any other", () => {
    const draft = useDraftStore();
    draft.load("m6");
    draft.startNew("Domain");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.assign(["pay"], b);
    draft.merge([a, b], a);
    expect(draft.canUndo).toBe(true);
    draft.undo();
    expect(draft.groups).toHaveLength(2);
  });

  it("makes a component whole again when its two halves land in one group", () => {
    const draft = useDraftStore();
    draft.load("m3");
    draft.startNew("Domain");
    draft.setGrain("file");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.move("audit", ["audit/A3.java"], b);
    expect(draft.splitCount).toBe(1);

    draft.merge([a, b], a);
    // Split across two groups, then both groups become one: it is not a part
    // of anything any more, and nothing downstream should still say it is.
    expect(draft.splitCount).toBe(0);
    expect(draft.groupByKey(a)!.parts).toEqual([{ component: "audit", files: null, standing: "confirmed" }]);
  });

  it("carries refusals across, except the ones the merge itself answers", () => {
    const draft = useDraftStore();
    draft.load("m4");
    draft.startNew("Domain");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["pay"], b);
    // "pay is not an A" was a real decision — but it is about to be one.
    draft.refuse(["pay"], a);
    draft.refuse(["audit"], b);
    expect(draft.refusedFor(a).has("pay")).toBe(true);

    draft.merge([a, b], a);
    expect(draft.refusedFor(a).has("pay")).toBe(false);
    // The other refusal was never answered, so it survives the group that held it.
    expect(draft.refusedFor(a).has("audit")).toBe(true);
    expect(draft.refused[b]).toBeUndefined();
  });

  it("does nothing when there is nothing to fold", () => {
    const draft = useDraftStore();
    draft.load("m5");
    draft.startNew("Domain");
    const a = draft.addGroup("A");
    const steps = draft.past.length;
    draft.merge([a], a);
    expect(draft.groups).toHaveLength(1);
    // No fold, so no undo step was spent on it.
    expect(draft.past.length).toBe(steps);
  });
});

describe("the grain: what a dimension is made of", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const mem: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } });
    (useDataStore() as any)._fileComponents = FILES;
    useGroupsStore().initForProject("p");
  });

  it("cannot divide a component while it is made of whole ones", () => {
    // The lock is here rather than in the buttons: no caller, no keystroke and
    // no restored draft can leave a part behind at component grain.
    const draft = useDraftStore();
    draft.load("g1");
    draft.startNew("Domain");
    expect(draft.grain).toBe("component");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);

    draft.move("audit", ["audit/A3.java"], b);
    // Asking for one file is read as what it plainly means: move the component.
    expect(draft.groupByKey(a)!.parts).toEqual([]);
    expect(draft.groupByKey(b)!.parts).toEqual([{ component: "audit", files: null, standing: "confirmed" }]);
    expect(draft.splitCount).toBe(0);
  });

  it("rejoins into the group holding most of a component, and undo brings the parts back", () => {
    const draft = useDraftStore();
    draft.load("g2");
    draft.startNew("Domain");
    draft.setGrain("file");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.move("audit", ["audit/A3.java"], b);
    expect(draft.splitCount).toBe(1);

    draft.setGrain("component");
    // A holds two of the three files, so the whole component lands in A.
    expect(draft.splitCount).toBe(0);
    expect(draft.groupByKey(a)!.parts).toEqual([{ component: "audit", files: null, standing: "confirmed" }]);
    expect(draft.groupByKey(b)!.parts).toEqual([]);

    draft.undo();
    expect(draft.grain).toBe("file");
    expect(draft.splitCount).toBe(1);
  });

  it("takes its grain from the way, until work or a choice says otherwise", () => {
    const draft = useDraftStore();
    draft.load("g3");
    draft.startNew("Domain");
    draft.followWay(wayById("layer"));
    expect(draft.grain).toBe("file");
    draft.followWay(wayById("domain"));
    expect(draft.grain).toBe("component");

    // Chosen by hand, the way stops deciding.
    draft.setGrain("file");
    draft.followWay(wayById("domain"));
    expect(draft.grain).toBe("file");

    // And the override can be released: asking for what the way already wants
    // is agreement, not an override, so the way goes back to deciding. Without
    // this the first hand-pick silences the way for the life of the draft.
    draft.setGrain("component", false);
    expect(draft.grainByHand).toBe(false);
    draft.followWay(wayById("layer"));
    expect(draft.grain).toBe("file");
  });

  it("never rejoins work behind your back when the way changes", () => {
    const draft = useDraftStore();
    draft.load("g4");
    draft.startNew("Layer");
    draft.setGrain("file", false);
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.move("audit", ["audit/A3.java"], b);

    // Switching to a way made of whole components would undo a real decision,
    // so the way defers and the toolbar keeps saying what is true.
    draft.followWay(wayById("domain"));
    expect(draft.grain).toBe("file");
    expect(draft.splitCount).toBe(1);
  });

  it("reads its grain off a restored draft rather than trusting what was stored", () => {
    const draft = useDraftStore();
    draft.load("g5");
    draft.startNew("Domain");
    draft.setGrain("file");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.move("audit", ["audit/A3.java"], b);

    setActivePinia(createPinia());
    (useDataStore() as any)._fileComponents = FILES;
    const again = useDraftStore();
    again.load("g5");
    expect(again.grain).toBe("file");
    expect(again.splitCount).toBe(1);
  });
});

describe("a split component is still one component", () => {
  it("counts components rather than the parts they are cut into", () => {
    const draft = useDraftStore();
    draft.load("split-count");
    draft.startNew("Domain");
    draft.setGrain("file");
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["one", "two"], a);
    expect(draft.standingCounts.confirmed).toBe(2);

    // Cut "one" in half: it is now a part in each group, but still one
    // component, and the tally must agree with the coverage beside it.
    draft.groupByKey(a)!.parts.find(p => p.component === "one")!.files = ["f1"];
    draft.groupByKey(b)!.parts.push({ component: "one", files: ["f2"], standing: "confirmed" });
    expect(draft.standingCounts.confirmed).toBe(2);
    expect(draft.splitCount).toBe(1);
  });

  // ── A group that says what it holds ─────────────────────────────────

  it("carries a query and its mode into the saved group", () => {
    const draft = useDraftStore();
    draft.load("ws");
    const key = draft.addGroup("Audits");
    draft.assign(["audit"], key);
    draft.setQuery(key, "audit", "live");
    draft.setDimension("Domain");
    draft.commit();
    const saved = useGroupsStore().groups.find(g => g.name === "Audits")!;
    expect(saved.query).toBe("audit");
    expect(saved.mode).toBe("live");
  });

  it("keeps a query as a group in the lens being built, and says which one it made", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.startNew();
    const key = draft.keepQuery("Audits", ["audit"], "audit.**");
    const made = draft.groupByKey(key)!;
    expect(made.parts.map(p => p.component)).toEqual(["audit"]);
    expect(made.query).toBe("audit.**");
    expect(made.mode).toBe("live");
    // The bar lives in the toolbar and cannot reach the view's own state, so
    // the key is left behind for the view to open.
    expect(draft.justMade).toBe(key);
  });

  it("makes a live group hold exactly what its query answers", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.startNew();
    const key = draft.addGroup("Admin");
    // Saying what it holds used to leave it holding nothing at all.
    draft.setQuery(key, "openadmin.**", "live");
    draft.setQueryMembers(key, ["audit", "pay"]);
    expect(draft.groupByKey(key)!.parts.map(p => p.component).sort()).toEqual(["audit", "pay"]);

    // Narrowing it releases what it no longer claims, rather than keeping a
    // member the definition has stopped naming.
    draft.setQueryMembers(key, ["pay"]);
    expect(draft.groupByKey(key)!.parts.map(p => p.component)).toEqual(["pay"]);
  });

  it("takes a match out of whatever group was holding it", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.startNew();
    const a = draft.addGroup("A");
    const b = draft.addGroup("B");
    draft.assign(["audit"], a);
    draft.setQueryMembers(b, ["audit"]);
    expect(draft.groupByKey(a)!.parts).toHaveLength(0);
    expect(draft.groupByKey(b)!.parts.map(p => p.component)).toEqual(["audit"]);
  });

  it("describes what a group already holds, and invents nothing when it cannot", () => {
    const draft = useDraftStore();
    draft.load("ws");
    const key = draft.addGroup("Both");
    draft.assign(["audit", "pay"], key);
    // Two components sharing no prefix have no description shorter than their
    // own names, so none is offered.
    expect(draft.describe(key)).toBeNull();
    expect(draft.groupByKey(key)!.query).toBeUndefined();
  });

  it("leaves a proposal as the parts on screen until someone says otherwise", () => {
    const draft = useDraftStore();
    draft.load("ws");
    draft.fromSuggestions("Domain", [
      {
        key: "a", name: "Audits",
        parts: [{ component: "audit", files: null, total: 3 }],
        components: ["audit"], reasons: [], units: 3, split: 0,
      },
    ]);
    const g = draft.groupByKey("a")!;
    expect(g.mode).toBe("fixed");
    expect(g.parts).toHaveLength(1);
  });

  it("dropping the query leaves the members alone", () => {
    const draft = useDraftStore();
    draft.load("ws");
    const key = draft.addGroup("Audits");
    draft.assign(["audit"], key);
    draft.setQuery(key, "audit", "live");
    draft.setQuery(key, "", "live");
    expect(draft.groupByKey(key)!.query).toBeUndefined();
    expect(draft.groupByKey(key)!.mode).toBeUndefined();
    expect(draft.groupByKey(key)!.parts.map(p => p.component)).toEqual(["audit"]);
  });
})
