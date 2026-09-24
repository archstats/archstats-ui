// SQL literal helpers for the read-only query seam. Every view that puts a
// route param or a user string into SQL goes through these; nothing else may
// interpolate raw text.

export function sqlLiteral(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
    return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlIn(values: Array<string | number>): string {
    if (values.length === 0) return "(NULL)";
    return `(${values.map(sqlLiteral).join(", ")})`;
}

// LIKE pattern with the wildcards of the input escaped; use with `ESCAPE '\'`.
export function sqlLikeLiteral(value: string, mode: "contains" | "prefix" | "suffix" = "contains"): string {
    const escaped = value.replace(/[\\%_]/g, ch => `\\${ch}`);
    const pattern = mode === "contains" ? `%${escaped}%` : mode === "prefix" ? `${escaped}%` : `%${escaped}`;
    return `'${pattern.replace(/'/g, "''")}' ESCAPE '\\'`;
}
