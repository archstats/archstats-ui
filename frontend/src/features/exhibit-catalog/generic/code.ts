// The code itself: the lines of a file (around what was asked for), where a
// text appears across every file the scan kept, and the files of a component.

import { componentPath, filePath, searchPath } from "~/features/navigation/routes"
import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num, plural, sq } from "~/features/exhibits/words"

// ── Lines of a file ──────────────────────────────────────────────────────

export interface ExcerptData { path: string; from: number; lines: string[]; total: number; marks: number[]; find: string }

const WINDOW = 60

export const excerpt = exhibit<ExcerptData>()({
    kind: "excerpt", v: 1,
    summary: "Lines of one file, numbered: around a text in it, around a line, or from the top.",
    params: s.object({
        file: s.string().describe("The file, by path or a distinctive name."),
        find: s.string().optional().describe("Text to find in it; the lines around its first occurrence are shown and every match is marked."),
        line: s.integer({ min: 1 }).optional().describe("A line to show the lines around."),
    }, { aliases: { path: "file", of: "file", text: "find" } }),

    title: (p, d) => `${(d?.path ?? p.file).split("/").pop()}${d ? `, lines ${d.from}–${d.from + d.lines.length - 1}` : ""}`,

    async resolve(p, { snap }): Promise<ExcerptData | Absent> {
        if (!("file_contents" in snap.columns)) return { absent: "This snapshot kept no file contents; the code cannot be read from it." }
        const path = candidates([...snap.fileComponent().keys()], p.file)[0]
        if (!path) return { absent: `No file matches "${p.file}".` }
        const row = (await snap.query<{ content: string }>(`SELECT content FROM file_contents WHERE file = ${sq(path)}`))[0]
        if (!row?.content) return { absent: `No contents kept for ${path} (binary, too large, or not source).` }
        const all = String(row.content).split(/\r?\n/)
        const find = String(p.find ?? "").trim()
        const marks = find ? all.map((l, i) => (l.toLowerCase().includes(find.toLowerCase()) ? i + 1 : 0)).filter(Boolean) : []
        if (find && !marks.length) return { absent: `"${find}" does not appear in ${path}.` }
        const centre = marks[0] ?? p.line ?? 1
        const from = Math.max(1, Math.min(centre - 8, all.length - WINDOW + 1))
        return { path, from, lines: all.slice(from - 1, from - 1 + WINDOW), total: all.length, marks, find }
    },

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: `${d.path}, lines ${d.from}–${d.from + d.lines.length - 1} of ${n(d.total)}.`, entities: [d.path], values: { from: d.from, to: d.from + d.lines.length - 1, lines: d.total } }]
        if (d.find) out.push({ kind: "row", text: `"${d.find}" appears on ${plural(d.marks.length, "line")}: ${d.marks.slice(0, 12).join(", ")}${d.marks.length > 12 ? " …" : ""}.`, entities: [d.path], values: { matches: d.marks.length } })
        // The lines themselves, so an answer can quote them; numbered, as the model should cite them.
        // Long lines cut: the model reads the shape of the code, the figure shows all of it.
        out.push({ kind: "note", text: `The lines:\n${d.lines.slice(0, 45).map((l, i) => `${String(d.from + i).padStart(4)}  ${l.length > 140 ? `${l.slice(0, 140)}…` : l}`).join("\n")}`, entities: [], values: {} })
        return out
    },

    elements: d => d.lines.map((_, i) => ({ id: `line:${d.from + i}`, label: `line ${d.from + i}` })),

    table: d => ({ columns: [{ id: "line", label: "Line", numeric: true }, { id: "code", label: "Code" }], rows: d.lines.map((l, i) => ({ line: d.from + i, code: l })) }),

    figure: {
        load: () => import("~/features/exhibits/components/ExCode.vue"),
        props: (d, _p, o) => ({ path: d.path, from: d.from, lines: d.lines, marks: d.marks, highlight: o.highlight }),
        height: d => Math.min(390, 40 + d.lines.length * 18),
    },

    open: (_p, d) => (d ? { route: filePath(d.path, "source"), label: "Open source" } : null),

    samples: snap => {
        const f = [...snap.fileComponent().keys()].find(x => /\.(java|ts|py|go|kt|js|vue)$/.test(x))
        return f ? [{ file: f }, { file: f, find: "import" }, { file: f, line: 30 }] : []
    },
})

// ── Where a text appears ─────────────────────────────────────────────────

export interface MatchesData { find: string; of: string | null; files: Array<{ file: string; hits: number; component: string }>; totalFiles: number; totalHits: number }

export const matches = exhibit<MatchesData>()({
    kind: "matches", v: 1,
    summary: "Every file the scan kept that contains a text, with how often, most first.",
    params: s.object({
        find: s.string().describe("The text to look for (any case)."),
        of: s.string().optional().describe("Only files of this component, or whose path contains this."),
    }, { aliases: { text: "find", in: "of" } }),

    title: (p, d) => `"${d?.find ?? p.find}" in the code${(d?.of ?? p.of) ? ` of ${d?.of ?? p.of}` : ""}`,

    async resolve(p, { snap }): Promise<MatchesData | Absent> {
        if (!("file_contents" in snap.columns)) return { absent: "This snapshot kept no file contents; the code cannot be searched." }
        const find = String(p.find ?? "").trim()
        if (find.length < 2) return { absent: "Give at least two characters to look for." }
        const comp = p.of ? candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null : null
        const fileComponent = snap.fileComponent()
        const inScope = (f: string) => !p.of || (comp ? fileComponent.get(f) === comp : f.includes(p.of))
        const needle = find.toLowerCase()
        const rows = await snap.query<{ file: string; hits: number }>(`SELECT file, (length(content) - length(replace(lower(content), ${sq(needle)}, ''))) / ${needle.length} AS hits FROM file_contents WHERE instr(lower(content), ${sq(needle)}) > 0`)
        const files = rows.filter(r => inScope(String(r.file))).map(r => ({ file: String(r.file), hits: Number(r.hits) || 1, component: fileComponent.get(String(r.file)) ?? "" })).sort((a, b) => b.hits - a.hits)
        if (!files.length) return { absent: `"${find}" appears in no file${p.of ? ` of ${comp ?? p.of}` : ""}.` }
        return { find, of: comp ?? (p.of || null), files: files.slice(0, 40), totalFiles: files.length, totalHits: files.reduce((sum, f) => sum + f.hits, 0) }
    },

    facts(d) {
        const byComp = new Map<string, number>()
        for (const f of d.files) byComp.set(f.component, (byComp.get(f.component) ?? 0) + f.hits)
        return [
            { kind: "total", text: `"${d.find}" appears ${plural(d.totalHits, "time")} in ${plural(d.totalFiles, "file")}${d.of ? ` of ${d.of}` : ""}.`, entities: [], values: { hits: d.totalHits, files: d.totalFiles } },
            { kind: "row", text: `By component: ${[...byComp].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, k]) => `${c || "(none)"} ${n(k)}`).join(", ")}.`, entities: [...byComp.keys()].slice(0, 6), values: {} },
            ...d.files.slice(0, 12).map((f, i): FactDraft => ({ kind: "row", text: `${i + 1}. ${f.file}: ${plural(f.hits, "match", "matches")}${f.component ? ` (${f.component})` : ""}.`, entities: [f.file], values: { hits: f.hits }, element: `row:${f.file}` })),
        ]
    },

    elements: d => d.files.map(f => ({ id: `row:${f.file}`, label: f.file })),

    table: d => ({ columns: [{ id: "file", label: "File" }, { id: "hits", label: "Matches", numeric: true }, { id: "component", label: "Component" }], rows: d.files, total: d.totalFiles }),

    open: (_p, d) => (d ? { route: searchPath(d.find), label: "Open in Find" } : null),

    samples: () => [{ find: "import" }, { find: "zz_no_such_text_zz" }],
})

// ── The files of a component ─────────────────────────────────────────────

export interface FilesData { component: string; rows: Array<{ file: string; lines: number | null; commits: number | null; health: number | null; role: string }>; total: number }

export const files = exhibit<FilesData>()({
    kind: "files", v: 1,
    summary: "The files of one component, largest first, with lines, commits, health and role.",
    params: s.object({
        of: s.string().describe("The component."),
    }, { aliases: { component: "of" } }),

    title: (p, d) => `Files in ${d?.component ?? p.of}`,

    async resolve(p, { snap }): Promise<FilesData | Absent> {
        const component = candidates(snap.components().map(c => String(c.name)), p.of)[0]
        if (!component) return { absent: `No component matches "${p.of}".` }
        const cols = snap.columns.files ?? []
        const pick = (c: string) => (cols.includes(c) ? c : "NULL")
        const rows = await snap.query(`SELECT name, ${pick("complexity__lines")} AS lines, ${pick("git__commits__total")} AS commits, ${pick("codesmells__code_health")} AS health, ${cols.includes("role") ? "role" : "'production'"} AS role FROM files WHERE component = ${sq(component)} ORDER BY complexity__lines DESC`)
        if (!rows.length) return { absent: `${component} holds no files in this snapshot.` }
        return { component, total: rows.length, rows: rows.slice(0, 40).map((r: any) => ({ file: String(r.name), lines: num(r.lines), commits: num(r.commits), health: num(r.health), role: String(r.role ?? "") })) }
    },

    facts: d => [
        { kind: "total", text: `${plural(d.total, "file")} in ${d.component}, largest first.`, entities: [d.component], values: { files: d.total } },
        ...d.rows.slice(0, 10).map((r, i): FactDraft => ({ kind: "row", text: `${i + 1}. ${r.file}: ${r.lines !== null ? `${n(r.lines)} lines` : "size unknown"}${r.commits !== null ? `, ${n(r.commits)} commits` : ""}${r.health !== null && r.health > 0 ? `, health ${n(r.health)}` : ""}${r.role && r.role !== "production" ? `, ${r.role}` : ""}.`, entities: [r.file], values: Object.fromEntries(Object.entries({ lines: r.lines, commits: r.commits, health: r.health }).filter(([, v]) => v !== null)) as Record<string, number>, element: `row:${r.file}` })),
    ],

    elements: d => d.rows.map(r => ({ id: `row:${r.file}`, label: r.file })),

    table: d => ({ columns: [{ id: "file", label: "File" }, { id: "lines", label: "Lines", numeric: true }, { id: "commits", label: "Commits", numeric: true }, { id: "health", label: "Health", numeric: true }, { id: "role", label: "Role" }], rows: d.rows, total: d.total }),

    open: (_p, d) => (d ? { route: componentPath(d.component, "inside"), label: "Open Inside" } : null),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
        return big ? [{ of: String(big.name) }] : []
    },
})

// ── Names ────────────────────────────────────────────────────────────────

export interface NamesData { text: string; components: string[]; files: string[] }

export const names = exhibit<NamesData>()({
    kind: "names", v: 1,
    summary: "Components and files whose names contain a text.",
    params: s.object({
        text: s.string().describe("Part of a name, any case."),
    }, { aliases: { find: "text", name: "text", query: "text" } }),

    title: p => `Names containing "${p.text}"`,

    async resolve(p, { snap }): Promise<NamesData | Absent> {
        const q = String(p.text ?? "").trim().toLowerCase()
        if (!q) return { absent: "Give part of a name." }
        const components = snap.components().map(c => String(c.name)).filter(x => x.toLowerCase().includes(q)).sort((a, b) => a.length - b.length)
        const fileNames = [...snap.fileComponent().keys()].filter(f => f.toLowerCase().includes(q)).sort((a, b) => a.length - b.length)
        if (!components.length && !fileNames.length) return { absent: `No component or file name contains "${p.text}". The code itself may: look inside the files for it.` }
        return { text: p.text, components, files: fileNames }
    },

    facts: (d): FactDraft[] => [
        { kind: "total", text: `${plural(d.components.length, "component")} and ${plural(d.files.length, "file")} have "${d.text}" in their name.`, entities: [], values: { components: d.components.length, files: d.files.length } },
        ...(d.components.length ? [{ kind: "row" as const, text: `Components: ${d.components.slice(0, 15).join(", ")}${d.components.length > 15 ? ", …" : ""}.`, entities: d.components.slice(0, 15), values: {} }] : []),
        ...(d.files.length ? [{ kind: "row" as const, text: `Files: ${d.files.slice(0, 15).join(", ")}${d.files.length > 15 ? ", …" : ""}.`, entities: d.files.slice(0, 15), values: {} }] : []),
    ],

    table: d => ({ columns: [{ id: "name", label: "Name" }, { id: "kind", label: "Kind" }], rows: [...d.components.map(x => ({ name: x, kind: "component" })), ...d.files.map(x => ({ name: x, kind: "file" }))].slice(0, 60), total: d.components.length + d.files.length }),

    samples: () => [{ text: "a" }, { text: "zz-nothing-zz" }],
})
