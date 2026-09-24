import { describe, expect, it } from "vitest"
import { provenanceLines, provenanceShort, type Provenance } from "./provenance"

const base: Provenance = {
    workspace: "Sylius", snapshot: "before the split", scannedAt: "2026-09-22T09:49:23.000Z",
    branch: "main", commit: "3f2a91c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6", uncommitted: 2,
    revision: 2, revisionOutdated: false, lens: "Domains", scope: null, role: null,
    pseudonymised: false, view: "/views/connections", appVersion: "v0.2.0",
}

describe("provenance", () => {
    it("says workspace, snapshot, commit and revision in one line, lens only when set", () => {
        expect(provenanceShort(base)).toBe("Sylius · before the split · main@3f2a91c +2 uncommitted · r2 · lens Domains")
        expect(provenanceShort({ ...base, lens: null, commit: "", uncommitted: null })).toBe("Sylius · before the split · r2")
    })
    it("flags an outdated revision and pseudonymised authors", () => {
        expect(provenanceShort({ ...base, revisionOutdated: true, pseudonymised: true })).toContain("r2 (outdated)")
        expect(provenanceShort({ ...base, pseudonymised: true })).toContain("authors pseudonymised")
    })
    it("never carries a folder path", () => {
        expect(provenanceLines(base).some(([k]) => /path|folder/i.test(k))).toBe(false)
    })
})
