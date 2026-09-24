import { describe, expect, it } from "vitest"
import { componentRole, componentZone, rankOf } from "./componentRole"

const role = (afferent: number, efferent: number, afferentPercentile = 50, efferentPercentile = 50) =>
    componentRole({ afferent, efferent, afferentPercentile, efferentPercentile })

describe("componentRole", () => {
    it("names a component nothing touches", () => {
        expect(role(0, 0).id).toBe("isolated")
    })

    it("names a component that is imported but imports nothing", () => {
        const r = role(12, 0)
        expect(r.id).toBe("foundation")
        expect(r.evidence).toContain("12 components import it")
    })

    it("names a component that imports but is imported by nothing", () => {
        expect(role(0, 4).id).toBe("leaf")
    })

    it("names a hub only when both directions are high for this codebase", () => {
        expect(role(30, 30, 95, 95).id).toBe("hub")
        expect(role(30, 30, 95, 40).id).toBe("widely-used")
        expect(role(30, 30, 40, 95).id).toBe("integrator")
        expect(role(30, 30, 40, 40).id).toBe("intermediate")
    })

    it("counts one importer without pluralising", () => {
        expect(role(1, 0).evidence).toContain("1 component imports it")
    })
})

describe("componentZone", () => {
    it("finds the zone of pain", () => {
        expect(componentZone(0.1, 0.2).id).toBe("pain")
    })

    it("finds the zone of uselessness", () => {
        expect(componentZone(0.9, 0.8).id).toBe("uselessness")
    })

    it("recognises the main sequence", () => {
        expect(componentZone(0.5, 0.5).id).toBe("main-sequence")
    })

    it("stays quiet between the zones and still reports coordinates", () => {
        const z = componentZone(0.1, 0.6)
        expect(z.id).toBe("none")
        expect(z.evidence).toContain("0.10")
    })

    it("says nothing without both coordinates", () => {
        expect(componentZone(null, 0.5).id).toBe("none")
        expect(componentZone(0.5, null).evidence).toBe("")
    })
})

describe("rankOf", () => {
    const sorted = [100, 50, 50, 10, 1]

    it("ranks the highest value first", () => {
        expect(rankOf(100, sorted).rank).toBe(1)
    })

    it("shares a rank between ties", () => {
        expect(rankOf(50, sorted).rank).toBe(2)
    })

    it("reports the share of values below", () => {
        expect(rankOf(50, sorted).percentile).toBe(40)
        expect(rankOf(1, sorted).percentile).toBe(0)
    })

    it("survives an empty codebase", () => {
        expect(rankOf(1, []).rank).toBe(0)
    })
})
