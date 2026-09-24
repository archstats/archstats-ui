// What the module graph says, in sentences, each one a way in.
//
// A table of 1,217 rows is an inventory, not a reading. An architect opening
// this screen has questions -- does my layering hold, what is load-bearing,
// what is knotted, what is dead -- and a list makes them derive the answers by
// eye. These are the answers, and each one descends into the evidence it was
// read off, so the claim can be checked rather than taken.
//
// The evidence keeps its own shape on the way down. "Seven references run back
// against the layer" is a claim about *references*, and flattening it into the
// fourteen modules at their ends loses the pairing that was the whole point:
// you arrive at a list and cannot see which module leaked into which.

import type { ModuleGraph } from "~/utils/moduleGraph"
import { laneFlows, mutualPairs } from "~/utils/graph"
import { UNCLASSIFIED } from "~/utils/javaFrameworks"

/** One module depending on another, as the evidence for a claim. */
export interface Reference {
    from: string
    to: string
    /** Unit references behind it, which is how heavy the dependency is. */
    weight: number
    /** Traffic the other way, when the pair leans on each other. */
    back?: number
}

/** A named subset of the codebase: what the descent's middle landing shows. */
export interface Region {
    id: string
    /** What the breadcrumb calls it. */
    label: string
    /** The modules in it, by path. */
    paths: string[]
    /** Why these and not others, kept so a reader can disagree. */
    note?: string
    /**
     * The claim this region is the evidence for, restated on arrival.
     *
     * Without it the descent drops what it was you clicked: the breadcrumb
     * names the region but not the finding, and a list of modules cannot say
     * on its own why those modules and not others.
     */
    claim?: { headline: string; detail: string; tone: "neutral" | "warn" }
    /**
     * Set when the evidence is dependencies rather than modules, so the
     * landing can show them as pairs instead of a flattened bag of ends.
     */
    references?: Reference[]
    /**
     * The two lanes the region is about, when it is about a boundary.
     *
     * Without them the landing cannot say how the two *groups* relate, which
     * is the question that got the reader here; it can only show the modules
     * at the ends, two grains below what was asked.
     */
    sides?: { a: string; b: string }
}

export interface Finding {
    id: string
    /** The claim, in the product's own words. */
    headline: string
    /** What it was read off. */
    detail: string
    tone: "neutral" | "warn"
    /** What to call the act of looking at the evidence. */
    action: string
    /** Where opening it lands. */
    region: Region
}

const MIN_FLOW = 3
const CROWDED = 8

export interface FindingsInput {
    graph: ModuleGraph
    laneLabel: (lane: string) => string
    /** Files a tool wrote, by their own header; see complexity__files__generated. */
    generated?: Set<string>
    /**
     * Lanes defined by what references them. "Entry points depends on Logic,
     * and never the other way round" was read as a layer holding; nothing can
     * depend on a lane made of what nothing references.
     */
    definitional?: Set<string>
}

/**
 * The handful of things worth saying about this codebase, ordered by how much
 * they should change what the reader does next.
 *
 * Written as claims rather than counts: "Components and Hooks depend on each
 * other" is a reading, "Components 41" is a number to interpret.
 */
export function findingsFor({ graph, laneLabel, generated = new Set(), definitional = new Set() }: FindingsInput): Finding[] {
    const { modules, edges } = graph
    if (modules.length === 0) return []

    const out: Finding[] = []
    const laneOf = new Map(modules.map((m) => [m.path, m.lane]))
    const weightOf = new Map(edges.map((e) => [e.from + "\n" + e.to, e.via.length]))

    // Layering, which is the question an architect arrives with -- asked of
    // the modules a rule placed. Unclassified is not a layer: a dependency on
    // "whatever matched nothing" says nothing about whether a layer holds.
    const classifiedLane = new Map([...laneOf].filter(([, lane]) => lane !== UNCLASSIFIED && !definitional.has(lane)))
    const flows = laneFlows(classifiedLane, edges)
    const strongest = flows[0]
    if (strongest && strongest.count >= MIN_FLOW) {
        const oneWay = strongest.reverse === 0
        // On a two-way dependency the references worth seeing are the ones
        // running back against the grain, not the well-behaved majority.
        const [tail, head] = oneWay
            ? [strongest.from, strongest.to]
            : [strongest.to, strongest.from]
        // Both directions, so the landing can draw the relationship rather
        // than only the half that was complained about.
        const between = edges.filter((e) => {
            const f = laneOf.get(e.from), t = laneOf.get(e.to)
            return (f === strongest.from && t === strongest.to) || (f === strongest.to && t === strongest.from)
        })
        const from = laneLabel(strongest.from)
        const to = laneLabel(strongest.to)
        const headline = oneWay
            ? `${from} depends on ${to}, and never the other way round.`
            : `${from} and ${to} depend on each other.`
        const detail = oneWay
            ? `${strongest.count} module references in one direction, none back. That is a layer holding.`
            : `${strongest.count} module references one way, ${strongest.reverse} the other. Neither layer can move without the other.`
        out.push({
            id: "layering",
            headline,
            detail,
            tone: oneWay ? "neutral" : "warn",
            action: oneWay ? `Open the ${strongest.count}` : `Open the ${strongest.reverse} going back`,
            region: {
                id: "layering",
                label: oneWay ? `${from} into ${to}` : `${to} back into ${from}`,
                paths: pathsOf(between),
                references: between.map((e) => ({
                    from: e.from, to: e.to, weight: e.via.length,
                    back: weightOf.get(e.to + "\n" + e.from),
                })),
                note: oneWay
                    ? `Every reference from ${from} into ${to}.`
                    : `The ${strongest.reverse} running from ${to} back into ${from}, against the grain of the other ${strongest.count}.`,
                claim: { headline, detail, tone: oneWay ? "neutral" : "warn" },
                sides: { a: strongest.from, b: strongest.to },
            },
        })
    }

    // Knots: the thing you cannot pull apart.
    const knots = mutualPairs(edges)
    if (knots.length > 0) {
        const names = new Map(modules.map((m) => [m.path, m.name]))
        const [a, b] = knots[0]
        const headline = knots.length === 1
            ? `${names.get(a) ?? a} and ${names.get(b) ?? b} import each other.`
            : `${knots.length} pairs of modules import each other.`
        const detail = "Neither side can be extracted, tested or replaced on its own."
        out.push({
            id: "knots",
            headline,
            detail,
            tone: "warn",
            action: knots.length === 1 ? "Open the pair" : "Open the pairs",
            region: {
                id: "knots",
                label: knots.length === 1 ? "A knotted pair" : `${knots.length} knotted pairs`,
                paths: [...new Set(knots.flat())],
                references: knots.map(([x, y]) => ({
                    from: x, to: y,
                    weight: weightOf.get(x + "\n" + y) ?? 0,
                    back: weightOf.get(y + "\n" + x) ?? 0,
                })),
                note: "Each row is two modules that import one another.",
                claim: { headline, detail, tone: "warn" },
            },
        })
    }

    // Crowded modules, which is where an extraction starts. Not a test file:
    // one holding two hundred tests is thorough, not doing two hundred jobs,
    // and gin's context_test led this finding. Not generated code either:
    // nopCommerce's NSwag client led it at 140, and nobody extracts from a
    // file a tool rewrites.
    const crowded = modules.filter((m) => m.declared.length >= CROWDED && !isTestPath(m.path) && !generated.has(m.path))
        .sort((a, b) => b.declared.length - a.declared.length)
    if (crowded.length > 0) {
        const top = crowded[0]
        const headline = crowded.length === 1
            ? `${top.name} declares ${top.declared.length} separate things.`
            : `${crowded.length} modules declare ${CROWDED} or more things each.`
        const detail = `${top.name} is the largest at ${top.declared.length}. A module doing this many jobs is where an extraction starts.`
        out.push({
            id: "crowded",
            headline,
            detail,
            tone: "warn",
            action: crowded.length === 1 ? "Open it" : "Open them",
            region: {
                id: "crowded",
                label: "Crowded modules",
                paths: crowded.map((m) => m.path),
                note: `Sorted by what each one declares. Anything over ${CROWDED} is here.`,
                claim: { headline, detail, tone: "warn" },
            },
        })
    }

    // What everything leans on.
    const hubs = modules.filter((m) => m.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn)
    if (hubs.length > 0 && hubs[0].fanIn >= MIN_FLOW) {
        const top = hubs.slice(0, 3)
        const headline = `${top.map((m) => m.name).join(", ")} carry the most weight.`
        const detail = `${hubs[0].name} is imported by ${hubs[0].fanIn} other modules. Changing one of these reaches furthest.`
        out.push({
            id: "hubs",
            headline,
            detail,
            tone: "neutral",
            action: "Open the load-bearing modules",
            region: {
                id: "hubs",
                label: "Load-bearing",
                paths: hubs.slice(0, 20).map((m) => m.path),
                note: "The twenty modules the rest of the codebase imports most.",
                claim: { headline, detail, tone: "neutral" },
            },
        })
    }

    // The honest one, last: it says what the view cannot see rather than
    // something about the design.
    //
    // "Never imported" means exactly that: nothing imports it. It used to
    // count only modules with no edges at all, in or out, so an entry point
    // that imports half the codebase and is imported by nothing was left out
    // of a sentence that describes it precisely -- Broadleaf read 370 where
    // 1,467 modules are imported by nothing.
    const never = modules.filter((m) => m.fanIn === 0)
        .sort((a, b) => Number(a.fanOut > 0) - Number(b.fanOut > 0))
    if (never.length > 0) {
        const isolated = never.filter((m) => m.fanOut === 0).length
        const tool = never.filter((m) => generated.has(m.path)).length
        const share = Math.round((never.length / modules.length) * 100)
        const headline = `${never.length.toLocaleString()} ${never.length === 1 ? "module is" : "modules are"} never imported.`
        // Django loads every migration by name, so they all land here; they
        // are not deletion candidates and the sentence should not imply it.
        const written = tool > 0 ? ` ${tool.toLocaleString()} ${tool === 1 ? "is" : "are"} generated by a tool.` : ""
        const detail = `${share}% of the total; ${isolated.toLocaleString()} of them import nothing either.${written} ` +
            "Entry points, config and tests belong here; anything else is a candidate for deletion."
        out.push({
            id: "dark",
            headline,
            detail,
            tone: "neutral",
            action: "Open them",
            region: {
                id: "dark",
                label: "Never imported",
                paths: never.map((m) => m.path),
                note: "No module in this codebase imports these. Those that import nothing either are listed first.",
                claim: { headline, detail, tone: "neutral" },
            },
        })
    }

    // Warnings first: a finding that should change what you do next outranks
    // one that is context for it.
    return out.sort((a, b) => Number(b.tone === "warn") - Number(a.tone === "warn"))
}

function pathsOf(edges: Array<{ from: string; to: string }>): string[] {
    return [...new Set(edges.flatMap((e) => [e.from, e.to]))]
}

/**
 * A test file, by the conventions of the languages this reads: a tests/ or
 * __tests__/ directory, or a name ending in test/spec (`foo.test.ts`,
 * `foo_test.go`, `FooTest.java`, `test_foo.py`).
 */
export function isTestPath(path: string): boolean {
    const p = path.toLowerCase()
    if (/(^|\/)(tests?|__tests__|specs?|e2e)\//.test(p)) return true
    const base = p.slice(p.lastIndexOf("/") + 1)
    // JVM and .NET test classes are named with a capital T (FooTest), read
    // from the original casing: lower-cased, "Contest.java" ends in test.java.
    const original = path.slice(path.lastIndexOf("/") + 1)
    return /[._-](test|spec)s?\.[a-z0-9]+$/.test(base) ||
        /_test\.go$/.test(base) ||
        /^test_.*\.py$/.test(base) ||
        /[a-z0-9]Tests?\.(java|kt|cs|scala)$/.test(original)
}
