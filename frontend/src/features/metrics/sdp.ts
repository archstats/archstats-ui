// The stable-dependencies principle, as a reading rather than a verdict:
// where a component leans on something more volatile than itself (higher
// instability, I = Ce / (Ca + Ce)), a change to the volatile one reaches the
// stable one. Never called a violation; inside a tangle the two already
// change together, so those are counted apart.

export interface StabilityRow { name: string; instability: number | null; afferent: number | null; efferent: number | null }

export interface LeanRow { from: StabilityRow; to: StabilityRow; inTangle: boolean }

export function leansOnLessStable(
    from: StabilityRow,
    dependencies: StabilityRow[],
    tangleOf: (name: string) => string | null,
): LeanRow[] {
    if (from.instability === null) return []
    const mine = tangleOf(from.name)
    return dependencies
        .filter(d => d.instability !== null && d.instability > (from.instability as number) + 1e-9)
        .map(d => ({ from, to: d, inTangle: !!mine && tangleOf(d.name) === mine }))
        .sort((a, b) => (b.to.instability as number) - (a.to.instability as number) || a.to.name.localeCompare(b.to.name))
}
