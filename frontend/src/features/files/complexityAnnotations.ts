// What the source view draws beside a file's code: the complex functions as
// bands down the gutter, and on each line the constructs that cost it
// cognitive complexity ("+3 if", "+1 &&"). The engine records them from
// revision 12 (complexity_increments); older snapshots have none and the view
// draws plain code.

import { computed, type Ref } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { sqlLiteral } from "~/shared/sql"

export interface AnnotatedFunction {
    name: string
    begin: number
    end: number
    cognitive: number
}

export interface ComplexityStep {
    line: number
    points: number
    construct: string
    nesting: number
}

export interface ComplexityAnnotations {
    functions: AnnotatedFunction[]
    steps: ComplexityStep[]
}

export interface LineAnnotation {
    /** The complex function the line is in, if any. */
    fn: AnnotatedFunction | null
    /** The line is that function's first. */
    first: boolean
    steps: ComplexityStep[]
}

const NONE: LineAnnotation = Object.freeze({ fn: null, first: false, steps: [] }) as LineAnnotation

/** One annotation per line, 1-based line n at index n - 1. */
export function annotateLines(lineCount: number, annotations: ComplexityAnnotations | null | undefined): LineAnnotation[] {
    const out: LineAnnotation[] = new Array(lineCount).fill(NONE)
    if (!annotations) return out
    const at = (line: number): LineAnnotation | null => {
        if (line < 1 || line > lineCount) return null
        if (out[line - 1] === NONE) out[line - 1] = { fn: null, first: false, steps: [] }
        return out[line - 1]
    }
    for (const fn of annotations.functions) {
        for (let line = fn.begin; line <= fn.end; line++) {
            const a = at(line)
            if (a && !a.fn) {
                a.fn = fn
                a.first = line === fn.begin
            }
        }
    }
    for (const step of annotations.steps) at(step.line)?.steps.push(step)
    return out
}

/** The complex functions of one file and what their complexity is made of. */
export function useComplexityAnnotations(filePath: Ref<string>) {
    const store = useDataStore()
    const { data } = useAsyncQuery<ComplexityAnnotations | null>(
        async () => {
            if (!filePath.value || !store.hasColumn("complexity_increments", "construct")) return null
            const file = sqlLiteral(filePath.value)
            const [functions, steps] = await Promise.all([
                store.query<AnnotatedFunction>(`SELECT name, begin_line AS begin, end_line AS end, cognitive FROM functions WHERE file = ${file} AND cognitive > 15 ORDER BY begin_line`),
                store.query<ComplexityStep>(`SELECT line, points, construct, nesting FROM complexity_increments WHERE file = ${file} ORDER BY line`),
            ])
            return functions.length ? { functions, steps } : null
        },
        [filePath, () => store.datasetKey],
        { initial: null },
    )
    return computed(() => data.value)
}

export interface FileSymbol {
    name: string
    begin: number
    end: number
    cognitive: number
}

/**
 * Every function of one file, in the order it reads: the Symbols panel's
 * list and the sticky scope's lookup. Null when the snapshot has no
 * functions table (before revision 11), so callers hide the panel.
 */
export function useFileSymbols(filePath: Ref<string>) {
    const store = useDataStore()
    const { data } = useAsyncQuery<FileSymbol[] | null>(
        async () => {
            if (!filePath.value || !store.hasColumn("functions", "cognitive")) return null
            return store.query<FileSymbol>(`SELECT name, begin_line AS begin, end_line AS end, cognitive FROM functions WHERE file = ${sqlLiteral(filePath.value)} ORDER BY begin_line`)
        },
        [filePath, () => store.datasetKey],
        { initial: null },
    )
    return computed(() => data.value)
}

/** The innermost function holding a line, or null between functions. */
export function symbolAt(symbols: FileSymbol[] | null | undefined, line: number): FileSymbol | null {
    let found: FileSymbol | null = null
    for (const s of symbols ?? []) {
        if (s.begin <= line && line <= s.end && (!found || s.begin >= found.begin)) found = s
    }
    return found
}
