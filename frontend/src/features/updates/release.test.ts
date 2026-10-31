import { describe, expect, it } from "vitest";
import { isRelease } from "./updates.store";

describe("isRelease", () => {
    it("takes a tag the release workflow stamps", () => {
        expect(isRelease("v0.12.0")).toBe(true);
        expect(isRelease("v0.13.0-rc.1")).toBe(true);
    });
    it("refuses a build that is not a release", () => {
        expect(isRelease("dev")).toBe(false);
        expect(isRelease("dev-abc1234")).toBe(false);
        expect(isRelease("")).toBe(false);
    });
});
