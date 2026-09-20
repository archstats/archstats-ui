import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useScopeStore } from "./scope";
import { useDataStore } from "./data";
import { units, useGroupsStore } from "./groups";

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
});
