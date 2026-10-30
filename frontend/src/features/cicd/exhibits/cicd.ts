// How the workspace builds and ships: what it builds (images, apps,
// functions), which pipelines build and deploy each, and where to. With a
// name: what carries that component, or that one artifact. A second exhibit
// lists the hygiene flags by rule.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface CicdData {
    of: string | null
    component: string | null
    rows: Array<{ name: string; kind: string; base: string; runtime: string; builtBy: string[]; deployedTo: string[]; components: number | null }>
    pipelines: Array<{ name: string; system: string; read: string; jobs: number }>
}

const readCicd = async (p: { of?: string }, snap: any): Promise<CicdData | Absent> => {
    if (!("artifacts" in snap.columns) || !("pipeline_jobs" in snap.columns)) return { absent: t("cicd.exhibits.oldSnapshot", { value: snap.info.analysis_revision || "?" }) }
    const all = await snap.query(`SELECT id, name, kind, base, runtime, components FROM artifacts ORDER BY name`) as any[]
    const pipes = await snap.query(`SELECT id, name, system, read, jobs FROM pipelines WHERE kind IN ('workflow', 'pipeline', 'gitops') ORDER BY name`) as any[]
    const outs = await snap.query(`SELECT pipeline, kind, artifact, environment FROM pipeline_outputs WHERE artifact <> ''`) as Array<{ pipeline: string; kind: string; artifact: string; environment: string }>
    if (!all.length && !pipes.length) return { absent: t("cicd.exhibits.nothing") }
    const names = new Map<string, string>()
    for (const x of await snap.query(`SELECT id, name FROM pipelines`) as any[]) names.set(String(x.id), String(x.name))
    let rows = all
    let component: string | null = null
    let of: string | null = null
    if (p.of) {
        const byName = candidates(all.map(r => String(r.name)), p.of)[0]
        if (byName) { of = byName; rows = all.filter(r => r.name === byName) }
        else {
            component = candidates(snap.components().map((c: any) => String(c.name)), p.of)[0] ?? null
            if (!component) return { absent: t("cicd.exhibits.noMatch", { of: p.of }) }
            const holders = new Set((await snap.query(`SELECT DISTINCT artifact FROM artifact_components WHERE component = ${sq(component)}`) as any[]).map(r => String(r.artifact)))
            rows = all.filter(r => holders.has(String(r.id)))
            if (!rows.length) return { absent: t("cicd.exhibits.noHolder", { component }) }
        }
    }
    const of_ = (id: string, deploy: boolean) => [...new Set(outs.filter(o => o.artifact === id && (o.kind === "deploy") === deploy).map(o => (deploy ? o.environment || names.get(o.pipeline) : names.get(o.pipeline)) ?? o.pipeline))].sort()
    return {
        of, component,
        rows: rows.slice(0, 40).map(r => ({ name: String(r.name), kind: String(r.kind ?? ""), base: String(r.base ?? ""), runtime: String(r.runtime ?? ""), builtBy: of_(String(r.id), false), deployedTo: of_(String(r.id), true), components: r.components == null ? null : Number(r.components) })),
        pipelines: pipes.slice(0, 30).map(x => ({ name: String(x.name), system: String(x.system ?? ""), read: String(x.read ?? ""), jobs: Number(x.jobs) || 0 })),
    }
}

const definition = (kind: "cicd" | "deployables") => exhibit<CicdData>()({
    kind, v: kind === "deployables" ? 2 : 1,
    summary: t("cicd.exhibits.summary"),
    params: s.object({
        of: s.string().optional().describe(t("cicd.exhibits.ofParam")),
    }, { aliases: { component: "of", name: "of" } }),

    title: (p, d) => ((d?.component ?? d?.of) ? t("cicd.exhibits.titleOf", { value: d.component ?? d.of }) : t("cicd.exhibits.title")),

    resolve: (p, { snap }) => readCicd(p, snap),

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: t("cicd.exhibits.total", { artifacts: d.rows.length, pipelines: d.pipelines.length }), entities: d.component ? [d.component] : [], values: { artifacts: d.rows.length, pipelines: d.pipelines.length } }]
        for (const r of d.rows.slice(0, 15)) {
            out.push({
                kind: "row",
                text: t("cicd.exhibits.row", { name: r.name, kind: r.kind, built: r.builtBy.join(", ") || t("cicd.inspector.nothingBuilds"), deployed: r.deployedTo.join(", ") || "—" }),
                entities: [r.name], values: r.components !== null ? { components: r.components } : {}, element: `row:${r.name}`,
            })
        }
        for (const x of d.pipelines.filter(x => x.read !== "full").slice(0, 6)) out.push({ kind: "row", text: t("cicd.exhibits.partial", { name: x.name }), entities: [x.name], values: {} })
        return out
    },

    elements: d => d.rows.map(r => ({ id: `row:${r.name}`, label: r.name })),

    table: d => ({
        columns: [
            { id: "name", label: t("cicd.images.artifact") }, { id: "kind", label: t("cicd.images.kind") }, { id: "base", label: t("cicd.images.base") },
            { id: "runtime", label: t("cicd.images.runtime") }, { id: "builtBy", label: t("cicd.images.builtBy") }, { id: "deployedTo", label: t("cicd.images.environments") },
            { id: "components", label: t("cicd.exhibits.components"), numeric: true },
        ],
        rows: d.rows.map(r => ({ ...r, builtBy: r.builtBy.join(", "), deployedTo: r.deployedTo.join(", ") })),
    }),

    open: () => ({ route: "/views/cicd", label: t("cicd.exhibits.open") }),
})

export const cicd = definition("cicd")
/** Reports written before revision 16 name the old kind; it reads the new tables. */
export const deployables = definition("deployables")

export interface CicdFlagsData { rules: Array<{ rule: string; count: number; files: number; examples: string[] }> }

export const cicdFlags = exhibit<CicdFlagsData>()({
    kind: "cicd-flags", v: 1,
    summary: t("cicd.exhibits.flagsSummary"),
    params: s.object({}),
    title: () => t("cicd.exhibits.flagsTitle"),
    async resolve(_p, { snap }): Promise<CicdFlagsData | Absent> {
        if (!("cicd_flags" in snap.columns)) return { absent: t("cicd.exhibits.oldSnapshot", { value: snap.info.analysis_revision || "?" }) }
        const rows = await snap.query(`SELECT rule, count(*) AS n, count(DISTINCT file) AS files, group_concat(file || ':' || line, ', ') AS at FROM cicd_flags GROUP BY rule ORDER BY n DESC`) as any[]
        if (!rows.length) return { absent: t("cicd.flags.none") }
        return { rules: rows.map(r => ({ rule: String(r.rule), count: Number(r.n), files: Number(r.files), examples: String(r.at ?? "").split(", ").slice(0, 3) })) }
    },
    facts: d => d.rules.map(r => ({ kind: "row", text: `${t(`cicd.flags.rules.${r.rule}.fact`)}: ${t("cicd.flags.count", { count: r.count, files: r.files })}.`, entities: [], values: { count: r.count } })),
    elements: d => d.rules.map(r => ({ id: `rule:${r.rule}`, label: r.rule })),
    table: d => ({
        columns: [{ id: "fact", label: t("cicd.exhibits.flagFact") }, { id: "count", label: t("cicd.exhibits.flagCount"), numeric: true }, { id: "files", label: t("cicd.exhibits.flagFiles"), numeric: true }, { id: "at", label: t("cicd.exhibits.flagAt") }],
        rows: d.rules.map(r => ({ fact: t(`cicd.flags.rules.${r.rule}.fact`), count: r.count, files: r.files, at: r.examples.join(", ") })),
    }),
    open: () => ({ route: "/views/cicd", label: t("cicd.exhibits.open") }),
})
