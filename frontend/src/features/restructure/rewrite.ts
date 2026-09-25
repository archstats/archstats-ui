// Carrying out a plan: move the files and rewrite every import that names
// them. The rewrite is one self-contained function so the exported script
// can embed it as it is (it is tested here, and runs there unchanged).

import type { Evaluation, Move, Placement, Plan } from "./plan"

/**
 * One file's source with its imports pointed at where things now sit.
 * `moves` maps old repo paths to new ones; `aliases` maps a specifier
 * prefix (`~/`, `@/`) to the repo folder it stands for; `known` holds every
 * repo path before the move. Relative imports stay relative and alias
 * imports stay alias imports; an extension or /index left off stays off.
 * Handles JS, TS, JSX and single-file components; other languages are left
 * as they are.
 */
export function rewriteImports(content: string, file: string, moves: Record<string, string>, aliases: Record<string, string>, known: ReadonlySet<string>): string {
    const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".json", ".css", ".scss"]
    const norm = (p: string) => {
        const out: string[] = []
        for (const s of p.split("/")) { if (s === "" || s === ".") continue; if (s === "..") out.pop(); else out.push(s) }
        return out.join("/")
    }
    const dir = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")
    const rel = (from: string, to: string) => {
        const a = from ? from.split("/") : [], b = to.split("/")
        let i = 0
        while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
        const up = a.slice(i).map(() => "..")
        const r = [...up, ...b.slice(i)].join("/")
        return r.startsWith(".") ? r : "./" + r
    }
    const resolve = (base: string): { path: string; tail: "" | "ext" | "index" } | null => {
        if (known.has(base)) return { path: base, tail: "" }
        for (const e of EXTS) if (known.has(base + e)) return { path: base + e, tail: "ext" }
        for (const e of EXTS) if (known.has(base + "/index" + e)) return { path: base + "/index" + e, tail: "index" }
        return null
    }
    const newFile = moves[file] ?? file
    const keys = Object.keys(aliases).sort((a, b) => b.length - a.length)
    return content.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])([^"'\n]+)\2/g, (whole, lead: string, q: string, spec: string) => {
        let base: string | null = null, alias: string | null = null
        if (spec.startsWith("./") || spec.startsWith("../")) base = norm(dir(file) + "/" + spec)
        else for (const k of keys) if (spec.startsWith(k)) { alias = k; base = norm(aliases[k] + "/" + spec.slice(k.length)); break }
        if (base === null) return whole
        const hit = resolve(base)
        if (!hit) return whole
        const target = moves[hit.path] ?? hit.path
        if (target === hit.path && newFile === file) return whole
        let path = target
        if (hit.tail === "index") path = path.replace(/\/index\.[^./]+$/, "")
        else if (hit.tail === "ext") path = path.replace(/\.[^./]+$/, "")
        let next: string
        const root = alias ? norm(aliases[alias]) : ""
        if (alias && (path === root || path.startsWith(root + "/"))) next = alias + path.slice(root.length + 1)
        else next = rel(dir(newFile), path)
        return next === spec ? whole : `${lead}${q}${next}${q}`
    })
}

/** The move map as JSON: what goes where. */
export function moveMapJson(mv: Move[], names: Map<string, string>): string {
    return JSON.stringify(mv.map(m => ({ from: m.from, to: m.to, module: names.get(m.module) ?? m.module })), null, 2) + "\n"
}

/** The moves as a shell script of git mv lines, for when imports are fixed another way. */
export function gitMvScript(mv: Move[]): string {
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
    const dirs = [...new Set(mv.map(m => m.to.slice(0, m.to.lastIndexOf("/"))).filter(Boolean))].sort()
    return ["#!/bin/sh", "# Moves the files of the restructure plan. Run from the repository root.", "set -e",
        ...dirs.map(d => `mkdir -p ${q(d)}`), ...mv.map(m => `git mv ${q(m.from)} ${q(m.to)}`), ""].join("\n")
}

/**
 * A Node script that rewrites every JS/TS/Vue import naming a moved file,
 * then moves the files with git mv. `--dry` lists what it would change.
 */
export function restructureScript(mv: Move[], aliases: Record<string, string>): string {
    const moves = Object.fromEntries(mv.map(m => [m.from, m.to]))
    return `#!/usr/bin/env node
// Carries out an Archstats restructure plan: rewrites the imports that name a
// moved file, then moves the files with git mv. Run from the repository root
// on a clean working tree; review with git diff, then run your tests.
//   node restructure.mjs --dry   list what would change
//   node restructure.mjs         change it
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const MOVES = ${JSON.stringify(moves, null, 2)}
const ALIASES = ${JSON.stringify(aliases)}

const rewriteImports = ${rewriteImports.toString()}

const dry = process.argv.includes("--dry")
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\\n").filter(Boolean)
const known = new Set(tracked)
const missing = Object.keys(MOVES).filter(f => !known.has(f))
if (missing.length) { console.error("Not in this repository (or not tracked):\\n  " + missing.join("\\n  ")); process.exit(1) }
let edited = 0
for (const f of tracked) {
  if (!/\\.(m?[jt]sx?|cjs|vue|svelte)$/.test(f)) continue
  const src = fs.readFileSync(f, "utf8")
  const out = rewriteImports(src, f, MOVES, ALIASES, known)
  if (out === src) continue
  edited++
  if (dry) console.log("edit " + f)
  else fs.writeFileSync(f, out)
}
for (const [from, to] of Object.entries(MOVES)) {
  if (dry) { console.log("move " + from + " -> " + to); continue }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  execFileSync("git", ["mv", from, to])
}
console.log((dry ? "Would edit " : "Edited ") + edited + " files and " + (dry ? "move " : "moved ") + Object.keys(MOVES).length + ".")
`
}

/** Import aliases a JS project most likely uses: ~/ and @/ for the folder holding pages or the src root. */
export function guessAliases(files: string[]): Record<string, string> {
    const src = files.map(f => f.match(/^(.*?\/)?src\//)?.[0]).filter((x): x is string => !!x)
    if (!src.length) return {}
    const count = new Map<string, number>()
    for (const s of src) count.set(s, (count.get(s) ?? 0) + 1)
    const root = [...count].sort((a, b) => b[1] - a[1])[0][0].replace(/\/$/, "")
    return { "~/": root, "@/": root }
}

/** The plan as Markdown, for the decision record: modules, checks against today, and the moves. */
export function planMarkdown(plan: Plan, placement: Placement, ev: Evaluation, today: Evaluation, mv: Move[], names: Map<string, string>): string {
    const n = (id: string) => names.get(id) ?? id
    const lines = ["# Restructure plan", ""]
    lines.push("## Modules", "")
    if (plan.ordered) lines.push("Listed top to bottom: a module may use the ones below it.", "")
    for (const m of plan.modules) {
        const s = ev.modules.get(m.id)
        lines.push(`### ${m.name}`, "")
        if (m.dir) lines.push(`Folder: \`${m.dir}\``)
        lines.push(`Files: ${s?.files ?? 0}, ${Math.round((s?.cohesion ?? 1) * 100)}% of their imports stay inside`)
        const pats = m.patterns.split("\n").map(l => l.trim()).filter(Boolean)
        if (pats.length) lines.push("", "```", ...pats, "```")
        if (m.files.length) lines.push("", `Placed by hand: ${m.files.map(f => `\`${f}\``).join(", ")}`)
        lines.push("")
    }
    lines.push("## Checks", "", "| Check | Today | Plan |", "| --- | ---: | ---: |",
        `| Imports crossing a module edge | ${today.crossing} | ${ev.crossing} |`,
        `| Module pairs that import each other | ${today.mutual.length} | ${ev.mutual.length} |`,
        `| Modules caught in cycles | ${today.tangles.reduce((a, t) => a + t.length, 0)} | ${ev.tangles.reduce((a, t) => a + t.length, 0)} |`)
    if (plan.ordered) lines.push(`| Imports pointing up the order | | ${ev.upward.length} |`)
    lines.push(`| Files no module takes | | ${placement.unplaced.length} |`, "")
    if (ev.mutual.length) {
        lines.push("### Pairs that still import each other", "")
        for (const p of ev.mutual) lines.push(`- ${n(p.a)} ⇄ ${n(p.b)}: ${p.ab} imports one way, ${p.ba} the other`)
        lines.push("")
    }
    if (mv.length) {
        lines.push("## Moves", "", "| From | To |", "| --- | --- |")
        for (const m of mv) lines.push(`| \`${m.from}\` | \`${m.to}\` |`)
        lines.push("")
    }
    return lines.join("\n")
}
