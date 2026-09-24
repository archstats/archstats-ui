import type { PinStatus, PinValues } from "~/utils/evidence"

// The evidence board as a Markdown report: a methodology header a reader can
// check the numbers against, the pins in board order with their values then
// and now and their figures, and a glossary of every metric cited. Nothing
// missing is guessed; it says "not recorded".

export interface ReportHeader {
    workspace: string
    scannedAt: string | null
    commit: string
    branch: string
    uncommitted: number | null
    appVersion: string
    revision: number
    extensions: string
    roles: string
    ignoreGlobs: string
    shallow: boolean | null
    historyRange: string
    anchor: string
    sweeping: number | null
    pseudonymised: boolean
}

export interface ReportPin {
    kind: string
    title: string
    note: string
    pinned: PinValues
    now: PinValues | null
    status: PinStatus | null
    snapshot: string
    commit: string
    revision: number
    lens: string
    scope: string
    figureFile: string | null
}

export interface GlossaryEntry { id: string; name: string; short: string }

const nr = (v: unknown) => (v === null || v === undefined || v === "" ? "not recorded" : String(v))
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")
const num = (v: number | undefined) => (v === undefined ? "—" : Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }))

export function reportMarkdown(title: string, h: ReportHeader, pins: ReportPin[], glossary: GlossaryEntry[], nameOf: (id: string) => string): string {
    const out: string[] = [`# ${title}`, "", "## Method", ""]
    out.push(
        `- **Workspace:** ${h.workspace}`,
        `- **Scanned:** ${nr(h.scannedAt)}`,
        `- **Commit:** ${h.commit ? `${h.branch ? h.branch + " " : ""}\`${h.commit}\`` : "not recorded"}${h.uncommitted ? `, ${h.uncommitted} uncommitted files` : ""}`,
        `- **Analysis:** revision ${h.revision}, Archstats desktop ${h.appVersion}`,
        `- **Language packs:** ${nr(h.extensions)}`,
        `- **Files by role:** ${nr(h.roles)}`,
        `- **Left out by the workspace:** ${h.ignoreGlobs ? h.ignoreGlobs.split("\n").map(g => `\`${g}\``).join(", ") : "nothing beyond the repository's ignore files"}`,
        `- **History:** ${h.shallow === null ? "not recorded" : h.shallow ? "shallow clone: only the fetched commits are counted" : "full clone"}; windows count back to ${nr(h.anchor)}${h.historyRange ? `; range ${h.historyRange}` : ""}`,
        `- **Co-change:** ${h.sweeping === null ? "not recorded" : `${h.sweeping.toLocaleString("en-US")} sweeping commits left out of co-change only`}`,
    )
    if (h.pseudonymised) out.push("- **Authors:** pseudonymised (Author 1…N, numbered by first commit)")
    for (const p of pins) {
        if (p.kind === "heading") { out.push("", `## ${p.title}`); continue }
        out.push("", `### ${p.title}`)
        if (p.note.trim()) out.push("", p.note.trim())
        const keys = Object.keys(p.pinned)
        if (keys.length) {
            out.push("", "| Reading | Pinned | Now |", "| --- | ---: | ---: |")
            for (const k of keys) out.push(`| ${esc(nameOf(k))} | ${num(p.pinned[k])} | ${p.now ? num(p.now[k]) : "gone"} |`)
        }
        if (p.status?.text) out.push("", `_Status: ${p.status.text}._`)
        if (p.figureFile) out.push("", `![${esc(p.title)}](${encodeURI(p.figureFile)})`)
        out.push("", `<sub>${[p.snapshot, p.commit ? p.commit.slice(0, 7) : "", `r${p.revision}`, p.lens ? `lens ${p.lens}` : "", p.scope ? `scope ${p.scope}` : ""].filter(Boolean).join(" · ")}</sub>`)
    }
    if (glossary.length) {
        out.push("", "## Glossary", "")
        for (const g of [...glossary].sort((a, b) => a.name.localeCompare(b.name))) out.push(`- **${g.name}** (\`${g.id}\`): ${g.short}`)
    }
    return out.join("\n") + "\n"
}

/** The metric ids cited by the pins, for the glossary. */
export function citedMetrics(pins: Array<{ pinned: PinValues }>): string[] {
    return [...new Set(pins.flatMap(p => Object.keys(p.pinned)))]
}

/** Author names found in free text: a note naming a real person blocks a pseudonymised export. */
export function namesIn(text: string, names: string[]): string[] {
    const lower = text.toLowerCase()
    return names.filter(n => n.length > 2 && lower.includes(n.toLowerCase()))
}
