// The structure checks, said the way Units says everything: as a claim that
// opens onto its evidence. They are read off the file import graph (the one
// that also resolves raw imports and reads unparsed files' text), not the
// unit graph, because an entry-point walk over a half-blind graph calls live
// code dead.

import type { Duplicate } from "~/features/checks/checks"
import type { Finding } from "./findings"

export interface ReachInput {
    unreachable: string[]
    testOnly: string[]
    roots: ReadonlySet<string>
}

const n = (x: number) => x.toLocaleString("en-US")
const s = (x: number, one: string, many = one + "s") => `${n(x)} ${x === 1 ? one : many}`

/** Code no entry point reaches, and code only tests keep alive. Null when there is none of either. */
export function reachFinding(r: ReachInput, lines: ReadonlyMap<string, number>): Finding | null {
    if (!r.unreachable.length && !r.testOnly.length) return null
    const sum = (fs: string[]) => fs.reduce((t, f) => t + (lines.get(f) ?? 0), 0)
    const headline = r.unreachable.length
        ? `${s(r.unreachable.length, "file is", "files are")} reached by nothing.`
        : `${s(r.testOnly.length, "file is", "files are")} kept alive only by tests.`
    const detail = (r.unreachable.length ? `${n(sum(r.unreachable))} lines no entry point imports` : "Nothing is unreached")
        + (r.unreachable.length && r.testOnly.length ? `, and ${s(r.testOnly.length, "more file")} only tests import. ` : ". ")
        + `Walked from ${s(r.roots.size, "entry point")} the framework calls; reflection, string lookups and config wiring are invisible to it.`
    return {
        id: "unreached",
        headline,
        detail,
        tone: "neutral",
        action: "See where they are",
        region: {
            id: "unreached",
            label: "Reached by nothing",
            paths: [...r.unreachable, ...r.testOnly],
            map: "reach",
            note: "Every production file, coloured by whether an entry point reaches it.",
            claim: { headline, detail, tone: "neutral" },
        },
    }
}

/** Names declared in several files, and file names reused across folders. Null when neither happens. */
export function duplicateFinding(names: Duplicate[], files: Duplicate[]): Finding | null {
    if (!names.length && !files.length) return null
    const top = [...names].sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name)).slice(0, 2)
    const headline = names.length
        ? `${s(names.length, "name is", "names are")} declared in more than one file.`
        : `${s(files.length, "file name is", "file names are")} used in more than one folder.`
    const detail = (top.length ? `Most often ${top.map(d => `${d.name} (${d.files.length} files)`).join(" and ")}. ` : "")
        + "A rule written twice, or two things that deserve different names."
        + (names.length && files.length ? ` ${s(files.length, "file name")} also repeat across folders.` : "")
    return {
        id: "twice",
        headline,
        detail,
        tone: "neutral",
        action: "Tie them together on the map",
        region: {
            id: "twice",
            label: "Written twice",
            paths: [...new Set([...names, ...files].flatMap(d => d.files))],
            map: "dupes",
            note: "Files that declare a name another file declares, or share a file name.",
            claim: { headline, detail, tone: "neutral" },
        },
    }
}
