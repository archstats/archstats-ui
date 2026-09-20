// What the engine costs and what it is worth, on a real codebase.
//
// This is the first of the three benches and the only one that needs no
// browser: it loads a snapshot, runs every preset's first pass through the
// production code path, and reports both halves of the question — how long
// each stage took, and whether the groups that came out are worth having.
//
// It asserts almost nothing. A quality bench that fails the suite on a
// tenth of a point teaches you to loosen the threshold; this one prints and
// leaves the judging to whoever reads it. The two assertions it does make
// are the ones a regression would be a bug rather than a drift: the pass must
// finish, and the gate must actually gate.

import { describe, expect, it } from "vitest"
import { loadSignalSources } from "~/composables/useSuggestModel"
import { measureCut, type QualityEdge } from "~/utils/cutQuality"
import { PRESETS, buildSuggestInput, suggest, type SignalSources, type SuggestSettings, type Suggestion } from "~/utils/suggest"
import { findSnapshot, median, ms, openSnapshot, pct, timed } from "./snapshot"

const DB = findSnapshot()
const run = DB ? describe : describe.skip

const edgesOf = (src: SignalSources): QualityEdge[] =>
  src.componentRefs.map(e => ({ from: e.from, to: e.to, weight: Number(e.references) || 1 }))

function report(label: string, out: Suggestion[], src: SignalSources, took: number) {
  const groups = out.map(s => ({ key: s.key, name: s.name, members: s.components }))
  const quality = measureCut(groups, edgesOf(src), src.components.length)
  const sizes = groups.map(g => g.members.length)
  return {
    label,
    took,
    groups: groups.length,
    placed: quality.placed,
    total: quality.total,
    covered: quality.total ? quality.placed / quality.total : 0,
    smallest: Math.min(...sizes, Infinity),
    median: median(sizes),
    singletons: quality.singletons,
    modularity: quality.modularity,
    kept: quality.kept,
    biggest: quality.biggest,
  }
}

type Row = ReturnType<typeof report>

const line = (r: Row) =>
  `${r.label.padEnd(22)} ${ms(r.took).padStart(7)}  ${String(r.groups).padStart(3)} groups  `
  + `${String(r.placed).padStart(3)}/${r.total} (${pct(r.covered).padStart(6)})  `
  + `min ${String(r.smallest === Infinity ? 0 : r.smallest).padStart(2)}  med ${String(r.median).padStart(4)}  `
  + `${String(r.singletons).padStart(2)} alone  Q ${r.modularity.toFixed(3)}  kept ${pct(r.kept).padStart(6)}  `
  + `biggest ${pct(r.biggest)}`

run("the engine, on a real snapshot", () => {
  it("runs every preset's first pass and reports what it costs and what it is worth", async () => {
    const db = openSnapshot(DB!)
    const load = await timed("load", () => loadSignalSources(db.query, db.hasView))
    const src = load.value

    const rows: Row[] = []
    const gate: string[] = []
    const grains: string[] = []
    const inputs = {
      component: (await timed("input", () => buildSuggestInput(src, "component"))),
      file: (await timed("input", () => buildSuggestInput(src, "file"))),
    }
    for (const preset of PRESETS) {
      const settings = preset.settings
      const grain = settings.splitFiles ? "file" : "component"
      const input = inputs[grain]
      const pass = await timed("suggest", () => suggest(input.value, settings))
      rows.push(report(`${preset.label} (${grain})`, pass.value, src, input.ms + pass.ms))

      // The same pass with the engine's judgement switched off, so the gate's
      // effect is a measurement rather than a claim.
      const ungated: SuggestSettings = { ...settings, minSize: 1, minKept: 0 }
      const open = suggest(input.value, ungated)
      const before = report(`  ungated`, open, src, 0)
      const after = rows[rows.length - 1]
      gate.push(
        `${preset.label.padEnd(10)} ungated ${String(before.groups).padStart(3)} groups / ${String(before.placed).padStart(3)} placed / Q ${before.modularity.toFixed(3)} / kept ${pct(before.kept)}`
        + `   →  gated ${String(after.groups).padStart(3)} / ${String(after.placed).padStart(3)} / Q ${after.modularity.toFixed(3)} / kept ${pct(after.kept)}`,
      )

      // Whether dividing components is paying for itself. A preset that
      // scores worse split than whole is asking for a freedom it cannot use.
      const other = grain === "file" ? "component" : "file"
      const swapped = report(`${preset.label} (${other})`, suggest(inputs[other].value, { ...settings, splitFiles: other === "file" }), src, 0)
      grains.push(`${line(after)}\n${line(swapped)}\n`)
    }

    const slowest = [...db.timings].sort((a, b) => b.ms - a.ms).slice(0, 6)
    console.log([
      ``,
      `snapshot  ${DB}`,
      `          ${src.components.length} components · ${src.files.length} files · ${src.componentRefs.length} component edges · ${src.fileRefs.length} file edges`,
      `          loaded in ${ms(load.ms)} over ${db.timings.length} queries`,
      ``,
      `slowest queries`,
      ...slowest.map(t => `  ${ms(t.ms).padStart(8)}  ${String(t.rows).padStart(7)} rows  ${t.sql}`),
      ``,
      `first pass`,
      ...rows.map(line),
      ``,
      `what the gate removes`,
      ...gate,
      ``,
      `whether dividing components pays for itself`,
      ...grains,
    ].join("\n"))

    expect(rows.length).toBe(PRESETS.length)
    // The one thing a regression here would be a bug rather than a drift: a
    // preset that asks for cohesion must actually be judged on it. The gate
    // silently did nothing at file grain for as long as it existed, and no
    // threshold on the output would have said so.
    for (const preset of PRESETS) {
      if (!preset.settings.minKept) continue
      const input = inputs[preset.settings.splitFiles ? "file" : "component"]
      const gated = suggest(input.value, preset.settings)
      const open = suggest(input.value, { ...preset.settings, minSize: 1, minKept: 0 })
      expect.soft(gated.length, `${preset.label}: the gate proposed everything it was given`).toBeLessThan(open.length)
    }
  }, 120_000)
})
