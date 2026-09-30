// Exhibits: the figures and tables Archstats can make from a scan, by name
// and a few parameters, with nothing mounted. The chat, reports and (later)
// MCP ask for one by spec; the exhibit's definition computes its data from the
// snapshot, states its facts in the app's words, and hands its component the
// props it draws from. The model never sees the data or the drawing, only
// the facts; the stored spec is a few bytes.

import type { Component } from "vue"
import type { Snapshot } from "~/features/snapshot/snapshot"
import type { Infer, ObjectSchema } from "./schema"

/** What names an exhibit: stored in a message, a report cell, a URL. */
export interface ExhibitSpec {
    kind: string
    v: number
    params: Record<string, unknown>
}

/** Where an exhibit was computed: the provenance every figure carries. */
export interface ExhibitRanOn { scanId: string; commit: string; revision: number; workspace: string }

/**
 * One checkable statement an exhibit makes, in the app's words. The unit a
 * citation points at: "E3.4". Its values and entities are what the claim check
 * compares a sentence against; its element is what lights up when it is cited.
 */
export interface Fact {
    id: string
    kind: "total" | "row" | "rank" | "absence" | "note"
    text: string
    entities: string[]
    values: Record<string, number>
    element?: string
}
export type FactDraft = Omit<Fact, "id">

/** Something in a figure that can be lit or picked: `floor:web`, `flow:web>core`, `component:com.acme.cart`. */
export interface Element { id: string; label: string }

/** Why an exhibit has nothing to draw here, said plainly ("This snapshot has no git history."). */
export interface Absent { absent: string }
export const isAbsent = (x: unknown): x is Absent => !!x && typeof x === "object" && typeof (x as Absent).absent === "string"

/** What resolving sees: the scan, and later the workspace's own data (groups) and other scans. */
export interface ResolveContext { snap: Snapshot }

export interface DrawOptions {
    density: "inline" | "full"
    /** Element ids to light, already checked against elements(). */
    highlight: string[]
    title: string
}

export interface ExhibitTable {
    columns: Array<{ id: string; label: string; numeric?: boolean }>
    rows: Array<Record<string, unknown>>
    total?: number
    note?: string
}

export interface ExhibitDef<P = any, D = any> {
    kind: string
    /** Bumped when the params or the facts change meaning. */
    v: number
    /** One line: what it shows. */
    summary: string
    params: ObjectSchema<any>
    title(p: P, d?: D): string
    resolve(p: P, ctx: ResolveContext): Promise<D | Absent>
    /** The statements the model reads and cites, most important first. At most ~25. */
    facts(d: D, p: P): FactDraft[]
    elements?(d: D): Element[]
    /** Every exhibit is also a table: its text fallback, CSV and report form. */
    table(d: D, p: P): ExhibitTable
    figure?: {
        /** The component, loaded only where something draws: definitions stay plain TypeScript for Node. */
        load: () => Promise<{ default: Component }>
        props(d: D, p: P, o: DrawOptions): Record<string, unknown>
        /** Height the figure needs at this density, in px: reserved while it loads, and given to it when it fills. */
        height(d: D, o: DrawOptions): number
        /** The component fills the box it is given (a tangle, a matrix) rather than sizing itself (the stack). */
        fill?: boolean
        /** Drawn only when this holds (a ranking of one row is a table); the table otherwise. */
        when?(d: D): boolean
        /** The component's events that pick an element, turned into its element id (or null for none). */
        picks?: Record<string, (...args: any[]) => string | null>
    }
    /** "Open in view": where the app shows this, and the graph focus to set there. */
    open?(p: P, d?: D): ExhibitOpen | null
    /** A small line under the figure: what the marks mean when the component draws no legend of its own. */
    note?(d: D, p: P): string
    /** Params worth trying on this snapshot, for the contract test (the empty params are always tried). */
    samples?(snap: Snapshot): Array<Record<string, unknown>>
}

/**
 * Declares an exhibit: `exhibit<Data>()({ … })`. The data type is stated once
 * (TypeScript cannot infer it across the definition's other methods); the
 * params are typed from the schema.
 */
export function exhibit<D>() {
    return <O extends ObjectSchema<any>>(def: Omit<ExhibitDef<Infer<O>, D>, "params"> & { params: O }): ExhibitDef<Infer<O>, D> => def as ExhibitDef<Infer<O>, D>
}

/** An exhibit as a conversation keeps it: the spec, and what it said then. */
export interface ExhibitPart {
    id: string
    spec: ExhibitSpec
    title: string
    ranOn: ExhibitRanOn
    facts: Fact[]
    /** The table as it was, so an old thread shows it even when the scan is gone. Capped. */
    table?: ExhibitTable
    open?: ExhibitOpen | null
}

export interface ExhibitOpen { route: string; label: string; focus?: string }
