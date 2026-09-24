import { describe, expect, it } from "vitest";
import { buildCrosscut, cellKey } from "./crosscut";

const filesOf = new Map<string, string[]>([
  ["pay.web", ["pay/web/A.java", "pay/web/B.java"]],
  ["pay.repo", ["pay/repo/R.java"]],
  ["audit.web", ["audit/web/C.java"]],
  ["audit.repo", ["audit/repo/S.java", "audit/repo/T.java"]],
  ["stray", ["stray/X.java"]],
]);
const rows = [
  { id: "pay", name: "Payments", color: "c1", files: new Set(["pay/web/A.java", "pay/web/B.java", "pay/repo/R.java"]) },
  { id: "audit", name: "Audits", color: "c2", files: new Set(["audit/web/C.java", "audit/repo/S.java", "audit/repo/T.java"]) },
];
const cols = [
  { id: "web", name: "Controllers", color: "c3", files: new Set(["pay/web/A.java", "pay/web/B.java", "audit/web/C.java"]) },
  { id: "repo", name: "Repositories", color: "c4", files: new Set(["pay/repo/R.java", "audit/repo/S.java", "audit/repo/T.java"]) },
];

describe("buildCrosscut", () => {
  it("counts files and components per intersection and tracks the uncovered", () => {
    const x = buildCrosscut({ rows, cols, filesOfComponent: filesOf, edges: [], source: "static" });
    expect(x.cells.get(cellKey("pay", "web"))?.files).toBe(2);
    expect(x.cells.get(cellKey("audit", "repo"))?.files).toBe(2);
    expect(Array.from(x.cells.get(cellKey("pay", "repo"))!.components)).toEqual(["pay.repo"]);
    expect(x.rowFiles.get("pay")).toBe(3);
    expect(x.colFiles.get("web")).toBe(3);
    expect(x.unrowed.has("stray")).toBe(true);
    expect(x.uncolumned.has("stray")).toBe(true);
    expect(x.cells.get(cellKey(null, null))?.files).toBe(1);
    expect(x.max.files).toBe(2);
  });

  it("sums coupling between cells with direction and finds partners", () => {
    const edges = [
      { from: "pay.web", to: "pay.repo", references: 5, sharedCommits: 0 },
      { from: "pay.web", to: "audit.repo", references: 2, sharedCommits: 0 },
      { from: "pay.web", to: "pay.web", references: 9, sharedCommits: 0 },
    ];
    const x = buildCrosscut({ rows, cols, filesOfComponent: filesOf, edges, source: "static" });
    const payWeb = x.cells.get(cellKey("pay", "web"))!;
    expect(payWeb.coupling).toBe(7);
    expect(payWeb.out).toBe(7);
    expect(payWeb.in).toBe(0);
    expect(payWeb.partners.get(cellKey("pay", "repo"))).toBe(5);
    expect(payWeb.partners.get(cellKey("audit", "repo"))).toBe(2);
    expect(x.cells.get(cellKey("audit", "repo"))!.in).toBe(2);
    expect(x.max.coupling).toBe(7);
  });

  it("uses shared commits for the git source and counts cycles that cross cells", () => {
    const edges = [
      { from: "pay.web", to: "audit.repo", references: 1, sharedCommits: 4 },
      { from: "audit.repo", to: "pay.web", references: 1, sharedCommits: 4 },
    ];
    // Git edges arrive one per pair; the pair above counts once.
    const git = buildCrosscut({ rows, cols, filesOfComponent: filesOf, edges: edges.slice(0, 1), source: "git" });
    expect(git.cells.get(cellKey("pay", "web"))!.coupling).toBe(4);
    expect(git.crossingCycles).toBe(0);
    const stat = buildCrosscut({ rows, cols, filesOfComponent: filesOf, edges, source: "static" });
    expect(stat.crossingCycles).toBe(1);
    expect(stat.cells.get(cellKey("pay", "web"))!.cycles).toBe(1);
    expect(stat.cells.get(cellKey("audit", "repo"))!.cycles).toBe(1);
  });
});
