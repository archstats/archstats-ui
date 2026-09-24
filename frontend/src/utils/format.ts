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

/** A span of days in the unit a person would say it in: "12 d", "7 mo", "13.4 y". */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return "—"
  const d = Number(days)
  if (d < 60) return `${Math.round(d)} d`
  if (d < 730) return `${Math.round(d / 30.44)} mo`
  return `${(d / 365.25).toFixed(1)} y`
}

/**
 * A metric in a table cell: whole numbers grouped, fractions rounded to what
 * a reader can compare down a column. `9.84341` and `61.64566` said nothing
 * the first digits did not.
 */
export function formatReading(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  if (Number.isInteger(n)) return n.toLocaleString("en-US")
  const a = Math.abs(n)
  const decimals = a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 ? 2 : 3
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Bytes as people read them: 812 MB, 1.3 GB. */
export function formatBytes(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = b / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i < 1 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
