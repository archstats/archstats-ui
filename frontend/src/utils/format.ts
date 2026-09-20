// Number formatting for evidence values: integers get thousands separators,
// fractions keep up to `decimals` places, nothing gets an exponent.
export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (Number.isInteger(n)) return n.toLocaleString("en-US");
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

export function formatSigned(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return "0";
    return `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US")}`;
}

export function shortHash(hash: string | null | undefined): string {
    return (hash || "").substring(0, 7);
}
