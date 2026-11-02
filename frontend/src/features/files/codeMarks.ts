// How the source view words a line's marks: a route, an outbound call, a
// read or write of data, a configuration key, a binding, a flag, or a
// reference the engine could not resolve.

import { t } from "~/shared/i18n"
import { formatNumber } from "~/shared/format"
import type { LineMark, MarkKind } from "./codeIntel"

export const MARK_ICON: Record<MarkKind, string> = {
    entry: "log-in",
    outbound: "arrow-up-right",
    data: "database",
    config: "sliders",
    binding: "plug",
    flag: "flag",
    unresolved: "circle-dashed",
}

/** Which mark wins the gutter when a line has several. */
export const MARK_ORDER: MarkKind[] = ["entry", "flag", "outbound", "data", "binding", "config", "unresolved"]

export function leadMark(marks: LineMark[] | undefined): LineMark | null {
    if (!marks?.length) return null
    return [...marks].sort((a, b) => MARK_ORDER.indexOf(a.kind) - MARK_ORDER.indexOf(b.kind))[0]
}

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v))
const tail = (name: string): string => name.slice(Math.max(name.lastIndexOf("."), name.lastIndexOf("/")) + 1)

export function markTitle(m: LineMark): string {
    const d = m.data
    switch (m.kind) {
        case "entry": return [s(d.method), s(d.path)].filter(Boolean).join(" ") || s(d.handler) || s(d.kind)
        case "outbound": return t("files.codeMarks.outboundTo", { target: s(d.system) || s(d.host) || s(d.target) || s(d.client) })
        case "data": {
            const target = tail(s(d.target) || s(d.entity))
            return d.access === "write" ? t("files.codeMarks.writes", { target }) : d.access === "read_write" ? t("files.codeMarks.readsWrites", { target }) : t("files.codeMarks.reads", { target })
        }
        case "config": return s(d.key)
        case "binding": return t("files.codeMarks.binds", { iface: tail(s(d.interface)), impl: tail(s(d.implementation)) })
        case "flag": return s(d.rule).replace(/_/g, " ")
        case "unresolved": return t("files.codeMarks.unresolved")
    }
}

export function markDetail(m: LineMark): string {
    const d = m.data
    switch (m.kind) {
        case "entry": {
            if (d.functions === null || d.functions === undefined) return s(d.framework)
            return t("files.codeMarks.reach", { functions: formatNumber(Number(d.functions)), tables: formatNumber(Number(d.tables ?? 0)), outbound: formatNumber(Number(d.outbound ?? 0)) })
        }
        case "outbound": return [s(d.method), s(d.path)].filter(Boolean).join(" ") + (d.client ? ` · ${s(d.client)}` : "") + (d.confidence ? ` · ${s(d.confidence)}` : "")
        case "data": return [s(d.via), s(d.entity) && s(d.entity) !== s(d.target) ? tail(s(d.entity)) : ""].filter(Boolean).join(" · ")
        case "config": {
            const value = `= ${s(d.value)}${d.environment ? ` (${s(d.environment)})` : ""}`
            return Number(d.readers) > 0 ? `${value} · ${t("files.codeMarks.readBy", { count: Number(d.readers) })}` : value
        }
        case "binding": return s(d.mechanism).replace(/_/g, " ")
        case "flag": return s(d.detail)
        case "unresolved": return [s(d.names), s(d.reason)].filter(Boolean).join(" · ")
    }
}
