// A tool's way of making an exhibit: the spec checked, the exhibit computed
// and stated as facts, its id from the conversation's counter. The tool gets
// back the part to keep and the text the model reads.

import { check, present } from "~/features/exhibits/engine"
// Registers every exhibit with the engine.
import "~/features/exhibit-catalog/catalog"
import { isAbsent, type ExhibitPart } from "~/features/exhibits/types"
import type { ToolContext } from "../engine/types"

export type Shown = { part: ExhibitPart; text: string } | { absent: string }

export async function show(kind: string, params: Record<string, unknown>, ctx: ToolContext): Promise<Shown> {
    const checked = check(kind, params)
    if ("error" in checked) return { absent: checked.error }
    try {
        const out = await present(checked.spec, { snap: ctx.world, id: ctx.nextId(), ranOn: ctx.ranOn })
        return isAbsent(out) ? out : { part: out.part, text: out.text }
    } catch (e: any) {
        // A table an older analysis did not write is the snapshot's age, not a broken database: say which.
        const table = /no such (?:table|column): (\S+)/.exec(String(e?.message ?? e))?.[1]
        if (table) return { absent: `This snapshot (analysis revision ${ctx.world.info.analysis_revision || "?"}) has no ${table.replace(/_/g, " ")}: it was read by an older analysis. Scanning again adds it.` }
        throw e
    }
}

/** Several exhibits for one answer: their texts joined, the parts kept, what could not be made said once. */
export function gather(shown: Shown[]): { text: string; exhibits: ExhibitPart[] } {
    const parts = shown.filter((x): x is { part: ExhibitPart; text: string } => "part" in x)
    const absent = shown.filter((x): x is { absent: string } => "absent" in x).map(x => x.absent)
    return { text: [...parts.map(x => x.text), ...absent].join("\n\n"), exhibits: parts.map(x => x.part) }
}
