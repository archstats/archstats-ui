// The questions the model can ask, and nothing else. Each intent takes a
// subject (`of`, from the whole codebase down to one file) and a few plain
// words; the engine decides which exhibits answer it and how they are drawn.
// The model reads the exhibits' facts and cites them; the answer shows the
// exhibits. No tool here names a figure, a column, a route or a table.

import { VIEWS } from "~/features/navigation/routes"
import { METRIC_WORDS, resolveMetric, metricName } from "~/features/snapshot/measures"
import { s, type Infer, type ObjectSchema } from "~/features/exhibits/schema"
import type { Tool, ToolContext, ToolParam, ToolResult } from "../engine/types"
import { CAPABILITIES, describeCapability } from "../knowledge/capabilities"
import { hybridSearch } from "../knowledge/semantic"
import { coreTools } from "../tools/core"
import { gather, show, type Shown } from "./show"
import { areaNote, resolveName, unresolved } from "./resolve"

function intent<O extends ObjectSchema<any>>(def: {
    name: string
    description: string
    params: O
    label: (a: Record<string, any>) => string
    run: (a: Infer<O>, ctx: ToolContext) => Promise<ToolResult>
}): Tool {
    const schema = def.params.jsonSchema()
    const params: Record<string, ToolParam> = Object.fromEntries(Object.entries(schema.properties).map(([k, p]: [string, any]) => [k, { type: p.type === "integer" ? "number" : p.type, description: p.description ?? "", ...(p.enum ? { enum: p.enum } : {}) }]))
    return {
        name: def.name, namespace: "core", description: def.description, params, required: schema.required, label: def.label,
        async run(args, ctx) {
            const parsed = def.params.parse(args)
            if ("error" in parsed) return { text: parsed.error }
            return def.run(parsed.value as Infer<O>, ctx)
        },
    }
}

/** The exhibits of an answer, their facts as the model's text. */
function answered(shown: Shown[], followUps: string[] = []): ToolResult {
    const g = gather(shown)
    return { text: g.text || "Nothing to show.", exhibits: g.exhibits, followUps }
}

const OF = s.string().optional().describe("What it is about: a component, file or area by name. Leave out for the whole codebase.")

export const INTENTS: Tool[] = [
    intent({
        name: "about",
        description: "What something is: the whole codebase (size, languages, production vs tests, areas, tangles, history) or one component or file (its measures, strongest neighbours, declarations). Start here for overviews, sizes, tests and composition.",
        params: s.object({ of: OF, vs: s.string().optional().describe("A second component or file, to compare with.") }, { aliases: { name: "of", component: "of", file: "of" } }),
        label: a => (a.of ? `Read ${a.of}${a.vs ? ` beside ${a.vs}` : ""}` : "Read the codebase as a whole"),
        async run(a, ctx) {
            if (!a.of) return answered([await show("profile", {}, ctx), await show("recipe", { recipe: "size-by-extension" }, ctx), await show("folders", { by: "role" }, ctx)], ["Is it well layered?", "Where are the tangles?"])
            const out: Shown[] = []
            for (const x of [a.of, a.vs].filter(Boolean) as string[]) {
                const r = resolveName(ctx.world, x)
                const why = unresolved(x, r, ctx.world)
                out.push(why ? { absent: why } : await show("profile", { of: (r as any).name }, ctx))
            }
            return answered(out)
        },
    }),
    intent({
        name: "structure",
        description: "How the code is layered and tangled: the stack of areas (imports should run downward; what points back up), tangles (components that all reach each other) with the cuts that would untangle them, and the cycles themselves: how many, and the smallest (e.g. \"what is the smallest cycle\"). For a component or area, its own parts.",
        params: s.object({ of: OF }, { aliases: { within: "of", component: "of" } }),
        label: a => `Looked at the structure${a.of ? ` of ${a.of}` : ""}`,
        async run(a, ctx) {
            // The layering, the tangle (with its cut plan), and the smallest cycles: what "is it layered" rests on.
            return answered([await show("stack", { of: a.of }, ctx), await show("tangle", { of: a.of }, ctx), await show("cycles", { of: a.of }, ctx)], ["What would it take to break the largest tangle?"])
        },
    }),
    intent({
        name: "dependencies",
        description: "What a component uses and what uses it (with import counts and the files that make each import), how far a change to it can ripple, and with `on` the route between two components and why one imports the other.",
        params: s.object({
            of: s.string().describe("The component."),
            direction: s.enum(["both", "uses", "used by"]).optional().describe("What it uses, what uses it, or both (default)."),
            on: s.string().optional().describe("A second component: how the two are connected."),
        }, { aliases: { component: "of", from: "of", to: "on" } }),
        label: a => (a.on ? `Traced ${a.of} to ${a.on}` : `Looked at what ${a.direction === "uses" ? `${a.of} uses` : a.direction === "used by" ? `uses ${a.of}` : `is around ${a.of}`}`),
        async run(a, ctx) {
            for (const x of [a.of, a.on].filter(Boolean) as string[]) {
                const why = unresolved(x, resolveName(ctx.world, x, "component"), ctx.world)
                if (why) return { text: why }
            }
            const r = resolveName(ctx.world, a.of, "component") as { name: string }
            const out = answered([await show("neighbours", { of: a.of, direction: a.direction, on: a.on }, ctx)])
            const note = areaNote(ctx.world, r.name)
            return note ? { ...out, text: `${out.text}\n\n${note}` } : out
        },
    }),
    intent({
        name: "change",
        description: "How the code changes over time: commits per month (activity), what changes in the same commits and whether an import explains it (together; hidden coupling when not), and hotspots (files changed often and complex).",
        params: s.object({
            of: OF,
            kind: s.enum(["activity", "together", "hidden coupling", "hotspots"]).optional().describe("Which: activity (default), together, hidden coupling, hotspots."),
            since: s.string().optional().describe("A recent period in words: \"30 days\", \"6 months\", \"a year\"."),
        }, { aliases: { component: "of", period: "since" } }),
        label: a => `Looked at ${a.kind ?? "activity"}${a.of ? ` of ${a.of}` : ""}${a.since ? ` over ${a.since}` : ""}`,
        async run(a, ctx) {
            if (a.of) { const why = unresolved(a.of, resolveName(ctx.world, a.of, "component"), ctx.world); if (why) return { text: why } }
            switch (a.kind) {
                case "together": return answered([await show("cochange", { of: a.of }, ctx)])
                case "hidden coupling": return answered([await show("cochange", { of: a.of, hidden: true }, ctx)])
                case "hotspots": return answered([await show("ranking", { measure: "hotspot", among: "files", of: a.of }, ctx), await show("recipe", { recipe: "unhealthy-changing" }, ctx)])
                default: return answered([await show("activity", { of: a.of, since: a.since }, ctx), ...(a.of ? [await show("cochange", { of: a.of }, ctx)] : [])])
            }
        },
    }),
    intent({
        name: "people",
        description: "Who knows the code: authors by share of commits and how many made half of them (the bus factor), who is still active, whom to ask, and what nobody active knows any more.",
        params: s.object({ of: OF, since: s.string().optional().describe("Only a recent period, in words: \"a year\".") }, { aliases: { component: "of" } }),
        label: a => `Looked at who knows ${a.of ?? "the code"}`,
        async run(a, ctx) {
            if (a.of) {
                const why = unresolved(a.of, resolveName(ctx.world, a.of, "component"), ctx.world)
                if (why) return { text: why }
                return answered([await show("authors", { of: a.of, since: a.since }, ctx)])
            }
            return answered([await show("knowledge", {}, ctx), await show("authors", { since: a.since }, ctx)])
        },
    }),
    intent({
        name: "rank",
        description: `Which components or files are the most or least of something (for the cycles and tangles themselves, use structure), e.g. "most depended on", "least healthy", "largest", "most changed", "hotspot", "cycles". Optionally only in part of the code, or only those meeting a condition ("dependents > 5"). Measures: ${[...new Set(Object.keys(METRIC_WORDS))].filter(k => !k.includes("_")).slice(0, 26).join(", ")}.`,
        params: s.object({
            measure: s.string().describe("What to rank by, in plain words, with most/least if it matters."),
            among: s.enum(["components", "files", "types"]).optional().describe("Components (default), files, or types and classes."),
            of: s.string().optional().describe("Only in this part of the code."),
            where: s.string().optional().describe("Only those meeting a condition, e.g. \"dependents > 5\"."),
        }, { aliases: { metric: "measure", by: "measure", grain: "among", within: "of", filter: "where" } }),
        label: a => `Ranked ${a.among ?? "components"} by ${a.measure}`,
        async run(a, ctx) {
            if (a.among === "types") return answered([await show("recipe", { recipe: "largest-classes" }, ctx)])
            return answered([await show("ranking", { measure: a.measure, among: a.among ?? "components", of: a.of, where: a.where }, ctx)])
        },
    }),
    intent({
        name: "libraries",
        description: "The outside packages and libraries the code imports, most used first, and the imports the scan could not resolve to code.",
        params: s.object({}),
        label: () => "Looked at the libraries",
        async run(_a, ctx) { return answered([await show("recipe", { recipe: "external-imports" }, ctx), await show("recipe", { recipe: "unresolved-imports" }, ctx)]) },
    }),
    intent({
        name: "deployables",
        description: "What ships from the code: services, apps and images, what builds them, the code each holds, and the pipelines. With a name: what ships that component.",
        params: s.object({ of: OF }, { aliases: { component: "of" } }),
        label: a => `Looked at what ships${a.of ? ` ${a.of}` : ""}`,
        async run(a, ctx) { return answered([await show("deployables", { of: a.of }, ctx)]) },
    }),
    intent({
        name: "rules",
        description: "The rules declared for this codebase (layering, forbidden imports) and what breaks them.",
        params: s.object({ of: OF }, { aliases: { component: "of" } }),
        label: () => "Looked at the declared rules",
        async run(a, ctx) { return answered([await show("rules", { of: a.of }, ctx)]) },
    }),
    intent({
        name: "code",
        description: "The code itself: a file's lines (around a text in it), where a text appears across the code (usages, annotations, calls), or the files of a component. Read code before explaining what it does.",
        params: s.object({
            of: s.string().optional().describe("A file or a component. Leave out to search the whole code for `find`."),
            find: s.string().optional().describe("Text to find: in the file, in the component's files, or everywhere."),
        }, { aliases: { file: "of", path: "of", component: "of", text: "find", search: "find" } }),
        label: a => (a.find ? `Looked for "${a.find}"${a.of ? ` in ${a.of}` : " in the code"}` : `Read ${a.of}`),
        async run(a, ctx) {
            if (!a.of) {
                if (!a.find) return { text: "Name a file or component (of), or text to find (find)." }
                return answered([await show("matches", { find: a.find }, ctx)])
            }
            const r = resolveName(ctx.world, a.of)
            const why = unresolved(a.of, r, ctx.world)
            if (why) return { text: why }
            const it = r as { kind: "component" | "file"; name: string }
            if (it.kind === "file") return answered(a.find ? [await show("excerpt", { file: it.name, find: a.find }, ctx)] : [await show("profile", { of: it.name }, ctx), await show("excerpt", { file: it.name }, ctx)])
            return answered(a.find ? [await show("matches", { find: a.find, of: it.name }, ctx)] : [await show("files", { of: it.name }, ctx)])
        },
    }),
    intent({
        name: "search",
        description: "Find components and files by part of their name.",
        params: s.object({ text: s.string().describe("Part of a name, any case.") }, { aliases: { name: "text", find: "text", query: "text" } }),
        label: a => `Looked up names containing "${a.text}"`,
        async run(a, ctx) { return answered([await show("names", { text: a.text }, ctx)]) },
    }),
    intent({
        name: "compare",
        description: "What changed between scans: since the last scan, what got worse or better, how a measure moved over time. Ask reads one snapshot, so this offers the Changes view, which compares two scans, and lists the scans there are to compare.",
        params: s.object({ of: OF }, { aliases: { component: "of", since: "of" } }),
        label: () => "Offered the comparison in Changes",
        async run(_a, { world, ranOn, nextId }) {
            const scans = world.scans?.() ?? null
            const id = nextId()
            const when = (at: string) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? at : d.toISOString().slice(0, 10) }
            const list = (scans ?? []).slice(0, 6).map((x, i) => `${i === 0 ? "newest" : `${i + 1}.`} ${when(x.at)}${x.commit ? `, commit ${x.commit}` : ""}${x.id === world.scanId ? " (the one Ask reads)" : ""}`)
            const text = scans && scans.length < 2
                ? `This workspace has ${scans.length === 1 ? "one scan" : "no completed scan"}, so there is nothing to compare yet: scanning again later gives Changes two to compare. Say so, then answer what this snapshot shows about recent change (the change tool).`
                : `Ask reads one snapshot and cannot compare scans. The Changes view compares two (what was added, removed, and which measures moved), and Over time follows a measure across all of them; an offer to open Changes is shown in the answer (it is not evidence: cite nothing for it).${list.length ? ` Scans: ${list.join("; ")}.` : ""} Say this plainly, without guessing what changed, then answer what this snapshot shows about recent change (the change tool).`
            return { text, evidence: [{ id, kind: "link" as const, title: "Compare scans in Changes", ranOn, open: { route: "/views/changes", label: "Open Changes" } }], followUps: ["What changed in the last 30 days?"] }
        },
    }),
    intent({
        name: "explain",
        description: "What a measure or term means and how it is computed (instability, code health, hotspot, tangle…), what Archstats can answer about a question, and where in the app to see it.",
        params: s.object({ term: s.string().describe("The measure, term or question."), of: s.string().optional().describe("A component, to give its value too.") }, { aliases: { question: "term", metric: "term" } }),
        label: a => `Looked up what "${a.term}" means`,
        async run(a, { world }) {
            const lines: string[] = []
            for (const table of ["components", "files"] as const) {
                const m = resolveMetric(world, a.term, table)
                if (!m || m.id === "cycles") continue
                const d = world.definitions().get(m.id)
                lines.push(`${metricName(world, m.id)} (${table}): ${d?.short ?? ""}${d?.long ? ` ${d.long}` : ""}`.trim())
                if (a.of && table === "components") {
                    const r = resolveName(world, a.of, "component")
                    if ("name" in r) { const c = world.components().find(x => x.name === r.name); if (c && c[m.id] !== undefined) lines.push(`${r.name}: ${metricName(world, m.id)} = ${c[m.id]}.`) }
                }
                break
            }
            const hits = (await hybridSearch(a.term, CAPABILITIES, c => [...c.asks, c.id.replace(/-/g, " "), c.family, c.how].join(". "), { embed: world.embed?.bind(world), limit: 2 })).map(x => x.item)
            for (const h of hits) lines.push(describeCapability(h))
            const view = VIEWS.find(v => a.term.toLowerCase().includes(v.label.toLowerCase()))
            if (view) lines.push(`In the app: the ${view.label} view.`)
            return { text: lines.join("\n") || `No definition of "${a.term}" is known here.` }
        },
    }),
    ...coreTools.filter(t => t.name === "ask_user"),
]
