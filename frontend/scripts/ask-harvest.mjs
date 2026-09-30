#!/usr/bin/env node
// Harvests the SQL the app already runs, as candidates for Ask's cookbook:
// every string literal in frontend/src holding a SELECT with no ${…}
// interpolation, run against real snapshots. A query that runs and returns
// rows on each snapshot is a candidate recipe; the rest are listed with why.
//
//   node scripts/ask-harvest.mjs /path/a.db [/path/b.db …] > candidates.md

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { DatabaseSync } from "node:sqlite"

const root = new URL("../src", import.meta.url).pathname
const snaps = process.argv.slice(2)
const files = []
;(function walk(d) {
    for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) { if (f !== "node_modules") walk(p) }
        else if (/\.(ts|vue)$/.test(f) && !/\.test\.ts$/.test(f) && !p.includes("/features/ask/")) files.push(p)
    }
})(root)

const found = new Map()
const lit = /`([^`]*\bSELECT\b[^`]*)`|"((?:[^"\\\n]|\\.)*\bSELECT\b(?:[^"\\\n]|\\.)*)"/gi
for (const f of files) {
    const s = readFileSync(f, "utf8")
    for (const m of s.matchAll(lit)) {
        const sql = (m[1] ?? m[2]).trim()
        if (sql.includes("${") || !/^\s*(with|select)\b/i.test(sql)) continue
        const key = sql.replace(/\s+/g, " ")
        if (!found.has(key)) found.set(key, { sql: key, where: relative(root, f) })
    }
}

const dbs = snaps.map(p => ({ p, db: new DatabaseSync(p, { readOnly: true }) }))
const ok = [], bad = []
for (const q of found.values()) {
    const results = dbs.map(({ db }) => { try { return { rows: db.prepare(`SELECT * FROM (${q.sql}) LIMIT 50`).all().length } } catch (e) { return { error: String(e.message).slice(0, 80) } } })
    ;(results.every(r => r.rows > 0) ? ok : bad).push({ ...q, results })
}
console.log(`# Cookbook candidates\n\n${found.size} static SELECTs in ${files.length} files; ${ok.length} run with rows on every snapshot.\n`)
for (const q of ok) console.log(`- \`${q.where}\` · rows ${q.results.map(r => r.rows).join("/")}\n  \`${q.sql.slice(0, 400)}\``)
console.log(`\n## Not usable as they stand (${bad.length})\n`)
for (const q of bad) console.log(`- \`${q.where}\`: ${q.results.map(r => r.error ?? `${r.rows} rows`).join(" / ")}`)
