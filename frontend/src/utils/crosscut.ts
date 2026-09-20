// The cross-cut: two dimensions at once. Rows are the groups of one
// dimension, columns the groups of another, and each cell is their
// intersection. A cell counts its files, the coupling it exchanges with
// other cells, and the cycles that touch it. Pure: the view feeds resolved
// groups and component-grain edges.

import { stronglyConnectedSets, type RawEdge, type Source } from "~/utils/connections"

export type Measure = "coupling" | "files" | "cycles"

export interface CrossGroup {
  id: string
  name: string
  color: string
  /** Every file the group amounts to. */
  files: Set<string>
}

export interface CrossInput {
  rows: CrossGroup[]
  cols: CrossGroup[]
  /** Components in scope with their files. */
  filesOfComponent: Map<string, string[]>
  /** Component-grain edges for the active source. */
  edges: RawEdge[]
  source: Source
}

export const NONE = "-"

export function cellKey(row: string | null, col: string | null): string {
  return `${row ?? NONE}|${col ?? NONE}`
}

export interface CrossCell {
  key: string
  row: string | null
  col: string | null
  files: number
  components: Set<string>
  /** Weight exchanged with other cells, both directions. */
  coupling: number
  /** Weight leaving this cell (static source) or half of the undirected weight. */
  out: number
  in: number
  /** Cycles (strongly connected sets of components) that touch this cell. */
  cycles: number
  /** Other cells this one exchanges weight with, by cell key. */
  partners: Map<string, number>
}

export interface Crosscut {
  cells: Map<string, CrossCell>
  rowFiles: Map<string, number>
  colFiles: Map<string, number>
  /** Components with files in no row group / no column group. */
  unrowed: Set<string>
  uncolumned: Set<string>
  max: Record<Measure, number>
  /** Cycles that span more than one cell. */
  crossingCycles: number
}

function weightOf(e: RawEdge, source: Source): number {
  if (source === "static") return e.references
  if (source === "git") return e.sharedCommits
  return e.references + e.sharedCommits
}

export function buildCrosscut(input: CrossInput): Crosscut {
  const rowOfFile = new Map<string, string>()
  for (const g of input.rows) for (const f of g.files) if (!rowOfFile.has(f)) rowOfFile.set(f, g.id)
  const colOfFile = new Map<string, string>()
  for (const g of input.cols) for (const f of g.files) if (!colOfFile.has(f)) colOfFile.set(f, g.id)

  const cells = new Map<string, CrossCell>()
  const cellFor = (row: string | null, col: string | null): CrossCell => {
    const key = cellKey(row, col)
    let c = cells.get(key)
    if (!c) { c = { key, row, col, files: 0, components: new Set(), coupling: 0, out: 0, in: 0, cycles: 0, partners: new Map() }; cells.set(key, c) }
    return c
  }

  // Files decide the cell; a component sits, for coupling, in the cell holding most of its files.
  const rowFiles = new Map<string, number>(), colFiles = new Map<string, number>()
  const unrowed = new Set<string>(), uncolumned = new Set<string>()
  const homeCell = new Map<string, string>()
  input.filesOfComponent.forEach((files, component) => {
    const tally = new Map<string, number>()
    let anyRow = false, anyCol = false
    for (const f of files) {
      const r = rowOfFile.get(f) ?? null, c = colOfFile.get(f) ?? null
      if (r) { anyRow = true; rowFiles.set(r, (rowFiles.get(r) ?? 0) + 1) }
      if (c) { anyCol = true; colFiles.set(c, (colFiles.get(c) ?? 0) + 1) }
      const cell = cellFor(r, c)
      cell.files++
      cell.components.add(component)
      tally.set(cell.key, (tally.get(cell.key) ?? 0) + 1)
    }
    if (files.length === 0) { const cell = cellFor(null, null); cell.components.add(component); tally.set(cell.key, 1) }
    if (!anyRow) unrowed.add(component)
    if (!anyCol) uncolumned.add(component)
    const best = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]
    if (best) homeCell.set(component, best[0])
  })

  // Coupling between cells.
  for (const e of input.edges) {
    const a = homeCell.get(e.from), b = homeCell.get(e.to)
    if (!a || !b || a === b) continue
    const w = weightOf(e, input.source)
    if (w <= 0) continue
    const ca = cells.get(a)!, cb = cells.get(b)!
    ca.coupling += w; cb.coupling += w
    ca.out += w; cb.in += w
    ca.partners.set(b, (ca.partners.get(b) ?? 0) + w)
    cb.partners.set(a, (cb.partners.get(a) ?? 0) + w)
  }

  // Cycles touching cells.
  let crossingCycles = 0
  if (input.source === "static") {
    for (const set of stronglyConnectedSets(input.filesOfComponent.keys(), input.edges)) {
      if (set.length < 2) continue
      const touched = new Set<string>()
      for (const c of set) { const k = homeCell.get(c); if (k) touched.add(k) }
      if (touched.size > 1) crossingCycles++
      touched.forEach(k => { cells.get(k)!.cycles++ })
    }
  }

  const max: Record<Measure, number> = { coupling: 0, files: 0, cycles: 0 }
  cells.forEach(c => {
    if (c.row === null && c.col === null) return
    max.coupling = Math.max(max.coupling, c.coupling)
    max.files = Math.max(max.files, c.files)
    max.cycles = Math.max(max.cycles, c.cycles)
  })
  return { cells, rowFiles, colFiles, unrowed, uncolumned, max, crossingCycles }
}
