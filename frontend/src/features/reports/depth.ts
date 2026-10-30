// Depth: what the shared readings say after their first paragraph, and the
// close look at one component. A reading's first paragraph gives the
// headline numbers; these add how they are spread, how they compare with the
// period before, and which code they are about, by name. The same rule holds
// as for every reading: they count and name, and leave the verdict to the
// writer.

import { canonicalAuthorSql, NOT_BOT_SQL } from "~/features/git/authors"
import { proseName, proseNames, type ReadingOutput } from "./reportDoc"
import { listOf, prodComponents, prodFile, probe, type ReadingContext, type ReadingDef, type SnapshotFacts } from "./readings"
import { intlLocale, ordinal, t } from "~/shared/i18n"

const n = (v: number) => Math.round(v).toLocaleString(intlLocale)
const dec = (v: number) => v.toLocaleString(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num = (v: unknown) => Number(v) || 0
const pct = (part: number, whole: number) => {
    if (!whole) return "0%"
    const p = (100 * part) / whole
    return p > 0 && p < 1 ? t("reports.depth.under1") : `${Math.round(p)}%`
}
const code = (s: string) => `\`${proseName(s).replace(/`/g, "'")}\``
const codes = (names: string[]) => proseNames(names).map(s => `\`${s.replace(/`/g, "'")}\``)
const b = (s: string) => `**${s}**`
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const inList = (names: string[]) => `(${names.map(lit).join(", ")})`
const lines = (v: number) => t("common.count.line", { count: Math.round(v) })
/** A span of days as a reader says it: days, then months, then years. */
const span = (days: number) => (days >= 730 ? t("reports.readings.years", { value: (days / 365.25).toFixed(1) }) : days >= 60 ? t("reports.readings.months", { value: Math.round(days / 30.4) }) : t("common.count.day", { count: days }))
/** When the code last changed, counted back from the newest commit in the scan. */
const lastChange = (age: unknown) => (age === undefined || age === null ? "" : num(age) === 0 ? t("reports.depth.lastChangeNewest") : t("reports.depth.lastChange", { days: span(num(age)) }))
/** Paragraphs as Markdown; the empty ones left out. */
export const paras = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join("\n\n")
/** Health reads 0 as no reading on snapshots before analysis revision 2. */
const healthCol = (revision: number, alias = "") => (revision < 2 ? `NULLIF(${alias}codesmells__code_health, 0)` : `${alias}codesmells__code_health`)
/** Components a test reaches: one sits inside it or imports it. */
const REACHED = `(SELECT component FROM files WHERE role = 'test' AND component IS NOT NULL UNION SELECT d."to" FROM component_connections_direct d JOIN files t ON t.name = d.file WHERE t.role = 'test')`

// ── After the first paragraph ─────────────────────────────────────────────

/** The ten largest components' share, the largest one and the largest file. */
export async function sizeMore(ctx: ReadingContext, f: SnapshotFacts): Promise<string> {
    const rows = await ctx.query(`SELECT component AS name, sum(coalesce(complexity__lines, 0)) AS l, count(*) AS files FROM files WHERE ${prodFile(f)} AND coalesce(component, '') <> '' GROUP BY 1 ORDER BY 2 DESC, 1`)
    const [file] = await ctx.query(`SELECT name, complexity__lines AS l FROM files WHERE ${prodFile(f)} ORDER BY l DESC, name LIMIT 1`)
    if (!rows.length || !file) return ""
    const top = rows[0]
    const largest = t("reports.depth.sizeLargest", { name: code(String(top.name)), lines: b(lines(num(top.l))), files: t("common.count.file", { count: num(top.files) }), file: code(String(file.name)), fileLines: lines(num(file.l)) })
    if (rows.length <= 10) return largest
    const ten = rows.slice(0, 10).reduce((s, r) => s + num(r.l), 0)
    return `${t("reports.depth.sizeTen", { share: b(pct(ten, f.production.lines)) })} ${largest}`
}

/** Commits and people in the last twelve months against the twelve before, and the busiest year. */
export async function historyMore(ctx: ReadingContext, f: SnapshotFacts): Promise<string> {
    if (!f.tables.has("git_commits")) return ""
    const c = `SELECT commit_hash, min(commit_time) AS t, min(${canonicalAuthorSql(ctx.aliases)}) AS a FROM git_commits WHERE ${NOT_BOT_SQL} GROUP BY commit_hash`
    const [r] = await ctx.query(`WITH c AS (${c}), e AS (SELECT max(julianday(t)) AS j FROM c) SELECT sum(julianday(t) > j - 365) AS y1, count(DISTINCT CASE WHEN julianday(t) > j - 365 THEN a END) AS p1, sum(julianday(t) <= j - 365 AND julianday(t) > j - 730) AS y2, count(DISTINCT CASE WHEN julianday(t) <= j - 365 AND julianday(t) > j - 730 THEN a END) AS p2, count(DISTINCT a) AS people FROM c, e`)
    const [busy] = await ctx.query(`WITH c AS (${c}) SELECT substr(t, 1, 4) AS y, count(*) AS k FROM c GROUP BY 1 ORDER BY 2 DESC, 1 DESC LIMIT 1`)
    if (!r || !num(r.people)) return ""
    const by = (commits: number, people: number) => (commits ? t("reports.depth.commitsBy", { commits: t("common.count.commit", { count: commits }), people: t("common.count.person", { count: people }) }) : t("reports.depth.noCommits"))
    return t("reports.depth.historyYears", {
        last: b(by(num(r.y1), num(r.p1))),
        before: by(num(r.y2), num(r.p2)),
        year: String(busy?.y ?? ""),
        busy: t("common.count.commit", { count: num(busy?.k) }),
        active: n(num(r.p1)),
        people: n(num(r.people)),
    })
}

/** The largest tangle's biggest members and what holds it together; the components at the graph's edges. */
export async function structureMore(ctx: ReadingContext, f: SnapshotFacts, groupOf: Map<string, string>, edges: Array<[string, string]>): Promise<string> {
    const out: string[] = []
    const sizes = new Map<string, number>()
    for (const g of groupOf.values()) sizes.set(g, (sizes.get(g) ?? 0) + 1)
    const big = [...sizes].sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))[0]
    if (big) {
        const members = [...groupOf].filter(([, g]) => g === big[0]).map(([c]) => c)
        const rows = await ctx.query(`SELECT name, coalesce(complexity__lines, 0) AS l FROM components WHERE name IN ${inList(members)} ORDER BY l DESC, name`)
        const [all] = await ctx.query(`SELECT sum(coalesce(complexity__lines, 0)) AS l FROM components`)
        const [e] = await ctx.query(`SELECT count(*) AS refs, count(DISTINCT "from" || ' > ' || "to") AS pairs FROM component_connections_direct WHERE "from" <> "to" AND "from" IN ${inList(members)} AND "to" IN ${inList(members)}`)
        const inside = rows.reduce((s, r) => s + num(r.l), 0)
        const top = rows.slice(0, 3)
        out.push(t("reports.depth.tangleLargest", {
            share: b(pct(inside, num(all?.l))),
            names: listOf(codes(top.map(r => String(r.name))).map((c, i) => `${c} (${lines(num(top[i].l))})`)),
            imports: b(t("common.count.time", { count: num(e?.refs) })),
            pairs: n(num(e?.pairs)),
        }))
    }
    if (f.components > 1) {
        const from = new Set(edges.map(([a]) => a)), to = new Set(edges.map(([, z]) => z))
        const names = (await ctx.query(`SELECT name FROM components WHERE ${prodComponents(f)}`)).map(r => String(r.name))
        const top = names.filter(c => !to.has(c)).length, bottom = names.filter(c => !from.has(c)).length
        out.push([top ? t("reports.depth.graphTop", { count: top }) : "", bottom ? t("reports.depth.graphBottom", { count: bottom }) : ""].filter(Boolean).join(" "))
    }
    return paras(...out)
}

/** How the scores are spread, whether the top ones still change, and the top file's numbers. */
export async function hotspotsMore(ctx: ReadingContext, f: SnapshotFacts, grain: "components" | "files", top: string[]): Promise<string> {
    const where = grain === "files" ? prodFile(f) : prodComponents(f)
    const cols = grain === "files" ? f.fileColumns : f.componentColumns
    const [r] = await ctx.query(`SELECT count(*) AS total, sum(codesmells__hotspot_score >= 50) AS high, sum(codesmells__hotspot_score >= 20 AND codesmells__hotspot_score < 50) AS mid FROM ${grain} WHERE ${where}`)
    const out: string[] = []
    const all = grain === "files" ? t("common.count.file", { count: num(r?.total) }) : t("common.count.component", { count: num(r?.total) })
    out.push(t("reports.depth.hotspotSpread", { all, high: b(n(num(r?.high))), mid: n(num(r?.mid)), low: n(num(r?.total) - num(r?.high) - num(r?.mid)) }))
    if (cols.has("git__commits__last_90_days")) {
        const [c] = await ctx.query(`SELECT count(*) AS k FROM ${grain} WHERE name IN ${inList(top)} AND coalesce(git__commits__last_90_days, 0) > 0`)
        const k = num(c?.k)
        out.push(`${k === top.length ? t("reports.depth.hotspotAllRecent", { top: n(top.length) }) : k ? t("reports.depth.hotspotRecent", { k: n(k), top: n(top.length) }) : t("reports.depth.hotspotQuiet", { top: n(top.length) })}`)
    }
    if (grain === "files" && top[0]) {
        const h = f.fileColumns.has("codesmells__code_health") ? `, ${healthCol(ctx.revision)} AS h` : ""
        const age = f.fileColumns.has("git__last_change_age_in_days") ? ", git__last_change_age_in_days AS age" : ""
        const [x] = await ctx.query(`SELECT complexity__lines AS l, git__commits__total AS c, git__authors__total AS p${h}${age} FROM files WHERE name = ${lit(top[0])}`)
        if (x) out.push([
            t("reports.depth.hotspotFile", { name: code(top[0]), lines: lines(num(x.l)), health: x.h !== undefined && x.h !== null ? t("reports.depth.andHealth", { h: dec(num(x.h)) }) : "" }),
            t("reports.depth.changedBy", { commits: t("common.count.commit", { count: num(x.c) }), people: t("common.count.person", { count: num(x.p) }) }),
            lastChange(x.age),
        ].filter(Boolean).join(" "))
    }
    return paras(...out)
}

/** The code by health band, and what the files below 4 have in common. */
export async function healthMore(ctx: ReadingContext, f: SnapshotFacts): Promise<string> {
    const h = healthCol(ctx.revision)
    const where = prodFile(f)
    const [r] = await ctx.query(`SELECT sum(CASE WHEN ${h} >= 8 THEN complexity__lines ELSE 0 END) AS good, sum(CASE WHEN ${h} >= 4 AND ${h} < 8 THEN complexity__lines ELSE 0 END) AS mid, sum(CASE WHEN ${h} < 4 THEN complexity__lines ELSE 0 END) AS low, sum(CASE WHEN ${h} IS NOT NULL THEN complexity__lines END) AS rated, avg(CASE WHEN ${h} < 4 THEN complexity__lines END) AS lowAvg, avg(CASE WHEN ${h} >= 4 THEN complexity__lines END) AS restAvg FROM files WHERE ${where}`)
    const rated = num(r?.rated)
    if (!rated) return ""
    const out = [t("reports.depth.healthBands", { good: b(pct(num(r.good), rated)), mid: pct(num(r.mid), rated), low: pct(num(r.low), rated) })]
    if (num(r.low)) {
        const [w] = await ctx.query(`SELECT name, complexity__lines AS l, ${h} AS h FROM files WHERE ${where} AND ${h} < 4 ORDER BY l DESC, name LIMIT 1`)
        out.push(t("reports.depth.healthLow", { low: n(num(r.lowAvg)), rest: n(num(r.restAvg)), name: code(String(w?.name ?? "")), lines: lines(num(w?.l)), h: dec(num(w?.h)) }))
    }
    return paras(...out)
}

/** Production against tests, the period before, and the one file that changed most. */
export async function churnMore(ctx: ReadingContext, f: SnapshotFacts, d: string, total: number): Promise<string> {
    const lc = (days: string, a = "") => `coalesce(${a}git__additions__last_${days}_days, 0) + coalesce(${a}git__deletions__last_${days}_days, 0)`
    const out: string[] = []
    let split = ""
    if (f.fileColumns.has("role") && f.fileColumns.has(`git__additions__last_${d}_days`)) {
        const rows = await ctx.query(`SELECT role, sum(${lc(d)}) AS l FROM files GROUP BY 1`)
        const of = (role: string) => num(rows.find(x => x.role === role)?.l)
        const all = rows.reduce((s, x) => s + num(x.l), 0)
        if (all) split = (t("reports.depth.churnRoles", { all: b(lines(all)), prod: pct(of("production"), all), test: pct(of("test"), all), other: pct(all - of("production") - of("test"), all) }))
    }
    // The window before, from the component totals: 90 days against the 90 before; 30 against the 60 before, per 30 days.
    const wider = d === "90" ? "180" : d === "30" ? "90" : ""
    if (wider && f.componentColumns.has(`git__additions__last_${wider}_days`)) {
        const [r] = await ctx.query(`SELECT sum(${lc(wider)}) AS l FROM components`)
        const before = num(r?.l) - total
        if (before >= 0) out.push(d === "90" ? t("reports.depth.churnBefore90", { lines: b(lines(before)) }) : t("reports.depth.churnBefore30", { lines: b(lines(before / 2)) }))
    }
    if (f.fileColumns.has(`git__additions__last_${d}_days`)) {
        const [x] = await ctx.query(`SELECT name, ${lc(d)} AS l FROM files WHERE ${prodFile(f)} AND coalesce(component, '') <> '' ORDER BY l DESC, name LIMIT 1`)
        if (x && num(x.l)) out.push(t("reports.depth.churnTopFile", { name: code(String(x.name)), lines: t("reports.depth.changedLines", { count: num(x.l) }) }))
    }
    return paras(out.join(" "), split)
}

/** The components one person wrote nearly alone, and whether the people behind them still commit. */
export async function knowledgeMore(ctx: ReadingContext, kept: any[]): Promise<string> {
    const out: string[] = []
    const alone = kept.filter(r => num(r.mainShare) >= 0.8).sort((a, z) => num(z.added) - num(a.added)).slice(0, 3)
    if (alone.length) {
        const names = codes(alone.map(r => String(r.component)))
        out.push(`${t("reports.depth.knowledgeAlone")}\n\n${alone.map((r, i) => `- ${t("reports.depth.knowledgeItem", { name: names[i], person: String(r.main), share: pct(num(r.mainShare), 1), lines: t("reports.depth.addedLines", { count: num(r.added) }) })}`).join("\n")}`)
    }
    const half = kept.filter(r => num(r.cover50) === 1)
    if (half.length) {
        const last = await ctx.query(`SELECT ${canonicalAuthorSql(ctx.aliases)} AS a, max(julianday(commit_time)) AS j FROM git_commits GROUP BY 1`)
        const newest = Math.max(0, ...last.map(r => num(r.j)))
        const lastOf = new Map(last.map(r => [String(r.a), num(r.j)]))
        const gone = half.filter(r => (lastOf.get(String(r.main)) ?? 0) < newest - 180).length
        out.push(gone === half.length
            ? t("reports.depth.knowledgeAllGone", { half: t("common.count.component", { count: half.length }) })
            : gone
            ? t("reports.depth.knowledgeGone", { gone: b(n(gone)), half: t("common.count.component", { count: half.length }) })
            : t("reports.depth.knowledgeActive"))
    }
    return paras(...out)
}

/** How many components carry wide use, and the most depended-on one's own numbers. */
export async function couplingMore(ctx: ReadingContext, f: SnapshotFacts, ext: string, top: string): Promise<string> {
    const [w] = await ctx.query(`SELECT count(*) AS k, sum(CASE WHEN modularity__coupling__dependents >= 10 THEN coalesce(complexity__lines, 0) ELSE 0 END) AS l, sum(coalesce(complexity__lines, 0)) AS lt, sum(modularity__coupling__dependents >= 10) AS wide FROM components WHERE ${prodComponents(f)}${ext}`)
    const wide = num(w?.wide)
    const out = [wide ? t("reports.depth.couplingWide", { components: t("reports.depth.componentsAre", { count: wide }), share: pct(num(w.l), num(w.lt)) }) : t("reports.depth.couplingNoneWide")]
    const git = f.componentColumns.has("git__commits__last_180_days") ? ", git__commits__last_180_days AS c" : ""
    const [r] = await ctx.query(`SELECT modularity__coupling__dependencies AS e${git} FROM components WHERE name = ${lit(top)}`)
    if (r) {
        const tangle = await tangleSize(ctx, f, top)
        out.push(`${t("reports.depth.couplingTop", { name: code(top), deps: t("common.count.otherComponent", { count: num(r.e) }) })}${r.c !== undefined ? ` ${num(r.c) ? t("reports.depth.changedIn180", { commits: t("common.count.commit", { count: num(r.c) }) }) : t("reports.depth.notChanged180")}` : ""}${tangle > 1 ? ` ${t("reports.depth.inTangle", { components: t("common.count.component", { count: tangle }) })}` : ""}`)
    }
    return out.join(" ")
}

/** The share and the largest of the components no test reaches. */
export async function testsMore(ctx: ReadingContext, f: SnapshotFacts, untested: number, total: number): Promise<string> {
    if (!untested || untested >= total) return ""
    const rows = await ctx.query(`SELECT component AS name, sum(coalesce(complexity__lines, 0)) AS l FROM files WHERE role = 'production' AND coalesce(component, '') <> '' AND component NOT IN ${REACHED} GROUP BY 1 ORDER BY 2 DESC, 1`)
    const sum = rows.reduce((s, r) => s + num(r.l), 0)
    const top = rows.slice(0, 3)
    if (!top.length) return ""
    return t("reports.depth.testsUntested", { share: b(pct(sum, f.production.lines)), names: listOf(codes(top.map(r => String(r.name))).map((c, i) => `${c} (${lines(num(top[i].l))})`)) })
}

/** Where the oldest code sits, and where the newest. */
export async function ageMore(ctx: ReadingContext, f: SnapshotFacts): Promise<string> {
    const by = (cond: string) => ctx.query(`SELECT component AS name, sum(coalesce(complexity__lines, 0)) AS l FROM files WHERE ${prodFile(f)} AND coalesce(component, '') <> '' AND ${cond} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3`)
    const named = (rows: any[]) => listOf(codes(rows.map(r => String(r.name))).map((c, i) => `${c} (${lines(num(rows[i].l))})`))
    const old = await by("git__last_change_age_in_days > 730")
    const fresh = await by("git__last_change_age_in_days <= 90")
    return [
        old.length ? t("reports.depth.ageOld", { names: named(old) }) : t("reports.depth.ageNoneOld"),
        fresh.length ? t("reports.depth.ageFresh", { names: named(fresh) }) : "",
    ].filter(Boolean).join(" ")
}

/** Libraries used once against libraries used everywhere. */
export function librariesMore(outside: Array<{ files: number }>): string {
    const single = outside.filter(l => l.files === 1).length, wide = outside.filter(l => l.files >= 50).length
    return t("reports.depth.libsSpread", { single: t("reports.depth.libsSingle", { count: single }), wide: t("reports.depth.libsWide", { count: wide }) })
}

// ── One component, up close ───────────────────────────────────────────────

async function tangleSize(ctx: ReadingContext, f: SnapshotFacts, name: string): Promise<number> {
    if (!f.tables.has("component_strongly_connected_groups")) return 0
    const [r] = await ctx.query(`SELECT count(*) AS c FROM component_strongly_connected_groups WHERE "group" = (SELECT "group" FROM component_strongly_connected_groups WHERE component = ${lit(name)} LIMIT 1)`)
    return num(r?.c)
}

/**
 * A component described in five short paragraphs: what it is, the files that
 * make it up, what it is tied to, its history, and the tests that reach it.
 * Each is left out when the snapshot cannot fill it.
 */
export async function describeComponent(ctx: ReadingContext, f: SnapshotFacts, name: string, o: { named?: boolean; health?: boolean } = {}): Promise<ReadingOutput | null> {
    const has = (c: string) => f.componentColumns.has(c)
    const h = has("codesmells__code_health") ? `, ${healthCol(ctx.revision)} AS health` : ""
    const git = has("git__commits__last_180_days") ? ", git__commits__total AS commits, git__commits__last_180_days AS recent" : ""
    const age = has("git__last_change_age_in_days") ? ", git__last_change_age_in_days AS age" : ""
    const [r] = await ctx.query(`SELECT complexity__files AS files, complexity__lines AS lines, modularity__coupling__dependencies AS e${h}${git}${age} FROM components WHERE name = ${lit(name)}`)
    if (!r) return null
    const out: string[] = []

    // What it is.
    const [own] = await ctx.query(`SELECT sum(coalesce(complexity__lines, 0)) AS l FROM files WHERE component = ${lit(name)} AND ${prodFile(f)}`)
    const [mod] = f.fileColumns.has("module") ? await ctx.query(`SELECT module AS m FROM files WHERE component = ${lit(name)} AND coalesce(module, '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`) : [null]
    out.push([
        o.named ? t("reports.depth.itHas", { files: b(t("common.count.file", { count: num(r.files) })), lines: b(lines(num(r.lines))) }) : t("reports.readings.has", { name: code(name), files: b(t("common.count.file", { count: num(r.files) })), value: b(lines(num(r.lines))) }),
        num(own?.l) && f.production.lines ? t("reports.depth.shareOfCode", { share: pct(num(own.l), f.production.lines) }) : "",
        mod?.m ? t("reports.depth.inModule", { module: code(String(mod.m)) }) : "",
        o.health !== false && r.health !== undefined && r.health !== null ? t("reports.depth.health", { h: dec(num(r.health)) }) : "",
    ].filter(Boolean).join(" "))

    // The files that make it up.
    const fh = f.fileColumns.has("codesmells__code_health") ? `, ${healthCol(ctx.revision)} AS h` : ""
    const fc = f.fileColumns.has("git__commits__total") ? ", git__commits__total AS c" : ""
    const files = await ctx.query(`SELECT name, complexity__lines AS l${fh}${fc} FROM files WHERE component = ${lit(name)} AND ${prodFile(f)} ORDER BY l DESC, name LIMIT 3`)
    if (files.length > 1) {
        const fn = codes(files.map(x => String(x.name)))
        out.push(`${t("reports.depth.largestFiles")}\n\n${files.map((x, i) => `- ${fn[i]}: ${[lines(num(x.l)), x.h !== undefined && x.h !== null ? t("reports.depth.healthShort", { h: dec(num(x.h)) }) : "", x.c !== undefined ? t("reports.depth.changedIn", { commits: t("common.count.commit", { count: num(x.c) }) }) : ""].filter(Boolean).join(", ")}`).join("\n")}`)
    }

    // What it is tied to, counted like the report's dependents table: production components that import it.
    let dependents: number | null = null, tangle = 0
    if (f.tables.has("component_connections_direct")) {
        const users = await ctx.query(`SELECT "from" AS c, count(*) AS k FROM component_connections_direct WHERE "to" = ${lit(name)} AND "from" <> ${lit(name)} AND ${prodComponents(f, `"from"`)} GROUP BY 1 ORDER BY 2 DESC, 1`)
        tangle = await tangleSize(ctx, f, name)
        dependents = users.length
        // Shortened beside the component's own name, so a neighbour never reads as itself.
        const top = users.slice(0, 3), un = codes([name, ...top.map(u => String(u.c))]).slice(1)
        out.push([
            users.length ? t("reports.depth.importedBy", { count: users.length, n: b(n(users.length)) }) : t("reports.depth.notImported"),
            num(r.e) ? t("reports.depth.importsOthers", { count: num(r.e) }) : t("reports.depth.importsNone"),
            tangle > 1 ? t("reports.readings.sitsTangleSoCannot", { components: t("common.count.component", { count: tangle }) }).trim() : "",
            top.length ? t("reports.depth.mostUsers", { count: top.length, names: listOf(un.map((c, i) => `${c} (${t("common.count.import", { count: num(top[i].k) })})`)) }) : "",
        ].filter(Boolean).join(" "))
    }

    // Its history, bots left out.
    if (r.commits !== undefined && f.tables.has("git_commits")) {
        const people = await ctx.query(`SELECT ${canonicalAuthorSql(ctx.aliases)} AS a, count(DISTINCT commit_hash) AS k FROM git_commits WHERE component = ${lit(name)} AND ${NOT_BOT_SQL} GROUP BY 1 ORDER BY 2 DESC, 1`)
        const all = people.reduce((s, p) => s + num(p.k), 0)
        out.push([
            num(r.recent) ? t("reports.depth.history", { commits: b(t("common.count.commit", { count: num(r.commits) })), recent: n(num(r.recent)) }) : t("reports.depth.historyQuiet", { commits: b(t("common.count.commit", { count: num(r.commits) })) }),
            people.length ? t("reports.depth.people", { people: t("common.count.person", { count: people.length }), top: String(people[0].a), share: pct(num(people[0].k), all) }) : "",
            lastChange(r.age),
        ].filter(Boolean).join(" "))
    }

    // The tests that reach it.
    let tests: number | null = null
    if (f.fileColumns.has("role") && (f.roles.test?.files ?? 0) > 0) {
        const [x] = await ctx.query(`SELECT count(*) AS c FROM files WHERE role = 'test' AND (component = ${lit(name)} OR name IN (SELECT file FROM component_connections_direct WHERE "to" = ${lit(name)}))`)
        tests = num(x?.c)
        out.push(tests ? t("reports.depth.tests", { count: tests }) : t("reports.depth.noTests"))
    }

    return {
        text: paras(...out),
        values: { lines: num(r.lines), ...(dependents !== null ? { dependents } : {}), dependencies: num(r.e), "tangle size": tangle, ...(r.health !== undefined && r.health !== null ? { health: Math.round(num(r.health) * 10) / 10 } : {}), ...(r.recent !== undefined ? { "commits, last 180 days": num(r.recent) } : {}), ...(tests !== null ? { "test files": tests } : {}) },
    }
}

const BY = ["hotspot", "dependents", "health", "churn"] as const
type By = (typeof BY)[number]

/** The component ranked so by this measure, or why there is none. */
async function ranked(ctx: ReadingContext, f: SnapshotFacts, by: By, rank: number, p: Record<string, string>): Promise<{ name: string; value: number } | string> {
    const has = (c: string) => f.componentColumns.has(c)
    const ext = /^[a-z0-9]{1,6}$/.test(p.ext ?? "") ? ` AND name IN (SELECT component FROM files WHERE name LIKE '%.${p.ext}')` : ""
    const days = ["30", "90", "180"].includes(p.days) ? p.days : "90"
    const churn = `coalesce(git__additions__last_${days}_days, 0) + coalesce(git__deletions__last_${days}_days, 0)`
    const ask: Record<By, [string, string] | string> = {
        hotspot: has("codesmells__hotspot_score") && f.commits ? ["codesmells__hotspot_score", "codesmells__hotspot_score > 0 ORDER BY v DESC"] : t("reports.readings.hotspotScoresNeedGit"),
        dependents: has("modularity__coupling__dependents") ? ["modularity__coupling__dependents", "modularity__coupling__dependents > 0 ORDER BY v DESC"] : t("reports.readings.scanDidNotCount"),
        health: has("codesmells__code_health") ? [healthCol(ctx.revision), `${healthCol(ctx.revision)} IS NOT NULL AND complexity__lines >= 200 ORDER BY v ASC`] : t("reports.readings.scanHasNoCode"),
        churn: has(`git__additions__last_${days}_days`) && f.commits ? [churn, `${churn} > 0 ORDER BY v DESC`] : t("reports.readings.scanHasNoGit2"),
    }
    const q = ask[by]
    if (typeof q === "string") return q
    const [r] = await ctx.query(`SELECT name, ${q[0]} AS v FROM components WHERE ${prodComponents(f)}${ext} AND ${q[1]}, name LIMIT 1 OFFSET ${rank - 1}`)
    return r ? { name: String(r.name), value: num(r.v) } : t("reports.depth.noneRanked", { rank: n(rank) })
}

export const SPOTLIGHT: ReadingDef = {
    id: "spotlight",
    label: t("reports.depth.spotlight"),
    describe: t("reports.depth.spotlightDescribe"),
    params: [
        { id: "by", label: t("reports.depth.rankedBy"), choices: [{ value: "hotspot", label: t("reports.depth.byHotspot") }, { value: "dependents", label: t("reports.depth.byDependents") }, { value: "health", label: t("reports.depth.byHealth") }, { value: "churn", label: t("reports.depth.byChurn") }] },
        { id: "rank", label: t("reports.depth.rank"), choices: ["1", "2", "3", "4", "5"].map(v => ({ value: v, label: v })) },
    ],
    async run(ctx, p) {
        const f = await probe(ctx)
        const by: By = (BY as readonly string[]).includes(p.by) ? (p.by as By) : "hotspot"
        const rank = Math.min(5, Math.max(1, Math.round(Number(p.rank) || 1)))
        const hit = await ranked(ctx, f, by, rank, p)
        if (typeof hit === "string") return { text: hit, values: {}, absent: true }
        // A component an earlier close look in the report already described is named, not described again.
        const earlier = await Promise.all((p.shown ?? "").split(",").filter(Boolean).map(async s => {
            const [eb, er, arg] = s.split(":")
            if (!(BY as readonly string[]).includes(eb)) return null
            const e = await ranked(ctx, f, eb as By, Math.max(1, Number(er) || 1), eb === "churn" ? { days: arg } : { ext: arg ?? "" })
            return typeof e === "string" ? null : e.name
        }))
        const seen = earlier.includes(hit.name)
        const d = seen ? { text: t("reports.depth.seenAbove"), values: {} } : await describeComponent(ctx, f, hit.name, { named: true, health: by !== "health" })
        if (!d) return { text: t("reports.readings.notSnapshot", { name: code(hit.name) }), values: {}, absent: true }
        const first = rank === 1
        const days = ["30", "90", "180"].includes(p.days) ? p.days : "90"
        const v = { name: b(code(hit.name)), place: ordinal(rank) }
        const lead = {
            hotspot: () => (first ? t("reports.depth.leadHotspot", { ...v, value: n(hit.value) }) : t("reports.depth.leadHotspotN", { ...v, value: n(hit.value) })),
            dependents: () => (first ? t("reports.depth.leadDependents", { ...v, value: n(hit.value) }) : t("reports.depth.leadDependentsN", { ...v, value: n(hit.value) })),
            health: () => (first ? t("reports.depth.leadHealth", { ...v, value: dec(hit.value) }) : t("reports.depth.leadHealthN", { ...v, value: dec(hit.value) })),
            churn: () => (first ? t("reports.depth.leadChurn", { ...v, value: t("reports.depth.changedLines", { count: hit.value }), days }) : t("reports.depth.leadChurnN", { ...v, value: t("reports.depth.changedLines", { count: hit.value }), days })),
        }[by]()
        return { text: paras(lead, d.text), values: { [by]: by === "health" ? Math.round(hit.value * 10) / 10 : Math.round(hit.value), ...d.values } }
    },
}
