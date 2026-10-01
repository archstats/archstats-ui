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

import type { ModuleGraph } from "./moduleGraph"
import { laneFlows, mutualPairs } from "./graph"
import { UNCLASSIFIED } from "~/features/frameworks/frameworkProfiles"
import { t, intlLocale } from "~/shared/i18n"

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
    /**
     * Set when the evidence is best seen where it lives: the region opens on
     * the folder map, painted by reach or by repeated names, not on a list.
     */
    map?: "reach" | "dupes"
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
            ? t("units.findings.dependsNeverOtherWay", { from, to })
            : t("units.findings.dependEachOther", { from, to })
        const detail = oneWay
            ? t("units.findings.moduleReferencesOneDirection", { strongestCount: strongest.count })
            : t("units.findings.moduleReferencesOneWay", { strongestCount: strongest.count, reverse: strongest.reverse })
        out.push({
            id: "layering",
            headline,
            detail,
            tone: oneWay ? "neutral" : "warn",
            action: oneWay ? t("units.findings.open", { strongestCount: strongest.count }) : t("units.findings.openGoingBack", { reverse: strongest.reverse }),
            region: {
                id: "layering",
                label: oneWay ? t("units.findings.into", { from, to }) : t("units.findings.back", { to, from }),
                paths: pathsOf(between),
                references: between.map((e) => ({
                    from: e.from, to: e.to, weight: e.via.length,
                    back: weightOf.get(e.to + "\n" + e.from),
                })),
                note: oneWay
                    ? t("units.findings.everyReference", { from, to })
                    : t("units.findings.runningBackAgainstGrain", { reverse: strongest.reverse, to, from, strongestCount: strongest.count }),
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
            ? t("units.findings.importEachOther", { value: names.get(a) ?? a, value2: names.get(b) ?? b })
            : t("units.findings.pairsModulesImportEach", { knotsLength: knots.length })
        const detail = t("units.findings.neitherSideCanExtracted")
        out.push({
            id: "knots",
            headline,
            detail,
            tone: "warn",
            action: knots.length === 1 ? t("units.findings.openPair") : t("units.findings.openPairs"),
            region: {
                id: "knots",
                label: knots.length === 1 ? t("units.findings.knottedPair") : t("units.findings.knottedPairs", { knotsLength: knots.length }),
                paths: [...new Set(knots.flat())],
                references: knots.map(([x, y]) => ({
                    from: x, to: y,
                    weight: weightOf.get(x + "\n" + y) ?? 0,
                    back: weightOf.get(y + "\n" + x) ?? 0,
                })),
                note: t("units.findings.eachRowTwoModules"),
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
            ? t("units.findings.declaresSeparateThings", { topName: top.name, declaredLength: top.declared.length })
            : t("units.findings.modulesDeclareMoreThings", { crowdedLength: crowded.length, CROWDED })
        const detail = t("units.findings.largestModuleDoingMany", { topName: top.name, declaredLength: top.declared.length })
        out.push({
            id: "crowded",
            headline,
            detail,
            tone: "warn",
            action: crowded.length === 1 ? t("units.findings.open2") : t("units.findings.openThem"),
            region: {
                id: "crowded",
                label: t("units.findings.crowdedModules"),
                paths: crowded.map((m) => m.path),
                note: t("units.findings.sortedWhatEachOne", { CROWDED }),
                claim: { headline, detail, tone: "warn" },
            },
        })
    }

    // What everything leans on.
    const hubs = modules.filter((m) => m.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn)
    if (hubs.length > 0 && hubs[0].fanIn >= MIN_FLOW) {
        const top = hubs.slice(0, 3)
        const headline = t("units.findings.carryMostWeight", { value: top.map((m) => m.name).join(", ") })
        const detail = t("units.findings.importedOtherModulesChanging", { name: hubs[0].name, fanIn: hubs[0].fanIn })
        out.push({
            id: "hubs",
            headline,
            detail,
            tone: "neutral",
            action: t("units.findings.openLoadBearingModules"),
            region: {
                id: "hubs",
                label: t("units.findings.loadBearing"),
                paths: hubs.slice(0, 20).map((m) => m.path),
                note: t("units.findings.twentyModulesRestCodebase"),
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
        const headline = t("units.findings.neverImported", { modulesAre: t("common.count.moduleIs", { count: never.length }) })
        // Django loads every migration by name, so they all land here; they
        // are not deletion candidates and the sentence should not imply it.
        const written = tool > 0 ? t("units.findings.generatedTool", { are: t("common.count.is", { count: tool }) }) : ""
        const detail = t("units.findings.totalThemImportNothing", { share, isolated: isolated.toLocaleString(intlLocale), written })
        out.push({
            id: "dark",
            headline,
            detail,
            tone: "neutral",
            action: t("units.findings.openThem"),
            region: {
                id: "dark",
                label: t("units.findings.neverImported2"),
                paths: never.map((m) => m.path),
                note: t("units.findings.noModuleCodebaseImports"),
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
