// Number formatting for evidence values: integers get thousands separators,
// fractions keep up to `decimals` places, nothing gets an exponent.
import { intlLocale, t } from "~/shared/i18n"

export function formatNumber(value: number | string | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (Number.isInteger(n)) return n.toLocaleString(intlLocale);
    return n.toLocaleString(intlLocale, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

export function formatSigned(value: number | string | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return "0";
    return `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString(intlLocale)}`;
}

export function shortHash(hash: string | null | undefined): string {
    return (hash || "").substring(0, 7);
}

/** A span of days in the unit a person would say it in: "12 d", "7 mo", "13.4 y". */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return "—"
  const d = Number(days)
  if (d < 60) return t("ui.format.days", { value: Math.round(d) })
  if (d < 730) return t("ui.format.mo", { value: Math.round(d / 30.44) })
  return t("ui.format.years", { value: fixed(d / 365.25, 1) })
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
  if (Number.isInteger(n)) return n.toLocaleString(intlLocale)
  const a = Math.abs(n)
  const decimals = a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 ? 2 : 3
  return n.toLocaleString(intlLocale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Bytes as people read them: 812 MB, 1.3 GB. */
export function formatBytes(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = b / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i < 1 ? Math.round(v) : fixed(v, 1)} ${units[i]}`
}

/** A number with a fixed count of decimals, in the app's language: 1.83 or 1,83. */
export function fixed(value: number | null | undefined, digits: number): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return ""
    return value.toLocaleString(intlLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
