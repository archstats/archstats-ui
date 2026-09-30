// The question a view already answers, as an intent call: asked from Cycles,
// the tangle; from Authors, who knows the code; from a component's page, that
// component. Made before the model speaks, so an answer about "this" rests on
// the same figure the person was looking at, with facts to cite.

import type { ViewContext } from "../engine/types"

export interface ViewCall { name: string; args: Record<string, unknown> }

/** A focus like `around "org.x.core"` names the component the graph is about. */
const focusOf = (focus?: string) => /(?:around|of|from)\s+"([^"]+)"/.exec(focus ?? "")?.[1] ?? null

export function viewCall(ctx: ViewContext | null | undefined): ViewCall | null {
    if (!ctx) return null
    if (ctx.subject?.kind === "component") return { name: "about", args: { of: ctx.subject.name } }
    if (ctx.subject?.kind === "file") return { name: "code", args: { of: ctx.subject.name } }
    const [path, query = ""] = ctx.route.split("?")
    const q = new URLSearchParams(query)
    switch (path) {
        case "/": return { name: "about", args: {} }
        case "/views/components/cycles": return { name: "structure", args: {} }
        case "/views/units": case "/views/checks": return { name: "structure", args: {} }
        case "/views/components/hotspots": return { name: "change", args: { kind: "hotspots" } }
        case "/views/git/activity": return { name: "change", args: {} }
        case "/views/git/coupling": return { name: "change", args: { kind: "hidden coupling" } }
        case "/views/git/authors": return { name: "people", args: {} }
        case "/views/deployables": return { name: "deployables", args: {} }
        case "/views/rules": return { name: "rules", args: {} }
        case "/views/libraries": return { name: "libraries", args: {} }
        case "/views/connections": { const of = focusOf(ctx.focus); return of ? { name: "dependencies", args: { of } } : null }
        case "/views/metrics": { const sort = q.get("sort"); return sort ? { name: "rank", args: { measure: sort, among: q.get("grain") === "files" ? "files" : "components" } } : null }
        default: return null
    }
}
