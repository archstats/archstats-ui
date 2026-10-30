// The group suggester off the window's thread. Clustering a large snapshot
// takes seconds; on the thread that draws the window, those seconds are a
// window that does not answer. The window sends a snapshot's signal sources
// once, then asks for runs (see suggestWorker.ts).
import { t } from "~/shared/i18n"
import { buildSuggestInput, placeRest, suggest, type Grain, type SignalSources, type SuggestInput } from "./suggest"

let sources: SignalSources | null = null
const inputs = new Map<string, SuggestInput>()

function inputFor(grain: Grain, include: string[] | null, cacheKey: string): SuggestInput {
  let input = inputs.get(cacheKey)
  if (!input) {
    if (!sources) throw new Error(t("lens-builder.suggestWorker.noSnapshot"))
    const only = include ? new Set(include) : null
    input = buildSuggestInput(sources, grain, only ? (c) => only.has(c) : undefined)
    inputs.set(cacheKey, input)
  }
  return input
}

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data
  try {
    let result: unknown = null
    if (m.type === "sources") {
      sources = m.sources
      inputs.clear()
    } else if (m.type === "run") {
      result = suggest(inputFor(m.grain, m.include, m.cacheKey), m.settings, new Set(m.taken), m.constraints)
    } else if (m.type === "hints") {
      result = placeRest(inputFor(m.grain, m.include, m.cacheKey), m.settings, m.placed)
    }
    self.postMessage({ id: m.id, result })
  } catch (e: any) {
    self.postMessage({ id: m.id, error: String(e?.message ?? e) })
  }
}
