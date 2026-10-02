// The code itself: which files a component holds, a file's outline (its
// declarations with line numbers, and its imports both ways), the lines of a
// file, and search across every file the scan kept. An architect reads the
// outline before the code, and the code before explaining behaviour.

import { componentPath, filePath, searchPath } from "~/features/navigation/routes"
import type { Tool, World } from "../engine/types"
import { fmt, notFound, num, resolveComponent, resolveFile, shortName } from "./shared"

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`
const has = (world: World, table: string) => table in world.columns

/** Snippet types that declare something a reader would look for. */
function isDeclaration(type: string): boolean {
    if (/import|modularity__/.test(type)) return false
    return /declaration|definition|span|function|method|class|interface|struct|enum|type|trait|protocol|annotation|route|endpoint/.test(type)
}

function kindOf(type: string): string {
    const t = type.replace(/^[a-z]+__/, "").replace(/__/g, " ")
    return t.replace(/ declaration$| definition$| span$/, "").trim()
}

export const codeTools: Tool[] = [
    {
        name: "files_of", namespace: "files",
        description: "The files of a component, largest first, with lines, commits, health and role. Example: {\"component\": \"checkout\"}",
        params: { component: { type: "string", description: "Component name." } }, required: ["component"],
        label: a => `Listed the files of ${a.component}`,
        async run(a, { world, ranOn, nextId }) {
            const { name, also } = resolveComponent(world, a.component)
            if (!name) return { text: notFound("component", a.component, also) }
            const cols = world.columns.files ?? []
            const pick = ["complexity__lines", "git__commits__total", "codesmells__code_health", "role"].filter(c => cols.includes(c))
            const sql = `SELECT name, ${pick.join(", ")} FROM files WHERE component = ${sq(name)} ORDER BY complexity__lines DESC LIMIT 40`
            const rows = await world.query(sql)
            if (!rows.length) return { text: `${name} holds no files in this snapshot.` }
            const id = nextId()
            const label: Record<string, string> = { complexity__lines: "Lines", git__commits__total: "Commits", codesmells__code_health: "Health", role: "Role" }
            return {
                text: `[${id}] ${fmt(rows.length)} files in ${name}, largest first:\n${rows.slice(0, 30).map((r: any) => `${r.name} · ${pick.map(c => `${label[c].toLowerCase()} ${fmt(r[c])}`).join(" · ")}`).join("\n")}`,
                evidence: [{ id, kind: "table", title: `Files in ${shortName(name)}`, columns: ["File", ...pick.map(c => label[c])], rows: rows.map((r: any) => [r.name, ...pick.map(c => r[c])]), total: rows.length, sql, ranOn, open: { route: componentPath(name, "inside"), label: "Open Inside" } }],
                followUps: rows[0] ? [`Outline ${String(rows[0].name).split("/").pop()}`] : [],
            }
        },
    },
    {
        name: "file_outline", namespace: "files",
        description: "Skim one file: its component and role, size, health, churn, the declarations in it with line numbers (classes, functions, methods…), what it imports and what imports it. Read this before file_read. Example: {\"path\": \"src/checkout/Cart.java\"} (a file name alone works)",
        params: { path: { type: "string", description: "File path, or a distinctive file name." } }, required: ["path"],
        label: a => `Outlined ${a.path}`,
        async run(a, { world, ranOn, nextId }) {
            const { name: path, also } = resolveFile(world, a.path)
            if (!path) return { text: notFound("file", a.path, also) }
            const cols = world.columns.files ?? []
            const want = ["component", "role", "complexity__lines", "codesmells__code_health", "git__commits__total", "git__commits__last_90_days", "git__authors__total", "git__last_change_age_in_days", "codesmells__hotspot_score",
                "codesmells__health__deduction__complex_code", "codesmells__health__deduction__coupling", "codesmells__health__deduction__size", "codesmells__health__deduction__deep_code"].filter(c => cols.includes(c))
            const row = (await world.query(`SELECT ${want.join(", ")} FROM files WHERE name = ${sq(path)}`))[0] ?? {}
            let outline: Array<{ line: number; kind: string; text: string }> = []
            let imports: string[] = []
            if (has(world, "snippets")) {
                const snips = await world.query<{ snippet_type: string; begin_position: string; content: string }>(`SELECT snippet_type, begin_position, content FROM snippets WHERE file = ${sq(path)}`)
                outline = snips.filter(s => isDeclaration(s.snippet_type))
                    .map(s => ({ line: Number(String(s.begin_position).split(":")[0]) || 0, kind: kindOf(s.snippet_type), text: String(s.content).replace(/\s+/g, " ").slice(0, 90) }))
                    // One entry per line: a named kind (function, class) beats the generic "declaration" span.
                    .sort((x, y) => x.line - y.line || (x.kind === "declaration" ? 1 : 0) - (y.kind === "declaration" ? 1 : 0))
                    .filter((s, i, all) => i === 0 || s.line !== all[i - 1].line)
                    .slice(0, 60)
                imports = [...new Set(snips.filter(s => s.snippet_type === "modularity__component__imports").map(s => String(s.content)))]
            }
            let importedBy: string[] = []
            let importsFiles: string[] = []
            if (has(world, "unit_connections")) {
                importedBy = (await world.query<{ f: string }>(`SELECT DISTINCT from_file AS f FROM unit_connections WHERE to_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
                importsFiles = (await world.query<{ f: string }>(`SELECT DISTINCT to_file AS f FROM unit_connections WHERE from_file = ${sq(path)} AND from_file != to_file LIMIT 40`)).map(r => r.f)
            }
            // Revision 11 on: what took the health down, and the functions behind complex code.
            const deductions = ([["complex code", row.codesmells__health__deduction__complex_code], ["coupling", row.codesmells__health__deduction__coupling], ["size", row.codesmells__health__deduction__size], ["deep code (from indentation)", row.codesmells__health__deduction__deep_code]] as const)
                .filter(([, v]) => num(v) !== null).map(([k, v]) => `${k} −${fmt(num(v))}`)
            let complexFunctions: Array<{ name: string; begin_line: number; end_line: number; cognitive: number }> = []
            if (has(world, "functions")) {
                complexFunctions = await world.query(`SELECT name, begin_line, end_line, cognitive FROM functions WHERE file = ${sq(path)} AND cognitive > 15 ORDER BY cognitive DESC LIMIT 10`)
            }
            const values = [
                { label: "Lines", value: num(row.complexity__lines) },
                { label: "Code health (10 best)", value: num(row.codesmells__code_health) },
                { label: "Commits, all time", value: num(row.git__commits__total) },
                { label: "Commits, last 90 days", value: num(row.git__commits__last_90_days) },
                { label: "Authors", value: num(row.git__authors__total) },
                { label: "Days since last change", value: num(row.git__last_change_age_in_days) },
            ].filter(v => v.value !== null)
            const id = nextId()
            const text = [
                `[${id}] ${path} · component ${row.component ?? world.fileComponent().get(path) ?? "?"} · role ${row.role ?? world.fileRole(path)}`,
                values.map(v => `${v.label}: ${fmt(v.value)}`).join(" · "),
                deductions.length ? `Health deductions (10 less these): ${deductions.join(", ")}` : "",
                complexFunctions.length ? `Complex functions (cognitive complexity over 15, worst first): ${complexFunctions.map(f => `${f.name || "anonymous"} (cognitive ${f.cognitive}, lines ${f.begin_line}–${f.end_line})`).join("; ")}` : "",
                outline.length ? `Declarations (${outline.length}${outline.length === 60 ? "+" : ""}; ${[...new Set(outline.map(o => o.kind))].map(k => `${outline.filter(o => o.kind === k).length} ${k}`).join(", ")}):\n${outline.map(o => `  line ${o.line} · ${o.kind}: ${o.text}`).join("\n")}` : "No declarations recorded for this file type.",
                imports.length ? `Imports ${imports.length} components: ${imports.slice(0, 20).join(", ")}` : "",
                importsFiles.length ? `Uses ${importsFiles.length} files: ${importsFiles.slice(0, 15).join(", ")}` : "",
                importedBy.length ? `Used by ${importedBy.length} files: ${importedBy.slice(0, 15).join(", ")}${importedBy.length > 15 ? " …" : ""}` : has(world, "unit_connections") ? "No other file is recorded as using it." : "",
            ].filter(Boolean).join("\n")
            return {
                text,
                evidence: [{ id, kind: "file", title: path.split("/").pop() ?? path, path, component: String(row.component ?? ""), role: String(row.role ?? world.fileRole(path)), values, outline, importsFrom: importsFiles.length ? importsFiles : imports, importedBy, ranOn, open: { route: filePath(path), label: "Open file" } }],
                followUps: [`Read ${path.split("/").pop()}`],
            }
        },
    },
    {
        name: "file_read", namespace: "files",
        description: "The lines of a file, numbered, at most 150 at a time. Use file_outline first to find the lines that matter. Example: {\"path\": \"Cart.java\", \"from\": 40, \"to\": 120}",
        params: {
            path: { type: "string", description: "File path, or a distinctive file name." },
            from: { type: "number", description: "First line, default 1." },
            to: { type: "number", description: "Last line, default from + 120." },
        },
        required: ["path"],
        label: a => `Read ${a.path}${a.from ? ` from line ${a.from}` : ""}`,
        async run(a, { world, ranOn, nextId }) {
            if (!has(world, "file_contents")) return { text: "This snapshot kept no file contents; the code cannot be read from it." }
            const { name: path, also } = resolveFile(world, a.path)
            if (!path) return { text: notFound("file", a.path, also) }
            const row = (await world.query<{ content: string }>(`SELECT content FROM file_contents WHERE file = ${sq(path)}`))[0]
            if (!row?.content) return { text: `No contents kept for ${path} (binary, too large, or not source).` }
            const all = String(row.content).split(/\r?\n/)
            const from = Math.max(1, Math.floor(Number(a.from) || 1))
            const to = Math.min(all.length, Math.max(from, Math.floor(Number(a.to) || from + 119)), from + 149)
            const lines = all.slice(from - 1, to)
            const id = nextId()
            return {
                text: `[${id}] ${path}, lines ${from}–${to} of ${all.length}:\n${lines.map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join("\n")}${to < all.length ? `\n(more: from ${to + 1})` : ""}`,
                evidence: [{ id, kind: "code", title: `${path.split("/").pop()} · lines ${from}–${to}`, path, from, lines, ranOn, open: { route: filePath(path, "source"), label: "Open source" } }],
            }
        },
    },
    {
        name: "code_search", namespace: "files",
        description: "Search the text of every file the scan kept: usages, annotations, calls, strings. Returns files with hit counts and the matching lines. Example: {\"text\": \"@Transactional\"} or {\"text\": \"new \\\\w+Service\\\\(\", \"regex\": true}",
        params: {
            text: { type: "string", description: "Text or regular expression." },
            regex: { type: "boolean", description: "Treat text as a regular expression." },
            word: { type: "boolean", description: "Whole words only." },
        },
        required: ["text"],
        label: a => `Searched the code for ${a.text}`,
        async run(a, { world, ranOn, nextId }) {
            if (!world.findInCode) return { text: "Code search is not available here." }
            const needle = String(a.text ?? "")
            if (!needle.trim()) return { text: "Give some text to search for." }
            const opts = { regex: !!a.regex, word: !!a.word, caseSensitive: false }
            const res = await world.findInCode(needle, opts)
            if (!res.totalHits) return { text: `"${needle}" appears in none of ${fmt(res.searched)} files.` }
            const top = res.files.slice(0, 12)
            const samples: string[] = []
            if (world.findLines) {
                for (const f of top.slice(0, 4)) {
                    const lines = (await world.findLines(f.file, needle, opts)).filter(l => !l.context).slice(0, 3)
                    for (const l of lines) samples.push(`${f.file}:${l.line}  ${l.text.trim().slice(0, 140)}`)
                }
            }
            const id = nextId()
            return {
                text: [`[${id}] "${needle}": ${fmt(res.totalHits)} hits in ${fmt(res.files.length)} of ${fmt(res.searched)} files${res.truncated ? " (stopped early)" : ""}.`,
                    ...top.map(f => `${f.file} (${f.hits}) · ${world.fileComponent().get(f.file) ?? ""}`),
                    samples.length ? `Lines:\n${samples.join("\n")}` : ""].filter(Boolean).join("\n"),
                evidence: [{ id, kind: "table", title: `"${needle}" in the code`, columns: ["File", "Hits", "Component"], rows: top.map(f => [f.file, f.hits, world.fileComponent().get(f.file) ?? ""]), total: res.files.length, note: samples.slice(0, 6).join("\n"), ranOn, open: { route: searchPath(needle), label: "Open in Find" } }],
            }
        },
    },
]
