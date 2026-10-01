// Moves the text a person reads out of the code and into
// src/locales/en/<namespace>.json, replacing it with t("<key>") calls.
//
//   node scripts/i18n-extract.mjs plan  <namespace> <files...>  > plan.tsv
//   node scripts/i18n-extract.mjs apply <namespace> plan.tsv
//
// `plan` lists every candidate as a tab-separated line: id, file:line, key,
// message. Delete the lines that are not text for people (ids, CSS, values
// compared elsewhere) and edit a key if it reads badly; `apply` then changes
// exactly the lines left. Text the script cannot turn into one message (a
// sentence split by markup, a plural built in code) is listed after a
// `# manual` line for hand work, and never applied.
//
//   node scripts/i18n-extract.mjs check
//
// fails when any text for people is left in the code outside a message and
// outside src/locales/keep-english.json (npm run i18n:check).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import MagicString from "magic-string"
import { parse as parseSfc } from "@vue/compiler-sfc"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(ROOT, "src")

// ── What counts as text for people ─────────────────────────────────────────

const PROSE_ATTRS = new Set(["figure", "title", "placeholder", "aria-label", "alt", "label", "hint", "heading", "subtitle", "description", "caption", "tooltip", "empty", "empty-text", "confirm-label", "cancel-label", "action-label", "summary", "text", "message", "legend", "lede", "note", "help", "prompt", "question", "detail", "blurb", "eyebrow", "kicker", "unit-label", "aria-description", "aria-roledescription", "aria-valuetext"])
const PROSE_PROPS = new Set([...PROSE_ATTRS, "name", "why", "short", "long", "audience", "when", "describe", "explain", "emptyText", "confirmLabel", "cancelLabel", "actionLabel", "tip", "reason", "intro", "cta", "headline", "body", "lead", "ariaLabel", "plural", "singular", "noun", "what", "meaning", "read", "reading", "question", "answer", "caveat", "unitLabel"])
const KEY_PROPS = new Set(["id", "take", "where", "sqlWhere", "filterSql", "entity-key", "entityKey", "verdict", "header", "section", "group", "key", "kind", "type", "to", "href", "path", "route", "icon", "class", "cls", "style", "color", "tone", "variant", "mode", "sql", "query", "column", "col", "field", "sort", "order", "format", "slot", "ref", "lang", "ext", "extension", "scheme", "event", "shortcut", "keys", "accelerator", "testid", "dataKey", "accessor", "font", "align", "anchor", "cursor", "fill", "stroke", "d", "transform", "role", "value", "intent", "tool", "direction", "insert", "kindOf", "verdictOf", "table", "source", "target", "from", "file", "dir", "glob", "pattern", "regex", "match", "selector", "storageKey", "name_", "also", "metric", "stat", "prop", "param", "kindOf", "grain", "level", "status", "state", "provider", "model", "url", "endpoint", "mime", "accept", "unit", "symbol"])
const DENY_CALLS = new Set(["enum", "literal", "default", "log", "warn", "error", "info", "debug", "trace", "query", "q", "querySelector", "querySelectorAll", "getElementById", "closest", "addEventListener", "removeEventListener", "emit", "$emit", "defineEmits", "require", "RegExp", "Symbol", "replace", "navigateTo", "t", "has", "getItem", "setItem", "removeItem", "startsWith", "endsWith", "includes", "split", "match", "matchAll", "test", "indexOf", "lastIndexOf", "join", "add", "remove", "toggle", "contains", "setAttribute", "getAttribute", "removeAttribute", "getPropertyValue", "setProperty", "fetch", "attr", "style", "classed", "select", "selectAll", "append", "insert", "on", "call", "sqlLiteral", "sqlIn", "sqlLikeLiteral", "lit", "defineStore", "createElement", "createElementNS", "postMessage", "invoke", "provide", "inject", "localeCompare", "padStart", "padEnd", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "measureText", "font", "useRoute", "watch", "mark", "measure", "command", "register", "fold", "SQL", "exec", "run", "prepare", "all", "get", "set", "delete", "isPinned", "column", "col", "sortBy", "orderBy", "keyBy", "pick", "omit"])
// Calls whose first argument is a key and the rest may be text.
const KEY_FIRST_CALLS = new Set(["set", "get", "has", "setItem", "attr", "style", "on", "classed", "register", "command", "provide", "emit", "$emit"])
const TAILWIND_WORDS = new Set(["flex", "grid", "hidden", "block", "inline", "contents", "truncate", "italic", "underline", "uppercase", "lowercase", "capitalize", "relative", "absolute", "fixed", "sticky", "static", "grow", "shrink", "border", "rounded", "shadow", "outline", "ring", "transition", "invisible", "visible", "tabular-nums", "font-mono", "antialiased", "hairline", "isolate", "container", "group", "peer", "sr-only", "table", "collapse", "resize", "select-none", "pointer-events-none"])
const SQL = /\bIN \(|\bselect\b[\s\S]*\bfrom\b|\b(AS|NULL|LIKE|IS NOT|SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE FROM|CREATE|PRAGMA|ORDER BY|GROUP BY|COALESCE|HAVING|UNION|LIMIT|DISTINCT|CASE WHEN|NULLIF)\b/

function looksLikeIdentifierList(s) {
    const tokens = s.trim().split(/\s+/)
    return tokens.every(tok => TAILWIND_WORDS.has(tok) || /^[!-]?[a-z0-9]+([-:/[\].][a-z0-9\]%#()_.,-]*)+$/.test(tok) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(tok) || /\w__\w/.test(tok) || /^[.#]?[a-z][\w-]*$/.test(tok) && tokens.length > 1 && tokens.every(x => /^[a-z0-9-]+$/.test(x) && /-/.test(x)))
}

/** Whether a string's content reads as text for a person. `strong`: the context says it is text. */

/**
 * Whether a string's content reads as text for a person. `strong`: the
 * context says it is text (a text node, a label prop, a toast); otherwise a
 * single word must look like a label to count.
 */
function isProse(raw, strong) {
    const s = raw.trim()
    if (!/[A-Za-zÀ-ɏ]{2,}/.test(s)) return false
    if (SQL.test(s)) return false
    if (/^(https?:|mailto:|file:|data:|#\/|\/|~\/|\.\/|\.\.\/|@\/)/.test(s)) return false
    if (/=>|\bfunction\b|\$\{|^\{|^\[|<\/?[a-z]|="/.test(s)) return false
    if (/^[a-z-]+\(/.test(s) || /^\(\s*[a-z-]+\s*:/.test(s)) return false // url(), translate(), media queries
    if (/^[\w.-]+\/[\w.+-]+$/.test(s) || !/\s/.test(s) && /[/*]/.test(s)) return false // mime types, paths, globs
    if (/\d(px|rem|em|pt)\b/.test(s)) return false // CSS values
    if (/\w+ (=|<>|!=) '/.test(s)) return false // SQL comparisons
    if (s.split(/\s+/).every(w => /[/*]/.test(w))) return false // lists of globs
    if (/^[a-z_]+:\S/.test(s)) return false // ids like edge:a>b
    if (/^(Cmd|Ctrl|Alt|Shift|Meta|Mod|CmdOrCtrl|CommandOrControl)\+/i.test(s)) return false
    if (/^\d+(px|pt|em|rem|%|ms|s)\b/.test(s) || /\b\d+px\b.*\b(sans|serif|mono|Inter)\b/i.test(s)) return false
    if (/__/.test(s) && !/\s/.test(s)) return false
    if (!strong && /^[A-Z0-9_]+$/.test(s)) return false
    if (looksLikeIdentifierList(s)) return false
    const tokens = s.split(/\s+/)
    // A long run of bare names (a standard library's modules) is data; a sentence has little words in it.
    if (tokens.length >= 12 && tokens.every(w => /^[a-z0-9_-]+$/.test(w)) && tokens.filter(w => ["the", "a", "an", "of", "to", "and", "or", "is", "are", "with", "from", "for", "in", "on"].includes(w)).length < 2) return false
    const words = s.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w))
    if (strong) return words.length > 0
    if (words.length >= 2) return /[a-z]{2,}/.test(s) || /^[A-Z][a-z]/.test(s)
    return /^[A-Z][a-z]+(['’][a-z]+)?[.…:?!]?$/.test(s) || /…$/.test(s)
}

// ── Keys ───────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "and", "or", "for", "is", "are", "it", "its", "this", "that", "with", "by", "at", "be", "as", "from", "into"])
function camel(words) {
    return words.filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("")
}
function wordsOf(text) {
    return text.replace(/\{\w+\}/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean)
}
function slug(text) {
    const words = wordsOf(text)
    const strong = words.filter(w => !STOP.has(w))
    const k = camel((strong.length ? strong : words).slice(0, 4))
    return /^[a-z]/.test(k) ? k : `text${k ? k[0].toUpperCase() + k.slice(1) : ""}`
}
const nounKey = one => camel(wordsOf(one)) || "item"
function areaOf(file) {
    const rel = relative(SRC, file).replace(/\\/g, "/")
    let stem = basename(rel).replace(/\.(vue|ts)$/, "").replace(/\.(store)$/, "Store")
    if (rel.startsWith("pages/") || rel.startsWith("layouts/")) {
        const parts = rel.replace(/\.vue$/, "").split("/").slice(1).filter(p => p !== "views" && !/^\[.*\]$/.test(p))
        stem = parts.length ? parts.join("-") : "index"
        if (rel.startsWith("layouts/")) stem = `layout-${stem}`
    }
    const words = stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toLowerCase())
    return camel(words) || "root"
}

// ── Expressions ────────────────────────────────────────────────────────────

const unwrap = n => { while (n && (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n))) n = n.expression; return n }
const strOf = n => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null)
const WRAPPERS = new Set(["n", "num", "formatNumber", "formatReading", "formatSigned", "fmt", "b", "bold", "code", "q", "String", "Number", "round", "abs", "pct", "formatDays", "shortHash", "label", "esc", "md"])

/** `plural(k, "file"[, "files"])`: the count and the noun's two forms. */
function pluralCall(node) {
    node = unwrap(node)
    if (!node || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !["plural", "count", "s", "n", "noun", "pl"].includes(node.expression.text)) return null
    const [count, a, b] = node.arguments
    const one = strOf(a)
    if (!count || one === null) return null
    const many = b ? strOf(b) : `${one}s`
    return many === null ? null : { count, one, many }
}

/** `k === 1 ? "file" : "files"`, either way round: the count and the two forms. */
function ternaryNoun(node) {
    node = unwrap(node)
    if (!node || !ts.isConditionalExpression(node)) return null
    const cond = unwrap(node.condition)
    if (!ts.isBinaryExpression(cond)) return null
    const op = cond.operatorToken.kind
    const isOne = x => ts.isNumericLiteral(unwrap(x)) && unwrap(x).text === "1"
    const count = isOne(cond.right) ? cond.left : isOne(cond.left) ? cond.right : null
    const a = strOf(unwrap(node.whenTrue)), b = strOf(unwrap(node.whenFalse))
    if (!count || a === null || b === null) return null
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) return { count, one: a, many: b }
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) return { count, one: b, many: a }
    return null
}

/** Whether two words are a noun's singular and plural ("file", "files"; "is", "are"). */
function pluralPair(one, many) {
    const IRREGULAR = { is: "are", has: "have", it: "them", its: "their", this: "these", that: "those", was: "were" }
    if (IRREGULAR[one] === many) return true
    const [o, m] = [one.split(" "), many.split(" ")]
    if (o.length !== m.length || o.slice(0, -1).join(" ") !== m.slice(0, -1).join(" ")) return false
    const a = o[o.length - 1], b = m[m.length - 1]
    return b === `${a}s` || b === `${a}es` || (a.endsWith("y") && b === `${a.slice(0, -1)}ies`)
}

/** The bare number an expression shows: `n(x)` and `x.toLocaleString()` show x. */
function bareText(node) {
    node = unwrap(node)
    if (ts.isCallExpression(node)) {
        const c = node.expression
        if (ts.isIdentifier(c) && WRAPPERS.has(c.text) && node.arguments[0]) return bareText(node.arguments[0])
        if (ts.isPropertyAccessExpression(c) && c.name.text === "toLocaleString") return bareText(c.expression)
    }
    return node.getText().replace(/\s+/g, "").replace(/\.value\b/g, "")
}

function nameOf(node) {
    node = unwrap(node)
    if (!node) return "value"
    const p = pluralCall(node)
    if (p) return nounKey(p.many)
    if (ts.isCallExpression(node)) {
        const c = node.expression
        const callee = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : ""
        // t("common.count.commit", ...) inside a sentence is named for what it says: {commit}.
        if (callee === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) return node.arguments[0].text.split(".").pop().replace(/\d+$/, "")
        if (ts.isPropertyAccessExpression(c) && ["join", "toFixed", "toLocaleString", "toLocaleDateString", "trim", "toLowerCase", "toUpperCase", "slice"].includes(callee)) return nameOf(c.expression)
        if (node.arguments.length >= 1 && (WRAPPERS.has(callee) || node.arguments.length === 1)) return nameOf(node.arguments[0])
        return callee || "value"
    }
    if (ts.isIdentifier(node)) return node.text
    if (ts.isPropertyAccessExpression(node)) {
        const parts = node.getText().replace(/\?\./g, ".").replace(/\s+/g, "").split(".").filter(x => /^[A-Za-z_$][\w$]*$/.test(x))
        const noise = new Set(["props", "store", "data", "value", "state", "ctx", "f", "p", "s", "r", "row", "d", "it", "x", "e", "o", "c", "m", "a", "w", "this"])
        const kept = parts.filter(x => !noise.has(x))
        if (!kept.length) return parts[parts.length - 1] ?? "value"
        const last = kept[kept.length - 1]
        if (kept.length >= 2 && ["length", "size", "name", "count", "label", "title", "total", "id"].includes(last)) return camel([kept[kept.length - 2], last])
        return last
    }
    return "value"
}

function uniqueNames(names) {
    const used = new Map()
    return names.map(base => {
        const k = used.get(base) ?? 0
        used.set(base, k + 1)
        return k ? `${base}${k + 1}` : base
    })
}

/**
 * Folds "{k} file{k === 1 ? "" : "s"}" and "{n(k)} {k === 1 ? "cycle" : "cycles"}"
 * into one counted part, rendered with a common.count message; a noun whose
 * number sits elsewhere becomes a common.noun part. Returns null when a
 * plural it cannot read is left in the pieces.
 */
function mergeCounts(ps) {
    const out = [...ps]
    for (let i = 0; i < out.length; i++) {
        const p = out[i]
        if (!p.node) continue
        const tn = ternaryNoun(p.node)
        if (!tn) continue
        let one = tn.one, many = tn.many
        const prev = out[i - 1]
        if (one === "" && /^(s|es)$/.test(many)) {
            const m = prev && "text" in prev ? /([A-Za-z]+)$/.exec(prev.text) : null
            if (!m) return null
            one = m[1]; many = m[1] + tn.many
            prev.text = prev.text.slice(0, -m[1].length)
        }
        const before = out[i - 2]
        const part = { node: tn.count, start: tn.count.__abs.start, end: tn.count.__abs.end, one, many }
        if (prev && "text" in prev && prev.text === " " && before?.node && bareText(before.node) === bareText(tn.count)) {
            out.splice(i - 2, 3, { ...part, kind: "count" })
            i -= 2
        } else {
            out.splice(i, 1, { ...part, kind: "noun" })
        }
    }
    // Neighbouring text pieces left by a fold join up again.
    for (let i = out.length - 1; i > 0; i--) if ("text" in out[i] && "text" in out[i - 1]) { out[i - 1].text += out[i].text; out.splice(i, 1) }
    return out
}

// ── Collecting candidates from TypeScript ──────────────────────────────────

/** Absolute offsets on every node of a parsed snippet, for ranges and nesting. */
function parseAt(code, offset) {
    const sf = ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const mark = n => { n.__abs = { start: offset + n.getStart(sf), end: offset + n.getEnd() }; ts.forEachChild(n, mark) }
    mark(sf)
    return sf
}

function scanTs(code, offset, inTemplate, out, manual, fileLabel, lineOf) {
    const sf = parseAt(code, offset)
    const isStringish = n => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)
    const isConcat = n => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && (isStringish(unwrap(n.left)) || isStringish(unwrap(n.right)) || isConcat(unwrap(n.left)))

    function context(node) {
        let p = node.parent, child = node
        while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isConditionalExpression(p) && child !== p.condition || ts.isBinaryExpression(p) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind))) { child = p; p = p.parent }
        if (!p) return { strong: false }
        // A string chosen inside a sentence is part of that sentence's text.
        const host = ts.isTemplateSpan(p) ? p.parent : ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.PlusToken && (isStringish(unwrap(p.left)) || isStringish(unwrap(p.right))) ? p : null
        if (host) {
            let top = host
            while (top.parent && (isConcat(top.parent) || ts.isParenthesizedExpression(top.parent))) top = top.parent
            const text = pieces(top).filter(x => "text" in x).map(x => x.text).join("")
            return { strong: isProse(text, false) }
        }
        const sibling = node.parent && ts.isConditionalExpression(node.parent) ? (node.parent.whenTrue === node ? node.parent.whenFalse : node.parent.whenFalse === node ? node.parent.whenTrue : null) : null
        const siblingProse = sibling && isStringish(unwrap(sibling)) && isProse(pieces(sibling).filter(x => "text" in x).map(x => x.text).join(""), false)
        if (ts.isArrayLiteralExpression(p)) {
            // A list of single words is a list of names to match; a list under a text prop is text.
            const owner = p.parent && ts.isPropertyAssignment(p.parent) ? p.parent.name.getText(sf).replace(/^["']|["']$/g, "") : ""
            const call = p.parent && ts.isCallExpression(p.parent) ? p.parent.expression : null
            const callee = call ? (ts.isIdentifier(call) ? call.text : ts.isPropertyAccessExpression(call) ? call.name.text : "") : ""
            if (DENY_CALLS.has(callee)) return { deny: true }
            if (KEY_PROPS.has(owner) || /suffix|prefix|annotation|import|keyword|pattern|marker|name|ext|glob|tag|word|alias|synonym|stop/i.test(owner) && !PROSE_PROPS.has(owner)) return { deny: true }
            return { strong: PROSE_PROPS.has(owner) || ["notes", "lines", "bullets", "steps", "examples", "paragraphs", "caveats", "tips"].includes(owner), multiword: true }
        }
        if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p) || ts.isImportTypeNode?.(p)) return { deny: true }
        if (ts.isPropertyAssignment(p) && p.name === child) return { deny: true }
        if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return { deny: true }
        if (ts.isCaseClause(p)) return { deny: true }
        if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return { deny: true }
        if (ts.isPropertyAssignment(p)) {
            const name = p.name.getText(sf).replace(/^["']|["']$/g, "")
            // The values of a map of names (aliases, synonyms) are names too.
            const owner = p.parent?.parent && ts.isPropertyAssignment(p.parent.parent) ? p.parent.parent.name.getText(sf) : ""
            if (/^(aliases|synonyms|renames|map|keys|ids|columnsById)$/.test(owner)) return { deny: true }
            if (KEY_PROPS.has(name)) return { deny: true }
            // `name: "count"` names a thing in code; `name: "Spring Boot"` names it for people.
            if (name === "name" && ts.isStringLiteral(node) && /^[a-z_][a-z0-9_]*$/.test(node.text)) return { deny: true }
            return { strong: PROSE_PROPS.has(name) || !!siblingProse, prop: name }
        }
        if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
            const callee = p.expression
            const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ""
            const idx = (p.arguments ?? []).indexOf(child)
            if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "console") return { deny: true }
            if (KEY_FIRST_CALLS.has(name)) return idx === 0 ? { deny: true } : { strong: false }
            if (DENY_CALLS.has(name)) return { deny: true }
            if (["plural", "count", "s", "n", "noun", "pl"].includes(name) && ts.isStringLiteral(p.arguments?.[1] ?? p)) return { deny: true }
            if (/^(confirm|alert|toast|notify|announce|status|fail|absent|prompt|explainSlot|say|note|error|setError|setStatus|flash|Error)$/.test(name)) return { strong: true }
            // A single word passed to some function is more often a name than text.
            return { strong: !!siblingProse, multiword: !inTemplate }
        }
        if (ts.isVariableDeclaration(p)) {
            const name = p.name.getText(sf)
            return { strong: !!siblingProse || /label|title|text|message|hint|empty|caption|heading|summary|why|tip|description|prompt/i.test(name) }
        }
        return { strong: !!siblingProse }
    }

    function pieces(node) {
        node = unwrap(node)
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ text: node.text }]
        if (ts.isTemplateExpression(node)) {
            const ps = [{ text: node.head.text }]
            for (const span of node.templateSpans) { ps.push({ node: span.expression, start: span.expression.__abs.start, end: span.expression.__abs.end }); ps.push({ text: span.literal.text }) }
            return ps
        }
        if (isConcat(node)) return [...pieces(node.left), ...pieces(node.right)]
        return [{ node, start: node.__abs.start, end: node.__abs.end }]
    }

    function visit(node) {
        const pc = pluralCall(node)
        if (pc) {
            out.push({ kind: "count", start: node.__abs.start, end: node.__abs.end, one: pc.one, many: pc.many, parts: [{ start: pc.count.__abs.start, end: pc.count.__abs.end, name: "count" }], inTemplate, where: `${fileLabel}:${lineOf(node.__abs.start)}` })
            visit(pc.count)
            return
        }
        const concat = isConcat(node) && !(node.parent && isConcat(node.parent))
        if ((isStringish(node) && !(node.parent && isConcat(node.parent))) || concat) {
            const raw = pieces(node)
            const text = raw.filter(p => "text" in p).map(p => p.text).join("")
            const ctx = context(node)
            // `${n} files`, `${d} d ago`: a value with a word beside it is text, however short.
            const unitPhrase = ts.isTemplateExpression(unwrap(node)) && raw.some(p => "text" in p && /(^|\s)[A-Za-z][a-z]{2,}[a-z.]*(\s|$)/.test(p.text) && /\s/.test(p.text)) && !/[{}();=<>]|px\b|\b(DESC|ASC|AND|OR|IN|AS)\b/.test(text)
            const strong = ctx.strong || unitPhrase || (inTemplate && /\s/.test(text.trim()))
            if (!ctx.deny && isProse(text, strong) && !(ctx.multiword && !strong && !/\s/.test(text.trim())) && raw.some(p => "text" in p && /[A-Za-z]{2,}/.test(p.text))) {
                const ps = mergeCounts(raw)
                const where = `${fileLabel}:${lineOf(node.__abs.start)}`
                if (!ps) { manual.push(`${where}\tplural built in code: ${node.getText(sf).replace(/\s+/g, " ").slice(0, 150)}`); ts.forEachChild(node, visit); return }
                out.push(textCandidate(ps, node.__abs.start, node.__abs.end, { inTemplate, where, prop: ctx.prop }))
                for (const p of ps) if (p.node) visit(p.node)
                return
            }
        }
        const tn = ternaryNoun(node)
        if (tn && /^[a-z][a-z ]*$/.test(tn.one) && /^[a-z][a-z ]*$/.test(tn.many) && pluralPair(tn.one, tn.many)) {
            // "file" or "files" by a count, on its own: the language's word for that count.
            out.push({ kind: "noun", start: node.__abs.start, end: node.__abs.end, one: tn.one, many: tn.many, parts: [{ start: tn.count.__abs.start, end: tn.count.__abs.end, name: "count" }], inTemplate, where: `${fileLabel}:${lineOf(node.__abs.start)}` })
            visit(tn.count)
            return
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
}

/** A text candidate from merged pieces: its message and its parts. */
function textCandidate(ps, start, end, extra) {
    const exprs = ps.filter(p => !("text" in p))
    const names = uniqueNames(exprs.map(p => (p.kind ? nounKey(p.many) : nameOf(p.node))))
    let i = 0
    const message = ps.map(p => ("text" in p ? p.text : `{${names[i++]}}`)).join("")
    const parts = exprs.map((p, j) => ({ start: p.start, end: p.end, name: names[j], kind: p.kind, one: p.one, many: p.many }))
    return { kind: "text", start, end, message, parts, ...extra }
}

// ── Collecting candidates from a Vue template ─────────────────────────────

const INLINE = new Set(["b", "strong", "em", "i", "code", "kbd", "span", "a", "RouterLink", "NuxtLink", "mark", "small", "sup", "sub", "u", "abbr", "time", "var", "samp"])
const SKIP_TEXT_IN = new Set(["code", "pre", "kbd", "script", "style", "samp"])

function scanVue(src, file, out, manual, lineOf) {
    const { descriptor } = parseSfc(src)
    if (!descriptor.template) return
    const fileLabel = relative(ROOT, file)
    const T = { ELEMENT: 1, TEXT: 2, COMMENT: 3, INTERPOLATION: 5, ATTRIBUTE: 6, DIRECTIVE: 7 }
    const exprAt = exp => {
        const sf = parseAt(`(${exp.content})`, exp.loc.start.offset - 1)
        return unwrap(sf.statements[0]?.expression)
    }
    const scanExpr = exp => { if (exp && exp.content.trim()) scanTs(`(${exp.content})`, exp.loc.start.offset - 1, true, out, manual, fileLabel, lineOf) }

    function walk(node, skipText) {
        if (node.type === T.ELEMENT) {
            for (const p of node.props) {
                const proseAttr = PROSE_ATTRS.has(p.name) || /-(placeholder|label|title|text|hint|empty|caption|tooltip|heading|summary|description|note|prompt)$/.test(p.name)
                if (p.type === T.ATTRIBUTE && p.value && proseAttr && isProse(p.value.content, true)) {
                    out.push({ kind: "text", start: p.loc.start.offset, end: p.loc.end.offset, message: p.value.content.replace(/\s+/g, " ").trim(), parts: [], attr: p.name, inTemplate: true, where: `${fileLabel}:${lineOf(p.loc.start.offset)}` })
                }
                if (p.type === T.DIRECTIVE && p.exp && !["for", "model", "slot"].includes(p.name)) {
                    const arg = p.arg?.content
                    if (p.name === "bind" && arg && KEY_PROPS.has(arg)) continue
                    scanExpr(p.exp)
                }
            }
            const skip = skipText || SKIP_TEXT_IN.has(node.tag)
            const kids = node.children
            const hasProseText = kids.some(k => k.type === T.TEXT && isProse(k.content, true))
            const hasInline = kids.some(k => k.type === T.ELEMENT && INLINE.has(k.tag) && k.children.some(c => c.type === T.TEXT || c.type === T.INTERPOLATION))
            if (!skip && hasProseText && hasInline) {
                const meaningful = kids.filter(k => k.type !== T.COMMENT && !(k.type === T.TEXT && !k.content.trim()))
                const proseTexts = kids.filter(k => k.type === T.TEXT && isProse(k.content, true))
                const hasProse = n => n.type === T.TEXT ? isProse(n.content, true) : (n.children ?? []).some(hasProse)
                // A v-if chain cannot be cut into slots, and a block element is not part of a sentence.
                const chained = kids.some(k => k.type === T.ELEMENT && k.props.some(p => p.type === T.DIRECTIVE && (p.name === "else" || p.name === "else-if")))
                const blocking = chained || kids.some(k => k.type === T.ELEMENT && !INLINE.has(k.tag) && hasProse(k))
                // A label beside its value ("Dependents <b>{{ n }}</b>") is just the label.
                if (!blocking && proseTexts.length === 1 && (meaningful[0] === proseTexts[0] || meaningful[meaningful.length - 1] === proseTexts[0])) {
                    const k = proseTexts[0]
                    const raw = k.content
                    const lead = raw.match(/^\s*/)[0].length, trail = raw.match(/\s*$/)[0].length
                    out.push({ kind: "text", start: k.loc.start.offset + lead, end: k.loc.end.offset - trail, message: raw.replace(/\s+/g, " ").trim(), parts: [], mustache: true, inTemplate: true, where: `${fileLabel}:${lineOf(k.loc.start.offset)}` })
                    for (const c of kids) if (c.type === T.INTERPOLATION) scanExpr(c.content)
                    for (const c of kids) if (c.type === T.ELEMENT) walk(c, skip)
                    return
                }
                if (blocking) {
                    const text = src.slice(node.loc.start.offset, node.loc.end.offset).replace(/\s+/g, " ")
                    manual.push(`${fileLabel}:${lineOf(node.loc.start.offset)}\tsentence split by markup: ${text.slice(0, 160)}`)
                    // Its own words wait for hand work; what sits inside it is still read.
                    for (const c of kids) if (c.type === T.INTERPOLATION) scanExpr(c.content)
                    for (const c of kids) if (c.type === T.ELEMENT) walk(c, skip)
                    return
                }
                // A sentence with markup in it: one message, the markup in named slots.
                const first = meaningful[0], last = meaningful[meaningful.length - 1]
                const slotKids = meaningful.filter(k => k.type !== T.TEXT)
                const slotName = k => {
                    if (k.type === T.INTERPOLATION) return nameOf(exprAt(k.content))
                    const ints = (k.children ?? []).filter(c => c.type === T.INTERPOLATION)
                    if (ints.length === 1) return nameOf(exprAt(ints[0].content))
                    if (!(k.children ?? []).some(hasProse)) return "icon"
                    return { RouterLink: "link", NuxtLink: "link", a: "link", b: "bold", strong: "bold", em: "em", i: "em", code: "code", kbd: "key" }[k.tag] ?? k.tag.toLowerCase()
                }
                const names = uniqueNames(slotKids.map(slotName))
                let si = 0
                const message = meaningful.map(k => (k.type === T.TEXT ? k.content.replace(/\s+/g, " ") : `{${names[si++]}}`)).join("").replace(/\s+/g, " ").trim()
                const parts = slotKids.map((k, i) => ({ start: k.loc.start.offset, end: k.loc.end.offset, name: names[i] }))
                out.push({ kind: "markup", start: first.loc.start.offset + (first.type === T.TEXT ? first.content.match(/^\s*/)[0].length : 0), end: last.loc.end.offset - (last.type === T.TEXT ? last.content.match(/\s*$/)[0].length : 0), message, parts, inTemplate: true, where: `${fileLabel}:${lineOf(first.loc.start.offset)}` })
                for (const c of kids) if (c.type === T.INTERPOLATION) scanExpr(c.content)
                for (const c of kids) if (c.type === T.ELEMENT) walk(c, skip)
                return
            }
            let run = []
            const flush = () => {
                if (!skip && run.some(k => k.type === T.TEXT && isProse(k.content, true))) {
                    const first = run[0], last = run[run.length - 1]
                    const raw = src.slice(first.loc.start.offset, last.loc.end.offset)
                    const lead = raw.match(/^\s*/)[0].length, trail = raw.match(/\s*$/)[0].length
                    const ps = run.map(k => (k.type === T.TEXT ? { text: k.content } : (() => { const node = exprAt(k.content); return { node, start: k.content.loc.start.offset, end: k.content.loc.end.offset } })()))
                    // Template text collapses whitespace; so does the message.
                    for (const p of ps) if ("text" in p) p.text = p.text.replace(/\s+/g, " ")
                    if (ps[0] && "text" in ps[0]) ps[0].text = ps[0].text.trimStart()
                    const lastP = ps[ps.length - 1]
                    if (lastP && "text" in lastP) lastP.text = lastP.text.trimEnd()
                    const merged = mergeCounts(ps)
                    const where = `${fileLabel}:${lineOf(first.loc.start.offset)}`
                    if (!merged) manual.push(`${where}\tplural built in code: ${raw.replace(/\s+/g, " ").slice(0, 150)}`)
                    else out.push(textCandidate(merged, first.loc.start.offset + lead, last.loc.end.offset - trail, { mustache: true, inTemplate: true, where }))
                    for (const k of run) if (k.type === T.INTERPOLATION) scanExpr(k.content)
                } else {
                    for (const k of run) if (k.type === T.INTERPOLATION) scanExpr(k.content)
                }
                run = []
            }
            for (const k of kids) {
                if (k.type === T.TEXT || k.type === T.INTERPOLATION) run.push(k)
                else { flush(); if (k.type !== T.COMMENT) walk(k, skip) }
            }
            flush()
        } else if (node.children) {
            for (const k of node.children) walk(k, skipText)
        }
    }
    walk(descriptor.template.ast, false)
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
        if (block) scanTs(block.content, block.loc.start.offset, false, out, manual, fileLabel, lineOf)
    }
}

// ── Plan ───────────────────────────────────────────────────────────────────

function collect(file, given) {
    const src = given ?? readFileSync(file, "utf8")
    const lineStarts = [0]
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1)
    const lineOf = off => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1 } return lo + 1 }
    let out = [], manual = []
    if (file.endsWith(".vue")) scanVue(src, file, out, manual, lineOf)
    else scanTs(src, 0, false, out, manual, relative(ROOT, file), lineOf)
    // One candidate per range; one inside another's text (not its parts) goes with it.
    const seen = new Set()
    out = out.filter(c => { const k = `${c.start}:${c.end}`; if (seen.has(k)) return false; seen.add(k); return true })
    out = out.filter(c => !out.some(o => o !== c && o.start <= c.start && o.end >= c.end && !o.parts.some(p => p.start <= c.start && p.end >= c.end)))
    out.sort((a, b) => a.start - b.start || b.end - a.end)
    return { src, out, manual }
}

function loadMessages(ns) {
    const p = join(SRC, "locales", "en", `${ns}.json`)
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}
}

const countMessage = (one, many) => ({ one: `{count} ${one}`, other: `{count} ${many}` })

function plan(ns, files) {
    const messages = loadMessages(ns)
    const lines = []
    const manualAll = []
    // Two files with one name get their folder in front: exhibitsDeployables.
    const stems = new Map()
    for (const f of files) { const a = areaOf(join(ROOT, f)); stems.set(a, (stems.get(a) ?? 0) + 1) }
    const areaFor = file => {
        const a = areaOf(file)
        if (stems.get(a) === 1 || !/\/(exhibits|components|app|engine|render|intents|tools|knowledge)\//.test(file)) return a
        const dir = basename(dirname(file)).replace(/[^A-Za-z0-9]/g, "") || "root"
        return camel([dir, a[0].toUpperCase() + a.slice(1)])
    }
    const keysByArea = new Map()
    for (const f of files) {
        const file = join(ROOT, f)
        const { out, manual } = collect(file)
        const area = areaFor(file)
        if (!keysByArea.has(area)) keysByArea.set(area, { taken: new Map(Object.entries(messages[area] ?? {}).map(([k, v]) => [typeof v === "string" ? v : JSON.stringify(v), k])), usedKeys: new Set(Object.keys(messages[area] ?? {})) })
        const { taken, usedKeys } = keysByArea.get(area)
        for (const c of out) {
            const id = `${relative(ROOT, file)}@${c.start}`
            if (c.kind === "count") { lines.push([id, c.where, `common.count.${nounKey(c.one)}`, `{count} ${c.one} | {count} ${c.many}`].join("\t")); continue }
            if (c.kind === "noun") { lines.push([id, c.where, `common.noun.${nounKey(c.one)}`, `${c.one} | ${c.many}`].join("\t")); continue }
            let key = taken.get(c.message)
            if (!key) {
                const base = slug(c.message)
                key = base
                for (let i = 2; usedKeys.has(key); i++) key = `${base}${i}`
                usedKeys.add(key)
                taken.set(c.message, key)
            }
            const counted = c.parts.filter(p => p.kind).map(p => ` [${p.name}: common.${p.kind}.${nounKey(p.one)}]`).join("")
            lines.push([id, c.where, `${ns}.${area}.${key}`, c.message.replace(/\t/g, " ").replace(/\n/g, "\\n") + counted].join("\t"))
        }
        manualAll.push(...manual)
    }
    return lines.join("\n") + "\n# manual\n" + manualAll.map(m => `# ${m.replace(/\n/g, " ")}`).join("\n") + "\n"
}

// ── Apply ──────────────────────────────────────────────────────────────────

function setPath(tree, path, value) {
    let node = tree
    for (const p of path.slice(0, -1)) node = node[p] ??= {}
    const last = path[path.length - 1]
    if (node[last] !== undefined && JSON.stringify(node[last]) !== JSON.stringify(value)) throw new Error(`key ${path.join(".")} already holds ${JSON.stringify(node[last])}, not ${JSON.stringify(value)}`)
    node[last] = value
}

// ── Local variables named t ────────────────────────────────────────────────

const singular = w => (/ies$/.test(w) ? w.slice(0, -3) + "y" : /(ss|us)$/.test(w) ? w : /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w)

/** A name for a local `t`, read from what it holds. */
function nameForT(decl) {
    const listName = x => {
        x = unwrap(x)
        if (ts.isCallExpression(x)) {
            const c = x.expression
            if (ts.isPropertyAccessExpression(c) && ["find", "filter", "at", "findLast", "flatMap", "map", "slice", "sort"].includes(c.name.text)) return listName(c.expression)
            const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : ""
            return name.replace(/^(tokenize|tokenise)$/, "tokens").replace(/^(get|read|load|list|all)([A-Z])/, (_, __, ch) => ch.toLowerCase())
        }
        if (ts.isPropertyAccessExpression(x)) return x.name.text === "value" ? listName(x.expression) : x.name.text
        if (ts.isIdentifier(x)) return x.text
        return ""
    }
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const init = decl.initializer.getText()
        if (/theme/i.test(init)) return "theme"
        if (/new Date|getTime|Date\.now|performance\.now/.test(init)) return "time"
        if (/setTimeout|setInterval/.test(init)) return "timer"
        const fo = decl.parent?.parent
        if (fo && (ts.isForOfStatement(fo) || ts.isForInStatement(fo))) return singular(listName(fo.expression)) || "item"
        const x = unwrap(decl.initializer)
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && ["find", "findLast", "at"].includes(x.expression.name.text)) return singular(listName(x.expression.expression)) || "item"
        if (ts.isPropertyAccessExpression(x) || ts.isIdentifier(x)) return listName(x) || "item"
        if (ts.isConditionalExpression(x) || ts.isBinaryExpression(x)) return "ratio"
        return "item"
    }
    if (ts.isVariableDeclaration(decl)) {
        const fo = decl.parent?.parent
        if (fo && (ts.isForOfStatement(fo) || ts.isForInStatement(fo))) return singular(listName(fo.expression)) || "item"
    }
    if (ts.isParameter(decl)) {
        const type = decl.type?.getText()
        if (type && /^[A-Z]\w*$/.test(type)) return type[0].toLowerCase() + type.slice(1)
        const fn = decl.parent, call = fn?.parent
        if (call && ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)) {
            const list = singular(listName(call.expression.expression))
            if (list) return list
        }
        if (type === "number") return "value"
        if (type === "string") return "text"
        return "item"
    }
    return "item"
}

/**
 * Renames each local `t` whose scope holds text being moved to t(), so the
 * import is not shadowed there. Returns the edits, or throws when a `t` is
 * one the template can see.
 */
function renamesForT(code, offset, ranges, isVue, fileLabel) {
    const host = ts.createCompilerHost({})
    const sf = ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    host.getSourceFile = name => (name === "x.ts" ? sf : undefined)
    host.fileExists = name => name === "x.ts"
    const program = ts.createProgram(["x.ts"], { noLib: true, noResolve: true, allowJs: true }, host)
    const checker = program.getTypeChecker()
    const used = new Set()
    const ids = []
    const visit = n => { if (ts.isIdentifier(n)) { used.add(n.text); if (n.text === "t") ids.push(n) } ts.forEachChild(n, visit) }
    visit(sf)
    const scopeOf = decl => {
        let n = ts.isParameter(decl) ? decl.parent : decl.parent
        while (n && !(ts.isBlock(n) || ts.isSourceFile(n) || ts.isFunctionLike(n) || ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isCatchClause(n))) n = n.parent
        if (ts.isVariableDeclarationList(decl.parent) && decl.parent.parent && (ts.isForOfStatement(decl.parent.parent) || ts.isForStatement(decl.parent.parent) || ts.isForInStatement(decl.parent.parent))) n = decl.parent.parent
        return n
    }
    const edits = []
    const chosenNames = []
    const symbols = new Map()
    for (const id of ids) {
        const sym = checker.getSymbolAtLocation(id)
        const decl = sym?.declarations?.[0]
        if (!decl || !(ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isBindingElement(decl) || ts.isFunctionDeclaration(decl))) continue
        if (!symbols.has(sym)) symbols.set(sym, { decl, uses: [] })
        symbols.get(sym).uses.push(id)
    }
    for (const { decl, uses } of symbols.values()) {
        const scope = scopeOf(decl)
        const s0 = offset + scope.getStart(sf), s1 = offset + scope.getEnd()
        // A top-level t would clash with the import itself, wherever the text is.
        if (!ts.isSourceFile(scope) && !ranges.some(([a, b]) => a >= s0 && b <= s1)) continue
        if (!ranges.length) continue
        // The new name must not meet another name inside the same scope.
        const inScope = new Set()
        const collect = n => { if (ts.isIdentifier(n)) inScope.add(n.text); ts.forEachChild(n, collect) }
        collect(scope)
        for (const c of chosenNames) if (c.s0 < s1 && s0 < c.s1) inScope.add(c.name)
        let name = nameForT(decl)
        for (let i = 2; inScope.has(name); i++) name = `${nameForT(decl)}${i}`
        chosenNames.push({ name, s0, s1 })
        if (isVue && ts.isSourceFile(scope)) edits.template = name
        for (const id of uses) {
            const parent = id.parent
            const at = offset + id.getStart(sf)
            // `{ t }` shorthand keeps its property name.
            if (ts.isShorthandPropertyAssignment(parent)) edits.push([at, at + 1, `t: ${name}`])
            else if (ts.isBindingElement(parent) && !parent.propertyName && parent.name === id && ts.isObjectBindingPattern(parent.parent)) edits.push([at, at + 1, `t: ${name}`])
            else edits.push([at, at + 1, name])
        }
    }
    return edits
}

/** Renames a template loop's `t` (`v-for="t in tabs"` → `tab`) inside its element. */
function templateLoopRenames(src) {
    const { descriptor } = parseSfc(src)
    if (!descriptor.template) return []
    const edits = []
    const T = { ELEMENT: 1, INTERPOLATION: 5, DIRECTIVE: 7 }
    const exprsIn = (node, out = []) => {
        if (node.type === T.ELEMENT) {
            for (const p of node.props) if (p.type === T.DIRECTIVE && p.exp && p.name !== "for") out.push(p.exp)
            for (const c of node.children) exprsIn(c, out)
        } else if (node.type === T.INTERPOLATION) out.push(node.content)
        else if (node.children) for (const c of node.children) exprsIn(c, out)
        return out
    }
    const walk = node => {
        if (node.type === T.ELEMENT) {
            const loop = node.props.find(p => p.type === T.DIRECTIVE && p.name === "for" && p.exp && /^\(?\s*t\b/.test(p.exp.content))
            if (loop) {
                const list = /\bin\s+(.+)$/.exec(loop.exp.content)?.[1] ?? ""
                const words = list.replace(/\.value\b/g, "").match(/[A-Za-z_$][\w$]*/g) ?? []
                const exprs = exprsIn(node)
                const used = new Set(exprs.flatMap(e => e.content.match(/[A-Za-z_$][\w$]*/g) ?? []))
                const base = singular(words[words.length - 1] ?? "") || "item"
                let name = base === "t" ? "item" : base
                for (let i = 2; used.has(name); i++) name = `${base}${i}`
                const at = loop.exp.loc.start.offset + loop.exp.content.search(/\bt\b/)
                edits.push([at, at + 1, name])
                for (const e of exprs) {
                    const sf = parseAt(`(${e.content})`, e.loc.start.offset - 1)
                    const visit = n => {
                        if (ts.isIdentifier(n) && n.text === "t") {
                            const parent = n.parent
                            const isCall = ts.isCallExpression(parent) && parent.expression === n && ts.isStringLiteral(parent.arguments[0])
                            const isMember = ts.isPropertyAccessExpression(parent) && parent.name === n
                            const isKey = ts.isPropertyAssignment(parent) && parent.name === n
                            if (!isCall && !isMember && !isKey) {
                                if (ts.isShorthandPropertyAssignment(parent)) edits.push([n.__abs.start, n.__abs.end, `t: ${name}`])
                                else edits.push([n.__abs.start, n.__abs.end, name])
                            }
                        }
                        ts.forEachChild(n, visit)
                    }
                    visit(sf)
                }
                return
            }
        }
        for (const c of node.children ?? []) walk(c)
    }
    walk(descriptor.template.ast)
    return edits
}

const IMPORT_LINE = `import { t } from "~/shared/i18n"`
const MARKUP_IMPORT = `import I18nT from "~/shared/ui/I18nT"`

function addImport(src, file) {
    if (/import \{[^}]*\bt\b[^}]*\} from "~\/shared\/i18n"/.test(src)) return src
    const importsIn = (body, base) => {
        const all = [...body.matchAll(/^import\s[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm)]
        if (!all.length) return null
        const last = all[all.length - 1]
        return { at: base + last.index + last[0].trimEnd().length, semi: last[0].trimEnd().endsWith(";") ? ";" : "" }
    }
    if (file.endsWith(".vue")) {
        const m = /<script\b[^>]*\bsetup\b[^>]*>\n?/.exec(src)
        if (m) {
            const base = m.index + m[0].length
            const end = src.indexOf("</script>", base)
            const found = importsIn(src.slice(base, end), base)
            return found ? src.slice(0, found.at) + `\n${IMPORT_LINE}${found.semi}` + src.slice(found.at) : src.slice(0, base) + `${IMPORT_LINE}\n` + src.slice(base)
        }
        return src.replace(/<\/template>[ \t]*\n/, m2 => `${m2}\n<script setup lang="ts">\n${IMPORT_LINE}\n</script>\n`)
    }
    const found = importsIn(src, 0)
    if (found) return src.slice(0, found.at) + `\n${IMPORT_LINE}${found.semi}` + src.slice(found.at)
    const header = /^(\s*\/\/[^\n]*\n)+\n?/.exec(src)
    const at = header ? header[0].length : 0
    return src.slice(0, at) + `${IMPORT_LINE}\n\n` + src.slice(at)
}

function apply(ns, planFile) {
    const rows = readFileSync(planFile, "utf8").split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t"))
    const byFile = new Map()
    for (const [id, , key, message] of rows) {
        const at = id.lastIndexOf("@")
        const f = id.slice(0, at), off = Number(id.slice(at + 1))
        if (!byFile.has(f)) byFile.set(f, new Map())
        byFile.get(f).set(off, { key, message: (message ?? "").replace(/ \[\w+: common\.\w+\.\w+\]/g, "").replace(/\\n/g, "\n") })
    }
    const messages = loadMessages(ns)
    const common = ns === "common" ? messages : loadMessages("common")
    const pending = new Map()
    for (let [f, wanted] of byFile) {
        const file = join(ROOT, f)
        let { src, out } = collect(file)
        const missing = [...wanted.keys()].filter(o => !out.some(c => c.start === o))
        if (missing.length) throw new Error(`${f}: plan is stale at ${missing.join(", ")}; plan again`)
        // Rename the local t's that would shadow the import, then find the same candidates again.
        const ordinals = out.map((c, i) => (wanted.has(c.start) ? i : -1)).filter(i => i >= 0)
        const keyAt = new Map(ordinals.map(i => [i, wanted.get(out[i].start)]))
        const ranges = ordinals.map(i => [out[i].start, out[i].end])
        const edits = []
        if (file.endsWith(".vue")) {
            const { descriptor } = parseSfc(src)
            for (const block of [descriptor.script, descriptor.scriptSetup]) if (block) edits.push(...renamesForT(block.content, block.loc.start.offset, ranges, true, f))
        } else edits.push(...renamesForT(src, 0, ranges, false, f))
        if (file.endsWith(".vue") && ranges.length) edits.push(...templateLoopRenames(src))
        if (file.endsWith(".vue")) {
            // A top-level t the template reads (`t.accent`) is renamed there too.
            const { descriptor } = parseSfc(src)
            const top = [descriptor.script, descriptor.scriptSetup].map(b => b && renamesForT(b.content, b.loc.start.offset, ranges, true, f).template).find(Boolean)
            if (top && descriptor.template) {
                const t0 = descriptor.template.loc.start.offset, t1 = descriptor.template.loc.end.offset
                for (const m of src.slice(t0, t1).matchAll(/(?<![\w$.'’])t(?=\.|\[|\?\.)/g)) edits.push([t0 + m.index, t0 + m.index + 1, top])
            }
        }
        if (edits.length) {
            const rn = new MagicString(src)
            for (const [a, b, text] of edits) rn.overwrite(a, b, text)
            const again = collect(file, rn.toString())
            if (again.out.length !== out.length) throw new Error(`${f}: renaming t changed the candidates`)
            pending.set(file, again.src)
            src = again.src; out = again.out
            console.log(`${f}: renamed ${edits.length} uses of a local t`)
        }
        wanted = new Map(ordinals.map(i => [out[i].start, keyAt.get(i)]))
        const chosen = out.filter(c => wanted.has(c.start))
        const ms = new MagicString(src)
        let usesMarkup = false
        const nested = (c, p) => chosen.filter(o => o !== c && o.start >= p.start && o.end <= p.end)
        const render = c => {
            const q = c.inTemplate ? "'" : '"'
            const textOf = p => {
                let text = src.slice(p.start, p.end)
                const inner = nested(c, p).filter((o, _, all) => !all.some(x => x !== o && x.start <= o.start && x.end >= o.end))
                for (const o of inner.sort((a, b) => b.start - a.start)) text = text.slice(0, o.start - p.start) + render(o) + text.slice(o.end - p.start)
                return text
            }
            // A common key already holding other forms gets a number: noun.is2.
            const commonKey = (kind, one, value) => {
                for (let i = 1; ; i++) {
                    const k = `${kind}.${nounKey(one)}${i > 1 ? i : ""}`
                    const have = common[kind]?.[k.split(".")[1]]
                    if (have === undefined || JSON.stringify(have) === JSON.stringify(value)) { setPath(common, k.split("."), value); return k }
                }
            }
            if (c.kind === "noun") {
                const key = commonKey("noun", c.one, { one: c.one, other: c.many })
                return `t(${q}common.${key}${q}, { count: ${textOf(c.parts[0])} })`
            }
            if (c.kind === "count") {
                const key = commonKey("count", c.one, countMessage(c.one, c.many))
                return `t(${q}common.${key}${q}, { count: ${textOf(c.parts[0])} })`
            }
            if (c.kind === "markup") {
                const { key, message } = wanted.get(c.start)
                const [kns, ...path] = key.split(".")
                setPath(kns === "common" ? common : messages, path, message)
                usesMarkup = true
                return `<I18nT k="${key}">${c.parts.map(p => `<template #${p.name}>${textOf(p)}</template>`).join("")}</I18nT>`
            }
            const { key, message } = wanted.get(c.start)
            const args = c.parts.map(p => {
                const text = textOf(p)
                if (p.kind) {
                    const k = commonKey(p.kind, p.one, p.kind === "count" ? countMessage(p.one, p.many) : { one: p.one, other: p.many })
                    return `${p.name}: t(${q}common.${k}${q}, { count: ${text} })`
                }
                return p.name === text.trim() ? p.name : `${p.name}: ${text}`
            })
            const call = args.length ? `t(${q}${key}${q}, { ${args.join(", ")} })` : `t(${q}${key}${q})`
            const [kns, ...path] = key.split(".")
            setPath(kns === "common" ? common : messages, path, message)
            if (c.attr) return `:${c.attr}="${call}"`
            if (c.mustache) return `{{ ${call} }}`
            return call
        }
        const outer = chosen.filter(c => !chosen.some(o => o !== c && o.start <= c.start && o.end >= c.end))
        for (const c of outer) ms.overwrite(c.start, c.end, render(c))
        let text = addImport(ms.toString(), file)
        if (usesMarkup && !text.includes(MARKUP_IMPORT)) text = text.replace(/^(import \{[^}]*\bt\b[^}]*\} from "~\/shared\/i18n";?)$/m, `$1\n${MARKUP_IMPORT}`)
        pending.set(file, text)
        console.log(`${f}: ${chosen.length}`)
    }
    // Nothing is written until every file went through.
    for (const [file, text] of pending) writeFileSync(file, text)
    const write = (name, tree) => {
        const p = join(SRC, "locales", "en", `${name}.json`)
        mkdirSync(dirname(p), { recursive: true })
        writeFileSync(p, JSON.stringify(tree, null, 2) + "\n")
    }
    write(ns, messages)
    if (ns !== "common") write("common", common)
}

/** The namespace a source file's messages belong to. */
function namespaceOf(rel) {
    if (rel.startsWith("src/features/")) return rel.split("/")[2]
    if (/^src\/(pages|layouts)\//.test(rel) || rel === "src/app.vue") return "pages"
    if (rel.startsWith("src/shared/")) return "ui"
    return "platform"
}

function check() {
    const keep = JSON.parse(readFileSync(join(SRC, "locales", "keep-english.json"), "utf8"))
    const glob = g => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§").replace(/\*/g, "[^/]*").replace(/§/g, ".*")}$`)
    const fileRules = keep.files.map(f => glob(f.files))
    const textRules = keep.texts.map(e => ({ file: e.file, text: e.text }))
    const files = []
    const walkDir = d => { for (const name of readdirSync(d)) { const p = join(d, name); if (statSync(p).isDirectory()) { if (!/\/(locales|testing)$/.test(p)) walkDir(p) } else if (/\.(ts|vue)$/.test(name) && !/\.test\.ts$/.test(name) && !["i18n.ts", "I18nT.ts"].includes(name)) files.push(p) } }
    walkDir(SRC)
    const left = []
    for (const file of files) {
        const rel = relative(ROOT, file)
        if (fileRules.some(r => r.test(rel))) continue
        const { out, manual } = collect(file)
        for (const c of out) {
            const text = c.kind === "count" ? `{count} ${c.one} | {count} ${c.many}` : c.kind === "noun" ? `${c.one} | ${c.many}` : c.message
            if (textRules.some(r => r.file === rel && (r.text === undefined || r.text === text))) continue
            left.push(`${c.where}\t${namespaceOf(rel)}\t${text.replace(/\n/g, "\\n").slice(0, 160)}`)
        }
        for (const m of manual) if (!textRules.some(r => r.file === rel && r.text === undefined)) left.push(m)
    }
    if (left.length) {
        console.log(left.join("\n"))
        console.error(`\n${left.length} strings for people are not messages. Extract them (scripts/i18n-extract.mjs plan/apply) or, when they must stay English, list them in src/locales/keep-english.json with why.`)
        process.exit(1)
    }
    console.log("Every string for people is a message.")
}

const [mode, ns, ...rest] = process.argv.slice(2)
if (mode === "check") { check(); process.exit(0) }
if (mode === "plan") process.stdout.write(plan(ns, rest))
else if (mode === "apply") apply(ns, rest[0])
else { console.error("usage: i18n-extract.mjs plan|apply <namespace> ..."); process.exit(1) }
