// What a file's code points at, read from the snapshot instead of a
// compiler. The engine already knows, per file, which types it references
// (unit_connections), which functions each line calls (calls), what it
// declares (units, functions), and which lines are routes, outbound calls,
// data access and configuration. This turns those rows into an index the
// source view reads per identifier: a type name anywhere in the file links
// to its unit, a method name on a call line links to the function that line
// calls, and a declaration links to its usages. Nothing here guesses beyond
// those rows: an identifier the engine did not resolve stays plain text.

export type TargetKind = "unit" | "function"

export interface SymbolTarget {
    /** Unique per target: `unit:<id>` or `fn:<unit>#<function>`. */
    key: string
    kind: TargetKind
    /** The unit's simple name, or the function as the engine names it (`Type.method`). */
    name: string
    unit: string
    fn: string | null
    unitKind: string | null
    file: string | null
    line: number | null
    /** The last line of a function's body, when known. */
    end: number | null
    component: string | null
    module: string | null
    signature: string | null
    usedBy: number | null
    /** How the call reached it: field, static, self, implementation. */
    via: string | null
    /** Implementations the same call site resolves to (`via = implementation`). */
    alternatives: SymbolTarget[]
}

export interface Declaration {
    target: SymbolTarget
    /** The identifier on the line that names it. */
    ident: string
    /** Call sites that reach it (functions), or the units that use it (types). */
    usages: number
    implementations: number
}

export type MarkKind = "entry" | "outbound" | "data" | "config" | "binding" | "flag" | "unresolved"

export interface LineMark {
    kind: MarkKind
    line: number
    /** Kind-specific facts, read by the view to word the mark. */
    data: Record<string, string | number | null>
}

export interface CodeIntel {
    file: string
    component: string | null
    module: string | null
    /** Type names that mean the same unit anywhere in the file. */
    types: Map<string, SymbolTarget>
    /** Per line, the call target of each method name called on it. */
    sites: Map<number, Map<string, SymbolTarget>>
    /** Per line, what is declared there. */
    declarations: Map<number, Declaration>
    marks: Map<number, LineMark[]>
    /** Every target by key, for the view's hover and click. */
    targets: Map<string, SymbolTarget>
}

// ── Rows, as the queries in useCodeIntel return them ──────────────
export interface UnitRow {
    id: string
    name: string
    kind: string | null
    file: string | null
    line: number | null
    signature: string | null
    component: string | null
    module: string | null
    used_by: number | null
}
export interface FunctionRow { name: string; begin: number; end: number; signature: string | null; usages: number | null }
export interface CallRow {
    line: number
    to_unit: string
    to_function: string
    via: string | null
    file: string | null
    def_line: number | null
    def_end: number | null
    unit_line: number | null
    component: string | null
    module: string | null
    signature: string | null
    unit_kind: string | null
}
export interface IntelFacts {
    file: string
    component: string | null
    module: string | null
    lines: string[]
    ownUnits: UnitRow[]
    ownFunctions: FunctionRow[]
    referenced: UnitRow[]
    calls: CallRow[]
    /** Implementations per unit declared in this file. */
    implementations: Array<{ unit: string; n: number }>
    marks: LineMark[]
}

export function unitKey(id: string): string { return `unit:${id}` }
export function functionKey(unit: string, fn: string): string { return `fn:${unit}#${fn}` }

/** The last segment of a dotted, slashed or `#` name: `a.b.Cart` → `Cart`, `Cart.total` → `total`. */
export function simpleName(name: string): string {
    const i = Math.max(name.lastIndexOf("."), name.lastIndexOf("/"), name.lastIndexOf("#"), name.lastIndexOf("::"))
    return i === -1 ? name : name.slice(i + (name.startsWith("::", i) ? 2 : 1))
}

const IDENT = /^[A-Za-z_$][\w$]*$/

function unitTarget(u: UnitRow): SymbolTarget {
    return {
        key: unitKey(u.id), kind: "unit", name: u.name || simpleName(u.id), unit: u.id, fn: null, unitKind: u.kind,
        file: u.file || null, line: u.line || null, end: null, component: u.component, module: u.module, signature: u.signature,
        usedBy: u.used_by, via: null, alternatives: [],
    }
}

function callTarget(c: CallRow): SymbolTarget {
    return {
        key: functionKey(c.to_unit, c.to_function), kind: "function", name: c.to_function, unit: c.to_unit, fn: c.to_function,
        unitKind: c.unit_kind, file: c.file, line: c.def_line ?? c.unit_line ?? null, end: c.def_line ? c.def_end : null, component: c.component, module: c.module,
        signature: c.signature, usedBy: null, via: c.via, alternatives: [],
    }
}

function hasWord(text: string, word: string): boolean {
    let i = text.indexOf(word)
    while (i !== -1) {
        const before = i === 0 ? "" : text[i - 1]
        const after = text[i + word.length] ?? ""
        if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) return true
        i = text.indexOf(word, i + 1)
    }
    return false
}

/**
 * The line a declaration is named on. A node starts at its annotations and
 * doc comment, so the first line from there that holds the name is the one
 * a reader would click.
 */
export function namingLine(lines: string[], from: number, ident: string, reach = 30): number | null {
    for (let line = Math.max(1, from); line <= Math.min(lines.length, from + reach); line++) {
        if (hasWord(lines[line - 1] ?? "", ident)) return line
    }
    return null
}

export function buildIntel(f: IntelFacts): CodeIntel {
    const targets = new Map<string, SymbolTarget>()
    const keep = (t: SymbolTarget): SymbolTarget => {
        const had = targets.get(t.key)
        if (had) return had
        targets.set(t.key, t)
        return t
    }

    // Type names. A name two different units share in this file's
    // references is left plain rather than linked to the wrong one.
    const types = new Map<string, SymbolTarget>()
    const ambiguous = new Set<string>()
    for (const u of [...f.ownUnits, ...f.referenced]) {
        const ident = u.name || simpleName(u.id)
        if (!IDENT.test(ident) || ident.length < 2) continue
        const had = types.get(ident)
        if (had && had.unit !== u.id) { ambiguous.add(ident); continue }
        if (!had) types.set(ident, keep(unitTarget(u)))
    }
    for (const a of ambiguous) types.delete(a)

    // Call sites: the method name on the line links to what it calls. The
    // engine records an interface call twice, once to the interface and
    // once per implementation; the first is the link, the rest are offered.
    const sites = new Map<number, Map<string, SymbolTarget>>()
    for (const c of f.calls) {
        const ident = simpleName(c.to_function)
        if (!IDENT.test(ident) || !hasWord(f.lines[c.line - 1] ?? "", ident)) continue
        let at = sites.get(c.line)
        if (!at) sites.set(c.line, (at = new Map()))
        const t = keep(callTarget(c))
        const had = at.get(ident)
        if (!had) at.set(ident, t)
        else if (c.via === "implementation" && had.via !== "implementation") {
            if (!had.alternatives.some(a => a.key === t.key)) had.alternatives.push(t)
        } else if (had.via === "implementation" && c.via !== "implementation") {
            // The interface call arrived after one of its implementations.
            t.alternatives.push(had, ...had.alternatives.filter(a => a.key !== t.key))
            had.alternatives = []
            at.set(ident, t)
        }
    }

    // Declarations, on the line that names them.
    const declarations = new Map<number, Declaration>()
    const impls = new Map(f.implementations.map(r => [r.unit, r.n]))
    for (const u of f.ownUnits) {
        const ident = u.name || simpleName(u.id)
        if (!u.line || !IDENT.test(ident)) continue
        const line = namingLine(f.lines, u.line, ident)
        if (line === null || declarations.has(line)) continue
        const t = types.get(ident) ?? keep(unitTarget(u))
        declarations.set(line, { target: t, ident, usages: u.used_by ?? 0, implementations: impls.get(u.id) ?? 0 })
    }
    const ownerOf = (fn: string): UnitRow | null => {
        const owner = fn.includes(".") ? fn.slice(0, fn.lastIndexOf(".")) : ""
        return f.ownUnits.find(u => u.id.endsWith(owner) && (u.name || simpleName(u.id)) === simpleName(owner)) ?? f.ownUnits[0] ?? null
    }
    for (const fn of f.ownFunctions) {
        const ident = simpleName(fn.name)
        if (!IDENT.test(ident)) continue
        const line = namingLine(f.lines, fn.begin, ident, Math.min(30, fn.end - fn.begin))
        if (line === null || declarations.has(line)) continue
        const owner = ownerOf(fn.name)
        if (!owner) continue
        const t = keep({
            key: functionKey(owner.id, fn.name), kind: "function", name: fn.name, unit: owner.id, fn: fn.name, unitKind: owner.kind,
            file: f.file, line, end: fn.end, component: f.component, module: f.module, signature: fn.signature, usedBy: fn.usages, via: null, alternatives: [],
        })
        declarations.set(line, { target: t, ident, usages: fn.usages ?? 0, implementations: 0 })
    }

    const marks = new Map<number, LineMark[]>()
    for (const m of f.marks) {
        if (!m.line || m.line < 1) continue
        const at = marks.get(m.line)
        if (at) at.push(m)
        else marks.set(m.line, [m])
    }

    return { file: f.file, component: f.component, module: f.module, types, sites, declarations, marks, targets }
}

/** What an identifier on a line means, if the snapshot says. */
export function resolveAt(intel: CodeIntel, line: number, ident: string): { target: SymbolTarget; declaration: boolean } | null {
    const site = intel.sites.get(line)?.get(ident)
    if (site) return { target: site, declaration: false }
    const decl = intel.declarations.get(line)
    if (decl && decl.ident === ident) return { target: decl.target, declaration: true }
    const type = intel.types.get(ident)
    if (type) return { target: type, declaration: false }
    return null
}

// ── Boundaries ────────────────────────────────────────────────────
export type Boundary = "same" | "component" | "module" | "forbidden"

/**
 * How far a reference reaches: within the file's own component, into
 * another component of the same module, or into another module. A lens
 * declaration that forbids the pair outranks all three.
 */
export function boundaryOf(intel: CodeIntel, t: SymbolTarget, forbidden?: (toFile: string) => string | null): Boundary {
    if (forbidden && t.file && t.file !== intel.file && forbidden(t.file)) return "forbidden"
    if (!t.component || !intel.component || t.component === intel.component) return "same"
    if (t.module && intel.module && t.module !== intel.module) return "module"
    return "component"
}

// ── Linking the highlighted HTML ──────────────────────────────────
// Text inside these spans is prose or data, not code that names a symbol.
const SKIP = /hljs-(comment|string|quote|doctag|regexp|number|subst)\b/
const TOKEN = /&[#\w]+;|[A-Za-z_$][\w$]*/g

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/**
 * One balanced line of highlighted HTML with every identifier the snapshot
 * resolves wrapped in a `.ref` span that carries its target's key.
 */
export function linkLine(html: string, line: number, intel: CodeIntel, forbidden?: (toFile: string) => string | null): string {
    if (!html) return html
    let out = ""
    const open: boolean[] = []
    let skipping = 0
    let at = 0
    const text = (chunk: string) => {
        if (skipping || !chunk) { out += chunk; return }
        out += chunk.replace(TOKEN, (tok) => {
            if (tok.startsWith("&")) return tok
            const hit = resolveAt(intel, line, tok)
            if (!hit) return tok
            const b = boundaryOf(intel, hit.target, forbidden)
            const cls = `ref ref-${b}${hit.declaration ? " ref-decl" : ""}${hit.target.kind === "function" ? " ref-fn" : ""}`
            return `<span class="${cls}" data-ref="${escapeAttr(hit.target.key)}"${hit.declaration ? " data-decl=\"1\"" : ""}>${tok}</span>`
        })
    }
    for (const m of html.matchAll(/<\/?span[^>]*>/g)) {
        text(html.slice(at, m.index))
        if (m[0].startsWith("</")) {
            if (open.pop()) skipping--
        } else {
            const skip = SKIP.test(m[0])
            open.push(skip)
            if (skip) skipping++
        }
        out += m[0]
        at = m.index! + m[0].length
    }
    text(html.slice(at))
    return out
}
