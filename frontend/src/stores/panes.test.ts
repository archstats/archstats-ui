import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { INSPECTOR, SIDEBAR, usePanesStore } from "./panes";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
    data,
  };
}

describe("panes store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts from defaults and persists clamped widths", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const panes = usePanesStore();
    panes.load();
    expect(panes.sidebarWidth).toBe(SIDEBAR.default);
    expect(panes.inspectorWidth).toBeNull();
    panes.setSidebar(9999);
    panes.setInspector(10);
    expect(panes.sidebarWidth).toBe(SIDEBAR.max);
    expect(panes.inspectorWidth).toBe(INSPECTOR.min);
    expect(JSON.parse(storage.data["archstats.panes"])).toEqual({ sidebarWidth: SIDEBAR.max, inspectorWidth: INSPECTOR.min });
  });

  it("restores saved widths and ignores garbage", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "archstats.panes": JSON.stringify({ sidebarWidth: 300, inspectorWidth: 400 }) }));
    const a = usePanesStore();
    a.load();
    expect(a.sidebarWidth).toBe(300);
    expect(a.inspectorWidth).toBe(400);

    setActivePinia(createPinia());
    vi.stubGlobal("localStorage", fakeStorage({ "archstats.panes": "{not json" }));
    const b = usePanesStore();
    b.load();
    expect(b.sidebarWidth).toBe(SIDEBAR.default);
    expect(b.inspectorWidth).toBeNull();
  });

  it("resets the inspector to the view default with null", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const panes = usePanesStore();
    panes.setInspector(500);
    panes.setInspector(null);
    expect(panes.inspectorWidth).toBeNull();
  });
});
