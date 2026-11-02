// What the reader has set up in the endpoint catalogue: the search (its
// checks among the tokens), ticks, the open item and the folded groups. Held outside the page so a trip
// to a file or a component and back finds it as it was; a different snapshot
// starts clean.

import { ref } from "vue"
import type { Token } from "./search"

export type Pick = { kind: "route"; id: number } | { kind: "node"; id: string } | { kind: "system"; name: string } | { kind: "contracts" } | { kind: "systems" } | null

export const catalogState = {
  dataset: ref<string | null>(null),
  search: ref(""),
  tokens: ref<Token[]>([]),
  collapsed: ref<Set<string>>(new Set()),
  checked: ref<Set<number>>(new Set()),
  picked: ref<Pick>(null),
  showLayers: ref(true),
}

/** The state for a snapshot: kept when it is the one last shown, cleared when not. */
export function catalogStateFor(dataset: string | null) {
  const s = catalogState
  if (s.dataset.value !== dataset) {
    s.dataset.value = dataset
    s.search.value = ""
    s.tokens.value = []
    s.collapsed.value = new Set()
    s.checked.value = new Set()
    s.picked.value = null
  }
  return s
}
