// Whether two snapshots can be compared number for number.
//
// A snapshot is immutable, so two scans written by different analysis
// revisions can disagree about the same code: a rule scoped differently, a
// file no longer scored, a rename now followed. Every surface that compares
// (Changes, trends, deltas, pins) asks this one function and says why when
// the answer is no. Revision 0 means unknown, never equal.

import { t } from "~/shared/i18n"

export interface ComparableScan {
    analysisRevision?: number
    ignoreGlobs?: string
    extensions?: string
}

export interface Comparability {
    ok: boolean
    reasons: Array<{ level: "block" | "warn"; text: string }>
}

export function comparability(a: ComparableScan, b: ComparableScan): Comparability {
    const reasons: Comparability["reasons"] = []
    const ra = a.analysisRevision ?? 0
    const rb = b.analysisRevision ?? 0
    if (ra === 0 || rb === 0) {
        reasons.push({ level: "block", text: t("trends.comparability.oneScansPredatesAnalysis") })
    } else if (ra !== rb) {
        reasons.push({ level: "block", text: t("trends.comparability.scansWereReadDifferent", { ra, rb }) })
    }
    if ((a.ignoreGlobs ?? "") !== (b.ignoreGlobs ?? "")) {
        reasons.push({ level: "block", text: t("trends.comparability.scansIgnoredDifferentPaths") })
    }
    if ((a.extensions ?? "") && (b.extensions ?? "") && a.extensions !== b.extensions) {
        reasons.push({ level: "warn", text: t("trends.comparability.differentLanguagePacksRan", { extensions: a.extensions, extensions2: b.extensions }) })
    }
    return { ok: !reasons.some(r => r.level === "block"), reasons }
}
