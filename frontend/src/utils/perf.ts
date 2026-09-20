// A stopwatch the app carries but does not run.
//
// Performance work needs a number before and a number after, and the numbers
// that matter are the ones the shipped code produces — not a sample of it
// copied into a bench. So the hot routines are instrumented permanently and
// the instrumentation is off: a disabled `begin` is one boolean test and a
// shared no-op closure, which is nothing against the work it wraps.
//
// Turn it on from the console or from a bench driver:
//   localStorage.setItem("archstats:perf", "1")  // then reload
//   __perf.on()   __perf.read()   __perf.reset()
//
// Instrument whole routines, never inner loops. A counter called once per
// node per frame measures itself.

export interface Stat {
  /** How many times it ran. */
  count: number
  /** Total milliseconds spent in it. */
  total: number
  /** The worst single run, which is what a dropped frame is made of. */
  max: number
}

const stats = new Map<string, Stat>()
let enabled = false
const noop = () => {}

/** Milliseconds, monotonic, wherever this happens to be running. */
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now())

export function setPerf(on: boolean): void {
  enabled = on
  if (!on) stats.clear()
}

export function perfOn(): boolean {
  return enabled
}

/**
 * Times one run of a named routine. Returns the function that ends it, so a
 * caller with several exits still records exactly one measurement:
 *
 *   const end = begin("graph.tick"); … ; end()
 */
export function begin(name: string): () => void {
  if (!enabled) return noop
  const started = now()
  return () => {
    const ms = now() - started
    const stat = stats.get(name)
    if (stat) {
      stat.count++
      stat.total += ms
      if (ms > stat.max) stat.max = ms
    } else {
      stats.set(name, { count: 1, total: ms, max: ms })
    }
  }
}

/** The same, around an expression. */
export function measure<T>(name: string, run: () => T): T {
  const end = begin(name)
  try { return run() } finally { end() }
}

/** Everything recorded so far, heaviest total first. */
export function readPerf(): Array<Stat & { name: string; mean: number }> {
  return Array.from(stats, ([name, s]) => ({ name, ...s, mean: s.total / s.count }))
    .sort((a, b) => b.total - a.total)
}

export function resetPerf(): void {
  stats.clear()
}

/**
 * Anything counted by hand rather than timed: elements drawn, edges kept,
 * rows returned. A size is half of every performance answer, and a bench that
 * reports only milliseconds cannot tell a faster renderer from a smaller one.
 */
export function count(name: string, n: number): void {
  if (!enabled) return
  stats.set(name, { count: n, total: 0, max: n })
}

// The console and the bench driver reach it through the same handle.
if (typeof window !== "undefined") {
  try { enabled = window.localStorage?.getItem("archstats:perf") === "1" } catch { /* private mode */ }
  ;(window as any).__perf = {
    on: () => setPerf(true),
    off: () => setPerf(false),
    read: readPerf,
    reset: resetPerf,
    get enabled() { return enabled },
  }
}
