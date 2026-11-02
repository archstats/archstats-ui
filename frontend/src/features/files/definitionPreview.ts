// What a hover card shows of a definition, read from its source: the doc
// comment above it as prose, its annotations as tags, the line that
// declares it, and the first lines of its body. A node starts at its doc
// comment and annotations, so they are taken apart here instead of being
// shown as code under a header that already names the symbol.

export interface DefinitionPreview {
    /** The doc comment as prose, without its markers or its @tags. */
    doc: string
    /** Annotations and attributes on the declaration: `@Service`, `[HttpGet]`. */
    annotations: string[]
    /** The declaration on one line: a wrapped signature joined, parameter annotations dropped, a long parameter list cut short. */
    declaration: string
    /** 1-based line of the first body line shown. */
    bodyStart: number
    /** The body's first lines, dedented to the declaration's indent. */
    body: string[]
    /** The body runs on past what is shown. */
    more: boolean
}

const KIND = /\b(abstract\s+class|sealed\s+class|data\s+class|enum\s+class|annotation\s+class|class|interface|enum|record|struct|trait|protocol|object|extension|mixin|module|namespace|type|func|function|fn|def|fun)\b/

/** What a declaration line declares, in the language's own word: `abstract class`, `interface`, `def`. */
export function declaredKind(line: string): string | null {
    const m = line.match(KIND)
    return m ? m[1].replace(/\s+/g, " ") : null
}

function hasWord(text: string, word: string): boolean {
    return new RegExp(`(^|[^\\w$])${word.replace(/[$]/g, "\\$")}([^\\w$]|$)`).test(text)
}

function docText(lines: string[]): string {
    const out: string[] = []
    for (const raw of lines) {
        const l = raw.trim()
            .replace(/^\/\*\*?|\*\/$/g, "")
            .replace(/^\*\s?/, "")
            .replace(/^\/\/\/?\s?/, "")
            .replace(/^#\s?/, "")
            .trim()
        // Tags end the description: @param, @return, @throws, <param>.
        if (/^(@[a-z]+|<(param|returns?|exception|typeparam)\b)/i.test(l)) break
        out.push(l)
    }
    return out.join(" ")
        .replace(/<\/?(p|summary|remarks|code|b|i|em|strong|br\s*\/?)>/gi, " ")
        .replace(/\{@(?:link|code|linkplain)\s+([^}]+)\}/g, "$1")
        .replace(/<see\s+cref="([^"]+)"\s*\/>/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * The parts of a definition starting at `from` (1-based), the line the
 * engine gives for it, named `ident`.
 */
export function definitionPreview(lines: string[], from: number, ident: string, maxBody = 8): DefinitionPreview | null {
    const start = Math.max(1, from)
    let i = start - 1
    const docLines: string[] = []
    const annotations: string[] = []
    // Some engines start a definition at its declaration, with the doc
    // comment and annotations above it: read upward first, over the block
    // that decorates it, to the line that ended the statement before.
    const declIndentAt = (k: number) => lines[k]?.match(/^\s*/)![0].length ?? 0
    // Brackets are counted so a line inside an annotation's arguments
    // (`@ApiResponses({`) is never taken for the end of what came before.
    const balance = (t: string) => {
        const code = t.replace(/"(?:[^"\\]|\\.)*"/g, "")
        return (code.match(/[)\]}]/g)?.length ?? 0) - (code.match(/[([{]/g)?.length ?? 0)
    }
    let top = i
    let depth = 0
    while (top > 0) {
        const t = lines[top - 1].trim()
        if (depth <= 0 && (!t || t.endsWith(";") || t.endsWith("{") || t.endsWith("}") || t.endsWith("*/") || t.startsWith("//"))) break
        depth += balance(t)
        top--
    }
    for (let k = top; k < i; k++) {
        const t = lines[k].trim()
        // Only the declaration's own annotations, not those nested in them.
        if (declIndentAt(k) !== declIndentAt(i)) continue
        const name = t.match(/^(@[\w.]+|\[\w[\w.]*|#\[\w+)/)?.[1]
        if (name) annotations.push(name.startsWith("@") ? name : `${name}]`)
    }
    const above = (top > 0 ? lines[top - 1] : "").trim()
    if (above.endsWith("*/")) {
        let k = top - 1
        while (k >= 0 && !lines[k].includes("/*")) k--
        if (k >= 0) docLines.push(...lines.slice(k, top))
    } else if (above.startsWith("//")) {
        let k = top - 1
        while (k > 0 && /^\s*\/\//.test(lines[k - 1])) k--
        docLines.push(...lines.slice(k, top))
    }
    // Doc comment and annotations, in any order, until the naming line.
    for (let guard = 0; i < lines.length && guard < 60; guard++) {
        const t = lines[i].trim()
        if (hasWord(t, ident) && !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("@") && !t.startsWith("[")) break
        if (t.startsWith("/**") || t.startsWith("/*")) {
            while (i < lines.length) {
                docLines.push(lines[i])
                if (lines[i].includes("*/")) break
                i++
            }
        } else if (t.startsWith("///") || (t.startsWith("//") && !docLines.length) || t.startsWith("#") && !t.startsWith("#[")) {
            docLines.push(lines[i])
        } else if (t.startsWith("@") || (t.startsWith("[") && t.endsWith("]")) || t.startsWith("#[")) {
            // An annotation may run over several lines; its first line names it.
            const name = t.match(/^(@[\w.]+|\[\w[\w.]*|#\[\w+)/)?.[1]
            if (name) annotations.push(name.startsWith("[") ? `${name}]` : name.startsWith("#[") ? `${name}]` : name)
            let depth = (t.match(/\(/g)?.length ?? 0) - (t.match(/\)/g)?.length ?? 0)
            while (depth > 0 && i + 1 < lines.length) {
                i++
                depth += (lines[i].match(/\(/g)?.length ?? 0) - (lines[i].match(/\)/g)?.length ?? 0)
            }
        } else if (t && !t.startsWith("*")) {
            break
        }
        i++
    }
    if (i >= lines.length) return null
    const declStart = i
    // The body starts after the line that opens it. A signature may wrap
    // over many lines, so its brackets are counted to find where it ends.
    let open = i
    let parens = 0
    for (let j = i; j < Math.min(lines.length, i + 60); j++) {
        const t = lines[j].trim()
        if (t.startsWith("//")) continue
        parens += -balance(t.replace(/\{[^{}]*$/, ""))
        open = j
        if (parens <= 0 && (t.includes("{") || t.endsWith(":") || t.endsWith("=>") || t.endsWith("=") || t.endsWith(";"))) break
    }
    // The body ends where a line comes back to the declaration's indent.
    const declIndent = declIndentAt(declStart)
    let end = open + 1
    while (end < lines.length && end <= open + 40 && !(lines[end].trim() && declIndentAt(end) <= declIndent)) end++
    let first = open + 1
    while (first < end && !lines[first].trim()) first++
    // A Python docstring opens the body: it is the doc, not code.
    const q = lines[first]?.trim().match(/^[rbu]?("""|\'\'\')/i)?.[1]
    if (q && !docLines.length) {
        let k = first
        const once = lines[first].trim().slice(lines[first].trim().indexOf(q) + 3)
        if (!once.includes(q)) while (k + 1 < end && !lines[++k].includes(q)) { /* to the closing quotes */ }
        docLines.push(...lines.slice(first, k + 1).map(l => l.replace(/[rbu]?("""|\'\'\')/gi, "")))
        first = k + 1
        while (first < end && !lines[first].trim()) first++
    }
    // Comments inside the body are prose the doc already speaks for.
    const slice = lines.slice(first, end).filter(l => !/^\s*(\/\/|\/\*|\*|#(?!\[))/.test(l))
    while (slice.length && !slice[0].trim()) slice.shift()
    const shown = slice.slice(0, maxBody)
    while (shown.length && !shown[shown.length - 1].trim()) shown.pop()
    const declaration = compactSignature(lines.slice(declStart, open + 1))
    // Dedented to the declaration, so the body stays indented under it.
    const body = shown.map(l => l.slice(Math.min(declIndent, l.match(/^\s*/)![0].length)))
    return {
        doc: docText(docLines),
        annotations: [...new Set(annotations)],
        declaration,
        bodyStart: first + 1,
        body,
        more: slice.length > maxBody,
    }
}

// About what a hover card shows on a line.
const LONG = 72

/** A signature that wraps over lines, as one line a hover card can show. */
export function compactSignature(lines: string[]): string {
    let text = lines
        .filter(l => !l.trim().startsWith("//"))
        .map(l => l.replace(/\/\*.*?\*\//g, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim()
    const open = text.indexOf("(")
    if (open === -1) return text
    // Parameter annotations (`@QueryParam("x") @Parameter(...)`) are noise in a summary.
    const head = text.slice(0, open + 1)
    let rest = text.slice(open + 1)
    rest = rest.replace(/@[\w.]+(?:\((?:[^()"]|"[^"]*"|\((?:[^()"]|"[^"]*")*\))*\))?\s*/g, "")
    text = head + rest
    if (text.length <= LONG) return text
    // Keep the first parameters and count the rest.
    let depth = 0, end = -1
    const cuts: number[] = []
    for (let k = open; k < text.length; k++) {
        const ch = text[k]
        if (ch === '"' ) { const close = text.indexOf('"', k + 1); if (close > k) k = close; continue }
        if ("(<[{".includes(ch)) depth++
        else if (")>]}".includes(ch)) { depth--; if (depth === 0) { end = k; break } }
        else if (ch === "," && depth === 1) cuts.push(k)
    }
    if (end === -1 || !cuts.length) return text
    // As many parameters as fit, at least one.
    let keep = 1
    while (keep < cuts.length && cuts[keep] + 8 <= LONG) keep++
    const params = cuts.length + 1
    return `${text.slice(0, cuts[keep - 1])}, … +${params - keep}${text.slice(end)}`
}
