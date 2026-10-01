import { compareScans, newestFirst, type OrderedScan } from "~/features/workspace/scanOrder"
import { t } from "~/shared/i18n"

// Changes: Compare. The Go side (app/changes) does the set differences; this
// picks the two snapshots, counts what moved and writes the summary a report
// carries.

export interface Edge { from: string; to: string; refs: number; files: string[]; dynamic: boolean }
export interface EdgeDelta { from: string; to: string; before: number; after: number }
export interface TangleChange { kind: "formed" | "dissolved" | "grew" | "shrank" | "reshaped"; before: string[]; after: string[]; joined: string[]; left: string[] }
export interface Finding { rule: string; from: string; to: string; file: string; line: number; kind: string }
export interface Move { component: string; metric: string; before: number; after: number }
export interface ChangeSet {
    baseId: string
    headId: string
    componentsAdded: string[] | null
    componentsRemoved: string[] | null
    edgesAdded: Edge[] | null
    edgesRemoved: Edge[] | null
    edgesChanged: EdgeDelta[] | null
    tangles: TangleChange[] | null
    rulesNew: Finding[] | null
    rulesGone: Finding[] | null
    rulesChecked: { base: boolean; head: boolean }
    moves: Move[] | null
}

export interface Sides<T> { base: T | null; head: T | null; swapped: boolean }

/**
 * Head is the open scan (or the one asked for); base is the one asked for,
 * else the pinned baseline, else the scan of the code just before head,
 * preferring another commit over a rescan of head's own. A
 * base that read newer code than head is swapped, and says so.
 */
export function pickSides<T extends OrderedScan>(scans: T[], opts: { head?: string | null; base?: string | null; baseline?: string | null }): Sides<T> {
    const complete = scans.filter(s => (s.status ?? "complete") === "complete")
    const byId = (id?: string | null) => (id ? complete.find(s => s.id === id) ?? null : null)
    const head = byId(opts.head) ?? newestFirst(complete)[0] ?? null
    if (!head) return { base: null, head: null, swapped: false }
    let base = byId(opts.base) ?? (opts.baseline && opts.baseline !== head.id ? byId(opts.baseline) : null)
    if (!base) {
        // The code just before head: a scan of a different commit when there is one.
        // A rescan of the same commit is older only by when it ran, and comparing
        // it finds nothing (the check-in's "What changed" slot came back empty).
        const older = newestFirst(complete.filter(s => s.id !== head.id && compareScans(s, head) < 0))
        const commit = (s: T) => (s as any).headCommit || ""
        base = older.find(s => !commit(head) || commit(s) !== commit(head)) ?? older[0] ?? null
    }
    if (base && base.id === head.id) base = null
    if (base && compareScans(base, head) > 0) return { base: head, head: base, swapped: true }
    return { base, head, swapped: false }
}

export interface ChangeCounts {
    componentsAdded: number; componentsRemoved: number
    edgesAdded: number; edgesRemoved: number
    tanglesFormed: number; tanglesDissolved: number; tanglesChanged: number
    rulesNew: number; rulesGone: number
}

/**
 * The change set as the page reads it: Go sends an empty list as null (a
 * formed tangle has no "before", an edge may list no files), so every list is
 * made a list once, where it arrives.
 */
export function normalizeChangeSet(cs: ChangeSet): ChangeSet {
    const list = <T>(x: T[] | null | undefined): T[] => x ?? []
    const c = cs as any
    return {
        ...cs,
        componentsAdded: list(c.componentsAdded), componentsRemoved: list(c.componentsRemoved),
        edgesAdded: list(c.edgesAdded).map((e: any) => ({ ...e, files: list(e.files) })),
        edgesRemoved: list(c.edgesRemoved).map((e: any) => ({ ...e, files: list(e.files) })),
        edgesChanged: list(c.edgesChanged),
        tangles: list(c.tangles).map((t: any) => ({ ...t, before: list(t.before), after: list(t.after), joined: list(t.joined), left: list(t.left) })),
        rulesNew: list(c.rulesNew), rulesGone: list(c.rulesGone), moves: list(c.moves),
    } as ChangeSet
}

export function countChanges(cs: ChangeSet): ChangeCounts {
    const t = cs.tangles ?? []
    return {
        componentsAdded: cs.componentsAdded?.length ?? 0,
        componentsRemoved: cs.componentsRemoved?.length ?? 0,
        edgesAdded: cs.edgesAdded?.length ?? 0,
        edgesRemoved: cs.edgesRemoved?.length ?? 0,
        tanglesFormed: t.filter(x => x.kind === "formed").length,
        tanglesDissolved: t.filter(x => x.kind === "dissolved").length,
        tanglesChanged: t.filter(x => x.kind !== "formed" && x.kind !== "dissolved").length,
        rulesNew: cs.rulesNew?.length ?? 0,
        rulesGone: cs.rulesGone?.length ?? 0,
    }
}

/** Nothing structural changed (moves in readings alone do not count). */
export function isUnchanged(c: ChangeCounts): boolean {
    return c.componentsAdded + c.componentsRemoved + c.edgesAdded + c.edgesRemoved + c.tanglesFormed + c.tanglesDissolved + c.tanglesChanged + c.rulesNew + c.rulesGone === 0
}

/** "+3 −1 components · +41 −12 dependencies · +2 tangles · +1 rule finding" */
export function summaryLine(c: ChangeCounts): string {
    const pair = (plus: number, minus: number, one: string, many: string) =>
        plus || minus ? `+${plus} −${minus} ${plus + minus === 1 ? one : many}` : ""
    const tangles = c.tanglesFormed - c.tanglesDissolved
    return [
        pair(c.componentsAdded, c.componentsRemoved, "component", "components"),
        pair(c.edgesAdded, c.edgesRemoved, "dependency", "dependencies"),
        c.tanglesFormed || c.tanglesDissolved || c.tanglesChanged ? t("trends.changes.tangles", { value: tangles >= 0 ? "+" : "−", tangles: Math.abs(tangles), value2: c.tanglesChanged ? t("trends.changes.changed", { tanglesChanged: c.tanglesChanged }) : "" }) : "",
        pair(c.rulesNew, c.rulesGone, t("trends.changes.ruleFinding"), t("trends.changes.ruleFindings")),
    ].filter(Boolean).join(" · ") || t("trends.changes.noStructuralChanges")
}

/** The comparison as a Markdown section for a report. */
export function changesMarkdown(cs: ChangeSet, baseLabel: string, headLabel: string, caption = ""): string {
    const c = countChanges(cs)
    const out = [`## Changes: ${baseLabel} → ${headLabel}`, "", summaryLine(c) + "."]
    const list = (title: string, items: string[]) => { if (items.length) out.push("", `### ${title}`, "", ...items.map(i => `- ${i}`)) }
    list(t("trends.changes.componentsAdded"), (cs.componentsAdded ?? []).map(n => `\`${n}\``))
    list(t("trends.changes.componentsRemoved"), (cs.componentsRemoved ?? []).map(n => `\`${n}\``))
    list(t("trends.changes.dependenciesAdded"), (cs.edgesAdded ?? []).map(e => `\`${e.from}\` → \`${e.to}\` (${e.refs} ref${e.refs === 1 ? "" : "s"}${e.dynamic ? t("trends.changes.runtimeLookupOnly") : ""})`))
    list(t("trends.changes.dependenciesRemoved"), (cs.edgesRemoved ?? []).map(e => `\`${e.from}\` → \`${e.to}\``))
    list("Tangles", (cs.tangles ?? []).map(t => `${t.kind}: ${(t.after.length ? t.after : t.before).map(m => `\`${m}\``).join(", ")}${t.joined.length && t.kind !== "formed" ? ` (joined: ${t.joined.join(", ")})` : ""}${t.left.length && t.kind !== "dissolved" ? ` (left: ${t.left.join(", ")})` : ""}`))
    list(t("trends.changes.newRuleFindings"), (cs.rulesNew ?? []).map(f => t("trends.changes.at", { rule: f.rule, from: f.from, to: f.to, file: f.file, line: f.line })))
    list(t("trends.changes.ruleFindingsGone"), (cs.rulesGone ?? []).map(f => `${f.rule}: \`${f.from}\` → \`${f.to}\``))
    if (caption) out.push("", `_${caption}_`)
    return out.join("\n") + "\n"
}
