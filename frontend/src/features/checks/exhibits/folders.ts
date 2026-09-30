// Where the code lives: every file drawn by size in its folders, painted by
// role (production, tests, generated…), health, churn or component. Answers
// "where is the mass", "where are the tests", "where is the unhealthy code".

import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, plural, sq } from "~/features/exhibits/words"

export interface FoldersData {
    of: string
    colorBy: "role" | "health" | "churn" | "component"
    note: string
    files: string[]
    lines: number[]
    values: Array<number | string | null>
    total: number
    folders: Array<{ folder: string; lines: number }>
    byValue: Array<{ value: string; lines: number }>
    unhealthy: number | null
    churned: Array<{ file: string; commits: number }>
}

export const folders = exhibit<FoldersData>()({
    kind: "folders", v: 1,
    summary: "Where the code lives: every file by size in its folders, painted by role, health, churn or component.",
    params: s.object({
        of: s.string().optional().describe("Only files whose path contains this (a folder or component path)."),
        by: s.enum(["role", "health", "churn", "component"]).default("role").describe("What the colour shows: role (default), health, churn or component."),
    }, { aliases: { within: "of", color: "by" } }),

    title: (p, d) => `Where the code lives${(d?.of || p.of) ? ` · ${d?.of || p.of}` : ""} · by ${d?.colorBy ?? p.by ?? "role"}`,

    async resolve(p, { snap }): Promise<FoldersData | Absent> {
        const cols = snap.columns.files ?? []
        let colorBy = (p.by ?? "role") as FoldersData["colorBy"]
        let note = ""
        if (colorBy === "role" && !cols.includes("role")) { colorBy = "component"; note = "This snapshot records no file roles (it predates them), so the map is coloured by component instead; tests cannot be told apart here." }
        const valueCol = colorBy === "health" ? "codesmells__code_health" : colorBy === "churn" ? "git__commits__total" : colorBy === "component" ? "component" : "role"
        if (!cols.includes(valueCol)) return { absent: `This snapshot has no ${colorBy} for files.` }
        const of = String(p.of ?? "").trim()
        const where = [`complexity__lines > 0`, of ? `name LIKE ${sq(`%${of.replace(/[%_]/g, "")}%`)}` : ""].filter(Boolean).join(" AND ")
        const rows = await snap.query<{ name: string; lines: number; v: any }>(`SELECT name, complexity__lines AS lines, ${valueCol} AS v FROM files WHERE ${where} ORDER BY lines DESC LIMIT 4000`)
        if (!rows.length) return { absent: `No files${of ? ` under "${of}"` : ""}.` }
        const folderLines = new Map<string, number>()
        for (const r of rows) { const f = r.name.split("/").slice(0, 2).join("/"); folderLines.set(f, (folderLines.get(f) ?? 0) + Number(r.lines)) }
        const byValue = new Map<string, number>()
        if (colorBy === "role" || colorBy === "component") for (const r of rows) byValue.set(String(r.v ?? "unknown"), (byValue.get(String(r.v ?? "unknown")) ?? 0) + Number(r.lines))
        return {
            of, colorBy, note,
            files: rows.map(r => r.name), lines: rows.map(r => Number(r.lines)),
            values: rows.map(r => (r.v === null || r.v === undefined ? null : typeof r.v === "number" ? r.v : String(r.v))),
            total: rows.reduce((sum, r) => sum + Number(r.lines), 0),
            folders: [...folderLines].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([folder, lines]) => ({ folder, lines })),
            byValue: [...byValue].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, lines]) => ({ value, lines })),
            unhealthy: colorBy === "health" ? rows.filter(r => Number(r.v) > 0 && Number(r.v) < 5).reduce((sum, r) => sum + Number(r.lines), 0) : null,
            churned: colorBy === "churn" ? [...rows].sort((a, b) => Number(b.v) - Number(a.v)).slice(0, 6).map(r => ({ file: r.name, commits: Number(r.v) || 0 })) : [],
        }
    },

    facts(d) {
        const pct = (x: number) => Math.round((100 * x) / Math.max(1, d.total))
        const out: FactDraft[] = [{ kind: "total", text: `${plural(d.files.length, "file")}, ${plural(d.total, "line")}${d.of ? ` under "${d.of}"` : ""}.`, entities: [], values: { files: d.files.length, lines: d.total } }]
        if (d.note) out.push({ kind: "note", text: d.note, entities: [], values: {} })
        out.push({ kind: "rank", text: `Largest folders: ${d.folders.slice(0, 8).map(f => `${f.folder} (${n(f.lines)} lines, ${pct(f.lines)}%)`).join(", ")}.`, entities: d.folders.slice(0, 8).map(f => f.folder), values: Object.fromEntries(d.folders.slice(0, 8).map(f => [f.folder, f.lines])) })
        for (const v of d.byValue) out.push({ kind: "row", text: `${d.colorBy === "role" ? "Role" : "Component"} ${v.value}: ${n(v.lines)} lines (${pct(v.lines)}%).`, entities: d.colorBy === "component" ? [v.value] : [], values: { lines: v.lines, percent: pct(v.lines) } })
        if (d.unhealthy !== null) out.push({ kind: "row", text: `${n(d.unhealthy)} lines (${pct(d.unhealthy)}%) are in files with health below 5.`, entities: [], values: { lines: d.unhealthy, percent: pct(d.unhealthy) } })
        for (const c of d.churned) out.push({ kind: "row", text: `${c.file}: ${plural(c.commits, "commit")}.`, entities: [c.file], values: { commits: c.commits }, element: `file:${c.file}` })
        return out
    },

    elements: d => [...new Set([...d.files.slice(0, 400), ...d.churned.map(c => c.file)])].map(f => ({ id: `file:${f}`, label: f })).concat(d.folders.map(f => ({ id: `folder:${f.folder}`, label: f.folder }))),

    table: d => ({ columns: [{ id: "folder", label: "Folder" }, { id: "lines", label: "Lines", numeric: true }], rows: d.folders, total: d.folders.length }),

    figure: {
        load: () => import("~/features/checks/components/FolderExhibit.vue"),
        props: (d, _p, o) => ({ files: d.files, lines: d.lines, values: d.values, colorBy: d.colorBy, title: o.title, highlight: o.highlight }),
        height: (_d, o) => (o.density === "inline" ? 340 : 520),
        fill: true,
        picks: { pick: (element: string) => element },
    },

    open: p => ({ route: "/views/metrics?grain=files", label: "Open Metrics" }),

    samples: () => [{ by: "health" }, { by: "churn" }, { by: "component" }],
})
