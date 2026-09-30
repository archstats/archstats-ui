import { describe, expect, it } from "vitest"
import { viewCall } from "./fromView"

const ctx = (route: string, extra: Record<string, unknown> = {}) => ({ route, label: "", exhibits: [], capturedAt: "", ...extra }) as any

describe("viewCall", () => {
    it("asks what the view shows", () => {
        expect(viewCall(ctx("/views/components/cycles"))).toEqual({ name: "structure", args: {} })
        expect(viewCall(ctx("/views/git/authors"))).toEqual({ name: "people", args: {} })
        expect(viewCall(ctx("/views/metrics?sort=modularity__instability"))).toEqual({ name: "rank", args: { measure: "modularity__instability", among: "components" } })
        expect(viewCall(ctx("/views/components/org.x.core", { subject: { kind: "component", name: "org.x.core" } }))).toEqual({ name: "about", args: { of: "org.x.core" } })
        expect(viewCall(ctx("/views/connections", { focus: 'around "org.x.core"' }))).toEqual({ name: "dependencies", args: { of: "org.x.core" } })
    })

    it("asks nothing for a view it cannot read", () => {
        expect(viewCall(ctx("/views/query"))).toBeNull()
        expect(viewCall(null)).toBeNull()
    })
})
