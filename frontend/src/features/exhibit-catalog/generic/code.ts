// The code itself: the lines of a file (around what was asked for), where a
// text appears across every file the scan kept, and the files of a component.

import { componentPath, filePath, searchPath } from "~/features/navigation/routes"
import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num, plural, sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

// ── Lines of a file ──────────────────────────────────────────────────────

export interface ExcerptData { path: string; from: number; lines: string[]; total: number; marks: number[]; find: string }

const WINDOW = 60

export const excerpt = exhibit<ExcerptData>()({
    kind: "excerpt", v: 1,
    summary: t("exhibit-catalog.code.linesOneFileNumbered"),
    params: s.object({
        file: s.string().describe(t("exhibit-catalog.code.filePathDistinctiveName")),
        find: s.string().optional().describe(t("exhibit-catalog.code.textFindLinesAround")),
        line: s.integer({ min: 1 }).optional().describe(t("exhibit-catalog.code.lineShowLinesAround")),
    }, { aliases: { path: "file", of: "file", text: "find" } }),

    title: (p, d) => `${(d?.path ?? p.file).split("/").pop()}${d ? t("exhibit-catalog.code.lines4", { from: d.from, value: d.from + d.lines.length - 1 }) : ""}`,

    async resolve(p, { snap }): Promise<ExcerptData | Absent> {
        if (!("file_contents" in snap.columns)) return { absent: t("exhibit-catalog.code.snapshotKeptNoFile") }
        const path = candidates([...snap.fileComponent().keys()], p.file)[0]
        if (!path) return { absent: t("exhibit-catalog.code.noFileMatches", { file: p.file }) }
        const row = (await snap.query<{ content: string }>(`SELECT content FROM file_contents WHERE file = ${sq(path)}`))[0]
        if (!row?.content) return { absent: t("exhibit-catalog.code.noContentsKeptBinary", { path }) }
        const all = String(row.content).split(/\r?\n/)
        const find = String(p.find ?? "").trim()
        const marks = find ? all.map((l, i) => (l.toLowerCase().includes(find.toLowerCase()) ? i + 1 : 0)).filter(Boolean) : []
        if (find && !marks.length) return { absent: t("exhibit-catalog.code.doesNotAppear", { find, path }) }
        const centre = marks[0] ?? p.line ?? 1
        const from = Math.max(1, Math.min(centre - 8, all.length - WINDOW + 1))
        return { path, from, lines: all.slice(from - 1, from - 1 + WINDOW), total: all.length, marks, find }
    },

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: t("exhibit-catalog.code.lines", { path: d.path, from: d.from, value: d.from + d.lines.length - 1, total: n(d.total) }), entities: [d.path], values: { from: d.from, to: d.from + d.lines.length - 1, lines: d.total } }]
        if (d.find) out.push({ kind: "row", text: t("exhibit-catalog.code.appears", { find: d.find, lines: t("common.count.line", { count: d.marks.length }), value: d.marks.slice(0, 12).join(", "), value2: d.marks.length > 12 ? " …" : "" }), entities: [d.path], values: { matches: d.marks.length } })
        // The lines themselves, so an answer can quote them; numbered, as the model should cite them.
        // Long lines cut: the model reads the shape of the code, the figure shows all of it.
        out.push({ kind: "note", text: t("exhibit-catalog.code.lines2", { value: d.lines.slice(0, 45).map((l, i) => `${String(d.from + i).padStart(4)}  ${l.length > 140 ? `${l.slice(0, 140)}…` : l}`).join("\n") }), entities: [], values: {} })
        return out
    },

    elements: d => d.lines.map((_, i) => ({ id: `line:${d.from + i}`, label: t("exhibit-catalog.code.line", { value: d.from + i }) })),

    table: d => ({ columns: [{ id: "line", label: t("exhibit-catalog.code.line2"), numeric: true }, { id: "code", label: t("exhibit-catalog.code.code") }], rows: d.lines.map((l, i) => ({ line: d.from + i, code: l })) }),

    figure: {
        load: () => import("~/features/exhibits/components/ExCode.vue"),
        props: (d, _p, o) => ({ path: d.path, from: d.from, lines: d.lines, marks: d.marks, highlight: o.highlight }),
        height: d => Math.min(390, 40 + d.lines.length * 18),
    },

    // Opens at the lines the exhibit shows, not at the top of the file.
    open: (_p, d) => (d ? { route: d.lines.length ? `${filePath(d.path, "source")}#L${d.from}-L${d.from + d.lines.length - 1}` : filePath(d.path, "source"), label: t("exhibit-catalog.code.openSource") } : null),

    samples: snap => {
        const f = [...snap.fileComponent().keys()].find(x => /\.(java|ts|py|go|kt|js|vue)$/.test(x))
        return f ? [{ file: f }, { file: f, find: "import" }, { file: f, line: 30 }] : []
    },
})

// ── Where a text appears ─────────────────────────────────────────────────

export interface MatchesData { find: string; of: string | null; files: Array<{ file: string; hits: number; component: string }>; totalFiles: number; totalHits: number }

export const matches = exhibit<MatchesData>()({
    kind: "matches", v: 1,
    summary: t("exhibit-catalog.code.everyFileScanKept"),
    params: s.object({
        find: s.string().describe(t("exhibit-catalog.code.textLookAnyCase")),
        of: s.string().optional().describe(t("exhibit-catalog.code.onlyFilesComponentWhose")),
    }, { aliases: { text: "find", in: "of" } }),

    title: (p, d) => t("exhibit-catalog.code.code2", { value: d?.find ?? p.find, value2: (d?.of ?? p.of) ? t("exhibit-catalog.code.of", { value: d?.of ?? p.of }) : "" }),

    async resolve(p, { snap }): Promise<MatchesData | Absent> {
        if (!("file_contents" in snap.columns)) return { absent: t("exhibit-catalog.code.snapshotKeptNoFile2") }
        const find = String(p.find ?? "").trim()
        if (find.length < 2) return { absent: t("exhibit-catalog.code.giveLeastTwoCharacters") }
        const comp = p.of ? candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null : null
        const fileComponent = snap.fileComponent()
        const inScope = (f: string) => !p.of || (comp ? fileComponent.get(f) === comp : f.includes(p.of))
        const needle = find.toLowerCase()
        const rows = await snap.query<{ file: string; hits: number }>(`SELECT file, (length(content) - length(replace(lower(content), ${sq(needle)}, ''))) / ${needle.length} AS hits FROM file_contents WHERE instr(lower(content), ${sq(needle)}) > 0`)
        const files = rows.filter(r => inScope(String(r.file))).map(r => ({ file: String(r.file), hits: Number(r.hits) || 1, component: fileComponent.get(String(r.file)) ?? "" })).sort((a, b) => b.hits - a.hits)
        if (!files.length) return { absent: t("exhibit-catalog.code.appearsNoFile", { find, value: p.of ? t("exhibit-catalog.code.of", { value: comp ?? p.of }) : "" }) }
        return { find, of: comp ?? (p.of || null), files: files.slice(0, 40), totalFiles: files.length, totalHits: files.reduce((sum, f) => sum + f.hits, 0) }
    },

    facts(d) {
        const byComp = new Map<string, number>()
        for (const f of d.files) byComp.set(f.component, (byComp.get(f.component) ?? 0) + f.hits)
        return [
            { kind: "total", text: t("exhibit-catalog.code.appears2", { find: d.find, times: t("common.count.time", { count: d.totalHits }), files: t("common.count.file", { count: d.totalFiles }), value: d.of ? t("exhibit-catalog.code.of2", { of: d.of }) : "" }), entities: [], values: { hits: d.totalHits, files: d.totalFiles } },
            { kind: "row", text: t("exhibit-catalog.code.component", { value: [...byComp].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, k]) => `${c || "(none)"} ${n(k)}`).join(", ") }), entities: [...byComp.keys()].slice(0, 6), values: {} },
            ...d.files.slice(0, 12).map((f, i): FactDraft => ({ kind: "row", text: `${i + 1}. ${f.file}: ${t("common.count.match", { count: f.hits })}${f.component ? ` (${f.component})` : ""}.`, entities: [f.file], values: { hits: f.hits }, element: `row:${f.file}` })),
        ]
    },

    elements: d => d.files.map(f => ({ id: `row:${f.file}`, label: f.file })),

    table: d => ({ columns: [{ id: "file", label: t("exhibit-catalog.code.file") }, { id: "hits", label: t("exhibit-catalog.code.matches"), numeric: true }, { id: "component", label: t("exhibit-catalog.code.component2") }], rows: d.files, total: d.totalFiles }),

    open: (_p, d) => (d ? { route: searchPath(d.find), label: t("exhibit-catalog.code.openFind") } : null),

    samples: () => [{ find: "import" }, { find: "zz_no_such_text_zz" }],
})

// ── The files of a component ─────────────────────────────────────────────

export interface FilesData { component: string; rows: Array<{ file: string; lines: number | null; commits: number | null; health: number | null; role: string }>; total: number }

export const files = exhibit<FilesData>()({
    kind: "files", v: 1,
    summary: t("exhibit-catalog.code.filesOneComponentLargest"),
    params: s.object({
        of: s.string().describe(t("exhibit-catalog.code.component3")),
    }, { aliases: { component: "of" } }),

    title: (p, d) => t("exhibit-catalog.code.files", { value: d?.component ?? p.of }),

    async resolve(p, { snap }): Promise<FilesData | Absent> {
        const component = candidates(snap.components().map(c => String(c.name)), p.of)[0]
        if (!component) return { absent: t("exhibit-catalog.code.noComponentMatches", { of: p.of }) }
        const cols = snap.columns.files ?? []
        const pick = (c: string) => (cols.includes(c) ? c : "NULL")
        const rows = await snap.query(`SELECT name, ${pick("complexity__lines")} AS lines, ${pick("git__commits__total")} AS commits, ${pick("codesmells__code_health")} AS health, ${cols.includes("role") ? "role" : "'production'"} AS role FROM files WHERE component = ${sq(component)} ORDER BY complexity__lines DESC`)
        if (!rows.length) return { absent: t("exhibit-catalog.code.holdsNoFilesSnapshot", { component }) }
        return { component, total: rows.length, rows: rows.slice(0, 40).map((r: any) => ({ file: String(r.name), lines: num(r.lines), commits: num(r.commits), health: num(r.health), role: String(r.role ?? "") })) }
    },

    facts: d => [
        { kind: "total", text: t("exhibit-catalog.code.largestFirst", { files: t("common.count.file", { count: d.total }), component: d.component }), entities: [d.component], values: { files: d.total } },
        ...d.rows.slice(0, 10).map((r, i): FactDraft => ({ kind: "row", text: `${i + 1}. ${r.file}: ${r.lines !== null ? t("exhibit-catalog.code.lines5", { lines: n(r.lines) }) : t("exhibit-catalog.code.sizeUnknown")}${r.commits !== null ? t("exhibit-catalog.code.commits2", { commits: n(r.commits) }) : ""}${r.health !== null && r.health > 0 ? t("exhibit-catalog.code.health2", { health: n(r.health) }) : ""}${r.role && r.role !== "production" ? `, ${r.role}` : ""}.`, entities: [r.file], values: Object.fromEntries(Object.entries({ lines: r.lines, commits: r.commits, health: r.health }).filter(([, v]) => v !== null)) as Record<string, number>, element: `row:${r.file}` })),
    ],

    elements: d => d.rows.map(r => ({ id: `row:${r.file}`, label: r.file })),

    table: d => ({ columns: [{ id: "file", label: t("exhibit-catalog.code.file") }, { id: "lines", label: t("exhibit-catalog.code.lines3"), numeric: true }, { id: "commits", label: t("exhibit-catalog.code.commits"), numeric: true }, { id: "health", label: t("exhibit-catalog.code.health"), numeric: true }, { id: "role", label: t("exhibit-catalog.code.role") }], rows: d.rows, total: d.total }),

    open: (_p, d) => (d ? { route: componentPath(d.component, "inside"), label: t("exhibit-catalog.code.openInside") } : null),

    samples: snap => {
        const big = [...snap.components()].sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
        return big ? [{ of: String(big.name) }] : []
    },
})

// ── Names ────────────────────────────────────────────────────────────────

export interface NamesData { text: string; components: string[]; files: string[] }

export const names = exhibit<NamesData>()({
    kind: "names", v: 1,
    summary: t("exhibit-catalog.code.componentsFilesWhoseNames"),
    params: s.object({
        text: s.string().describe(t("exhibit-catalog.code.partNameAnyCase")),
    }, { aliases: { find: "text", name: "text", query: "text" } }),

    title: p => t("exhibit-catalog.code.namesContaining", { text: p.text }),

    async resolve(p, { snap }): Promise<NamesData | Absent> {
        const q = String(p.text ?? "").trim().toLowerCase()
        if (!q) return { absent: t("exhibit-catalog.code.givePartName") }
        const components = snap.components().map(c => String(c.name)).filter(x => x.toLowerCase().includes(q)).sort((a, b) => a.length - b.length)
        const fileNames = [...snap.fileComponent().keys()].filter(f => f.toLowerCase().includes(q)).sort((a, b) => a.length - b.length)
        if (!components.length && !fileNames.length) return { absent: t("exhibit-catalog.code.noComponentFileName", { text: p.text }) }
        return { text: p.text, components, files: fileNames }
    },

    facts: (d): FactDraft[] => [
        { kind: "total", text: t("exhibit-catalog.code.haveTheirName", { components: t("common.count.component", { count: d.components.length }), files: t("common.count.file", { count: d.files.length }), text: d.text }), entities: [], values: { components: d.components.length, files: d.files.length } },
        ...(d.components.length ? [{ kind: "row" as const, text: t("exhibit-catalog.code.components", { value: d.components.slice(0, 15).join(", "), value2: d.components.length > 15 ? ", …" : "" }), entities: d.components.slice(0, 15), values: {} }] : []),
        ...(d.files.length ? [{ kind: "row" as const, text: t("exhibit-catalog.code.files2", { value: d.files.slice(0, 15).join(", "), value2: d.files.length > 15 ? ", …" : "" }), entities: d.files.slice(0, 15), values: {} }] : []),
    ],

    table: d => ({ columns: [{ id: "name", label: t("exhibit-catalog.code.name") }, { id: "kind", label: t("exhibit-catalog.code.kind") }], rows: [...d.components.map(x => ({ name: x, kind: "component" })), ...d.files.map(x => ({ name: x, kind: "file" }))].slice(0, 60), total: d.components.length + d.files.length }),

    samples: () => [{ text: "a" }, { text: "zz-nothing-zz" }],
})
