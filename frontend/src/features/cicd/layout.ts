// A pipeline drawn the way it runs, left to right: what starts it, then its
// jobs in columns by depth (the longest chain of needs before each), then
// what it produces. Geometry only; the component draws it. Every number here
// is a pixel in the drawing's own coordinates.

import { stepKey, type CicdIndex, type Handoff, type Job, type Output, type Step, type Trigger, type Unread } from "./cicd"

export const G = {
  trigW: 168,
  colW: 248,
  outW: 216,
  gapX: 64,
  gapY: 14,
  pad: 16,
  head: 46, // name and meta lines
  stepH: 21,
  moreH: 20,
  handoffH: 24,
  cardPad: 8,
  trigH: 30,
  outH: 40,
  maxSteps: 8,
} as const

export interface Card {
  job: Job
  x: number; y: number; w: number; h: number
  steps: Step[]
  more: number
  handoffs: Handoff[]
}
export interface TriggerBox { trigger: Trigger; x: number; y: number; w: number; h: number }
export interface OutputBox { key: string; outputs: Output[]; x: number; y: number; w: number; h: number }
export interface Placeholder { unread: Unread; x: number; y: number; w: number; h: number }
export interface Edge { key: string; kind: "needs" | "start" | "produces"; from: string; to: string; d: string }

export interface GraphLayout {
  width: number
  height: number
  triggers: TriggerBox[]
  cards: Card[]
  outputs: OutputBox[]
  placeholders: Placeholder[]
  edges: Edge[]
  depth: number
}

export function cardHeight(steps: number, handoffs: number): number {
  const shown = Math.min(steps, G.maxSteps)
  const more = steps > G.maxSteps ? G.moreH : 0
  return G.head + shown * G.stepH + more + handoffs * G.handoffH + G.cardPad
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(24, (x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

export const outputKey = (o: Output) => `${o.kind}\u0000${o.target}\u0000${o.environment}\u0000${o.artifact}`

export function layoutPipeline(ix: CicdIndex, pipeline: string): GraphLayout {
  const jobs = [...(ix.jobsOf.get(pipeline) ?? [])]
  const triggers = ix.triggersOf.get(pipeline) ?? []
  const handoffs = ix.handoffsOf.get(pipeline) ?? []
  const outputs = ix.outputsOf.get(pipeline) ?? []
  const unread = ix.unreadOf.get(pipeline) ?? []
  const byId = new Map(jobs.map(j => [j.id, j]))
  const maxDepth = jobs.reduce((d, j) => Math.max(d, j.depth), 0)

  const colX = (depth: number) => G.pad + G.trigW + G.gapX + depth * (G.colW + G.gapX)

  // Order each column by where the jobs it needs sit, so edges cross less.
  const columns: Job[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const j of jobs) columns[j.depth].push(j)
  const rank = new Map<string, number>()
  for (let d = 0; d <= maxDepth; d++) {
    const col = columns[d]
    const centre = (j: Job) => {
      const parents = needsOf(j).map(n => rank.get(n)).filter((r): r is number => r !== undefined)
      return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : Number.POSITIVE_INFINITY
    }
    col.sort((a, b) => {
      const ca = centre(a), cb = centre(b)
      if (ca !== cb) return ca - cb
      if (a.group !== b.group) return a.group.localeCompare(b.group)
      return a.line - b.line || a.id.localeCompare(b.id)
    })
    col.forEach((j, i) => rank.set(j.id, i))
  }

  const cards: Card[] = []
  const cardOf = new Map<string, Card>()
  let height = 0
  for (let d = 0; d <= maxDepth; d++) {
    let y = G.pad
    for (const j of columns[d]) {
      const steps = ix.stepsOf.get(stepKey(pipeline, j.id)) ?? []
      const hs = handoffs.filter(h => h.job === j.id)
      const h = cardHeight(steps.length, hs.length)
      const card: Card = { job: j, x: colX(d), y, w: G.colW, h, steps: steps.slice(0, G.maxSteps), more: Math.max(0, steps.length - G.maxSteps), handoffs: hs }
      cards.push(card)
      cardOf.set(j.id, card)
      y += h + G.gapY
    }
    height = Math.max(height, y)
  }

  // Unread regions sit after the job written just before them.
  const placeholders: Placeholder[] = []
  const colBottom = (d: number) => Math.max(G.pad, ...cards.filter(c => c.job.depth === d).map(c => c.y + c.h + G.gapY))
  for (const u of unread) {
    const before = jobs.filter(j => j.line <= u.from_line).sort((a, b) => b.line - a.line)[0]
    const d = before ? Math.min(before.depth + 1, maxDepth + 1) : 0
    const y = Math.max(colBottom(d), ...placeholders.filter(p => p.x === colX(d)).map(p => p.y + p.h + G.gapY))
    placeholders.push({ unread: u, x: colX(d), y, w: G.colW, h: 64 })
    height = Math.max(height, y + 64 + G.gapY)
  }

  const trigBoxes: TriggerBox[] = triggers.map((t, i) => ({ trigger: t, x: G.pad, y: G.pad + i * (G.trigH + 8), w: G.trigW, h: G.trigH }))
  if (trigBoxes.length) height = Math.max(height, trigBoxes[trigBoxes.length - 1].y + G.trigH + G.gapY)

  // Outputs: one box per thing produced, in the column after the last job.
  const outX = colX(Math.max(maxDepth, placeholders.length ? maxDepth + 1 : maxDepth) + 1)
  const groups = new Map<string, Output[]>()
  for (const o of outputs) {
    const k = outputKey(o)
    const list = groups.get(k)
    if (list) list.push(o)
    else groups.set(k, [o])
  }
  const outBoxes: OutputBox[] = []
  const producers = (os: Output[]) => os.map(o => cardOf.get(o.job)).filter((c): c is Card => !!c)
  const sortedOuts = [...groups.entries()].sort((a, b) => {
    const ya = Math.min(...producers(a[1]).map(c => c.y), 1e9)
    const yb = Math.min(...producers(b[1]).map(c => c.y), 1e9)
    return ya - yb || a[0].localeCompare(b[0])
  })
  let oy = G.pad
  for (const [key, os] of sortedOuts) {
    outBoxes.push({ key, outputs: os, x: outX, y: oy, w: G.outW, h: G.outH })
    oy += G.outH + 8
  }
  height = Math.max(height, oy + G.pad)

  const edges: Edge[] = []
  for (const c of cards) {
    for (const n of needsOf(c.job)) {
      const from = cardOf.get(n)
      if (!from || from === c) continue
      edges.push({ key: `n:${n}>${c.job.id}`, kind: "needs", from: n, to: c.job.id, d: curve(from.x + from.w, from.y + 22, c.x, c.y + 22) })
    }
  }
  if (trigBoxes.length) {
    const tx = G.pad + G.trigW
    const ty = (trigBoxes[0].y + trigBoxes[trigBoxes.length - 1].y + G.trigH) / 2
    for (const c of cards) {
      if (c.job.depth !== 0 || needsOf(c.job).some(n => byId.has(n))) continue
      edges.push({ key: `t>${c.job.id}`, kind: "start", from: "triggers", to: c.job.id, d: curve(tx, ty, c.x, c.y + 22) })
    }
  }
  for (const b of outBoxes) {
    const seen = new Set<string>()
    for (const c of producers(b.outputs)) {
      if (seen.has(c.job.id)) continue
      seen.add(c.job.id)
      edges.push({ key: `o:${c.job.id}>${b.key}`, kind: "produces", from: c.job.id, to: b.key, d: curve(c.x + c.w, c.y + 22, b.x, b.y + G.outH / 2) })
    }
  }

  const width = (outBoxes.length ? outX + G.outW : colX(maxDepth + (placeholders.length ? 1 : 0)) + G.colW) + G.pad
  return { width, height: Math.max(height, 120), triggers: trigBoxes, cards, outputs: outBoxes, placeholders, edges, depth: maxDepth }
}

export function needsOf(j: Job): string[] {
  return j.needs ? j.needs.split(", ").filter(Boolean) : []
}
