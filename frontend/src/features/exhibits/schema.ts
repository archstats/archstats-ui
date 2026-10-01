// Parameters declared once: the TypeScript type, the JSON Schema a model or an
// MCP client sees, and the validation of what comes back. Small on purpose:
// strings, enums, numbers and booleans, all flat, which is all a tool call or
// an exhibit spec should ever need.

import { t } from "~/shared/i18n"

export type Scalar = string | number | boolean

interface FieldDef {
    type: "string" | "number" | "boolean"
    description?: string
    enum?: readonly string[]
    min?: number
    max?: number
    integer?: boolean
    default?: Scalar
    optional: boolean
}

export class Field<T extends Scalar, Opt extends boolean = false> {
    /** Type-level only: whether the field may be left out. */
    declare readonly _optional: Opt
    /** Type-level only: the value's type. */
    declare readonly _value: T
    constructor(readonly def: FieldDef) {}
    optional(): Field<T, true> { return new Field({ ...this.def, optional: true }) }
    describe(description: string): Field<T, Opt> { return new Field({ ...this.def, description }) }
    /** Used when the value is missing; the field stays optional to the caller. */
    default(value: T): Field<T, true> { return new Field({ ...this.def, default: value, optional: true }) }
}

export const s = {
    string: () => new Field<string>({ type: "string", optional: false }),
    enum: <E extends string>(values: readonly [E, ...E[]]) => new Field<E>({ type: "string", enum: values, optional: false }),
    number: (o: { min?: number; max?: number } = {}) => new Field<number>({ type: "number", ...o, optional: false }),
    integer: (o: { min?: number; max?: number } = {}) => new Field<number>({ type: "number", integer: true, ...o, optional: false }),
    boolean: () => new Field<boolean>({ type: "boolean", optional: false }),
    object: <S extends Shape>(shape: S, o: { aliases?: Record<string, keyof S & string> } = {}) => new ObjectSchema(shape, o.aliases ?? {}),
}

type Shape = Record<string, Field<any, boolean>>
type ValueOf<F> = F extends Field<infer T, boolean> ? T : never
type RequiredKeys<S extends Shape> = { [K in keyof S]: S[K]["_optional"] extends true ? never : K }[keyof S]
type OptionalKeys<S extends Shape> = Exclude<keyof S, RequiredKeys<S>>
export type Infer<O> = O extends ObjectSchema<infer S> ? { [K in RequiredKeys<S>]: ValueOf<S[K]> } & { [K in OptionalKeys<S>]?: ValueOf<S[K]> } : never

export interface Parsed<T> { value: T; dropped: string[] }

export class ObjectSchema<S extends Shape = Shape> {
    constructor(readonly shape: S, readonly aliases: Record<string, string>) {}

    /** JSON Schema for a tool definition or an MCP input schema. */
    jsonSchema(): { type: "object"; properties: Record<string, any>; required: string[]; additionalProperties: false } {
        const properties: Record<string, any> = {}
        const required: string[] = []
        for (const [k, f] of Object.entries(this.shape)) {
            const d = f.def
            properties[k] = {
                type: d.integer ? "integer" : d.type,
                ...(d.description ? { description: d.description } : {}),
                ...(d.enum ? { enum: [...d.enum] } : {}),
                ...(d.min !== undefined ? { minimum: d.min } : {}),
                ...(d.max !== undefined ? { maximum: d.max } : {}),
            }
            if (!d.optional) required.push(k)
        }
        return { type: "object", properties, required, additionalProperties: false }
    }

    /**
     * What a caller sent, made valid or refused. Unknown keys are dropped (and
     * named), aliases renamed, values coerced where the intent is plain ("5" →
     * 5, "Hotspots" → "hotspots", numbers clamped); a missing required value,
     * or an enum value that matches nothing, is an error that says what would do.
     */
    parse(input: unknown): Parsed<Infer<this>> | { error: string } {
        const raw: Record<string, unknown> = input && typeof input === "object" && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {}
        for (const [from, to] of Object.entries(this.aliases)) if (from in raw && !(to in raw)) { raw[to] = raw[from]; delete raw[from] }
        const out: Record<string, unknown> = {}
        const dropped = Object.keys(raw).filter(k => !(k in this.shape))
        for (const [k, f] of Object.entries(this.shape)) {
            const d = f.def
            let v = raw[k]
            if (v === null || v === undefined || v === "") {
                if (d.default !== undefined) out[k] = d.default
                else if (!d.optional) return { error: t("exhibits.schema.required", { k, value: d.description ? `: ${d.description}` : "" }) }
                continue
            }
            if (d.type === "string") {
                v = String(v).trim()
                if (d.enum) {
                    const hit = d.enum.find(e => e.toLowerCase() === String(v).toLowerCase())
                    if (!hit) return { error: t("exhibits.schema.mustOneGot", { k, value: d.enum.map(e => `"${e}"`).join(", "), v }) }
                    v = hit
                }
            } else if (d.type === "number") {
                let n = Number(v)
                if (!Number.isFinite(n)) return { error: t("exhibits.schema.mustNumberGot", { k, v }) }
                if (d.integer) n = Math.round(n)
                if (d.min !== undefined) n = Math.max(d.min, n)
                if (d.max !== undefined) n = Math.min(d.max, n)
                v = n
            } else {
                v = v === true || v === "true" || v === 1 || v === "1" || v === "yes"
            }
            out[k] = v
        }
        return { value: out as Infer<this>, dropped }
    }
}

/** A stable key for a params object: sorted keys, no undefined. */
export function stableKey(params: Record<string, unknown>): string {
    return JSON.stringify(Object.keys(params).filter(k => params[k] !== undefined).sort().map(k => [k, params[k]]))
}
