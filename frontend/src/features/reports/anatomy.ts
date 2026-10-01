// Framework anatomy: the codebase read through the framework it is built on.
//
// The Classes view sorts every class or function into its framework's roles
// (a Spring controller, a Django model, a React hook) with the profiles in
// features/frameworks. These readings put the same sorting into words: how
// many of each role there are and where they live, which roles reference
// which, and where references skip a layer or run back up against it. A role
// is what the profile's rules say, never a guess; what no rule matched is
// counted apart as unclassified and left out of every claim about layers.

import { classify, detectFramework, languageOf, languageOfFile, profileById, UNCLASSIFIED, type FrameworkProfile, type Language } from "~/features/frameworks/frameworkProfiles"
import { isTestPath } from "~/features/snapshot/fileRole"
import { loadUnits } from "~/features/units/units"
import { proseName, proseNames, type ReadingOutput } from "./reportDoc"
import type { ReadingContext, ReadingDef } from "./readings"
import { t, intlLocale } from "~/shared/i18n"

export interface AnatomyUnit { id: string; name: string; lane: string; component: string; fanIn: number; fanOut: number }

export interface Anatomy {
    profile: FrameworkProfile
    /** The profile was detected with confidence, rather than asked for or fallen back to. */
    confident: boolean
    reason: string
    /** Units carrying the framework's own annotations, base types or imports, and all units read. */
    evidence: { strong: number; total: number }
    language: Language | null
    /** Declared units outside tests, each with its role. */
    units: AnatomyUnit[]
    /** Distinct unit-to-unit references between those units, members rolled up to their owners. */
    edges: Array<[string, string]>
    /** The snapshot records which unit uses which; without it there are no edges to read. */
    linked: boolean
}

/**
 * Each profile's roles from the top of a request to the bottom, for the ones
 * that have a direction. Cross-cutting roles (middleware, wiring, messaging)
 * are left out: they sit beside the layers, not in them.
 */
const LAYERS: Record<string, string[]> = {
    spring: ["controllers", "services", "repositories", "entities"],
    jakarta: ["endpoints", "beans", "repositories", "entities"],
    quarkus: ["resources", "beans", "data", "entities"],
    micronaut: ["controllers", "beans", "repositories", "entities"],
    vertx: ["verticles", "handlers", "clients", "models"],
    // The Application wires every resource and DAO; that is its job, not a
    // reference back up the stack, so it sits beside the layers.
    dropwizard: ["resources", "data", "models"],
    // A pipeline composes transforms, a transform its DoFns. IO and coders
    // are reached from every step and sit beside them.
    beam: ["pipelines", "transforms", "fns"],
    android: ["screens", "viewmodels", "data", "models"],
    // On every mobile platform the small views and widgets sit beside the
    // layers, as Android's do: a screen composes them and so does a row, and
    // the state they read is the screen's. The App and its delegates are
    // wiring. TCA is the exception, being its own stack: a view renders a
    // store, a reducer runs effects through its dependency clients.
    ios: ["screens", "state", "data", "models"],
    tca: ["views", "features", "clients", "models"],
    flutter: ["screens", "state", "data", "models"],
    "react-native": ["screens", "hooks", "state", "data", "models"],
    nestjs: ["controllers", "providers", "data", "models"],
    angular: ["components", "services", "data", "models"],
    // Next.js routes to pages, which compose components; a hook is what a
    // component calls, a client what a hook calls.
    react: ["pages", "components", "hooks", "data", "models"],
    vue: ["pages", "components", "composables", "stores", "data", "models"],
    express: ["routes", "services", "data", "models"],
    django: ["views", "forms", "models"],
    fastapi: ["routes", "data", "models"],
    "go-http": ["handlers", "logic", "data", "models"],
    "go-cli": ["commands", "logic", "data", "models"],
    aspnet: ["controllers", "services", "data", "models"],
    laravel: ["controllers", "logic", "data", "models"],
    symfony: ["controllers", "logic", "data", "models"],
    ktor: ["routes", "logic", "data", "models"],
    structure: ["entry", "logic", "data", "models"],
}

/** Bottom layers that hold data shapes rather than behaviour. */
const SHAPES = new Set(["models", "entities"])

/** The profile's layers, top first, as far as the profile has them. */
export function layersOf(profile: FrameworkProfile): string[] {
    const have = new Set(profile.lanes.map(l => l.id))
    return (LAYERS[profile.id] ?? []).filter(id => have.has(id) && id !== UNCLASSIFIED)
}

const NOUN: Record<Language, string> = {
    java: "classes", kotlin: "classes", csharp: "classes", php: "classes",
    python: t("reports.anatomy.classesFunctions"), go: t("reports.anatomy.typesFunctions"), typescript: t("reports.anatomy.functionsClassesTypes"),
    // Swift's structs, enums and actors are types; Dart's screens are classes
    // and its providers may be functions.
    swift: "types", objc: "classes", dart: t("reports.anatomy.classesFunctions"),
}

const cache = new WeakMap<ReadingContext, Map<string, Promise<Anatomy | null>>>()

/**
 * The anatomy under a profile: the one asked for, else the detected one; with
 * a language, only that language's code, so a Go review of a Go and Vue
 * repository reads the Go. Read once per run context, profile and language.
 */
export function anatomy(ctx: ReadingContext, profileId = "", language = ""): Promise<Anatomy | null> {
    let byProfile = cache.get(ctx)
    if (!byProfile) cache.set(ctx, (byProfile = new Map()))
    const key = `${profileId}\n${language}`
    let p = byProfile.get(key)
    if (!p) { p = readAnatomy(ctx, profileId, language); byProfile.set(key, p) }
    return p
}
/** Java and Kotlin read as one language. */
const sameLanguage = (file: string, language: string) => { const l = languageOfFile(file); return l === language || (language === "java" && l === "kotlin") }

async function readAnatomy(ctx: ReadingContext, profileId: string, only: string): Promise<Anatomy | null> {
    const q = async (sql: string) => { try { return await ctx.query(sql) } catch { return [] } }
    const tables = new Set((await q(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view')`)).map(r => String(r.name)))
    if (!tables.has("units")) return null
    const facts = await loadUnits(ctx.query, v => tables.has(v))
    if (!facts.size) return null

    const fileRows = tables.has("files") ? await q(`SELECT name, ${(await q(`SELECT name FROM pragma_table_info('files') WHERE name = 'role'`)).length ? "role" : "'production' AS role"} FROM files`) : []
    // Tests, and code nobody here wrote: generated protobuf stubs and vendored libraries have no role in the design.
    const test = new Set(fileRows.filter(r => r.role === "test" || r.role === "generated" || r.role === "third_party").map(r => String(r.name)))
    const language = only ? (only as Language) : languageOf(fileRows.filter(r => (r.role || "production") === "production").map(r => String(r.name)))
    const detection = detectFramework([...facts.values()].map(f => f.facts), language)
    const profile = profileById(profileId || detection.id)

    // Members reach the graph through their owners, as they do in the Classes view.
    const unitRows = await q(`SELECT id, kind, owner FROM units`)
    const ownerOf = new Map<string, string>()
    const kindOf = new Map<string, string>()
    for (const r of unitRows) { kindOf.set(String(r.id), String(r.kind ?? "")); if (r.owner) ownerOf.set(String(r.id), String(r.owner)) }
    // Only an owner that is a unit: a Kotlin extension on a library type stands on its own.
    const top = (id: string) => { let x = id; for (let i = 0; ownerOf.has(x) && kindOf.has(ownerOf.get(x)!) && i < 8; i++) x = ownerOf.get(x)!; return x }

    const kept = new Map<string, AnatomyUnit>()
    for (const f of facts.values()) {
        if (kindOf.get(f.id) === "module") continue
        if (test.has(f.file) || isTestPath(f.file)) continue
        if (only && !sameLanguage(f.file, only)) continue
        kept.set(f.id, { id: f.id, name: f.name, lane: UNCLASSIFIED, component: f.component, fanIn: 0, fanOut: 0 })
    }
    const raw = tables.has("unit_connections") ? await q(`SELECT DISTINCT "from", "to" FROM unit_connections WHERE "from" <> "to"`) : []
    const seen = new Set<string>()
    const edges: Array<[string, string]> = []
    for (const r of raw) {
        const a = top(String(r.from)), z = top(String(r.to))
        if (a === z || !kept.has(a) || !kept.has(z)) continue
        const key = `${a}\n${z}`
        if (seen.has(key)) continue
        seen.add(key)
        edges.push([a, z])
        kept.get(a)!.fanOut++
        kept.get(z)!.fanIn++
    }
    for (const u of kept.values()) u.lane = classify(profile, facts.get(u.id)!.facts, { inDegree: u.fanIn, outDegree: u.fanOut })
    const best = detection.candidates.find(c => c.id === profile.id)
    return { profile, confident: !profileId && detection.confident, reason: detection.reason, evidence: { strong: best?.strong ?? 0, total: detection.total }, language, units: [...kept.values()], edges, linked: raw.length > 0 }
}

// ── Writing it down ───────────────────────────────────────────────────────

const n = (v: number) => Math.round(v).toLocaleString(intlLocale)
const b = (s: string) => `**${s}**`
/** A name set as code, shortened for prose (proseName); the root folder's component "." reads as "(root)". */
const code = (s: string) => `\`${proseName(s).replace(/`/g, "'")}\``
const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`
/** "`a` (10) and `b` (7)": places with their counts, names kept apart when shortened. */
const places = (where: Array<[string, number]>) => { const shown = proseNames(where.map(([c]) => c)); return listOf(where.map(([, x], i) => `\`${shown[i].replace(/`/g, "'")}\` (${n(x)})`)) }
const listOf = (items: string[]) => (items.length <= 1 ? items.join("") : t("reports.anatomy.and", { items: items.slice(0, -1).join(", "), value: items[items.length - 1] }))
const absent = (text: string): ReadingOutput => ({ text, values: {}, absent: true })
const noAnatomy = absent(t("reports.anatomy.scanDidNotRecord"))

const labelOf = (p: FrameworkProfile, lane: string) => p.lanes.find(l => l.id === lane)?.label ?? lane
const hintOf = (p: FrameworkProfile, lane: string) => p.lanes.find(l => l.id === lane)?.hint
/** A role's label as a sentence says it: "Entities & Models" reads "entities and models"; "DTOs" keeps its capitals. */
const inProse = (label: string) => label.replace(/ & /g, " and ").split(" ").map(w => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w)).join(" ")
/** "58 controllers", "1 controller", or "1 of the services and other" where a label has no one-word singular. */
const countRole = (k: number, p: FrameworkProfile, lane: string) => {
    const label = inProse(labelOf(p, lane))
    if (k !== 1) return `${n(k)} ${label}`
    return /\s/.test(label) ? t("reports.anatomy.text1", { label }) : `1 ${label.replace(/ies$/, "y").replace(/(ss)es$/, "$1").replace(/s$/, "")}`
}
/** A lane's hint as an aside: "(what answers a request)". */
const aside = (p: FrameworkProfile, lane: string) => { const h = hintOf(p, lane); return h ? ` (${/^[A-Z][a-z]/.test(h) ? h.charAt(0).toLowerCase() + h.slice(1) : h})` : "" }
/** "Go services' own" where a name ends in s, "Symfony's own" otherwise. */
const possessive = (s: string) => (s.endsWith("s") ? `${s}'` : `${s}'s`)

function countBy<T>(xs: T[], key: (x: T) => string): Array<[string, number]> {
    const m = new Map<string, number>()
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** The units of one lane, the same unit ids as a set. */
const inLane = (a: Anatomy, lane: string) => a.units.filter(u => u.lane === lane)

// Parameters, set by templates and not offered in the cell pane: `profile`,
// a profile id to read the code as (the detected one when empty), and for
// "role", `lane`, the role to describe.
export const ANATOMY_READINGS: ReadingDef[] = [
    {
        id: "roles",
        label: t("reports.anatomy.rolesFramework"),
        describe: "Every class or function outside tests, sorted into its framework's roles by the Classes view's profiles (annotations, base types, imports, then names), with where each role lives.",
        async run(ctx, p) {
            const a = await anatomy(ctx, p.profile, p.language)
            if (!a) return noAnatomy
            const noun = a.language ? NOUN[a.language] : "declarations"
            const counts = new Map(countBy(a.units, u => u.lane))
            const lanes = a.profile.lanes.filter(l => l.id !== UNCLASSIFIED && counts.get(l.id))
            if (!lanes.length) return absent(t("reports.anatomy.noneCodeSMatch", { noun, profileLabel: a.profile.label }))
            const unclassified = counts.get(UNCLASSIFIED) ?? 0
            const classified = a.units.length - unclassified
            const name = a.profile.label
            const lead = a.evidence.strong && (p.profile || a.confident)
                ? t("reports.anatomy.codebaseTestsIncludedUse", { name: b(name), strong: n(a.evidence.strong), evidenceTotal: n(a.evidence.total), noun, name2: possessive(name) })
                : p.profile ? t("reports.anatomy.sortedRolesGivesThem", { noun, name })
                : t("reports.anatomy.noSingleFrameworkStands", { noun })
            const intro = t("reports.anatomy.outsideTestsThereFit", { lead, unitsLength: b(n(a.units.length)), noun, value: classified >= unclassified ? t("reports.anatomy.mostThem") : t("reports.anatomy.someThem"), name: possessive(name) })
            const layers = new Set(layersOf(a.profile))
            const top = layersOf(a.profile)[0]
            const items = lanes.map(l => {
                const us = inLane(a, l.id)
                const k = us.length
                const where = countBy(us, u => u.component || t("reports.anatomy.noComponent"))
                const lives = where.length === 1
                    ? t("reports.anatomy.in", { allLive: t("common.noun.lives", { count: k }), value: code(where[0][0]) })
                    : t("reports.anatomy.liveMostly", { slice: places(where.slice(0, 2)) })
                const reaches = l.id === top || !layers.has(l.id)
                const pick = reaches
                    ? [...us].sort((x, y) => y.fanOut - x.fanOut || x.name.localeCompare(y.name))[0]
                    : [...us].sort((x, y) => y.fanIn - x.fanIn || x.name.localeCompare(y.name))[0]
                const note = pick && (reaches ? pick.fanOut : pick.fanIn) > 0 && k > 1
                    ? reaches ? t("reports.anatomy.usesMostOtherClasses", { pickName: code(pick.name), fanOut: n(pick.fanOut) }) : t("reports.anatomy.mostUsed", { pickName: code(pick.name), classes: t("common.count.class", { count: pick.fanIn }) })
                    : ""
                return `- ${b(countRole(k, a.profile, l.id))}${aside(a.profile, l.id)} ${lives}.${note}`
            })
            const rest = unclassified ? t("reports.anatomy.otherFitNoneThese", { unclassified: b(n(unclassified)) }) : ""
            return {
                text: `${intro}\n\n${items.join("\n")}${rest}`,
                values: { declared: a.units.length, ...Object.fromEntries(lanes.map(l => [labelOf(a.profile, l.id), counts.get(l.id) ?? 0])), unclassified },
            }
        },
    },
    {
        id: "layers",
        label: t("reports.anatomy.howRolesReferenceEach"),
        describe: t("reports.anatomy.referencesBetweenClassesUnit"),
        async run(ctx, p) {
            const a = await anatomy(ctx, p.profile, p.language)
            if (!a) return noAnatomy
            const order = layersOf(a.profile)
            if (order.length < 2) return absent(t("reports.anatomy.hasNoTopBottom", { profileLabel: a.profile.label }))
            const rank = new Map(order.map((id, i) => [id, i]))
            const byId = new Map(a.units.map(u => [u.id, u]))
            const down: Array<[string, string]> = [], skip: Array<[string, string]> = [], back: Array<[string, string]> = []
            // Models and entities are the shapes every layer passes around: a
            // controller takes a request DTO, a service loads an entity. Every
            // agent auditing a framework found those read as skipped layers,
            // the most ordinary code there is. Reaching them is expected; only
            // leaving them, back up, is not.
            const shapes = SHAPES.has(order[order.length - 1]) ? order.length - 1 : -1
            for (const e of a.edges) {
                const f = rank.get(byId.get(e[0])!.lane), t = rank.get(byId.get(e[1])!.lane)
                if (f === undefined || t === undefined || f === t) continue
                if (t === f + 1 || (t === shapes && f < t)) down.push(e); else if (t > f + 1) skip.push(e); else back.push(e)
            }
            if (!a.linked) return absent(t("reports.anatomy.scanDoesNotRecord"))
            if (!down.length && !skip.length && !back.length) return absent(t("reports.anatomy.noReferenceRunsBetween", { profileLabel: a.profile.label }))
            const pairText = (list: Array<[string, string]>) => {
                const pairs = countBy(list, e => `${byId.get(e[0])!.lane}\n${byId.get(e[1])!.lane}`)
                const [key, k] = pairs[0]
                const [fl, tl] = key.split("\n")
                const own = list.filter(e => byId.get(e[0])!.lane === fl && byId.get(e[1])!.lane === tl)
                const who = countBy(own, e => byId.get(e[0])!.name).slice(0, 3)
                return t("reports.anatomy.mostGo", { labelOf: inProse(labelOf(a.profile, fl)), labelOf2: inProse(labelOf(a.profile, tl)), k: n(k), classes: t("common.count.class", { count: new Set(own.map(e => e[0])).size }), value: who[0][1] > 1 ? t("reports.anatomy.makesMost", { value: code(who[0][0]), value2: n(who[0][1]) }) : "" })
            }
            const chain = order.map(id => inProse(labelOf(a.profile, id))).join(" → ")
            const parts = [
                t("reports.anatomy.codeMeantRunOne", { profileLabel: a.profile.label, chain }),
                "",
                t("reports.anatomy.oneStepDownExpected", { referencesGo: t("common.count.referenceGoes", { count: down.length }), value: shapes >= 0 ? t("reports.anatomy.orIntoThe", { labelOf: inProse(labelOf(a.profile, order[shapes])) }) : "" }),
                skip.length ? t("reports.anatomy.skipLayer", { skipLength: b(n(skip.length)), skip: pairText(skip) }) : t("reports.anatomy.noneSkipLayer"),
                back.length ? t("reports.anatomy.runBackUpAgainst", { backLength: b(n(back.length)), back: pairText(back) }) : t("reports.anatomy.noneRunBackUp"),
            ]
            return { text: parts.join("\n"), values: { "one step down": down.length, "skip a layer": skip.length, "back up": back.length } }
        },
    },
    {
        id: "role",
        label: t("reports.anatomy.oneRole"),
        describe: t("reports.anatomy.oneFrameworkSRoles"),
        async run(ctx, p) {
            const a = await anatomy(ctx, p.profile, p.language)
            if (!a) return noAnatomy
            const lane = p.lane
            const us = inLane(a, lane)
            const label = labelOf(a.profile, lane)
            if (!us.length) return absent(t("reports.anatomy.codeHasNo", { profileLabel: a.profile.label, label: inProse(label) }))
            const ids = new Set(us.map(u => u.id))
            const byId = new Map(a.units.map(u => [u.id, u]))
            const where = countBy(us, u => u.component || t("reports.anatomy.noComponent"))
            const outTo = countBy(a.edges.filter(e => ids.has(e[0]) && !ids.has(e[1])), e => byId.get(e[1])!.lane).filter(([l]) => l !== UNCLASSIFIED)
            const inFrom = countBy(a.edges.filter(e => ids.has(e[1]) && !ids.has(e[0])), e => byId.get(e[0])!.lane).filter(([l]) => l !== UNCLASSIFIED)
            const reach = [...us].sort((x, y) => y.fanOut - x.fanOut || x.name.localeCompare(y.name)).filter(u => u.fanOut > 0).slice(0, 3)
            const used = [...us].sort((x, y) => y.fanIn - x.fanIn || x.name.localeCompare(y.name)).filter(u => u.fanIn > 0).slice(0, 3)
            const unused = us.filter(u => u.fanIn === 0).length
            const noun = inProse(label)
            const lines = [
                t("reports.anatomy.there", { are: t("common.noun.is", { count: us.length }), countRole: b(countRole(us.length, a.profile, lane)), aside: aside(a.profile, lane), components: t("common.count.component", { count: where.length }), value: where.length === 1 ? t("reports.anatomy.in2", { theyAllLive: t("common.noun.itLives", { count: us.length }), value: code(where[0][0]) }) : t("reports.anatomy.mostLive", { slice: places(where.slice(0, 3)) }) }),
            ]
            const items: string[] = []
            if (!a.linked) lines.push(t("reports.anatomy.scanDoesNotRecord2"))
            else {
                items.push(outTo.length ? t("reports.anatomy.theyUse", { roles: listOf(outTo.slice(0, 4).map(([l, k]) => `${inProse(labelOf(a.profile, l))} (${t("common.count.time", { count: k })})`)) }) : t("reports.anatomy.theyUseNoOtherRole"))
                items.push(inFrom.length ? t("reports.anatomy.theyUsed", { value: listOf(inFrom.slice(0, 4).map(([l, k]) => `${inProse(labelOf(a.profile, l))} (${n(k)})`)) }) : t("reports.anatomy.noClassAnotherRole"))
            }
            if (reach.length) items.push(t("reports.anatomy.usesMostOtherClasses2", { name: code(reach[0].name), fanOut: n(reach[0].fanOut), value: reach.length > 1 ? t("reports.anatomy.then", { value: listOf(reach.slice(1).map(u => `${code(u.name)} (${n(u.fanOut)})`)) }) : "" }))
            if (used.length) items.push(t("reports.anatomy.mostUsed2", { name: code(used[0].name), class: t("common.count.class", { count: used[0].fanIn }), value: used.length > 1 ? t("reports.anatomy.then", { value: listOf(used.slice(1).map(u => `${code(u.name)} (${n(u.fanIn)})`)) }) : "" }))
            if (a.linked && unused && unused < us.length) items.push(t("reports.anatomy.usedNothingCode", { unused: n(unused), noun, value: unused === 1 ? t("reports.anatomy.is") : t("reports.anatomy.are") }))
            const text = [lines.join(" "), items.length ? items.map(t => `- ${t}`).join("\n") : ""].filter(Boolean)
            return { text: text.join("\n\n"), values: { [label]: us.length, components: where.length, "referenced by nothing": unused } }
        },
    },
]
