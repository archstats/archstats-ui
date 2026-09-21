// An architecture rule is not a metric.
//
// A metric goes up or down and somebody has to decide what that means. A rule
// is kept or broken, and when it is broken the answer names the file and the
// line. That difference is the whole reason this screen exists.
//
// The harder half is what a rule says when it finds nothing, because there
// are two different nothings. "Core must not depend on a plugin" holding in a
// .NET solution is a result. The same rule in a Go repository has no opinion
// at all, and reporting that repository as clean claims something nobody
// checked. The engine therefore reports a status for every rule, and this
// module keeps the two apart everywhere.

export const VIOLATION = "violation"
export const OK = "ok"
export const NOT_APPLICABLE = "not_applicable"

export interface RuleFinding {
    rule: string
    /** VIOLATION, OK or NOT_APPLICABLE. */
    status: string
    from: string
    to: string
    kind: string
    file: string
    line: number
}

export interface RuleGroup {
    /** The rule's definition id, e.g. rules__symfony__component_must_not_depend_on_bundle. */
    id: string
    name: string
    short: string
    violations: RuleFinding[]
    /**
     * Distinct module pairs. Twenty imports between the same two modules is
     * one architectural fact, not twenty.
     */
    edges: number
    files: number
}

export type DefinitionLookup = (id: string) => { name?: string; short?: string } | undefined

/** A rule id with the registry prefix stripped, for when no definition loaded. */
export function fallbackName(id: string): string {
    const tail = id.replace(/^rules__/, "").split("__").pop() ?? id
    const words = tail.replace(/_/g, " ")
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Broken rules, worst first.
 *
 * Ordered by how many distinct module pairs break the rule rather than by how
 * many lines do: a rule broken between four pairs of modules is a worse
 * problem than one broken forty times between the same two, and sorting by
 * raw count says the opposite.
 */
export function groupByRule(findings: RuleFinding[], definitionFor: DefinitionLookup): RuleGroup[] {
    const byId = new Map<string, RuleFinding[]>()
    for (const f of findings) {
        if (f.status !== VIOLATION) continue
        const list = byId.get(f.rule)
        if (list) list.push(f)
        else byId.set(f.rule, [f])
    }

    const groups: RuleGroup[] = []
    for (const [id, list] of byId) {
        const def = definitionFor(id)
        const pairs = new Set<string>()
        const files = new Set<string>()
        for (const f of list) {
            pairs.add(`${f.from} -> ${f.to}`)
            files.add(f.file)
        }
        groups.push({
            id,
            name: def?.name || fallbackName(id),
            short: def?.short || "",
            violations: [...list].sort(compareFindings),
            edges: pairs.size,
            files: files.size,
        })
    }
    return groups.sort((a, b) =>
        b.edges - a.edges || b.violations.length - a.violations.length || a.name.localeCompare(b.name))
}

function compareFindings(a: RuleFinding, b: RuleFinding): number {
    return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.file.localeCompare(b.file) || a.line - b.line
}

/** The rules that had no opinion about this codebase, by id. */
export function notApplicable(findings: RuleFinding[], definitionFor: DefinitionLookup): RuleGroup[] {
    return findings
        .filter(f => f.status === NOT_APPLICABLE)
        .map(f => {
            const def = definitionFor(f.rule)
            return {
                id: f.rule,
                name: def?.name || fallbackName(f.rule),
                short: def?.short || "",
                violations: [],
                edges: 0,
                files: 0,
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
}

/** The rules that applied and held. */
export function held(findings: RuleFinding[], definitionFor: DefinitionLookup): RuleGroup[] {
    return findings
        .filter(f => f.status === OK)
        .map(f => {
            const def = definitionFor(f.rule)
            return {
                id: f.rule,
                name: def?.name || fallbackName(f.rule),
                short: def?.short || "",
                violations: [],
                edges: 0,
                files: 0,
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
}

/** How an edge came to exist, for the tag beside a violation. */
export function kindLabel(kind: string): string {
    switch (kind) {
        case "manifest": return "declared"
        case "type_only": return "types only"
        case "dynamic": return "dynamic"
        case "embed": return "embedded"
        default: return "import"
    }
}

/** What the tag means, spelled out, because "declared" is not self-evident. */
export function kindHint(kind: string): string {
    switch (kind) {
        case "manifest": return "Declared in a manifest with no import in the source"
        case "type_only": return "Imported for its types only; erased when the program runs"
        case "dynamic": return "Named by a string and resolved at runtime"
        case "embed": return "Composed in rather than referenced"
        default: return "An ordinary import in the source"
    }
}

/** `src/Foo/Bar.php:16`, or just the path when the line is unknown. */
export function atLine(file: string, line: number): string {
    return line > 0 ? `${file}:${line}` : file
}

/**
 * `Bar.php:16` — what to show in a narrow column.
 *
 * The full path is long enough that a table cell truncates the end of it,
 * and the end is the line number, which is the one part somebody is about to
 * act on. The path still belongs on the row, as a tooltip and a link.
 */
export function shortLocation(file: string, line: number): string {
    const base = file.split("/").pop() || file
    return line > 0 ? `${base}:${line}` : base
}

export type Verdict = "no-modules" | "clean" | "violations"

/**
 * What the screen is actually reporting.
 *
 * No findings at all means the project declares no modules. Rules are
 * statements about the modules a project builds and publishes; a
 * single-package repository declares none, earns neither a pass nor a
 * failure, and the engine says so by reporting nothing rather than a row per
 * rule claiming it held.
 */
export function verdictOf(findings: RuleFinding[]): Verdict {
    if (findings.length === 0) return "no-modules"
    return findings.some(f => f.status === VIOLATION) ? "violations" : "clean"
}

export function summarise(groups: RuleGroup[]): string {
    const total = groups.reduce((n, g) => n + g.violations.length, 0)
    if (total === 0) return ""
    const v = total === 1 ? "1 violation" : `${total} violations`
    const r = groups.length === 1 ? "1 rule" : `${groups.length} rules`
    return `${v} across ${r}`
}
