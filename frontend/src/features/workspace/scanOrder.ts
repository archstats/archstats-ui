// The order of scans is the order of the code they read, not the order they
// were taken in: a rescan of last month's commit belongs before today's scan
// even though it ran after it. Scans without a known commit time fall back
// to when they ran.

export interface OrderedScan {
    id: string
    startedAt: string | Date
    headTime?: string | Date | null
    status?: string
}

const ms = (v: string | Date | null | undefined): number => (v ? new Date(v).getTime() : NaN)

/** [code time, scan time]: sort ascending for oldest first. */
export function scanOrderKey(scan: OrderedScan): [number, number] {
    const head = ms(scan.headTime)
    const ran = ms(scan.startedAt)
    return [Number.isFinite(head) ? head : ran, ran]
}

export function compareScans(a: OrderedScan, b: OrderedScan): number {
    const [ah, ar] = scanOrderKey(a)
    const [bh, br] = scanOrderKey(b)
    return ah - bh || ar - br
}

/** Newest first, by the code they read. */
export function newestFirst<T extends OrderedScan>(scans: T[]): T[] {
    return [...scans].sort((a, b) => compareScans(b, a))
}

/** Complete scans that read older code than `scan`, newest first. */
export function olderThan<T extends OrderedScan>(scans: T[], scan: T): T[] {
    return newestFirst(scans.filter(s => s.id !== scan.id && (s.status ?? "complete") === "complete" && compareScans(s, scan) < 0))
}
