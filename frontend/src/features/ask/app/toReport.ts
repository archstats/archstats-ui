// Evidence into a report. The rule: the report runs again what the
// conversation ran. A query stays a query and a component stays the
// component reading; what only a view computes (a cut plan, a walk of the
// graph) is kept as a capture, visibly frozen with its provenance; code is
// quoted as code.

import { newId, type Block, type CellSpec, type RanOn as ReportRanOn, type TableOutput } from "~/features/reports/reportDoc"
import type { Evidence, RanOn } from "../engine/types"
import type { ExhibitPart } from "~/features/exhibits/types"
import { highlightFor } from "~/features/exhibits/engine"
import { layoutAnswer } from "../render/blocks"
import { untrusted } from "../render/verdict"
import type { Grounding } from "~/features/exhibits/grounding"

function ranOnOf(r: RanOn): ReportRanOn {
    return { scanId: r.scanId, label: r.workspace, commit: r.commit, revision: r.revision, at: new Date().toISOString() }
}

function live(spec: CellSpec, title: string): Block {
    return { id: newId(), kind: "cell", cell: { spec, title, caption: "", output: null, ranOn: null } }
}

function capture(title: string, table: TableOutput, r: RanOn, route = ""): Block {
    return { id: newId(), kind: "cell", cell: { spec: { type: "capture", kind: "table", route, view: "Ask" }, title, caption: "", output: { table }, ranOn: ranOnOf(r) } }
}

const col = (id: string, label: string, numeric = false) => ({ id, label, numeric })

export function reportable(e: Evidence): boolean {
    return e.kind !== "link"
}

/** A view's figure in a report: a slot the report fills from the view itself, the way templates ask for figures. */
function viewSlot(title: string, route: string, take?: string): Block {
    return { id: newId(), kind: "cell", cell: { spec: { type: "slot", kind: "figure", route, view: title, hint: "Asked for in an Ask conversation", ...(take ? { take } : {}) }, title, caption: "", output: null, ranOn: null } }
}

/** The report blocks a piece of evidence becomes (usually one cell). */
export function evidenceBlocks(e: Evidence): Block[] {
    switch (e.kind) {
        case "bars":
            if (e.sql) return [live({ type: "sql", sql: e.sql, limit: Math.max(10, e.items.length) }, e.title)]
            return [capture(e.title, { columns: [col("name", "Name"), col("value", e.unit, true)], rows: e.items.map(i => ({ name: i.key ?? i.label, value: i.value })), total: e.items.length, note: e.note }, e.ranOn, e.open?.route)]
        case "table":
            if (e.sql) return [live({ type: "sql", sql: e.sql, limit: Math.max(20, Math.min(200, e.rows.length)) }, e.title)]
            return [capture(e.title, { columns: e.columns.map((c, i) => col(`c${i}`, c, typeof e.rows[0]?.[i] === "number")), rows: e.rows.map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))), total: e.total, note: e.note }, e.ranOn, e.open?.route)]
        case "component":
            return [live({ type: "reading", reading: "focus", params: { component: e.name } }, `One component: ${e.name}`)]
        case "graph":
            return [capture(`${e.title}: the components`, { columns: [col("name", "Component"), col("uses", "Imports among these", true)], rows: e.nodes.map(n => ({ name: n, uses: e.edges.filter(x => x.from === n).length })), total: e.nodes.length, note: `Walked with "${e.query}".` }, e.ranOn, e.open?.route)]
        case "tangle":
            return [capture(e.title, {
                columns: [col("cut", "Import to cut"), col("imports", "Import references", true), col("freed", "Components freed", true), col("tangled", "Still tangled", true), col("files", "Carried by")],
                rows: e.steps.map(s => ({ cut: `${s.from} → ${s.to}`, imports: s.imports, freed: s.freed, tangled: s.tangled, files: s.carriers.join(", ") })),
                total: e.steps.length, note: `A tangle of ${e.members.length} components; cuts in the order that untangles most first.`,
            }, e.ranOn, e.open?.route)]
        case "file":
            return [capture(`${e.path}`, { columns: [col("measure", "Measure"), col("value", "Value", true)], rows: e.values.map(v => ({ measure: v.label, value: v.value })), total: e.values.length, note: `Component ${e.component}; role ${e.role}.` }, e.ranOn, e.open?.route)]
        case "code":
            return [{ id: newId(), kind: "p", text: `${e.path}, lines ${e.from}–${e.from + e.lines.length - 1}:` }, { id: newId(), kind: "code", text: e.lines.join("\n"), lang: e.path.split(".").pop() }]
        case "timeline":
            if (e.sql) return [live({ type: "sql", sql: e.sql, limit: e.points.length }, e.title)]
            return [capture(e.title, { columns: [col("period", "Month"), col("value", e.unit, true)], rows: e.points.map(p => ({ period: p.label, value: p.value })), total: e.points.length }, e.ranOn, e.open?.route)]
        case "layers":
            return [capture(e.title, { columns: [col("floor", "Layer, top to bottom"), col("sub", "Size"), col("up", "Imports pointing back up", true)], rows: e.floors.map(f => ({ floor: f.label, sub: f.sub, up: e.flows.filter(x => x.bad && x.from === f.id).reduce((s, x) => s + x.count, 0) })), total: e.floors.length, note: `Floors are ${e.grouping}.` }, e.ranOn, e.open?.route)]
        case "folders": {
            const by = new Map<string, number>()
            e.files.forEach((f, i) => { const k = f.split("/").slice(0, 2).join("/"); by.set(k, (by.get(k) ?? 0) + e.lines[i]) })
            return [capture(e.title, { columns: [col("folder", "Folder"), col("lines", "Lines", true)], rows: [...by].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([folder, lines]) => ({ folder, lines })), total: by.size }, e.ranOn, e.open?.route)]
        }
        case "knowledge":
            return [capture(e.title, { columns: [col("component", "Component"), col("lines", "Lines", true), col("state", "Knowledge"), col("ask", "Person to ask")], rows: [...e.rows].sort((a, b) => b.lines - a.lines).slice(0, 40).map(r => ({ component: r.component, lines: r.lines, state: r.state, ask: r.ask ?? "" })), total: e.rows.length, note: `Over ${e.windowWords}.` }, e.ranOn, e.open?.route)]
        case "view": {
            const out: Block[] = e.figures.slice(0, 1).map(f => viewSlot(f.title, e.route, f.title))
            const t = e.tables[0]
            if (t) out.push(capture(t.title, { columns: t.columns.map((c, i) => col(`c${i}`, c)), rows: t.rows.map(r => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))), total: t.total }, e.ranOn, e.route))
            return out
        }
        case "link":
            return []
    }
}

/** The prose of an answer as a writer's prompt: a draft that never prints until rewritten. */
export function draftPrompt(answer: string): string {
    const draft = answer.replace(/\s*\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g, "").trim()
    return draft ? `Draft from Ask (rewrite in your own words, or delete): ${draft}` : "Your reading of the evidence below."
}

/** An exhibit as a report cell: its spec, run again on the report's snapshot; lit as it was beside its sentence. */
export function exhibitBlock(x: ExhibitPart, highlight: string[] = [], caption = ""): Block {
    return { id: newId(), kind: "cell", cell: { spec: { type: "exhibit", kind: x.spec.kind, v: x.spec.v, params: x.spec.params, ...(highlight.length ? { highlight } : {}) }, title: x.title, caption, output: null, ranOn: null } }
}

/**
 * An answer as report blocks, in its own order: its prose as paragraphs, each
 * exhibit it shows as a cell where it shows it. Exhibits it neither placed nor
 * cited stay out: the answer did not rest on them.
 */
export function answerBlocks(answer: string, exhibits: ExhibitPart[], fromMarkdown: (md: string) => Block[]): Block[] {
    const byId = new Map(exhibits.map(x => [x.id, x]))
    const strip = (t: string) => t.replace(/\s*\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g, "").trim()
    return layoutAnswer(answer, new Set(byId.keys())).blocks.flatMap(b => {
        if (b.type === "prose") return fromMarkdown(strip(b.text))
        const x = byId.get(b.id)!
        return [exhibitBlock(x, highlightFor(x, b.cites), b.caption)]
    })
}

/**
 * What an answer said that its facts did not bear out, kept visible in the
 * report instead of passing as a finding: one quote to check or delete.
 */
export function checkBlocks(g: Grounding | null | undefined, broken: string[] = []): Block[] {
    const strip = (t: string) => t.replace(/\s*\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g, "").trim()
    const lines = [
        ...untrusted(g).map(c => `- ${strip(c.sentence)} (${c.verdict}: ${c.reasons.join("; ")})`),
        ...(broken.length ? [`- The answer cited ${broken.join(", ")}, which Ask never showed.`] : []),
    ]
    if (!lines.length) return []
    return [{ id: newId(), kind: "quote", text: `Check before using: Ask could not back these with the facts it cited.\n${lines.join("\n")}` }]
}
