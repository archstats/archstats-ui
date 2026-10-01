// The structure checks, said the way Units says everything: as a claim that
// opens onto its evidence. They are read off the file import graph (the one
// that also resolves raw imports and reads unparsed files' text), not the
// unit graph, because an entry-point walk over a half-blind graph calls live
// code dead.

import type { Duplicate } from "~/features/checks/checks"
import type { Finding } from "./findings"
import { t, intlLocale, listOf } from "~/shared/i18n"

export interface ReachInput {
    unreachable: string[]
    testOnly: string[]
    roots: ReadonlySet<string>
}

const n = (x: number) => x.toLocaleString(intlLocale)
const s = (x: number, one: string, many = one + "s") => `${n(x)} ${x === 1 ? one : many}`

/** Code no entry point reaches, and code only tests keep alive. Null when there is none of either. */
export function reachFinding(r: ReachInput, lines: ReadonlyMap<string, number>): Finding | null {
    if (!r.unreachable.length && !r.testOnly.length) return null
    const sum = (fs: string[]) => fs.reduce((t, f) => t + (lines.get(f) ?? 0), 0)
    const headline = r.unreachable.length
        ? t("units.checkFindings.reachedNothing", { s: s(r.unreachable.length, t("units.checkFindings.file"), t("units.checkFindings.files")) })
        : t("units.checkFindings.keptAliveOnlyTests", { s: s(r.testOnly.length, t("units.checkFindings.file"), t("units.checkFindings.files")) })
    const detail = t("units.checkFindings.walkedFrameworkCallsReflection", { value: (r.unreachable.length ? t("units.checkFindings.linesNoEntryPoint", { unreachable: n(sum(r.unreachable)) }) : t("units.checkFindings.nothingUnreached"))
        + (r.unreachable.length && r.testOnly.length ? t("units.checkFindings.onlyTestsImport", { s: s(r.testOnly.length, t("units.checkFindings.moreFile")) }) : ". "), s: s(r.roots.size, t("units.checkFindings.entryPoint")) })
    return {
        id: "unreached",
        headline,
        detail,
        tone: "neutral",
        action: t("units.checkFindings.seeWhereThey"),
        region: {
            id: "unreached",
            label: t("units.checkFindings.reachedNothing2"),
            paths: [...r.unreachable, ...r.testOnly],
            map: "reach",
            note: t("units.checkFindings.everyProductionFileColoured"),
            claim: { headline, detail, tone: "neutral" },
        },
    }
}

/** Names declared in several files, and file names reused across folders. Null when neither happens. */
export function duplicateFinding(names: Duplicate[], files: Duplicate[]): Finding | null {
    if (!names.length && !files.length) return null
    const top = [...names].sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name)).slice(0, 2)
    const headline = names.length
        ? t("units.checkFindings.declaredMoreThanOne", { s: s(names.length, t("units.checkFindings.name"), t("units.checkFindings.names")) })
        : t("units.checkFindings.usedMoreThanOne", { s: s(files.length, t("units.checkFindings.fileName"), t("units.checkFindings.fileNames")) })
    const detail = t("units.checkFindings.ruleWrittenTwiceTwo", { value: top.length ? t("units.checkFindings.mostOften", { value: listOf(top.map(d => `${d.name} (${d.files.length} files)`)) }) : "", value2: names.length && files.length ? t("units.checkFindings.alsoRepeatAcrossFolders", { s: s(files.length, t("units.checkFindings.fileName2")) }) : "" })
    return {
        id: "twice",
        headline,
        detail,
        tone: "neutral",
        action: t("units.checkFindings.tieThemTogetherMap"),
        region: {
            id: "twice",
            label: t("units.checkFindings.writtenTwice"),
            paths: [...new Set([...names, ...files].flatMap(d => d.files))],
            map: "dupes",
            note: t("units.checkFindings.filesDeclareNameAnother"),
            claim: { headline, detail, tone: "neutral" },
        },
    }
}
