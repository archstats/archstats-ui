// Can the engine's answers be said in the architect's language?
//
// The whole design rests on one unproven claim: that a set of components the
// engine found is expressible as a handful of patterns. If it is, "save this
// proposal as a query" is one keystroke and a group explains itself forever.
// If it is not, generalisation is a party trick and groups stay lists of ids
// wearing a pattern's clothes.
//
// This bench answers it before any UI exists, by taking every group each
// preset proposes on a real snapshot and generalising it back.

import { describe, expect, it } from "vitest"
import { loadSignalSources } from "~/composables/useSuggestModel"
import { generalise, globToRegExp, parseQuery, runQuery } from "~/utils/query"
import { detectSeparator } from "~/utils/studio"
import { PRESETS, buildSuggestInput, suggest } from "~/utils/suggest"
import { findSnapshot, median, openSnapshot, pct } from "./snapshot"

const DB = findSnapshot()
const run = DB ? describe : describe.skip

run("saying the engine's answer as a query", () => {
  it("generalises every proposed group and reports how well it goes", async () => {
    const db = openSnapshot(DB!)
    const src = await loadSignalSources(db.query, db.hasView)
    const sep = detectSeparator(src.components)
    const universe = src.components

    const rows: string[] = []
    const termCounts: number[] = []
    let groups = 0, exact = 0, within3 = 0, allLiteral = 0

    for (const preset of PRESETS) {
      const grain = preset.settings.splitFiles ? "file" : "component"
      if (grain === "file") continue // a file-grain band is not a set of components
      const input = buildSuggestInput(src, "component")
      const out = suggest(input, preset.settings)

      let pGroups = 0, pExact = 0, pTerms = 0, pLiterals = 0
      for (const s of out) {
        const members = s.components
        if (members.length < 2) continue
        const g = generalise(members, universe, sep)

        // The claim is only worth anything if the text means the same thing
        // as the selection it replaced, so check rather than trust.
        const back = runQuery(parseQuery(g.text), { components: universe, files: [], componentSep: sep })
        const same = back.components.length === members.length
          && back.components.every(id => members.includes(id))

        groups++; pGroups++
        termCounts.push(g.terms.length + g.literals.length)
        pTerms += g.terms.length
        pLiterals += g.literals.length
        if (same) { exact++; pExact++ }
        if (g.terms.length + g.literals.length <= 3) within3++
        if (g.terms.length === 0) allLiteral++
      }
      if (pGroups) {
        rows.push(`  ${preset.label.padEnd(10)} ${String(pGroups).padStart(3)} groups · `
          + `${pExact}/${pGroups} said exactly · ${(pTerms / pGroups).toFixed(1)} patterns + ${(pLiterals / pGroups).toFixed(1)} literals each`)
      }
    }

    // What a group actually looks like, so the number has a face.
    const input = buildSuggestInput(src, "component")
    const domains = suggest(input, PRESETS[0].settings)
    const sample = [...domains].sort((a, b) => b.components.length - a.components.length).slice(0, 3)
      .map(s => {
        const g = generalise(s.components, universe, sep)
        return `  ${s.name} (${s.components.length} components)\n`
          + g.text.split("\n").slice(0, 6).map(l => `      ${l}`).join("\n")
          + (g.text.split("\n").length > 6 ? `\n      … ${g.text.split("\n").length - 6} more lines` : "")
      })

    console.log([
      ``,
      `snapshot  ${DB}`,
      `          ${universe.length} components · separator "${sep}"`,
      ``,
      `generalising every proposed group`,
      ...rows,
      ``,
      `  ${groups} groups · ${pct(exact / groups)} said exactly · ${pct(within3 / groups)} in 3 lines or fewer`,
      `  lines per group: median ${median(termCounts)}, worst ${Math.max(...termCounts)}`,
      `  ${allLiteral} groups no pattern could describe at all`,
      ``,
      `the three biggest domains, as text`,
      ...sample,
      ``,
    ].join("\n"))

    // Generalisation may turn out to be weak; saying something the selection
    // did not say would be a bug.
    expect(exact).toBe(groups)
  }, 120_000)
})
