// Whether an answer rests on the measure the question asked about. The claim
// checker verifies that numbers and names come from the cited facts; it
// cannot see that "the most unstable" was answered from a ranking of the
// most depended-on. This does, for rankings: the measure a question names
// against the measure of every ranking the answer cites.

import { METRIC_WORDS } from "~/features/snapshot/measures"
import { readMeasure } from "~/features/metrics/exhibits/ranking"

/** Words that name one measure without doubt, and the column each means. */
const ASKED: Array<[RegExp, string]> = [
    [/\b(?:in)?stab(?:le|ility)\b|\bunstable\b/i, "modularity__instability"],
    [/\babstract(?:ness)?\b/i, "modularity__abstractness"],
    [/\bmain sequence\b|\bdistance from\b/i, "modularity__distance_main_sequence"],
    [/\bdepended[- ]on\b|\bdependents\b|\bfan[- ]?in\b|\bafferent\b|\bmost used\b|\bused by the most\b/i, "modularity__coupling__dependents"],
    [/\bdependencies\b|\bfan[- ]?out\b|\befferent\b|\bimports the most\b/i, "modularity__coupling__dependencies"],
    [/\bchurn\b|\bchanged? (?:the )?most\b|\bmost (?:changed|commits)\b/i, "git__commits__total"],
    [/\b(?:un)?health(?:y|iest)?\b|\bcode health\b/i, "codesmells__code_health"],
    [/\bhotspots?\b/i, "codesmells__hotspot_score"],
    [/\bcomplex(?:ity)?\b/i, "codesmells__static_complexity_score"],
    [/\bpage ?rank\b|\bcentral(?:ity)?\b|\bmost important\b/i, "graph__page_rank"],
    [/\bbetweenness\b/i, "graph__betweenness"],
    [/\blargest\b|\bbiggest\b|\blines of code\b|\bloc\b/i, "complexity__lines"],
]

/** The measures a question names. */
export function askedMeasures(question: string): string[] {
    return [...new Set(ASKED.filter(([re]) => re.test(question)).map(([, id]) => id))]
}

/** The column a ranking's `measure` words mean. */
export function rankedMeasure(words: string): string {
    const { measure } = readMeasure(words)
    return METRIC_WORDS[measure] ?? measure
}

/** A column in the words a person uses. */
export function measureWords(id: string): string {
    return {
        modularity__instability: "instability", modularity__abstractness: "abstractness", modularity__distance_main_sequence: "distance from the main sequence",
        modularity__coupling__dependents: "dependents (fan-in)", modularity__coupling__dependencies: "dependencies (fan-out)", git__commits__total: "churn (commits)",
        codesmells__code_health: "code health", codesmells__hotspot_score: "hotspot score", codesmells__static_complexity_score: "complexity",
        graph__page_rank: "centrality", graph__betweenness: "betweenness", complexity__lines: "lines of code",
    }[id] ?? id.replace(/^.*__/, "").replace(/_/g, " ")
}

export interface TopicExhibit { id: string; spec: { kind: string; params: Record<string, unknown> } }

/** Subjects a question can name, and the exhibits that answer them. */
const SUBJECTS: Array<[RegExp, string, string[]]> = [
    [/\blayer(?:s|ed|ing)?\b|\bfloors?\b/i, "layering", ["stack"]],
    [/\btangle[sd]?\b|\bcycles?\b|\bcircular\b/i, "tangles and cycles", ["tangle", "cycles"]],
    [/\bwho (?:knows|owns|wrote|maintains)\b|\bbus factor\b|\bknowledge\b/i, "who knows the code", ["authors", "knowledge"]],
    [/\bdeploy(?:s|ed|ment|ables?)?\b|\bpipelines?\b/i, "what ships", ["deployables"]],
    [/\brules?\b|\bviolations?\b/i, "the declared rules", ["rules"]],
]

/**
 * A mismatch, or null: the question names a subject, this turn drew the
 * exhibit that answers it, and the answer cites none of it (an earlier
 * answer's figures instead, or others).
 */
export function subjectMismatch(question: string, answer: string, exhibits: TopicExhibit[]): { asked: string; cites: string } | null {
    const cites = (id: string) => new RegExp(`\\b${id}(?:\\.\\d+)?\\b`).test(answer)
    for (const [re, label, kinds] of SUBJECTS) {
        if (!re.test(question)) continue
        const made = exhibits.filter(x => kinds.includes(x.spec.kind))
        if (!made.length || made.some(x => cites(x.id))) continue
        return { asked: label, cites: made[0].id }
    }
    return null
}

/**
 * A mismatch, or null: the question names a measure, the answer cites
 * rankings, and none of them ranks by what was asked.
 */
export function topicMismatch(question: string, answer: string, exhibits: TopicExhibit[]): { asked: string; ranked: string; cites: string } | null {
    const asked = askedMeasures(question)
    if (!asked.length) return null
    const cited = exhibits.filter(x => x.spec.kind === "ranking" && new RegExp(`\\b${x.id}(?:\\.\\d+)?\\b`).test(answer))
    if (!cited.length) return null
    const by = cited.map(x => rankedMeasure(String(x.spec.params.measure ?? "")))
    if (by.some(m => asked.includes(m))) return null
    return { asked: measureWords(asked[0]), ranked: measureWords(by[0]), cites: cited[0].id }
}
