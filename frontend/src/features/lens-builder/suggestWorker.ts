import { toRaw } from "vue"
import { t } from "~/shared/i18n"
import { placeRest, suggest, buildSuggestInput, type Constraints, type Grain, type Placement, type SignalSources, type SuggestInput, type SuggestSettings, type Suggestion } from "./suggest"

// The window's side of suggest.worker.ts. Calls queue in the worker in the
// order they were made. Where there is no Worker (tests, the hidden stage),
// the same functions run here instead.

interface Pending { resolve: (v: any) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let sentFor: string | null = null
let nextId = 0
const pending = new Map<number, Pending>()
// The inline fallback's own cache, keyed like the worker's.
let inlineSources: SignalSources | null = null
const inlineInputs = new Map<string, SuggestInput>()

function start(): Worker | null {
  if (worker) return worker
  if (typeof Worker === "undefined") return null
  try {
    // The name carries the app's language into the worker (shared/i18n.ts
    // reads it there). Vite wants a worker's options written out, so one
    // constructor per language.
    worker = locale() === "nl"
      ? new Worker(new URL("./suggest.worker.ts", import.meta.url), { type: "module", name: "suggest locale=nl" })
      : new Worker(new URL("./suggest.worker.ts", import.meta.url), { type: "module", name: "suggest locale=en" })
  } catch {
    return null
  }
  worker.onmessage = (ev: MessageEvent) => {
    const { id, result, error } = ev.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (error) p.reject(new Error(error)); else p.resolve(result)
  }
  // A worker that died takes its calls with it; the next call starts a new one.
  worker.onerror = (ev) => {
    ev.preventDefault?.()
    const err = new Error(t("lens-builder.suggestWorker.stopped"))
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
    sentFor = null
  }
  return worker
}

function locale(): string {
  try { return globalThis.localStorage?.getItem("archstats.locale") ?? "en" } catch { return "en" }
}

function call<T>(w: Worker, message: Record<string, unknown>): Promise<T> {
  const id = ++nextId
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ ...message, id })
  })
}

/** A copy without Vue's proxies, which cannot be posted to a worker. */
export function plain<T>(value: T): T {
  const v: any = toRaw(value as any)
  if (v === null || typeof v !== "object") return v
  if (v instanceof Map) return new Map(Array.from(v, ([k, x]) => [plain(k), plain(x)])) as any
  if (v instanceof Set) return new Set(Array.from(v, plain)) as any
  if (Array.isArray(v)) return v.map(plain) as any
  const out: any = {}
  for (const k of Object.keys(v)) out[k] = plain(v[k])
  return out
}

function sync(w: Worker, key: string, src: SignalSources): void {
  if (sentFor === key) return
  // Posted in order: every call after this one sees these sources.
  w.postMessage({ type: "sources", id: ++nextId, sources: plain(src) })
  sentFor = key
}

function inlineInput(key: string, src: SignalSources, grain: Grain, include: string[] | null, cacheKey: string): SuggestInput {
  if (inlineSources !== src) { inlineSources = src; inlineInputs.clear() }
  let input = inlineInputs.get(cacheKey)
  if (!input) {
    const only = include ? new Set(include) : null
    input = buildSuggestInput(src, grain, only ? (c) => only.has(c) : undefined)
    inlineInputs.set(cacheKey, input)
  }
  return input
}

export interface RunArgs {
  /** Which snapshot the sources are of; sources are posted once per key. */
  key: string
  src: SignalSources
  grain: Grain
  /** The components to cluster, or null for all of them. */
  include: string[] | null
  cacheKey: string
  settings: SuggestSettings
}

export function runSuggest(a: RunArgs, taken: ReadonlySet<string>, constraints?: Constraints): Promise<Suggestion[]> {
  const w = start()
  if (!w) return Promise.resolve(suggest(inlineInput(a.key, a.src, a.grain, a.include, a.cacheKey), a.settings, taken, constraints))
  sync(w, a.key, a.src)
  return call(w, { type: "run", grain: a.grain, include: a.include, cacheKey: a.cacheKey, settings: plain(a.settings), taken: [...taken], constraints: constraints ? plain(constraints) : undefined })
}

export function runHints(a: RunArgs, placed: Map<string, string>): Promise<Map<string, Placement>> {
  const w = start()
  if (!w) return Promise.resolve(placeRest(inlineInput(a.key, a.src, a.grain, a.include, a.cacheKey), a.settings, placed))
  sync(w, a.key, a.src)
  return call(w, { type: "hints", grain: a.grain, include: a.include, cacheKey: a.cacheKey, settings: plain(a.settings), placed: plain(placed) })
}
