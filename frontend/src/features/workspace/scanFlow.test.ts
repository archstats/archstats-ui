import { describe, expect, it } from "vitest";
import { monogram, nameFromFolder, refLabel, scanEstimate, scanEta, shortenPath, shouldOpenResult } from "./scanFlow";

describe("shortenPath", () => {
    it("leaves short paths alone", () => {
        expect(shortenPath("/Users/ryan/acme", 36)).toBe("/Users/ryan/acme");
    });
    it("keeps the root segment and the tail", () => {
        const p = "/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui";
        const out = shortenPath(p, 36);
        expect(out.length).toBeLessThanOrEqual(36);
        expect(out.startsWith("/Users/…/")).toBe(true);
        expect(out.endsWith("/archstats-ui")).toBe(true);
    });
    it("drops middle segments before it touches the last one", () => {
        expect(shortenPath("/a/bb/ccc/dddd/eeeee", 14)).toBe("/a/…/eeeee");
    });
    it("elides the start of a single overlong segment", () => {
        const out = shortenPath("/x/this-is-a-very-long-folder-name-indeed", 20);
        expect(out.length).toBe(20);
        expect(out.startsWith("…")).toBe(true);
        expect(out.endsWith("indeed")).toBe(true);
    });
    it("understands Windows separators", () => {
        const out = shortenPath("C:\\Users\\ryan\\src\\clients\\acme\\backend", 28);
        expect(out).toBe("C:\\…\\clients\\acme\\backend");
    });
});

describe("shouldOpenResult", () => {
    const own = (openAtStart: string | null) => ({ ref: "", openAtStart });
    it("opens a scan of the working copy when the user stayed put", () => {
        expect(shouldOpenResult(own("s2"), "s2")).toBe(true);
    });
    it("opens it even when an older snapshot was open, if nothing moved", () => {
        expect(shouldOpenResult(own("s1"), "s1")).toBe(true);
    });
    it("stays put when the user opened another snapshot meanwhile", () => {
        expect(shouldOpenResult(own("s2"), "s1")).toBe(false);
    });
    it("never lets a rescan take the view over", () => {
        expect(shouldOpenResult({ ref: "v1.9.0", openAtStart: "s2" }, "s2")).toBe(false);
    });
    it("fills an empty view with whatever finished", () => {
        expect(shouldOpenResult({ ref: "v1.9.0", openAtStart: null }, null)).toBe(true);
        expect(shouldOpenResult(null, null)).toBe(true);
    });
    it("leaves a scan it did not see begin alone", () => {
        expect(shouldOpenResult(null, "s2")).toBe(false);
    });
});

describe("refLabel", () => {
    it("keeps tags and shortens hashes", () => {
        expect(refLabel("v1.9.0")).toBe("v1.9.0");
        expect(refLabel("3f2a91c0d4e5f60718293a4b5c6d7e8f90a1b2c3")).toBe("3f2a91c");
    });
});

describe("monogram", () => {
    it("takes the first letters of two words", () => {
        expect(monogram("archstats-ui")).toBe("AU");
        expect(monogram("BroadleafCommerce")).toBe("BC");
        expect(monogram("spring petclinic")).toBe("SP");
    });
    it("takes two letters of a single word", () => {
        expect(monogram("fineract")).toBe("FI");
    });
    it("survives a name with no letters", () => {
        expect(monogram("—")).toBe("?");
    });
});

describe("nameFromFolder", () => {
    it("uses the last segment", () => {
        expect(nameFromFolder("/Users/ryan/acme-backend")).toBe("acme-backend");
        expect(nameFromFolder("/Users/ryan/acme-backend/")).toBe("acme-backend");
        expect(nameFromFolder("C:\\src\\acme")).toBe("acme");
    });
});

describe("scanEstimate", () => {
    const at = (min: number, secs: number, origin = "scan", status = "complete") => ({
        status, origin,
        startedAt: new Date(Date.UTC(2026, 8, 1, 10, min)).toISOString(),
        finishedAt: new Date(Date.UTC(2026, 8, 1, 10, min, secs)).toISOString(),
    });
    it("takes the median of the last three scans of the working copy", () => {
        expect(scanEstimate([at(1, 10), at(2, 50), at(3, 30), at(4, 40)])).toBe(40_000);
    });
    it("ignores rescans, imports and failures", () => {
        expect(scanEstimate([at(1, 20), at(2, 59, "backfill"), at(3, 59, "import"), at(4, 59, "scan", "failed")])).toBe(20_000);
    });
    it("has nothing to say before a first scan", () => {
        expect(scanEstimate([])).toBeNull();
    });
});

describe("scanEta", () => {
    it("counts down in tens of seconds, then minutes", () => {
        expect(scanEta(10_000, 50_000).label).toBe("about 40s left");
        expect(scanEta(0, 200_000).label).toBe("about 3 min left");
    });
    it("never claims to be done", () => {
        expect(scanEta(90_000, 60_000)).toEqual({ fraction: 0.96, label: "taking longer than last time" });
    });
    it("says nothing without an estimate", () => {
        expect(scanEta(5_000, null)).toEqual({ fraction: null, label: "" });
    });
});
