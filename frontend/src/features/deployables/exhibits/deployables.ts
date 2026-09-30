// What ships: the deployables the scan found (services, apps, images,
// libraries), what builds them, which code each holds, and the pipelines
// that build and deploy them. With a name: what ships that component or
// deployable.

import { candidates } from "~/features/snapshot/names"
import { exhibit, type Absent, type FactDraft } from "~/features/exhibits/types"
import { s } from "~/features/exhibits/schema"
import { n, num, plural, sq } from "~/features/exhibits/words"

export interface DeployablesData {
    of: string | null
    /** The component `of` named, when it named one: then the rows are what ships it. */
    component: string | null
    rows: Array<{ name: string; kind: string; runtime: string; builtBy: string; components: number | null; pipelines: string[] }>
    pipelines: Array<{ name: string; system: string; deployables: number }>
}

export const deployables = exhibit<DeployablesData>()({
    kind: "deployables", v: 1,
    summary: "What ships from this code: deployables, what builds them, the code they hold, and the pipelines around them.",
    params: s.object({
        of: s.string().optional().describe("A deployable or a component: what ships it. Everything when left out."),
    }, { aliases: { component: "of", name: "of" } }),

    title: (p, d) => ((d?.component ?? d?.of) ? `What ships ${d.component ?? d.of}` : "What ships"),

    async resolve(p, { snap }): Promise<DeployablesData | Absent> {
        if (!("deployables" in snap.columns)) return { absent: `This snapshot was read with analysis revision ${snap.info.analysis_revision || "older than 9"}; deployables need revision 9 or newer. Scan the workspace again to see them.` }
        const all = await snap.query<any>(`SELECT id, name, kind, runtime, built_by, components FROM deployables ORDER BY name`)
        const pipes = "pipelines" in snap.columns ? await snap.query<any>(`SELECT name, system, deployables FROM pipelines ORDER BY name`) : []
        const links = "pipeline_deployables" in snap.columns ? await snap.query<{ pipeline: string; deployable: string }>(`SELECT pipeline, deployable FROM pipeline_deployables`) : []
        if (!all.length && !pipes.length) return { absent: "The scan found nothing that ships here: no build files, images or pipelines it could read." }
        let rows = all
        let component: string | null = null
        let of: string | null = null
        if (p.of) {
            const byName = candidates(all.map(r => String(r.name)), p.of)[0]
            if (byName) { of = byName; rows = all.filter(r => r.name === byName) }
            else if ("deployable_components" in snap.columns) {
                component = candidates(snap.components().map(c => String(c.name)), p.of)[0] ?? null
                if (!component) return { absent: `No deployable or component matches "${p.of}".` }
                const holders = new Set((await snap.query<{ deployable: string }>(`SELECT DISTINCT deployable FROM deployable_components WHERE component = ${sq(component)}`)).map(r => String(r.deployable)))
                rows = all.filter(r => holders.has(String(r.id)) || holders.has(String(r.name)))
                if (!rows.length) return { absent: `No deployable holds ${component}: the scan found nothing that ships it.` }
            } else return { absent: `No deployable matches "${p.of}".` }
        }
        const pipelinesOf = (r: any) => links.filter(l => l.deployable === r.id || l.deployable === r.name).map(l => String(l.pipeline))
        return {
            of, component,
            rows: rows.slice(0, 40).map(r => ({ name: String(r.name), kind: String(r.kind ?? ""), runtime: String(r.runtime ?? ""), builtBy: String(r.built_by ?? ""), components: num(r.components), pipelines: pipelinesOf(r) })),
            pipelines: pipes.slice(0, 20).map(x => ({ name: String(x.name), system: String(x.system ?? ""), deployables: Number(x.deployables) || 0 })),
        }
    },

    facts(d) {
        const out: FactDraft[] = [{ kind: "total", text: `${plural(d.rows.length, "deployable")}${d.component ? ` hold ${d.component}` : ""} and ${plural(d.pipelines.length, "pipeline")} were found.`, entities: d.component ? [d.component] : [], values: { deployables: d.rows.length, pipelines: d.pipelines.length } }]
        for (const r of d.rows.slice(0, 15)) out.push({ kind: "row", text: `${r.name}: ${r.kind || "deployable"}${r.runtime ? ` on ${r.runtime}` : ""}${r.builtBy ? `, built by ${r.builtBy}` : ""}${r.components !== null ? `, holding ${plural(r.components, "component")}` : ""}${r.pipelines.length ? `; pipelines ${r.pipelines.join(", ")}` : ""}.`, entities: [r.name], values: r.components !== null ? { components: r.components } : {}, element: `row:${r.name}` })
        for (const x of d.pipelines.slice(0, 6)) out.push({ kind: "row", text: `Pipeline ${x.name}${x.system ? ` (${x.system})` : ""}${x.deployables ? ` handles ${plural(x.deployables, "deployable")}` : ""}.`, entities: [x.name], values: { deployables: x.deployables } })
        return out
    },

    elements: d => d.rows.map(r => ({ id: `row:${r.name}`, label: r.name })),

    table: d => ({
        columns: [{ id: "name", label: "Deployable" }, { id: "kind", label: "Kind" }, { id: "runtime", label: "Runtime" }, { id: "builtBy", label: "Built by" }, { id: "components", label: "Components", numeric: true }, { id: "pipelines", label: "Pipelines" }],
        rows: d.rows.map(r => ({ ...r, pipelines: r.pipelines.join(", ") })),
    }),

    open: () => ({ route: "/views/deployables", label: "Open Deployables" }),
})
