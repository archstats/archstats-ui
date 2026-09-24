import { chartTheme } from "~/composables/useChartTheme";

// The one definition of "good, warning, bad" for the two engine scores that
// views colour. Code health runs 1–10 (10 is healthy); hotspot score runs
// 0–100 (100 is the hottest). Every badge, dot, bar and canvas fill reads
// these, so a file cannot be amber in one view and green in another.

export type HealthLevel = "good" | "warn" | "bad" | "none";

export const HEALTH_THRESHOLDS = { good: 8, warn: 5 } as const;   // >= good, >= warn, else bad
export const HOTSPOT_THRESHOLDS = { warn: 40, bad: 70 } as const; // < warn good, < bad warn, else bad

export function healthLevel(score: number | null | undefined): HealthLevel {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return "none";
    const s = Number(score);
    // The scale's floor is 1. Snapshots taken before the engine stored an
    // unscored file (XML, text, vendored code) as NULL stored it as 0, and
    // it read as the unhealthiest file in the codebase.
    if (s < 1) return "none";
    if (s >= HEALTH_THRESHOLDS.good) return "good";
    if (s >= HEALTH_THRESHOLDS.warn) return "warn";
    return "bad";
}

export function hotspotLevel(score: number | null | undefined): HealthLevel {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return "none";
    const s = Number(score);
    if (s < HOTSPOT_THRESHOLDS.warn) return "good";
    if (s < HOTSPOT_THRESHOLDS.bad) return "warn";
    return "bad";
}

// Readable ink for a level; the data ramps, never the accent.
export function levelTextClass(level: HealthLevel): string {
    switch (level) {
        case "good": return "text-green-700";
        case "warn": return "text-amber-700";
        case "bad": return "text-red-700";
        default: return "text-neutral-500";
    }
}

// A 6px dot next to a value; the same ramp steps as the text.
export function levelDotClass(level: HealthLevel): string {
    switch (level) {
        case "good": return "bg-green-500";
        case "warn": return "bg-amber-500";
        case "bad": return "bg-red-500";
        default: return "bg-neutral-300";
    }
}

export function levelLabel(level: HealthLevel): string {
    switch (level) {
        case "good": return "Healthy";
        case "warn": return "Watch";
        case "bad": return "Alert";
        default: return "—";
    }
}

// Canvas and SVG fill for a level, from the live theme.
export function levelColor(level: HealthLevel): string {
    const t = chartTheme();
    switch (level) {
        case "good": return t.green;
        case "warn": return t.amber;
        case "bad": return t.red;
        default: return t.hairlineStrong;
    }
}

export function formatHealth(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(Number(score)) || Number(score) < 1) return "—";
    return Number(score).toFixed(1);
}

export function formatHotspot(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return "—";
    return String(Math.round(Number(score)));
}
