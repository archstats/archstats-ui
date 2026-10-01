// What ships: the deployables the scan found (services, apps, images,
// libraries), what builds them, which code each holds, and the pipelines
// that build and deploy them. With a name: what ships that component or
// deployable.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num, plural, sq } from "~/features/exhibits/words"
import { t } from "~/shared/i18n"

export interface DeployablesData {
    of: string | null
    /** The component `of` named, when it named one: then the rows are what ships it. */
    component: string | null
    rows: Array<{ name: string; kind: string; runtime: string; builtBy: string; components: number | null; pipelines: string[] }>
    pipelines: Array<{ name: string; system: string; deployables: number }>
}

export const deployables = exhibit<DeployablesData>()({
    kind: "deployables", v: 1,
    summary: t("deployables.exhibitsDeployables.whatShipsCodeDeployables"),
    params: s.object({
        of: s.string().optional().describe(t("deployables.exhibitsDeployables.deployableComponentWhatShips")),
    }, { aliases: { component: "of", name: "of" } }),

    title: (p, d) => ((d?.component ?? d?.of) ? t("deployables.exhibitsDeployables.whatShips", { value: d.component ?? d.of }) : t("deployables.exhibitsDeployables.whatShips2")),

    async resolve(p, { snap }): Promise<DeployablesData | Absent> {
        if (!("deployables" in snap.columns)) return { absent: t("deployables.exhibitsDeployables.snapshotWasReadAnalysis", { value: snap.info.analysis_revision || t("deployables.exhibitsDeployables.olderThan9") }) }
        const all = await snap.query<any>(`SELECT id, name, kind, runtime, built_by, components FROM deployables ORDER BY name`)
        const pipes = "pipelines" in snap.columns ? await snap.query<any>(`SELECT name, system, deployables FROM pipelines ORDER BY name`) : []
        const links = "pipeline_deployables" in snap.columns ? await snap.query<{ pipeline: string; deployable: string }>(`SELECT pipeline, deployable FROM pipeline_deployables`) : []
        if (!all.length && !pipes.length) return { absent: t("deployables.exhibitsDeployables.scanFoundNothingShips") }
        let rows = all
        let component: string | null = null
        let of: string | null = null
        if (p.of) {
            const byName = candidates(all.map(r => String(r.name)), p.of)[0]
            if (byName) { of = byName; rows = all.filter(r => r.name === byName) }
            else if ("deployable_components" in snap.columns) {
                component = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
                if (!component) return { absent: t("deployables.exhibitsDeployables.noDeployableComponentMatches", { of: p.of }) }
                const holders = new Set((await snap.query<{ deployable: string }>(`SELECT DISTINCT deployable FROM deployable_components WHERE component = ${sq(component)}`)).map(r => String(r.deployable)))
                rows = all.filter(r => holders.has(String(r.id)) || holders.has(String(r.name)))
                if (!rows.length) return { absent: t("deployables.exhibitsDeployables.noDeployableHoldsScan", { component }) }
            } else return { absent: t("deployables.exhibitsDeployables.noDeployableMatches", { of: p.of }) }
        }
        const pipelinesOf = (r: any) => links.filter(l => l.deployable === r.id || l.deployable === r.name).map(l => String(l.pipeline))
        return {
            of, component,
            rows: rows.slice(0, 40).map(r => ({ name: String(r.name), kind: String(r.kind ?? ""), runtime: String(r.runtime ?? ""), builtBy: String(r.built_by ?? ""), components: num(r.components), pipelines: pipelinesOf(r) })),
            pipelines: pipes.slice(0, 20).map(x => ({ name: String(x.name), system: String(x.system ?? ""), deployables: Number(x.deployables) || 0 })),
        }
    },

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: t("deployables.exhibitsDeployables.wereFound", { deployables: t("common.count.deployable", { count: d.rows.length }), value: d.component ? t("deployables.exhibitsDeployables.hold", { component: d.component }) : "", pipelines: t("common.count.pipeline", { count: d.pipelines.length }) }), entities: d.component ? [d.component] : [], values: { deployables: d.rows.length, pipelines: d.pipelines.length } }]
        for (const r of d.rows.slice(0, 15)) out.push({ kind: "row", text: `${r.name}: ${r.kind || "deployable"}${r.runtime ? t("deployables.exhibitsDeployables.on", { runtime: r.runtime }) : ""}${r.builtBy ? t("deployables.exhibitsDeployables.built", { builtBy: r.builtBy }) : ""}${r.components !== null ? t("deployables.exhibitsDeployables.holding", { t: t("common.count.component", { count: r.components }) }) : ""}${r.pipelines.length ? `; pipelines ${r.pipelines.join(", ")}` : ""}.`, entities: [r.name], values: r.components !== null ? { components: r.components } : {}, element: `row:${r.name}` })
        for (const x of d.pipelines.slice(0, 6)) out.push({ kind: "row", text: t("deployables.exhibitsDeployables.pipeline", { name: x.name, value: x.system ? ` (${x.system})` : "", value2: x.deployables ? t("deployables.exhibitsDeployables.handles", { t: t("common.count.deployable", { count: x.deployables }) }) : "" }), entities: [x.name], values: { deployables: x.deployables } })
        return out
    },

    elements: d => d.rows.map(r => ({ id: `row:${r.name}`, label: r.name })),

    table: d => ({
        columns: [{ id: "name", label: t("deployables.exhibitsDeployables.deployable") }, { id: "kind", label: t("deployables.exhibitsDeployables.kind") }, { id: "runtime", label: t("deployables.exhibitsDeployables.runtime") }, { id: "builtBy", label: t("deployables.exhibitsDeployables.built2") }, { id: "components", label: t("deployables.exhibitsDeployables.components"), numeric: true }, { id: "pipelines", label: t("deployables.exhibitsDeployables.pipelines") }],
        rows: d.rows.map(r => ({ ...r, pipelines: r.pipelines.join(", ") })),
    }),

    open: () => ({ route: "/views/deployables", label: t("deployables.exhibitsDeployables.openDeployables") }),
})
