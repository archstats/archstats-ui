// A real scan, opened outside the app.
//
// The bench runs the production loader and the production engine against a
// snapshot on disk. Only the transport is different — sqlite3 on a pipe
// rather than the Go backend on a Wails call — so the numbers it reports are
// the app's numbers, not a model of them.

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface Snapshot {
  path: string
  query: (sql: string) => Promise<any[]>
  hasView: (view: string) => boolean
  /** Every query the run issued, slowest first once sorted. */
  timings: Array<{ sql: string; ms: number; rows: number }>
}

const SCANS = join(homedir(), "Library", "Application Support", "archstats", "scans")

/**
 * The snapshot to measure: $ARCHSTATS_DB, else the largest one the desktop
 * app has scanned. Largest rather than newest, because a bench that quietly
 * picks up a twelve-component toy proves nothing and says so in no way the
 * reader would notice.
 */
export function findSnapshot(): string | null {
  if (process.env.ARCHSTATS_DB) return existsSync(process.env.ARCHSTATS_DB) ? process.env.ARCHSTATS_DB : null
  if (!existsSync(SCANS)) return null
  const found: Array<{ path: string; size: number }> = []
  for (const scan of readdirSync(SCANS)) {
    const dir = join(SCANS, scan)
    if (!statSync(dir).isDirectory()) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".db")) continue
      const path = join(dir, entry)
      found.push({ path, size: statSync(path).size })
    }
  }
  return found.sort((a, b) => b.size - a.size)[0]?.path ?? null
}

export function openSnapshot(path: string): Snapshot {
  const timings: Snapshot["timings"] = []
  const views = new Set<string>(
    execFileSync("sqlite3", [path, "select name from sqlite_master where type in ('table','view')"])
      .toString().split("\n").filter(Boolean),
  )

  return {
    path,
    timings,
    hasView: (view: string) => views.has(view),
    query: async (sql: string) => {
      const started = performance.now()
      const out = execFileSync("sqlite3", ["-json", path, sql], { maxBuffer: 1 << 30 }).toString()
      const rows = out.trim() ? JSON.parse(out) : []
      timings.push({ sql: sql.replace(/\s+/g, " ").trim().slice(0, 90), ms: performance.now() - started, rows: rows.length })
      return rows
    },
  }
}

/** Wall clock around anything, reported in whole milliseconds. */
export async function timed<T>(label: string, run: () => T | Promise<T>): Promise<{ label: string; ms: number; value: T }> {
  const started = performance.now()
  const value = await run()
  return { label, ms: performance.now() - started, value }
}

export const ms = (n: number) => `${n.toFixed(0)}ms`
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export function median(numbers: number[]): number {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
