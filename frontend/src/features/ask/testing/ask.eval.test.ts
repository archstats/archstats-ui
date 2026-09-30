// The benchmark: real questions, a real local model, real snapshots, the
// same engine the app runs. Opt in (it takes minutes):
//
//   ASK_EVAL=1 ASK_MODEL=qwen3-vl:30b ASK_SNAPS=/path/a.db:/path/b.db \
//     npx vitest run src/features/ask/testing/ask.eval.test.ts
//
// Each question states what a good answer must do: which tools it should
// reach for, and what it must not say. The scorecard prints at the end and
// is written to ASK_EVAL_OUT (default: the system temp folder) as JSON, so
// harness changes can be compared run against run.

import { describe, it } from "vitest"
import { existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runTurn } from "../engine/loop"
import { buildCard } from "../knowledge/card"
import { INTENTS, TOOLS, useIntents } from "../tools"
import { INTENT_FOR } from "../engine/checks"
import { sqliteWorld } from "./sqliteWorld"
import { nodeOllama } from "./nodeOllama"
import type { TurnEvent, World } from "../engine/types"

interface Case {
    q: (w: World) => string
    /** At least one of these tools must be called; empty = any, even none (the snapshot card may answer). */
    tools: string[]
    /** The answer must not match. */
    not?: RegExp
    /** The answer must match. */
    must?: (w: World) => RegExp
}

const biggest = (w: World) => String([...w.components()].filter(c => c.name !== ".").sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0].name)
/** A short but unambiguous name: the last segment, or the last two when the last is generic ("src", "main"). */
const tail = (n: string) => { const p = n.split(/[./]/).filter(Boolean); const last = p[p.length - 1] ?? n; return last.length < 5 && p.length > 1 ? p.slice(-2).join(n.includes("/") ? "/" : ".") : last }

const CASES: Case[] = [
    { q: () => "What is the smallest cycle?", tools: ["cycles"], not: /cannot|can't|unable/i },
    { q: () => "Where are the tangles, and what would untangle the largest one?", tools: ["tangles", "untangle"] },
    { q: w => `How many components depend on ${tail(biggest(w))}?`, tools: ["component", "graph"], must: w => { const n = Number(w.components().find(c => c.name === biggest(w))?.modularity__coupling__dependents ?? 0); return n === 0 ? /\b(0|zero|no|none|nothing)\b/i : new RegExp(`\\b${n}\\b`) } },
    { q: w => `What depends on ${tail(biggest(w))}, all the way up?`, tools: ["graph"] },
    { q: () => "Which files are the riskiest to change?", tools: ["rank", "cookbook"] },
    { q: w => `What are the largest files in ${tail(biggest(w))} and what does the biggest one declare?`, tools: ["files_of", "file_outline", "rank"] },
    { q: () => "How much of the code is tests?", tools: [], not: /cannot|can't|unable/i },
    { q: w => `Who knows ${tail(biggest(w))}?`, tools: ["knowledge"] },
    { q: () => "Which components change together without importing each other?", tools: ["cochange", "cookbook"] },
    { q: () => "What is the test coverage?", tools: [], not: /\d+(\.\d+)?\s*% (line |branch )?coverage|you'?re right|apologi/i, must: () => /cannot|can't|does not|doesn't|not (measure|calculate|store|provide)|no coverage|nothing to measure|no test files/i },
    {
        q: () => "Which component with more than 5 dependents has the lowest code health?", tools: ["run_code", "rank", "sql", "component"],
        must: w => {
            const c = w.components().filter(x => x.name !== "." && Number(x.modularity__coupling__dependents) > 5 && Number(x.codesmells__code_health) > 0).sort((a, b) => Number(a.codesmells__code_health) - Number(b.codesmells__code_health))[0]
            return new RegExp(c ? tail(String(c.name)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "$^")
        },
    },
    { q: () => "Is this codebase well layered?", tools: ["layers", "tangles", "untangle", "cycles"], not: /\b(is|are) (cleanly|well|clearly) layered\b|\b(has|shows|follows) (a )?clean (top-down )?layering\b/i },
    { q: () => "Where does the code live, and how much of it is tests?", tools: [] },
]

const on = process.env.ASK_EVAL === "1"
/** ASK_TOOLS=legacy runs the old tool set; intents otherwise. */
const intents = useIntents()
const model = process.env.ASK_MODEL ?? "qwen3-vl:30b"
const snaps = (process.env.ASK_SNAPS ?? "").split(":").filter(p => p && existsSync(p))
/** ASK_CASES=4,5,6 runs only those questions (1-based). */
const only = new Set((process.env.ASK_CASES ?? "").split(",").map(Number).filter(Boolean))

describe.skipIf(!on || !snaps.length)(`Ask benchmark · ${model}`, () => {
    const rows: any[] = []
    for (const path of snaps) {
        for (const [i, c] of CASES.entries()) {
            if (only.size && !only.has(i + 1)) continue
            it(`${path.split("/").pop()} · ${i + 1}`, async () => {
                const world = sqliteWorld(path)
                const card = await buildCard(world)
                const question = c.q(world)
                const called: string[] = []
                let n = 0
                const t0 = Date.now()
                const out = await runTurn({
                    question, history: [], model: nodeOllama(model), tools: intents ? INTENTS : TOOLS, intents, world, card: card.text, here: "Headless evaluation.", onScreen: null,
                    ranOn: { scanId: world.scanId, commit: world.info.git_head_commit ?? "", revision: Number(world.info.analysis_revision ?? 0), workspace: world.workspace },
                    nextId: () => `E${++n}`, recall: () => null, sources: card.numbers, evidenceIds: new Set(), signal: new AbortController().signal,
                    emit: (e: TurnEvent) => { if (e.type === "tool" && e.phase === "start") called.push(e.name) },
                })
                // With intents, a case's legacy tools stand for the intents that answer the same question.
                const expected = intents ? [...new Set(c.tools.map(t => INTENT_FOR[t] ?? t))] : c.tools
                const toolOk = !expected.length || expected.some(t => called.includes(t))
                const notOk = !c.not || !c.not.test(out.answer)
                const mustOk = !c.must || c.must(world).test(out.answer)
                const checksOk = out.checks.every(x => x.ok)
                rows.push({ snapshot: path.split("/").pop(), question, toolOk, notOk, mustOk, checksOk, called, repaired: out.messages.some(m => m.content.startsWith("[Check]")), seconds: Math.round((Date.now() - t0) / 1000), tokens: out.tokens.prompt + out.tokens.output, failedChecks: out.checks.filter(x => !x.ok).map(x => `${x.id}: ${x.detail}`), grounding: out.grounding?.counts ?? null, flagged: out.grounding?.claims.filter(c => c.verdict !== "verified" && c.verdict !== "cited") ?? [], answer: out.answer })
            }, 420_000)
        }
    }
    it("scorecard", () => {
        const pass = rows.filter(r => r.toolOk && r.notOk && r.mustOk && r.checksOk).length
        const summary = { model, tools: intents ? "intents" : "legacy", when: new Date().toISOString(), pass, total: rows.length, rows }
        const file = process.env.ASK_EVAL_OUT ?? join(tmpdir(), `ask-eval-${model.replace(/[:/]/g, "_")}-${Date.now()}.json`)
        writeFileSync(file, JSON.stringify(summary, null, 2))
        console.log(`\nAsk benchmark · ${model} · ${intents ? "intents" : "legacy tools"}: ${pass}/${rows.length} pass · written to ${file}`)
        const claims = rows.reduce((acc, r) => { for (const [k, v] of Object.entries(r.grounding ?? {})) acc[k] = (acc[k] ?? 0) + (v as number); return acc }, {} as Record<string, number>)
        console.log(`Claims: ${Object.entries(claims).map(([k, v]) => `${v} ${k}`).join(" · ")}`)
        for (const r of rows) console.log(`${r.toolOk && r.notOk && r.mustOk && r.checksOk ? "✓" : "✗"} ${r.seconds}s ${r.snapshot?.slice(0, 8)} ${r.question.slice(0, 70)} · tools ${r.called.join(",") || "none"}${r.toolOk ? "" : " · WRONG TOOL"}${r.notOk ? "" : " · SAID WHAT IT MUST NOT"}${r.mustOk ? "" : " · MISSING FACT"}${r.checksOk ? "" : ` · CHECK FAILED (${r.failedChecks.join("; ").slice(0, 140)})`}`)
    })
})
