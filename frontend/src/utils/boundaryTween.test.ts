import { describe, expect, it } from "vitest"
import { blendBoundary, easeOut, settled } from "./boundaryTween"
import type { BoundaryFlow, FlowNode, FlowRibbon } from "./boundaryFlow"

function node(key: string, y0: number, y1: number): FlowNode {
    return {
        key, path: key, label: key, weight: 1, degree: 1, y0, y1,
        aggregates: 0, rank: 0, returns: false, backWeight: 0, pinned: false,
    }
}

function ribbon(id: string, y: number): FlowRibbon {
    return { id, left: "a", right: "b", weight: 1, back: false, ly0: y, ly1: y + 10, ry0: y, ry1: y + 10 }
}

function flow(left: FlowNode[], ribbons: FlowRibbon[] = [], height = 100): BoundaryFlow {
    return { left, right: [], ribbons, height, leftOmitted: 0, rightOmitted: 0 }
}

describe("blendBoundary", () => {
    it("slides a node that is in both layouts", () => {
        const from = settled(flow([node("a", 0, 20)]))
        const half = blendBoundary(from, flow([node("a", 40, 80)]), 0.5)
        expect(half.left[0]).toMatchObject({ key: "a", y0: 20, y1: 50, alpha: 1 })
    })

    it("grows an arriving node out of its own centre", () => {
        // Unfolding the tail brings names that were not on screen; starting
        // them at full height makes the new ones indistinguishable from the
        // ones that merely moved.
        const from = settled(flow([]))
        const half = blendBoundary(from, flow([node("new", 0, 40)]), 0.5)
        expect(half.left[0]).toMatchObject({ key: "new", y0: 10, y1: 30, alpha: 0.5 })
    })

    it("shrinks a departing node back into its own centre", () => {
        const from = settled(flow([node("gone", 0, 40)]))
        const half = blendBoundary(from, flow([]), 0.5)
        expect(half.left).toHaveLength(1)
        expect(half.left[0]).toMatchObject({ key: "gone", y0: 10, y1: 30, alpha: 0.5 })
    })

    it("keeps a departing node out of the settled layout", () => {
        const from = settled(flow([node("gone", 0, 40)]))
        expect(settled(flow([])).left).toEqual([])
        expect(blendBoundary(from, flow([]), 1).left[0].alpha).toBe(0)
    })

    it("blends ribbon ends and the drawing's height", () => {
        const from = settled(flow([], [ribbon("r", 0)], 100))
        const half = blendBoundary(from, flow([], [ribbon("r", 20)], 300), 0.5)
        expect(half.ribbons[0]).toMatchObject({ ly0: 10, ly1: 20, ry0: 10, ry1: 20 })
        expect(half.height).toBe(200)
    })

    it("steps the folded counts rather than sliding them through values nothing held", () => {
        const from = settled(flow([]))
        const to: BoundaryFlow = { ...flow([]), leftOmitted: 144 }
        expect(blendBoundary(from, to, 0.5).leftOmitted).toBe(144)
    })

    it("lands exactly on the target layout", () => {
        const from = settled(flow([node("a", 0, 20)]))
        const done = blendBoundary(from, flow([node("a", 40, 80)], [], 300), 1)
        expect(done.left[0]).toMatchObject({ y0: 40, y1: 80, alpha: 1 })
        expect(done.height).toBe(300)
    })
})

describe("easeOut", () => {
    it("starts at nothing and lands exactly on one", () => {
        expect(easeOut(0)).toBe(0)
        expect(easeOut(1)).toBe(1)
    })

    it("does most of its travel early, so the motion settles rather than arrives", () => {
        expect(easeOut(0.5)).toBeGreaterThan(0.9)
    })

    it("holds inside the range for times outside it", () => {
        expect(easeOut(-1)).toBe(0)
        expect(easeOut(4)).toBe(1)
    })
})
