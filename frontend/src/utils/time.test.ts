import { describe, expect, it } from "vitest";
import { formatElapsed, formatScanTime, relativeAge } from "./time";

const now = new Date(2026, 8, 17, 12, 0, 0); // 17 Sep 2026, 12:00 local

describe("formatScanTime", () => {
    it("omits the year inside the current year", () => {
        expect(formatScanTime(new Date(2026, 8, 16, 18, 42), now)).toBe("16 Sep, 18:42");
    });
    it("includes the year otherwise", () => {
        expect(formatScanTime(new Date(2024, 0, 3, 9, 5), now)).toBe("3 Jan 2024, 09:05");
    });
    it("accepts ISO strings", () => {
        const iso = new Date(2026, 1, 1, 0, 0).toISOString();
        expect(formatScanTime(iso, now)).toBe("1 Feb, 00:00");
    });
    it("returns empty for garbage", () => {
        expect(formatScanTime("not a date", now)).toBe("");
    });
});

describe("relativeAge", () => {
    const at = (ms: number) => new Date(now.getTime() - ms);
    it("rounds to one unit", () => {
        expect(relativeAge(at(10_000), now)).toBe("just now");
        expect(relativeAge(at(4 * 60_000), now)).toBe("4 min ago");
        expect(relativeAge(at(2 * 3_600_000), now)).toBe("2 h ago");
        expect(relativeAge(at(3 * 86_400_000), now)).toBe("3 d ago");
        expect(relativeAge(at(65 * 86_400_000), now)).toBe("2 mo ago");
        expect(relativeAge(at(400 * 86_400_000), now)).toBe("1 y ago");
    });
    it("treats future timestamps as just now", () => {
        expect(relativeAge(new Date(now.getTime() + 60_000), now)).toBe("just now");
    });
});

describe("formatElapsed", () => {
    const at = (ms: number) => new Date(now.getTime() - ms);
    it("formats minutes and seconds", () => {
        expect(formatElapsed(at(7_000), now)).toBe("0:07");
        expect(formatElapsed(at(102_000), now)).toBe("1:42");
    });
    it("adds hours when needed", () => {
        expect(formatElapsed(at(3_725_000), now)).toBe("1:02:05");
    });
});
