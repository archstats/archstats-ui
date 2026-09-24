import { describe, expect, it } from "vitest"
import { layoutBoundary, OTHERS_LEFT, OTHERS_RIGHT } from "./boundaryFlow"
import type { Reference } from "./findings"

const nameOf = (p: string) => p.replace(/\.\w+$/, "")

function ref(from: string, to: string, weight = 1): Reference {
    return { from, to, weight }
}

/** Left lane is "a"; anything named L is in it, R is the other side. */
function lanes(refs: Reference[]) {
    const m = new Map<string, string>()
    for (const r of refs) {
        for (const p of [r.from, r.to]) m.set(p, p.startsWith("L") ? "a" : "b")
    }
    return m
}

function build(forward: Reference[], backward: Reference[] = [], opts = {}) {
    const laneOf = lanes([...forward, ...backward])
    return layoutBoundary({ forward, backward, laneOf, headLane: "a", nameOf, gap: 0, minNode: 0, pitch: 25, ...opts })
}

describe("layoutBoundary", () => {
    it("puts each end in the column of its own lane", () => {
        const f = build([ref("L1.ts", "R1.ts")])
        expect(f.left.map((n) => n.key)).toEqual(["L1.ts"])
        expect(f.right.map((n) => n.key)).toEqual(["R1.ts"])
    })

    it("keeps a module on its own side even when the dependency runs backwards", () => {
        // A back-reference goes from the right lane into the left one; its
        // ends must not swap columns or the diagram stops being two groups.
        const f = build([], [ref("R1.ts", "L1.ts")])
        expect(f.left.map((n) => n.key)).toEqual(["L1.ts"])
        expect(f.right.map((n) => n.key)).toEqual(["R1.ts"])
        expect(f.ribbons[0].back).toBe(true)
    })

    it("gives a node height in proportion to the traffic through it", () => {
        const f = build([ref("L1.ts", "R1.ts", 3), ref("L2.ts", "R1.ts", 1)], [], { minNode: 0 })
        const [big, small] = f.left
        expect(big.key).toBe("L1.ts")
        expect((big.y1 - big.y0) / (small.y1 - small.y0)).toBeCloseTo(3, 5)
    })

    it("keeps the smallest node tall enough to carry its own label", () => {
        // Purely proportional, the top ten modules of a real boundary got six
        // pixels each while the folded tail took three quarters of the height.
        const f = build([ref("L1.ts", "R1.ts", 400), ref("Ltiny.ts", "R1.ts", 1)], [], { minNode: 16 })
        const tiny = f.left.find((n) => n.key === "Ltiny.ts")!
        const big = f.left.find((n) => n.key === "L1.ts")!
        expect(tiny.y1 - tiny.y0).toBeGreaterThanOrEqual(15.9)
        expect(big.y1 - big.y0).toBeGreaterThan(tiny.y1 - tiny.y0)
    })

    it("grows the drawing with the number of nodes rather than squeezing them", () => {
        const few = build([ref("L1.ts", "R1.ts")])
        const many = Array.from({ length: 14 }, (_, i) => ref(`L${i}.ts`, `R${i}.ts`))
        expect(build(many, [], { top: 20 }).height).toBeGreaterThan(few.height)
    })

    it("does not mark the folded tail as carrying traffic against the grain", () => {
        // Painted red, the least actionable thing on screen was the loudest.
        const forward = Array.from({ length: 6 }, (_, i) => ref(`L${i}.ts`, "R1.ts"))
        const f = build(forward, [ref("R1.ts", "L5.ts")], { top: 2 })
        expect(f.left.find((n) => n.key === OTHERS_LEFT)!.returns).toBe(false)
    })

    it("records each node's rank so the eye can follow the order", () => {
        const f = build([ref("L1.ts", "R1.ts", 3), ref("L2.ts", "R1.ts", 1)])
        expect(f.left.map((n) => n.rank)).toEqual([0, 1])
    })

    it("ranks by traffic rather than by how many modules a node touches", () => {
        // One module carried 137 of 177 crossings on the real boundary; a
        // layout ranking by partner count would bury it.
        const f = build([
            ref("Lheavy.ts", "R1.ts", 50),
            ref("Lwide.ts", "R1.ts"), ref("Lwide.ts", "R2.ts"), ref("Lwide.ts", "R3.ts"),
        ])
        expect(f.left[0].key).toBe("Lheavy.ts")
    })

    it("folds everything past the top few into one node", () => {
        const forward = Array.from({ length: 6 }, (_, i) => ref(`L${i}.ts`, "R1.ts", 6 - i))
        const f = build(forward, [], { top: 3 })
        expect(f.left).toHaveLength(4)
        expect(f.left[3].key).toBe(OTHERS_LEFT)
        expect(f.left[3].aggregates).toBe(3)
        expect(f.leftOmitted).toBe(3)
    })

    it("keeps the aggregate last so the ranking above it reads", () => {
        const forward = Array.from({ length: 6 }, (_, i) => ref(`L${i}.ts`, "R1.ts", 1))
        const f = build(forward, [], { top: 2 })
        expect(f.left[f.left.length - 1].key).toBe(OTHERS_LEFT)
    })

    it("folds the ribbons onto the aggregate too, so heights still match", () => {
        const forward = Array.from({ length: 6 }, (_, i) => ref(`L${i}.ts`, "R1.ts", 1))
        const f = build(forward, [], { top: 2 })
        const total = f.left.reduce((n, x) => n + x.weight, 0)
        const ribbonTotal = f.ribbons.reduce((n, r) => n + r.weight, 0)
        expect(total).toBe(ribbonTotal)
    })

    it("stacks ribbons inside a node without overlapping or overflowing it", () => {
        const f = build([
            ref("L1.ts", "R1.ts", 2), ref("L1.ts", "R2.ts", 1), ref("L2.ts", "R1.ts", 1),
        ])
        const node = f.left.find((n) => n.key === "L1.ts")!
        const mine = f.ribbons.filter((r) => r.left === "L1.ts").sort((a, b) => a.ly0 - b.ly0)
        expect(mine[0].ly0).toBeCloseTo(node.y0, 5)
        expect(mine[mine.length - 1].ly1).toBeCloseTo(node.y1, 5)
        for (let i = 1; i < mine.length; i++) {
            expect(mine[i].ly0).toBeCloseTo(mine[i - 1].ly1, 5)
        }
    })

    it("marks a node that carries traffic against the grain", () => {
        const f = build([ref("L1.ts", "R1.ts")], [ref("R1.ts", "L1.ts")])
        expect(f.left.find((n) => n.key === "L1.ts")!.returns).toBe(true)
    })

    it("counts the distinct modules a node reaches", () => {
        const f = build([ref("L1.ts", "R1.ts"), ref("L1.ts", "R2.ts")])
        expect(f.left[0].degree).toBe(2)
    })

    it("drops a reference whose two ends sit in the same lane", () => {
        // Both ends inside one group is not a crossing and would put the same
        // module in both columns.
        const laneOf = new Map([["L1.ts", "a"], ["L2.ts", "a"]])
        const f = layoutBoundary({
            forward: [ref("L1.ts", "L2.ts")], backward: [], laneOf,
            headLane: "a", nameOf, height: 100, gap: 0,
        })
        expect(f.ribbons).toEqual([])
    })

    it("has nothing to lay out for an empty boundary", () => {
        const f = build([])
        expect(f.left).toEqual([])
        expect(f.right).toEqual([])
        expect(f.ribbons).toEqual([])
    })

    it("draws a pinned module even when it ranks nowhere near the top", () => {
        // Following a module link from the inspector used to select something
        // folded into the aggregate, so the click had nothing to show for it.
        const forward = [
            ref("L1.ts", "R1.ts", 9), ref("L2.ts", "R1.ts", 8),
            ref("L3.ts", "R1.ts", 7), ref("L4.ts", "R1.ts", 1),
        ]
        expect(build(forward, [], { top: 2 }).left.map((n) => n.key))
            .toEqual(["L1.ts", "L2.ts", OTHERS_LEFT])

        const pinned = build(forward, [], { top: 2, pin: ["L4.ts"] })
        expect(pinned.left.map((n) => n.key)).toContain("L4.ts")
        expect(pinned.left.find((n) => n.key === "L4.ts")?.pinned).toBe(true)
        // It joins the drawing; it does not displace the ranking above it.
        expect(pinned.left.map((n) => n.key).slice(0, 2)).toEqual(["L1.ts", "L2.ts"])
    })

    it("pinning something already drawn changes nothing", () => {
        const forward = [ref("L1.ts", "R1.ts", 9), ref("L2.ts", "R1.ts", 1)]
        const plain = build(forward)
        const pinned = build(forward, [], { pin: ["L1.ts"] })
        expect(pinned.left.map((n) => n.key)).toEqual(plain.left.map((n) => n.key))
    })

    it("measures how much of a node runs against the grain", () => {
        // A whole bar painted red the moment any of it returns says nothing
        // about how much, so the share is carried as a weight.
        const f = build([ref("L1.ts", "R1.ts", 3)], [ref("R1.ts", "L1.ts", 1)])
        const left = f.left[0]
        expect(left.weight).toBe(4)
        expect(left.backWeight).toBe(1)
        expect(left.returns).toBe(true)
    })

    it("leaves a node with no returning traffic at zero", () => {
        const f = build([ref("L1.ts", "R1.ts", 3)])
        expect(f.left[0].backWeight).toBe(0)
        expect(f.left[0].returns).toBe(false)
    })

    it("never attributes the folded tail an anomaly it cannot be opened on", () => {
        const f = build(
            [ref("L1.ts", "R1.ts", 9), ref("L2.ts", "R1.ts", 1)],
            [ref("R1.ts", "L2.ts", 5)],
            { top: 1 },
        )
        const others = f.left.find((n) => n.key === OTHERS_LEFT)
        expect(others?.backWeight).toBe(0)
        expect(others?.returns).toBe(false)
    })

    it("keeps the two folded tails apart", () => {
        // One shared key meant nothing could tell the two aggregates apart:
        // a band into the right-hand fold was captioned with the left-hand
        // fold's count, and hovering either one lit both.
        const forward = [
            ref("L1.ts", "R1.ts", 9), ref("L2.ts", "R2.ts", 1),
            ref("L3.ts", "R3.ts", 1), ref("L4.ts", "R4.ts", 1),
        ]
        const f = build(forward, [], { top: 1 })
        const left = f.left[f.left.length - 1]
        const right = f.right[f.right.length - 1]
        expect(left.key).not.toBe(right.key)
        expect(left.aggregates).toBe(3)
        expect(right.aggregates).toBe(3)
        // Neither carries a path, so neither is selectable.
        expect(left.path).toBeUndefined()
        expect(right.path).toBeUndefined()
    })

    it("gives a returning band the ends of the dependency it is", () => {
        // These were left undefined, so clicking the largest red band on the
        // screen fell through every branch and did nothing at all.
        const f = build([], [ref("R1.ts", "L1.ts", 4)])
        const back = f.ribbons[0]
        expect(back.back).toBe(true)
        // Drawn right-to-left; the dependency runs R1 -> L1.
        expect(back.left).toBe("L1.ts")
        expect(back.right).toBe("R1.ts")
        expect(back.fromPath).toBe("R1.ts")
        expect(back.toPath).toBe("L1.ts")
    })

    it("keeps a forward band pointing the way it always did", () => {
        const f = build([ref("L1.ts", "R1.ts", 4)])
        expect(f.ribbons[0]).toMatchObject({ fromPath: "L1.ts", toPath: "R1.ts", back: false })
    })

    it("leaves the folded end of a band unnamed, in either direction", () => {
        const forward = [ref("L1.ts", "R1.ts", 9), ref("L2.ts", "R1.ts", 1)]
        const f = build(forward, [ref("R1.ts", "L2.ts", 3)], { top: 1 })
        const folded = f.ribbons.filter((r) => r.left === OTHERS_LEFT || r.right === OTHERS_RIGHT)
        expect(folded.length).toBeGreaterThan(0)
        for (const r of folded) {
            // The named end is still named; only the aggregate end is dropped.
            expect(r.fromPath === undefined || r.toPath === undefined).toBe(true)
            expect(r.fromPath ?? r.toPath).toBeDefined()
        }
    })

    it("counts partners before the tail is folded", () => {
        // The number beside a name is a claim about the codebase. Reading it
        // off the merged links made it a claim about the picture instead.
        const forward = [
            ref("L1.ts", "R1.ts", 9), ref("L1.ts", "R2.ts", 1),
            ref("L1.ts", "R3.ts", 1), ref("L1.ts", "R4.ts", 1),
        ]
        const f = build(forward, [], { top: 1 })
        expect(f.right.map((n) => n.key)).toEqual(["R1.ts", OTHERS_RIGHT])
        expect(f.left[0].degree).toBe(4)
    })

    it("stacks returning traffic at the top of the nodes it touches", () => {
        // The red band on a bar has to sit where its red ribbons leave it.
        const f = build(
            [ref("L1.ts", "R1.ts", 4)],
            [ref("R1.ts", "L1.ts", 2)],
        )
        const back = f.ribbons.find((r) => r.back)!
        const forwardRibbon = f.ribbons.find((r) => !r.back)!
        expect(back.ly0).toBe(f.left[0].y0)
        expect(back.ry0).toBe(f.right[0].y0)
        expect(forwardRibbon.ly0).toBeGreaterThanOrEqual(back.ly1)
    })
})
