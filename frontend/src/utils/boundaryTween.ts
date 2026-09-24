// Blending one boundary layout into another.
//
// Unfolding the tail from twelve names to twenty-four rewrites every height
// and every y in the drawing at once. Cutting between the two is a different
// picture arriving, and the reader has to find their module again from
// scratch. Blended, the twelve they were reading slide to their new places
// and the twelve new ones grow out of the fold they were hidden in, which is
// the same information plus where it came from.

import type { BoundaryFlow, FlowNode, FlowRibbon } from "~/utils/boundaryFlow"

/** A node or ribbon part-way between two layouts. */
export type Tweened<T> = T & {
    /** 0 while entering or leaving, 1 once settled. */
    alpha: number
}

export interface BoundaryView {
    left: Array<Tweened<FlowNode>>
    right: Array<Tweened<FlowNode>>
    ribbons: Array<Tweened<FlowRibbon>>
    height: number
    leftOmitted: number
    rightOmitted: number
}

/** The layout as it stands, with nothing in motion. */
export function settled(flow: BoundaryFlow): BoundaryView {
    return {
        left: flow.left.map((n) => ({ ...n, alpha: 1 })),
        right: flow.right.map((n) => ({ ...n, alpha: 1 })),
        ribbons: flow.ribbons.map((r) => ({ ...r, alpha: 1 })),
        height: flow.height,
        leftOmitted: flow.leftOmitted,
        rightOmitted: flow.rightOmitted,
    }
}

/**
 * `from` blended `k` of the way into `to`.
 *
 * Anything in both is interpolated. Anything only in `to` grows out of its own
 * centre; anything only in `from` shrinks back into its own centre, so a name
 * folding into the aggregate collapses towards where it was rather than
 * blinking out.
 */
export function blendBoundary(from: BoundaryView, to: BoundaryFlow, k: number): BoundaryView {
    return {
        left: blendNodes(from.left, to.left, k),
        right: blendNodes(from.right, to.right, k),
        ribbons: blendRibbons(from.ribbons, to.ribbons, k),
        height: lerp(from.height, to.height, k),
        // Counts are read as text, so they step rather than slide through
        // values nothing in the data ever held.
        leftOmitted: to.leftOmitted,
        rightOmitted: to.rightOmitted,
    }
}

function blendNodes(
    from: Array<Tweened<FlowNode>>,
    to: FlowNode[],
    k: number,
): Array<Tweened<FlowNode>> {
    const was = new Map(from.map((n) => [n.key, n]))
    const will = new Set(to.map((n) => n.key))

    const entering = to.map((n) => {
        const old = was.get(n.key)
        if (!old) return { ...n, ...grow(n, k), alpha: k }
        return {
            ...n,
            y0: lerp(old.y0, n.y0, k),
            y1: lerp(old.y1, n.y1, k),
            alpha: lerp(old.alpha, 1, k),
        }
    })

    const leaving = from
        .filter((n) => !will.has(n.key))
        .map((n) => ({ ...n, ...shrink(n, k), alpha: n.alpha * (1 - k) }))

    return [...entering, ...leaving]
}

function blendRibbons(
    from: Array<Tweened<FlowRibbon>>,
    to: FlowRibbon[],
    k: number,
): Array<Tweened<FlowRibbon>> {
    const was = new Map(from.map((r) => [r.id, r]))
    const will = new Set(to.map((r) => r.id))

    const entering = to.map((r) => {
        const old = was.get(r.id)
        if (!old) {
            return {
                ...r,
                ly0: lerp(mid(r.ly0, r.ly1), r.ly0, k), ly1: lerp(mid(r.ly0, r.ly1), r.ly1, k),
                ry0: lerp(mid(r.ry0, r.ry1), r.ry0, k), ry1: lerp(mid(r.ry0, r.ry1), r.ry1, k),
                alpha: k,
            }
        }
        return {
            ...r,
            ly0: lerp(old.ly0, r.ly0, k), ly1: lerp(old.ly1, r.ly1, k),
            ry0: lerp(old.ry0, r.ry0, k), ry1: lerp(old.ry1, r.ry1, k),
            alpha: lerp(old.alpha, 1, k),
        }
    })

    const leaving = from
        .filter((r) => !will.has(r.id))
        .map((r) => ({
            ...r,
            ly0: lerp(r.ly0, mid(r.ly0, r.ly1), k), ly1: lerp(r.ly1, mid(r.ly0, r.ly1), k),
            ry0: lerp(r.ry0, mid(r.ry0, r.ry1), k), ry1: lerp(r.ry1, mid(r.ry0, r.ry1), k),
            alpha: r.alpha * (1 - k),
        }))

    return [...entering, ...leaving]
}

function grow(n: FlowNode, k: number) {
    const c = mid(n.y0, n.y1)
    return { y0: lerp(c, n.y0, k), y1: lerp(c, n.y1, k) }
}

function shrink(n: Tweened<FlowNode>, k: number) {
    const c = mid(n.y0, n.y1)
    return { y0: lerp(n.y0, c, k), y1: lerp(n.y1, c, k) }
}

function mid(a: number, b: number) { return (a + b) / 2 }
function lerp(a: number, b: number, k: number) { return a + (b - a) * k }

/**
 * Exponential ease-out, normalised to land exactly on the target.
 *
 * Motion that starts at full speed and settles is what a reader tracks; a
 * symmetric ease reads as the drawing deciding to move rather than answering.
 */
export function easeOut(t: number): number {
    const clamped = Math.min(1, Math.max(0, t))
    return (1 - Math.pow(2, -10 * clamped)) / (1 - Math.pow(2, -10))
}
