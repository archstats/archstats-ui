import { describe, expect, it } from "vitest"
import { newCrossings, previousOf } from "./drift"

const e = (file: string, line = 1) => ({ fromGroup: "a", toGroup: "b", fromComponent: "x", toComponent: "y", file, refs: 1, line }) as any
const c = (...edges: any[]) => [{ from: "a", to: "b", edges, refs: edges.length, typeOnly: 0, ambiguous: 0 }]

describe("drift", () => {
    it("counts an import as new only when it did not cross before, whatever its line", () => {
        expect(newCrossings(c(e("f1.ts", 3)), c(e("f1.ts", 9), e("f2.ts"))).map(x => x.file)).toEqual(["f2.ts"])
    })
    it("finds the newest comparable scan before the open one", () => {
        const scans = [{ id: "s4", repo: "r" }, { id: "s3", repo: "r" }, { id: "s2", repo: "other" }, { id: "s1", repo: "r" }]
        expect(previousOf(scans, "s3", (a, b) => a.repo === b.repo)?.id).toBe("s1")
        expect(previousOf(scans, "s1", () => true)).toBeNull()
    })
})
