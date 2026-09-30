import { describe, expect, it } from "vitest"
import { checkAnswer, markUnsourced, unsourcedNumbers } from "./checks"
import { compact } from "./compact"
import { isBroad, route } from "./route"
import { runTurn } from "./loop"
import { searchCapabilities } from "../knowledge/capabilities"
import { bindRecipe, recipe } from "../knowledge/cookbook"
import type { ModelClient, ModelReply, Tool, TurnEvent, World } from "./types"

describe("number audit", () => {
    const sources = "[E1] common.web is in 82 distinct shortest cycles\n1. a → b: 1,405 import references, 32.5%"

    it("accepts numbers the evidence holds, in any grouping", () => {
        expect(unsourcedNumbers("It sits in 82 cycles and carries 1405 references (32.5%) [E1].", sources)).toEqual([])
    })
    it("names a number no evidence holds", () => {
        expect(unsourcedNumbers("Cutting drops it to 17 cycles [E1].", sources)).toEqual(["17"])
    })
    it("ignores small counts, code spans and evidence ids", () => {
        expect(unsourcedNumbers("Two or 3 steps in `v2024` per E12.", sources)).toEqual([])
    })
    it("never splits an HTML entity when marking", () => {
        const { html, count } = markUnsourced("<p>you&#39;d need 40</p>", "40")
        expect(count).toBe(0)
        expect(html).toContain("you&#39;d")
    })
})

describe("answer checks", () => {
    it("sends a give-up back with what the catalogue knows", () => {
        const out = checkAnswer({ question: "What is the smallest cycle?", answer: "The scan cannot show the smallest cycle.", sources: "", toolCalls: 0, evidenceIds: new Set() })
        expect(out.checks.find(c => c.id === "gave-up")?.ok).toBe(false)
        expect(out.repair).toMatch(/cycles/)
    })
    it("flags ids no tool returned", () => {
        const out = checkAnswer({ question: "q", answer: "It has 82 cycles [E9].", sources: "82", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.checks.find(c => c.id === "uncited")?.ok).toBe(false)
    })
    it("passes a sourced, cited answer", () => {
        const out = checkAnswer({ question: "q", answer: "It sits in 82 cycles [E1].", sources: "82", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.repair).toBeNull()
    })
})

describe("routing", () => {
    it("offers the cycle tools for a cycle question", () => {
        expect(route("What is the smallest cycle?", { onScreen: false })).toContain("cycles")
    })
    it("offers the code tools when the question is about code", () => {
        expect(route("What does Cart.java do?", { onScreen: false })).toContain("files")
    })
    it("plans only broad questions", () => {
        expect(isBroad("Is this codebase well layered?")).toBe(true)
        expect(isBroad("What depends on checkout?")).toBe(false)
    })
})

describe("capabilities", () => {
    it("finds the entry for the question the first version gave up on", () => {
        expect(searchCapabilities("what is the smallest cycle")[0]?.id).toBe("smallest-cycle")
    })
    it("knows blast radius", () => {
        expect(searchCapabilities("what breaks if I change the order module")[0]?.tools).toContain("graph")
    })
})

describe("cookbook binding", () => {
    it("binds text as a quoted literal", () => {
        expect(bindRecipe(recipe("import-files")!, { from: "a'b", to: "c" })).toContain("'a''b'")
    })
    it("refuses a missing parameter", () => {
        expect(() => bindRecipe(recipe("import-files")!, { from: "a" })).toThrow(/to/)
    })
})

describe("compaction", () => {
    it("shortens old tool results and keeps the recent turns whole", () => {
        const long = `[E1] ${"x".repeat(2000)}`
        const h = [
            { role: "user" as const, content: "one" }, { role: "tool" as const, content: long },
            { role: "user" as const, content: "two" }, { role: "tool" as const, content: long },
            { role: "user" as const, content: "three" }, { role: "tool" as const, content: long },
        ]
        const out = compact(h, 100)
        expect(out[1].content.length).toBeLessThan(400)
        expect(out[1].content).toContain("recall E1")
        expect(out[5].content).toBe(long)
    })
})

describe("the loop", () => {
    const world = { info: {}, columns: {}, components: () => [], connections: () => [], cycles: () => [], definitions: () => new Map(), fileComponent: () => new Map(), fileRole: () => "production", query: async () => [], console: async () => ({ columns: [], rows: [], truncated: false }), author: (n: string) => n, scanId: "s", workspace: "w" } as unknown as World
    const echo: Tool = { name: "rank", namespace: "core", description: "", params: {}, label: () => "ranked", run: async (_a, ctx) => { const id = ctx.nextId(); return { text: `[${id}] 42 things`, evidence: [{ id, kind: "link", title: "x", ranOn: ctx.ranOn }] } } }

    function scripted(replies: Array<Partial<ModelReply>>): ModelClient {
        let i = 0
        return { name: "script", chat: async () => ({ content: "", thinking: "", toolCalls: [], promptTokens: 1, outputTokens: 1, ms: 1, stopped: false, ...replies[Math.min(i++, replies.length - 1)] }) }
    }

    it("calls tools, then checks and returns the answer", async () => {
        const events: TurnEvent[] = []
        let n = 0
        const out = await runTurn({
            question: "how many things?", history: [], tools: [echo], world, card: "", here: "", onScreen: null,
            ranOn: { scanId: "s", commit: "", revision: 1, workspace: "w" }, nextId: () => `E${++n}`, recall: () => null,
            sources: "", evidenceIds: new Set(), signal: new AbortController().signal, emit: e => events.push(e), plan: false,
            model: scripted([{ toolCalls: [{ name: "rank", args: {} }] }, { content: "There are 42 things [E1]." }]),
        })
        expect(out.answer).toBe("There are 42 things [E1].")
        expect(out.checks.every(c => c.ok)).toBe(true)
        expect(events.some(e => e.type === "tool" && e.phase === "end")).toBe(true)
    })

    it("repairs an unsourced number once", async () => {
        let n = 0
        const out = await runTurn({
            question: "how many things?", history: [], tools: [echo], world, card: "", here: "", onScreen: null,
            ranOn: { scanId: "s", commit: "", revision: 1, workspace: "w" }, nextId: () => `E${++n}`, recall: () => null,
            sources: "", evidenceIds: new Set(), signal: new AbortController().signal, emit: () => {}, plan: false,
            model: scripted([{ toolCalls: [{ name: "rank", args: {} }] }, { content: "There are 57 things [E1]." }, { content: "There are 42 things [E1]." }]),
        })
        expect(out.answer).toBe("There are 42 things [E1].")
        expect(out.messages.some(m => m.content.startsWith("[Check]"))).toBe(true)
    })
})

describe("the loop's budget", () => {
    it("answers without tools once the steps run out", async () => {
        const world = { info: {}, columns: {}, components: () => [], connections: () => [], cycles: () => [], definitions: () => new Map(), fileComponent: () => new Map(), fileRole: () => "production", query: async () => [], console: async () => ({ columns: [], rows: [], truncated: false }), author: (n: string) => n, scanId: "s", workspace: "w" } as unknown as World
        const tool: Tool = { name: "rank", namespace: "core", description: "", params: {}, label: () => "", run: async () => ({ text: "nothing" }) }
        const seen: boolean[] = []
        let n = 0
        const model: ModelClient = { name: "loop", chat: async req => { seen.push(!!req.tools); return req.tools ? { content: "", thinking: "", toolCalls: [{ name: "rank", args: {} }], promptTokens: 1, outputTokens: 1, ms: 1, stopped: false } : { content: "From what I found: nothing.", thinking: "", toolCalls: [], promptTokens: 1, outputTokens: 1, ms: 1, stopped: false } } }
        const out = await runTurn({ question: "q", history: [], model, tools: [tool], world, card: "", here: "", onScreen: null, ranOn: { scanId: "s", commit: "", revision: 1, workspace: "w" }, nextId: () => `E${++n}`, recall: () => null, sources: "", evidenceIds: new Set(), signal: new AbortController().signal, emit: () => {}, plan: false, maxSteps: 4 })
        expect(out.answer).toBe("From what I found: nothing.")
        expect(seen.at(-1)).toBe(false)
    })
})

describe("areas", () => {
    it("reads each naming style on its own and splits the big area", async () => {
        const { areasOf } = await import("../knowledge/areas")
        const names = [
            "com.elepy", "com.elepy.auth", "com.elepy.auth.users", "com.elepy.http", "com.elepy.dao", "com.elepy.models", "com.elepy.annotations", "com.elepy.handlers",
            "admin/src/main/resources/frontend", "admin/src/main/resources/frontend/src",
        ]
        const a = areasOf(names, () => 100)
        const keys = new Set(a.of.values())
        expect(keys.has("com")).toBe(false)
        expect(keys.size).toBeGreaterThanOrEqual(4)
        const biggest = Math.max(...[...keys].map(k => [...a.of.values()].filter(v => v === k).length))
        expect(biggest / names.length).toBeLessThan(0.6)
    })
})

describe("made-up markers", () => {
    it("sends [Snapshot] and [show: …] back", () => {
        const out = checkAnswer({ question: "q", answer: "It has 611 components [Snapshot]. See [show: cycles].", sources: "611", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.checks.find(c => c.id === "uncited")?.ok).toBe(false)
        expect(out.repair).toMatch(/Snapshot/)
    })
})

describe("the audit, refined", () => {
    it("ignores list numbering and accepts shares of stated numbers", () => {
        expect(unsourcedNumbers("1. a\n4. metrics.vue – 900 lines\n5. b", "900")).toEqual([])
        expect(unsourcedNumbers("112 of 783 files are tests, about 14% [E1].", "112 783")).toEqual([])
        expect(unsourcedNumbers("112 of 783 files, about 40% [E1].", "112 783")).toEqual(["40%"])
    })
})

describe("report digits", () => {
    it("writes spelled numbers as digits", async () => {
        const { digitize } = await import("../app/writer")
        expect(digitize("Sixty-one components across fourteen levels reach twenty-two percent of the code; seven authors.")).toBe("61 components across 14 levels reach 22% of the code; 7 authors.")
    })
})

describe("invented names", () => {
    it("sends back file names no tool returned, and admitted guesses", () => {
        const out = checkAnswer({ question: "largest files in order?", answer: "The largest are Order.java and OrderImpl.java [E1].", sources: "[E1] component order.domain", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.checks.find(c => c.id === "invented")?.ok).toBe(false)
        expect(out.repair).toMatch(/files_of/)
        const guess = checkAnswer({ question: "q", answer: "These would likely be the biggest, based on typical structure.", sources: "", toolCalls: 1, evidenceIds: new Set() })
        expect(guess.checks.find(c => c.id === "invented")?.ok).toBe(false)
    })
    it("accepts names the tools returned", () => {
        const out = checkAnswer({ question: "q", answer: "OrderImpl.java is the largest [E1].", sources: "[E1] src/OrderImpl.java 1,139 lines", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.checks.find(c => c.id === "invented")?.ok).toBe(true)
    })
})

describe("brackets in code", () => {
    it("does not read a Nuxt folder in a code span as a marker", () => {
        const out = checkAnswer({ question: "q", answer: "`pages/views/components/[name]/cycles.vue` has 62 hotspot [E1].", sources: "62 cycles.vue", toolCalls: 1, evidenceIds: new Set(["E1"]) })
        expect(out.checks.find(c => c.id === "uncited")?.ok).toBe(true)
    })
})

describe("a model that never stops calling tools", () => {
    it("still ends with an answer", async () => {
        const world = { info: {}, columns: {}, components: () => [], connections: () => [], cycles: () => [], definitions: () => new Map(), fileComponent: () => new Map(), fileRole: () => "production", query: async () => [], console: async () => ({ columns: [], rows: [], truncated: false }), author: (n: string) => n, scanId: "s", workspace: "w" } as unknown as World
        const tool: Tool = { name: "rank", namespace: "core", description: "", params: { component: { type: "string", description: "" } }, label: () => "", run: async (a, ctx) => { const id = ctx.nextId(); return { text: `[${id}] ${a.component ?? "none"}`, evidence: [{ id, kind: "link", title: "x", ranOn: ctx.ranOn }] } } }
        let n = 0, calls = 0
        const model: ModelClient = { name: "stubborn", chat: async () => { calls++; return { content: "", thinking: "", toolCalls: [{ name: "rank", args: { name: "web" } }], promptTokens: 1, outputTokens: 1, ms: 1, stopped: false } } }
        const out = await runTurn({ question: "q", history: [], model, tools: [tool], world, card: "", here: "", onScreen: null, ranOn: { scanId: "s", commit: "", revision: 1, workspace: "w" }, nextId: () => `E${++n}`, recall: () => null, sources: "", evidenceIds: new Set(), signal: new AbortController().signal, emit: () => {}, plan: false, maxSteps: 3 })
        expect(out.answer.length).toBeGreaterThan(10)
        expect(out.messages.some(m => m.role === "tool" && m.content.includes("web"))).toBe(true)
    })
})

describe("cannot, correctly", () => {
    it("lets a correct 'the scan cannot measure coverage' stand, with shares of card numbers", () => {
        const card = "Files by role: test 112 files / 11,369 lines · 783 files · 98,935 lines"
        const out = checkAnswer({ question: "What is the test coverage?", answer: "The scan cannot measure coverage. 112 of 783 files are tests, about 14%.", sources: card, card, toolCalls: 1, evidenceIds: new Set() })
        expect(out.checks.filter(c => !c.ok)).toEqual([])
    })
})

describe("menus", () => {
    it("sends a menu back to be answered", () => {
        const out = checkAnswer({ question: "What is the test coverage?", answer: "Would you like to see:\n1. Test vs production size\n2. Which components have tests", sources: "", toolCalls: 1, evidenceIds: new Set() })
        expect(out.repair).toMatch(/Answer the question first/)
    })
})
