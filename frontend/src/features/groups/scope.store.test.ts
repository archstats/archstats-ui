import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useScopeStore } from "./scope.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { units, useGroupsStore } from "./groups.store";

// A typed question narrows every view, because every view already narrows by
// scope. These pin the part that would otherwise be invisible until a table
// somewhere quietly showed the wrong rows.

const FILES = [
  { name: "audit/AuditController.java", component: "audit" },
  { name: "audit/AuditService.java", component: "audit" },
  { name: "billing/BillingController.java", component: "billing" },
  { name: "billing/BillingDao.java", component: "billing" },
  { name: "shipping/ShipDao.java", component: "shipping" },
];

describe("scope", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    (useDataStore() as any)._fileComponents = FILES;
    useGroupsStore().initForProject("p");
  });

  it("is inactive until something is asked", () => {
    const scope = useScopeStore();
    expect(scope.isActive).toBe(false);
    expect(scope.componentInScope("audit")).toBe(true);
    scope.setQuery("audit");
    expect(scope.isActive).toBe(true);
  });

  it("narrows components to what the query matches", () => {
    const scope = useScopeStore();
    scope.setQuery("audit");
    expect(scope.componentInScope("audit")).toBe(true);
    expect(scope.componentInScope("billing")).toBe(false);
  });

  it("scopes the components holding the files a file-shaped question names", () => {
    const scope = useScopeStore();
    scope.setQuery("**/*Dao.java");
    // The component views must not go empty because the question was about files.
    expect(scope.componentInScope("billing")).toBe(true);
    expect(scope.componentInScope("shipping")).toBe(true);
    expect(scope.componentInScope("audit")).toBe(false);
    // …and the file views answer about exactly those files.
    expect(scope.fileInScope("billing/BillingDao.java", "billing")).toBe(true);
    expect(scope.fileInScope("billing/BillingController.java", "billing")).toBe(false);
  });

  it("narrows with a group rather than widening: both must be true", () => {
    const groups = useGroupsStore();
    const scope = useScopeStore();
    const g = groups.createGroup("Audits", units("component", ["audit"]), "Domain");
    scope.toggleGroup(g.id);
    expect(scope.componentInScope("audit")).toBe(true);
    scope.setQuery("billing");
    // The group says audit, the query says billing; nothing is both.
    expect(scope.componentInScope("audit")).toBe(false);
    expect(scope.componentInScope("billing")).toBe(false);
  });

  it("a query matching nothing scopes to nothing, rather than to everything", () => {
    const scope = useScopeStore();
    scope.setQuery("nope.**");
    expect(scope.isActive).toBe(true);
    expect(scope.componentInScope("audit")).toBe(false);
  });

  it("clears back to showing everything", () => {
    const scope = useScopeStore();
    scope.setQuery("audit");
    scope.clearQuery();
    expect(scope.isActive).toBe(false);
    expect(scope.componentInScope("billing")).toBe(true);
  });

  describe("focus", () => {
    beforeEach(() => {
      // billing -> audit -> shipping
      (useDataStore() as any)._componentConnections = [
        { from: "billing", to: "audit", count: 3 },
        { from: "audit", to: "shipping", count: 1 },
      ];
    });

    it("narrows every view to the neighbourhood, files too", () => {
      const scope = useScopeStore();
      scope.setFocus("dependencies of billing");
      expect(scope.componentInScope("audit")).toBe(true);
      expect(scope.componentInScope("shipping")).toBe(false);
      expect(scope.fileInScope("audit/AuditService.java", "audit")).toBe(true);
      expect(scope.fileInScope("shipping/ShipDao.java", "shipping")).toBe(false);
      expect(scope.fileNames?.has("billing/BillingDao.java")).toBe(true);
    });

    it("intersects with a typed query instead of replacing it", () => {
      const scope = useScopeStore();
      scope.setQuery("audit");
      scope.setFocus("around audit");
      expect(Array.from(scope.componentNames ?? []).sort()).toEqual(["audit"]);
      expect(scope.query).toBe("audit");
    });

    it("walks back and forward along the trail", () => {
      const scope = useScopeStore();
      scope.setFocus("billing");
      scope.setFocus("around billing");
      scope.setFocus("around billing depth 2");
      scope.back();
      expect(scope.focus).toBe("around billing");
      scope.back();
      expect(scope.focus).toBe("billing");
      scope.forward();
      expect(scope.focus).toBe("around billing");
      scope.setFocus("audit");
      expect(scope.focusAhead).toEqual([]);
      scope.jumpBack(1);
      expect(scope.focus).toBe("billing");
    });

    it("is cleared with the rest of the scope, and the clear can be undone", () => {
      const scope = useScopeStore();
      scope.setFocus("around billing");
      scope.clear();
      expect(scope.isActive).toBe(false);
      scope.back();
      expect(scope.focus).toBe("around billing");
    });
  });
});
