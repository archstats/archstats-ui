// Writes src/locales/en/definitions.json from the engine's metric
// definitions (the YAML files under the archstats repo's extensions/), so the
// English text matches what a scan writes into the snapshot and the Dutch
// file has a source to follow. Entries the app adds itself (app__ ids, and
// categories the engine does not file under) are kept as they are.
//
//   node scripts/i18n-definitions.mjs [path/to/archstats]

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"

const here = dirname(fileURLToPath(import.meta.url))
const engine = process.argv[2] ?? join(here, "../../../archstats")
const out = join(here, "../src/locales/en/definitions.json")

function walk(dir, found = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, found)
        else if (/\.ya?ml$/.test(name) && /\/definitions\//.test(p)) found.push(p)
    }
    return found
}

/** The key a category is stored under: "Modularity & Component Structure" → "modularityComponentStructure". */
export function categoryKey(name) {
    const words = name.toLowerCase().replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    return words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("")
}

const current = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { categories: {}, metrics: {} }
const metrics = Object.fromEntries(Object.entries(current.metrics ?? {}).filter(([id]) => id.startsWith("app__")))
const categories = { ...(current.categories ?? {}) }

for (const file of walk(join(engine, "extensions")).sort()) {
    const d = yaml.load(readFileSync(file, "utf8"))
    if (!d?.id) continue
    metrics[d.id] = { name: d.name ?? d.id, short: (d.short_description ?? "").trim(), long: (d.long_description ?? "").trim() }
    if (d.category) categories[categoryKey(d.category)] = d.category
}

const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]))
// Everything else in the file (the app's own entries, the per-window templates) stays as it is.
const rest = Object.fromEntries(Object.entries(current).filter(([k]) => k !== "categories" && k !== "metrics"))
writeFileSync(out, JSON.stringify({ ...rest, categories: sorted(categories), metrics: sorted(metrics) }, null, 2) + "\n")
console.log(`${Object.keys(metrics).length} metrics, ${Object.keys(categories).length} categories → ${out}`)
