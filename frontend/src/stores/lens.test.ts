import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLensStore } from "./lens";
import { useGroupsStore } from "./groups";
import { useDataStore } from "./data";

describe("lens store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const mem: Record<string, string> = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } });
    (useDataStore() as any)._fileComponents = [];
    useGroupsStore().initForProject("p");
  });

  it("falls back to the first dimension and honours a chosen one that exists", () => {
    const groups = useGroupsStore();
    const lens = useLensStore();
    lens.load("ws");
    expect(lens.active).toBeNull();
    groups.createGroup("A", [], "Domain");
    groups.createGroup("B", [], "Layer");
    expect(lens.active).toBe("Domain");
    expect(lens.isChosen).toBe(false);
    lens.set("Layer");
    expect(lens.active).toBe("Layer");
    expect(lens.isChosen).toBe(true);
    lens.set("Gone");
    expect(lens.active).toBe("Domain");
    expect(lens.isChosen).toBe(false);
  });

  it("remembers the choice per workspace", () => {
    const groups = useGroupsStore();
    groups.createGroup("A", [], "Domain");
    groups.createGroup("B", [], "Layer");
    const lens = useLensStore();
    lens.load("one");
    lens.set("Layer");
    lens.load("two");
    expect(lens.active).toBe("Domain");
    lens.load("one");
    expect(lens.active).toBe("Layer");
  });
});
