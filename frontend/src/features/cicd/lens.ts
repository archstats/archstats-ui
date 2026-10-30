// "From the images they're in": one group per artifact, holding the
// components whose files it carries. A component carried by several is put
// in a group of its own, never split. The architect takes it or leaves it.

import type { CicdModel } from "./cicd"

export interface LensProposal {
  groups: Array<{ name: string; components: string[] }>
  /** Components in more than one artifact. */
  shared: string[]
  /** Components in none. */
  unshipped: number
}

export function proposeLens(m: CicdModel, allComponents: string[]): LensProposal {
  const holders = new Map<string, Set<string>>()
  for (const c of m.components) {
    let s = holders.get(c.component)
    if (!s) holders.set(c.component, (s = new Set()))
    s.add(c.artifact)
  }
  const shared: string[] = []
  const byArtifact = new Map<string, string[]>()
  for (const [component, arts] of holders) {
    if (arts.size > 1) {
      shared.push(component)
      continue
    }
    const a = [...arts][0]
    const list = byArtifact.get(a)
    if (list) list.push(component)
    else byArtifact.set(a, [component])
  }
  const names = new Map(m.artifacts.map(a => [a.id, a.name || a.id]))
  const groups = [...byArtifact.entries()]
    .map(([id, components]) => ({ name: names.get(id) ?? id, components: components.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const shipped = new Set(holders.keys())
  return { groups, shared: shared.sort(), unshipped: allComponents.filter(c => !shipped.has(c)).length }
}
