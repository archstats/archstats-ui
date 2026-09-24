// What a file is written in, by extension, for the snapshot's composition.
// Every file gets an answer, code or not: a report's first sentence is often
// "876,814 of 996,736 lines are translations", and that has to be countable.

const BY_EXT: Record<string, string> = {
    java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", groovy: "Groovy", gradle: "Gradle",
    cs: "C#", csproj: "MSBuild", vb: "Visual Basic", fs: "F#", razor: "Razor", cshtml: "Razor",
    php: "PHP", twig: "Twig", phtml: "PHP",
    py: "Python", pyi: "Python", ipynb: "Jupyter",
    go: "Go", rs: "Rust", rb: "Ruby", erb: "ERB", swift: "Swift", m: "Objective-C", mm: "Objective-C",
    c: "C", h: "C/C++ header", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++",
    js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript (JSX)",
    ts: "TypeScript", mts: "TypeScript", cts: "TypeScript", tsx: "TypeScript (TSX)",
    vue: "Vue", svelte: "Svelte",
    html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
    json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML", xsd: "XML", properties: "Properties", ini: "INI",
    sql: "SQL", sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", bat: "Batch",
    md: "Markdown", rst: "reStructuredText", txt: "Text", adoc: "AsciiDoc",
    po: "Gettext translations", pot: "Gettext translations", mo: "Gettext (compiled)",
    feature: "Gherkin", proto: "Protocol Buffers", graphql: "GraphQL", gql: "GraphQL",
    svg: "SVG", lock: "Lock file", dockerfile: "Dockerfile",
}

const BY_NAME: Record<string, string> = {
    dockerfile: "Dockerfile", makefile: "Makefile", "package.json": "JSON", "composer.lock": "Lock file",
}

/** The language a path is written in: a name for known extensions, the extension itself otherwise. */
export function languageOfPath(path: string): string {
    const base = path.split("/").pop() ?? path
    const lower = base.toLowerCase()
    if (BY_NAME[lower]) return BY_NAME[lower]
    const dot = lower.lastIndexOf(".")
    if (dot <= 0) return "No extension"
    const ext = lower.slice(dot + 1)
    return BY_EXT[ext] ?? `.${ext}`
}

/** The extension a path carries, for a filter; empty when it has none. */
export function extensionOf(path: string): string {
    const base = (path.split("/").pop() ?? path).toLowerCase()
    const dot = base.lastIndexOf(".")
    return dot <= 0 ? "" : base.slice(dot)
}

export type FileRole = "production" | "test" | "generated" | "third_party" | "non_code"

export const ROLE_LABELS: Record<FileRole, string> = {
    production: "Production",
    test: "Tests",
    generated: "Generated",
    third_party: "Third-party",
    non_code: "Not code",
}

export interface CompositionRow {
    language: string
    files: number
    lines: number
    roles: Record<FileRole, number>
    /** An extension that picks these files out, when they share one. */
    extension: string
}

/** Lines and files by language, largest first, with lines per role. */
export function composition(files: Array<{ name: string; lines: number; role: FileRole }>): CompositionRow[] {
    const by = new Map<string, CompositionRow & { exts: Set<string> }>()
    for (const f of files) {
        const language = languageOfPath(f.name)
        const row = by.get(language) ?? { language, files: 0, lines: 0, roles: { production: 0, test: 0, generated: 0, third_party: 0, non_code: 0 }, extension: "", exts: new Set<string>() }
        row.files++
        row.lines += f.lines
        row.roles[f.role] += f.lines
        row.exts.add(extensionOf(f.name))
        by.set(language, row)
    }
    return [...by.values()]
        .map(({ exts, ...r }) => ({ ...r, extension: exts.size === 1 ? [...exts][0] : "" }))
        .sort((a, b) => b.lines - a.lines || b.files - a.files || a.language.localeCompare(b.language))
}
