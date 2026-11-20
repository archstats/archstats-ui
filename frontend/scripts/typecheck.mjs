// Type-checks the frontend with vue-tsc against a per-file ratchet.
//
//   npm run typecheck              fail if any file has more errors than its baseline
//   npm run typecheck -- --update  record the current counts (review the diff)
//
// The code base had several hundred type errors when this check arrived, so
// it cannot demand zero yet. It demands that no file gets worse: a new file
// has a baseline of zero, and a file you fix should be recorded lower.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINE = join(ROOT, "typecheck-baseline.json")
const bin = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "vue-tsc.cmd" : "vue-tsc")

const run = spawnSync(bin, ["--noEmit", "--pretty", "false", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
if (run.error) {
    console.error(`typecheck: cannot run vue-tsc (${run.error.message}); run npm ci in frontend/`)
    process.exit(2)
}
const output = run.stdout + run.stderr
const counts = {}
const lines = {}
for (const line of output.split("\n")) {
    const m = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line)
    if (!m) continue
    const file = m[1].replaceAll("\\", "/")
    counts[file] = (counts[file] ?? 0) + 1
    ;(lines[file] ??= []).push(line)
}
if (run.status !== 0 && Object.keys(counts).length === 0) {
    console.error("typecheck: vue-tsc failed without reporting a type error:\n" + output.slice(0, 4000))
    process.exit(2)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)

if (process.argv.includes("--update")) {
    const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n")
    console.log(`typecheck: recorded ${total} errors in ${Object.keys(counts).length} files to typecheck-baseline.json`)
    process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {}
const worse = Object.keys(counts).filter(f => counts[f] > (baseline[f] ?? 0))
const better = Object.keys(baseline).filter(f => (counts[f] ?? 0) < baseline[f])
const known = Object.values(baseline).reduce((a, b) => a + b, 0)

if (worse.length) {
    console.error(`typecheck: ${worse.length} file(s) have more type errors than their baseline:\n`)
    for (const f of worse) {
        console.error(`${f}: ${counts[f]} errors, baseline ${baseline[f] ?? 0}`)
        for (const l of lines[f]) console.error("  " + l)
    }
    console.error("\nFix the new errors. Only record a higher baseline (npm run typecheck -- --update) if the user agreed to.")
    process.exit(1)
}
console.log(`typecheck: ${total} errors, none above the baseline (${known}).`)
if (better.length) console.log(`typecheck: ${better.length} file(s) improved; record it with npm run typecheck -- --update`)
