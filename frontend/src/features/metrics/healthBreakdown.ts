// Why a file's health reads what it does: the deductions the engine stored,
// each with the input that earned it and the rule that priced it.
//
// Three shapes, chosen by what the snapshot recorded rather than by its
// revision number:
//   functions    revision 11 on, a file a language pack parsed: complex code,
//                coupling, size.
//   indentation  revision 11 on, a programming language no pack parses: size
//                and deep code, read from indentation.
//   legacy       revisions 2-10: size over 500 lines, deepest and average
//                nesting, each capped at 3.
// The engine computes the score; nothing here decides it. The sum is shown so
// a reader can check it, and a mismatch is said out loud.

import { t, intlLocale } from "~/shared/i18n"
import { filePath } from "~/features/navigation/routes"

export type BreakdownKind = "functions" | "indentation" | "legacy"

export interface BreakdownRow {
    id: string
    label: string
    /** Where the evidence for this deduction is: the functions, the imports, the code. */
    to?: string
    input: string
    threshold: string
    rule: string
    points: number
}

export interface Breakdown {
    kind: BreakdownKind
    rows: BreakdownRow[]
    health: number
    /** 10 less the deductions, before the floor at 1. */
    unfloored: number
    /** What the deductions give once floored: equal to health unless the snapshot disagrees. */
    expected: number
}

type FileRow = Record<string, unknown>

function num(file: FileRow, key: string): number | null {
    const v = file?.[key]
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

export function fmt(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return "—"
    return v.toLocaleString(intlLocale, { maximumFractionDigits: 2 })
}

export function fmtInt(v: number | null): string {
    if (v === null || !Number.isFinite(v)) return "—"
    return Math.round(v).toLocaleString(intlLocale)
}

/** The kind of breakdown the file's stored deductions make, or null when it has none. */
export function breakdownKind(file: FileRow): BreakdownKind | null {
    if (num(file, "codesmells__health__deduction__complex_code") !== null) return "functions"
    if (num(file, "codesmells__health__deduction__deep_code") !== null) return "indentation"
    if (num(file, "codesmells__health__deduction__max_nesting") !== null && num(file, "codesmells__health__deduction__avg_nesting") !== null) return "legacy"
    return null
}

export function healthBreakdown(file: FileRow): Breakdown | null {
    const health = num(file, "codesmells__code_health")
    const kind = breakdownKind(file)
    if (health === null || kind === null || num(file, "codesmells__health__deduction__size") === null) return null
    const d = (key: string) => num(file, `codesmells__health__deduction__${key}`) ?? 0
    const name = typeof file.name === "string" && file.name ? file.name : null
    const tab = (which: string) => (name ? filePath(name, which) : undefined)
    let rows: BreakdownRow[]
    if (kind === "functions") {
        const complexFunctions = num(file, "complexity__functions__complex") ?? 0
        rows = [
            {
                id: "complex_code", label: t("metrics.healthBreakdown.complexCode"), to: tab("functions"),
                input: t("metrics.healthBreakdown.linesInComplexFunctions", { lines: fmtInt(num(file, "complexity__lines__complex")), count: complexFunctions, functions: fmtInt(complexFunctions) }),
                threshold: t("metrics.healthBreakdown.cognitiveOver", { threshold: 15 }),
                rule: t("metrics.healthBreakdown.perDoublingOfLines"), points: d("complex_code"),
            },
            {
                id: "coupling", label: t("metrics.healthBreakdown.coupling"), to: tab("imports"),
                input: t("metrics.healthBreakdown.imports", { count: num(file, "modularity__imports__count") ?? 0, imports: fmtInt(num(file, "modularity__imports__count")) }),
                threshold: t("metrics.healthBreakdown.over", { maxT: fmtInt(10) }),
                rule: t("metrics.healthBreakdown.oneAndAHalfPerDoubling"), points: d("coupling"),
            },
            {
                id: "size", label: t("metrics.healthBreakdown.size"),
                input: t("metrics.healthBreakdown.codeLines", { lines: fmtInt(num(file, "complexity__lines__code")) }),
                threshold: t("metrics.healthBreakdown.over", { maxT: fmtInt(150) }),
                rule: t("metrics.healthBreakdown.onePerDoubling"), points: d("size"),
            },
        ]
    } else if (kind === "indentation") {
        rows = [
            {
                id: "deep_code", label: t("metrics.healthBreakdown.deepCode"), to: tab("source"),
                input: t("metrics.healthBreakdown.deepLines", { lines: fmtInt(num(file, "complexity__indentation__deep")) }),
                threshold: t("metrics.healthBreakdown.levelsIn", { levels: 3 }),
                rule: t("metrics.healthBreakdown.perDoublingOfLines"), points: d("deep_code"),
            },
            {
                id: "size", label: t("metrics.healthBreakdown.size"),
                input: t("metrics.healthBreakdown.nonBlankLines", { lines: fmtInt(num(file, "complexity__lines__nonblank")) }),
                threshold: t("metrics.healthBreakdown.over", { maxT: fmtInt(180) }),
                rule: t("metrics.healthBreakdown.onePerDoubling"), points: d("size"),
            },
        ]
    } else {
        const maxT = num(file, "codesmells__health__threshold__max_nesting")
        const avgT = num(file, "codesmells__health__threshold__avg_nesting")
        rows = [
            {
                id: "size", label: t("metrics.healthBreakdown.size"),
                input: t("metrics.healthBreakdown.lines", { lines: fmtInt(num(file, "complexity__lines")) }),
                threshold: t("metrics.healthBreakdown.over", { maxT: fmtInt(500) }),
                rule: t("metrics.healthBreakdown.text001PerLine"), points: d("size"),
            },
            {
                id: "max_nesting", label: t("metrics.healthBreakdown.deepestNesting"),
                input: t("metrics.healthBreakdown.levels", { maxNesting: fmtInt(num(file, "complexity__indentation__max")) }),
                threshold: maxT !== null ? t("metrics.healthBreakdown.over", { maxT: fmt(maxT) }) : "—",
                rule: t("metrics.healthBreakdown.text05PerLevel"), points: d("max_nesting"),
            },
            {
                id: "avg_nesting", label: t("metrics.healthBreakdown.averageNesting"),
                input: t("metrics.healthBreakdown.levels2", { avgNesting: fmt(num(file, "complexity__indentation__avg")) }),
                threshold: avgT !== null ? t("metrics.healthBreakdown.over2", { avgT: fmt(avgT) }) : "—",
                rule: t("metrics.healthBreakdown.text15PerLevel"), points: d("avg_nesting"),
            },
        ]
    }
    const unfloored = 10 - rows.reduce((s, r) => s + r.points, 0)
    return { kind, rows, health, unfloored, expected: Math.max(1, unfloored) }
}

/** "10 − 2 (complex code) − 1.5 (coupling) − 2 (size)": the deductions in one line, for a tooltip. */
export function deductionSummary(file: FileRow): string | null {
    const b = healthBreakdown(file)
    if (!b) return null
    return `10${b.rows.map(r => ` − ${fmt(r.points)} (${r.label.toLocaleLowerCase(intlLocale)})`).join("")}${b.unfloored < 1 ? t("metrics.healthBreakdown.floored1") : ""}`
}
