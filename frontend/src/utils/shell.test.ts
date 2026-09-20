import { describe, expect, it } from "vitest";
import { nameFromFolder, shortenPath, shouldAutoOpen } from "./shell";

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

describe("shouldAutoOpen", () => {
    const scans = [
        { id: "s3", status: "failed" },
        { id: "s2", status: "complete" },
        { id: "s1", status: "complete" },
    ];
    it("opens when nothing is open", () => {
        expect(shouldAutoOpen(null, scans)).toBe(true);
    });
    it("opens when the newest completed snapshot is open", () => {
        expect(shouldAutoOpen("s2", scans)).toBe(true);
    });
    it("stays put when an older snapshot was chosen", () => {
        expect(shouldAutoOpen("s1", scans)).toBe(false);
    });
    it("opens when the workspace had no completed scans yet", () => {
        expect(shouldAutoOpen("elsewhere", [{ id: "s9", status: "failed" }])).toBe(true);
    });
});

describe("nameFromFolder", () => {
    it("uses the last segment", () => {
        expect(nameFromFolder("/Users/ryan/acme-backend")).toBe("acme-backend");
        expect(nameFromFolder("/Users/ryan/acme-backend/")).toBe("acme-backend");
        expect(nameFromFolder("C:\\src\\acme")).toBe("acme");
    });
});
