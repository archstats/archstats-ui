import { Version } from "wailsjs/go/app/AppService"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useLensStore } from "~/features/groups/lens.store"
import { useScopeStore } from "~/features/groups/scope.store"
import { useStateStore } from "~/platform/state.store"
import { t, listOf } from "~/shared/i18n"

// Where a number came from. Every figure, table and pin that leaves the app
// carries this: a reader of a report must be able to tell which snapshot,
// which commit, which analysis and which slicing produced the number, and to
// reproduce it. The short form sits under figures; the full form heads CSV
// files and the Markdown methodology block. The folder path is left out: a
// report travels, and the path says whose laptop it came from.

export interface Provenance {
    workspace: string
    snapshot: string
    scannedAt: string | null
    branch: string
    commit: string
    uncommitted: number | null
    revision: number
    revisionOutdated: boolean
    lens: string | null
    scope: string | null
    role: string | null
    pseudonymised: boolean
    /** A custom history range, when one is set. */
    historyRange: string | null
    view: string
    appVersion: string
}

let version = "dev"
void (async () => { try { version = await Version() } catch { /* not in the desktop shell */ } })()

const shortSha = (sha: string) => sha.slice(0, 7)

export function buildProvenance(view = typeof location !== "undefined" ? location.hash.replace(/^#/, "") : ""): Provenance {
    const data = useDataStore()
    const workspaces = useWorkspacesStore()
    const lens = useLensStore()
    const scope = useScopeStore()
    const state = useStateStore()
    const scan: any = workspaces.openScan
    const info = data.snapshotInfo ?? {}
    const scopeGroups = listOf(scope.byDimension.map(b => listOf(b.groups.map(g => g.name), "disjunction")))
    const scopeText = [scopeGroups, scope.query.trim() ? t("export.provenance.matching", { query: scope.query.trim() }) : ""].filter(Boolean).join(", ")
    const role = state.get<string>("fileRole.facet", "all")
    return {
        workspace: workspaces.active?.name ?? "",
        snapshot: scan?.label || (scan ? new Date(scan.startedAt).toISOString().slice(0, 16).replace("T", " ") : ""),
        scannedAt: scan?.startedAt ? new Date(scan.startedAt).toISOString() : null,
        branch: info.git_branch || scan?.branch || "",
        commit: info.git_head_commit || scan?.headCommit || "",
        uncommitted: info.git_dirty_files !== undefined ? Number(info.git_dirty_files) : (scan?.dirtyFiles ?? null),
        revision: data._snapshotRevision ?? 0,
        revisionOutdated: !!data.snapshotOutdated,
        lens: lens.active ?? null,
        scope: scopeText || null,
        role: role && role !== "all" ? role : null,
        pseudonymised: !!state.get("authors.pseudonymise", false),
        historyRange: (() => { const r = state.get<{ since: string; until: string } | null>("history.range", null); return r ? t("export.provenance.to", { since: r.since, until: r.until }) : null })(),
        view,
        appVersion: version,
    }
}

/** One line under a figure: workspace · date · branch@sha · rN, then lens, scope and role when set. */
export function provenanceShort(p: Provenance): string {
    const parts = [p.workspace, p.snapshot]
    if (p.commit) parts.push(`${p.branch ? p.branch + "@" : ""}${shortSha(p.commit)}${p.uncommitted ? t("export.provenance.uncommitted", { uncommitted: p.uncommitted }) : ""}`)
    parts.push(`r${p.revision}${p.revisionOutdated ? " (outdated)" : ""}`)
    if (p.lens) parts.push(t("export.provenance.lens", { lens: p.lens }))
    if (p.scope) parts.push(t("export.provenance.scope", { scope: p.scope }))
    if (p.role) parts.push(t("export.provenance.files", { role: p.role }))
    if (p.pseudonymised) parts.push(t("export.provenance.authorsPseudonymised"))
    return parts.filter(Boolean).join(" · ")
}

/** The full form as `key: value` lines, for a CSV preamble (each prefixed with "# "). */
export function provenanceLines(p: Provenance): Array<[string, string]> {
    const out: Array<[string, string]> = [
        ["workspace", p.workspace],
        ["snapshot", p.snapshot],
    ]
    if (p.scannedAt) out.push(["scanned", p.scannedAt])
    if (p.commit) out.push(["commit", `${p.branch ? p.branch + " " : ""}${p.commit}`])
    if (p.uncommitted) out.push([t("export.provenance.uncommittedFiles"), String(p.uncommitted)])
    out.push([t("export.provenance.analysisRevision"), `${p.revision}${p.revisionOutdated ? t("export.provenance.olderThanBuildS") : ""}`])
    if (p.lens) out.push(["lens", p.lens])
    if (p.scope) out.push(["scope", p.scope])
    if (p.role) out.push(["files", p.role])
    if (p.pseudonymised) out.push(["authors", "pseudonymised"])
    if (p.historyRange) out.push(["history", p.historyRange])
    if (p.view) out.push(["view", p.view])
    out.push([t("export.provenance.archstatsDesktop"), p.appVersion])
    return out
}

/** The full form as a Markdown block, for reports and pins. */
export function provenanceMarkdown(p: Provenance): string {
    return provenanceLines(p).map(([k, v]) => `- **${k}:** ${v}`).join("\n")
}
