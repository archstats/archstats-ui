// Finding an endpoint the way people look for one: a few words ("customer
// delete"), a URL pasted from a log or a browser ("https://shop/api/orders/42?x=1"
// finds GET /api/orders/{id}), a method ("post"), or a picked fact (the table
// Customer, the system payments, the class OrderController). Picked facts are
// tokens; everything else is text that must match somewhere.

import type { Endpoint } from "./catalog"

/** A filter token is a check the catalogue answers (No timeout, Changes data); the search leaves it to the page. */
export type TokenKind = "method" | "table" | "system" | "class" | "access" | "filter"
export interface Token { kind: TokenKind; value: string }

export interface Query {
  tokens: Token[]
  /** Free words, lower case; each must match somewhere. */
  words: string[]
  /** A concrete path to match against templates, from a pasted URL or a typed path. */
  path: string | null
}

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "any"])

/** A URL or path as the path part alone: no scheme, host, query or fragment. */
export function pathOf(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(s)
  if (url) return url[1] || "/"
  if (s.startsWith("/")) return s.split(/[?#]/)[0]
  return null
}

/** Free text and tokens into a query. A method word is a method; a path or URL is a path. */
export function parseQuery(text: string, tokens: Token[] = []): Query {
  const words: string[] = []
  const all = [...tokens]
  let path: string | null = null
  for (const part of text.trim().split(/\s+/).filter(Boolean)) {
    const p = pathOf(part)
    if (p && (part.includes("://") || part.length > 1)) { path = p; continue }
    if (METHODS.has(part.toLowerCase())) { all.push({ kind: "method", value: part.toUpperCase() }); continue }
    words.push(part.toLowerCase())
  }
  return { tokens: all, words, path }
}

const PARAM = /^(\{.*\}|:.+|<.+>|\[.+\]|%.+%)$/

/**
 * How well a concrete path fits a route's template: 0 for no fit, more for
 * each literal segment that matches. `/orders/42` fits `/orders/{id}`;
 * a template's `**` or `{*rest}` takes the rest.
 */
export function pathFit(template: string, path: string): number {
  const t = template.split("/").filter(Boolean)
  const p = decodeURIComponent(path).split("/").filter(Boolean)
  let score = 1
  for (let i = 0; i < t.length; i++) {
    const seg = t[i]
    if (/^(\*\*|\{\*.*\}|\{\.\.\..*\}|\[\.\.\..*\])$/.test(seg)) return score
    if (i >= p.length) return 0
    if (PARAM.test(seg) || seg === "*") continue
    if (seg.toLowerCase() !== p[i].toLowerCase()) return 0
    score += 2
  }
  return t.length === p.length ? score : 0
}

/** The fit with up to three leading segments dropped: an app mounted under /api/v2 still finds its routes. */
export function mountedFit(template: string, path: string): number {
  const segs = path.split("/").filter(Boolean)
  // Dropping every segment would let the root route fit any URL.
  for (let drop = 0; drop <= Math.min(3, segs.length - 1); drop++) {
    const fit = pathFit(template, "/" + segs.slice(drop).join("/"))
    if (fit) return Math.max(1, fit - drop)
  }
  return 0
}

/** Does an endpoint pass a query, and how well (for ordering); 0 is no. */
export function score(e: Endpoint, hay: string, q: Query): number {
  let s = 1
  for (const tk of q.tokens) {
    // A route that takes any method is found by ANY, not by each method it would also take.
    if (tk.kind === "method" && !e.methods.includes(tk.value)) return 0
    if (tk.kind === "table" && !(e.changes.includes(tk.value) || e.mayChange.includes(tk.value) || e.reads.includes(tk.value))) return 0
    if (tk.kind === "system" && !e.calls.includes(tk.value)) return 0
    if (tk.kind === "class" && e.route.unit !== tk.value) return 0
    if (tk.kind === "access" && (e.accessText ?? "") !== tk.value) return 0
  }
  if (q.path) {
    // A concrete path fits the template; a typed piece of path is found in it.
    const fit = mountedFit(e.route.path, q.path)
    const piece = e.route.path.toLowerCase().includes(q.path.toLowerCase())
    if (!fit && !piece) return 0
    s += fit ? fit * 10 : 5
  }
  for (const w of q.words) {
    const at = hay.indexOf(w)
    if (at < 0) return 0
    // A word in the path counts for more than one in a table name.
    if (e.route.path.toLowerCase().includes(w)) s += 3
  }
  return s
}

export interface Suggestion { token: Token; label: string; count: number; group?: string; title?: string }

/**
 * What the word being typed could mean, among the endpoints still in play:
 * a table, a system, a class, an access rule. Most endpoints first.
 */
export function suggest(endpoints: Endpoint[], word: string, limit = 8): Suggestion[] {
  const w = word.trim().toLowerCase()
  if (w.length < 2) return []
  const counts = new Map<string, Suggestion>()
  const add = (kind: TokenKind, value: string, label: string) => {
    if (!value.toLowerCase().includes(w)) return
    const k = `${kind}\u0000${value}`
    const s = counts.get(k) ?? { token: { kind, value }, label, count: 0 }
    s.count++
    counts.set(k, s)
  }
  for (const e of endpoints) {
    for (const t of new Set([...e.changes, ...e.mayChange, ...e.reads])) add("table", t, t)
    for (const c of e.calls) add("system", c, c)
    if (e.route.unit) add("class", e.route.unit, e.route.unit.slice(e.route.unit.lastIndexOf(".") + 1))
    if (e.accessText) add("access", e.accessText, e.accessText)
  }
  // Two classes with one short name are told apart by the namespace part before it.
  const classes = [...counts.values()].filter(s => s.token.kind === "class")
  for (const s of classes) {
    if (classes.filter(o => o.label === s.label).length < 2) continue
    const parts = s.token.value.split(/[.\\/]/)
    s.label = parts.slice(-3).join(".")
  }
  const exact = (s: Suggestion) => Number(s.label.toLowerCase() === w) * 2 + Number(s.label.toLowerCase().startsWith(w))
  return [...counts.values()].sort((a, b) => exact(b) - exact(a) || b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit)
}

/** Where words occur in a text, merged, for drawing matches. */
export function marks(text: string, words: string[]): Array<{ text: string; hit: boolean }> {
  if (!words.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const hit = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    if (!w) continue
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) for (let k = i; k < i + w.length; k++) hit[k] = true
  }
  const out: Array<{ text: string; hit: boolean }> = []
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === hit[i]) last.text += text[i]
    else out.push({ text: text[i], hit: hit[i] })
  }
  return out
}
