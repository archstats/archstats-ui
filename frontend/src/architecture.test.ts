// The module rules, checked on every test run. See src/README.md for the
// layout they protect. A failure here names the import that broke a rule.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SRC = dirname(fileURLToPath(import.meta.url))

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name)
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(name) ? [relative(SRC, p)] : []
    })
}

const IMPORT = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/gs

/** Every import of a project file, as [importer, imported], both relative to src/. */
function imports(): Array<[string, string]> {
    const out: Array<[string, string]> = []
    for (const file of walk(SRC)) {
        if (file.endsWith(".test.ts")) continue
        for (const m of readFileSync(join(SRC, file), "utf8").matchAll(IMPORT)) {
            const spec = m[1] ?? m[2]
            if (spec.startsWith("~/")) out.push([file, normalize(spec.slice(2))])
            else if (spec.startsWith(".")) out.push([file, normalize(join(dirname(file), spec))])
        }
    }
    return out
}

/** The top-level part a file belongs to: a feature's name, or shared, platform, pages... */
function partOf(file: string): string {
    const [top, second] = file.split("/")
    return top === "features" ? second : top
}

describe("module rules", () => {
    const edges = imports()

    it("keeps shared and platform free of features, pages and layouts", () => {
        const bad = edges.filter(([from, to]) => /^(shared|platform)\//.test(from) && /^(features|pages|layouts)\//.test(to))
        expect(bad).toEqual([])
    })

    it("never imports a page or a layout from a feature", () => {
        const bad = edges.filter(([from, to]) => from.startsWith("features/") && /^(pages|layouts)\//.test(to))
        expect(bad).toEqual([])
    })

    it("has no utils, stores, composables or components folders to fall back into", () => {
        const bad = walk(SRC).filter(f => /^(utils|stores|composables|components)\//.test(f))
        expect(bad).toEqual([])
    })

    it("adds no new pair of features that depend on each other", () => {
        // Known pairs, each a debt with a reason (see src/README.md):
        // workspace selection loads every feature's per-workspace state, and
        // those features read the active workspace back.
        const KNOWN = new Set(["git|workspace", "groups|workspace", "lens-builder|workspace", "git|groups", "git|metrics"])
        const deps = new Map<string, Set<string>>()
        for (const [from, to] of edges) {
            if (!from.startsWith("features/") || !to.startsWith("features/")) continue
            const a = partOf(from), b = partOf(to)
            if (a !== b) deps.set(a, (deps.get(a) ?? new Set()).add(b))
        }
        const mutual = [...deps].flatMap(([a, bs]) => [...bs].filter(b => a < b && deps.get(b)?.has(a)).map(b => `${a}|${b}`))
        expect(mutual.filter(p => !KNOWN.has(p))).toEqual([])
    })

    // The Wails bindings (wailsjs/, generated from the Go services) are the
    // IPC seam. A component asks a store, composable or module in its feature
    // (or platform/) and that file calls Go, so the call has one place to be
    // typed, guarded and faked in tests.
    const BINDING = /(?:from\s+|import\(\s*)["']wailsjs\//
    const callsGo = walk(SRC).filter(f => !f.endsWith(".test.ts") && BINDING.test(readFileSync(join(SRC, f), "utf8")))

    it("keeps shared free of the Go bindings", () => {
        expect(callsGo.filter(f => f.startsWith("shared/"))).toEqual([])
    })

    it("adds no .vue file that calls the Go bindings itself", () => {
        // Files that did before this rule. Move the call into the feature's
        // store or module when you next change one, then delete it here.
        const KNOWN = new Set([
            "features/ai/components/AISettings.vue",
            "features/files/components/OpenInEditor.vue",
            "features/reports/components/AddToReportSheet.vue",
            "features/reports/components/PdfPreviewSheet.vue",
            "features/rules/components/DriftBar.vue",
            "features/sql/components/SchemaExplorer.vue",
            "features/trends/components/SinceBar.vue",
            "features/workspace/components/BackfillQueue.vue",
            "features/workspace/components/CloneSheet.vue",
            "features/workspace/components/ImportSnapshotSheet.vue",
            "features/workspace/components/OutdatedSnapshotBar.vue",
            "features/workspace/components/RescanCommitSheet.vue",
            "features/workspace/components/ScanPanel.vue",
            "features/workspace/components/ScanTagsSheet.vue",
            "features/workspace/components/StorageSheet.vue",
            "features/workspace/components/WorkspaceSettingsSheet.vue",
            "features/workspace/components/WorkspaceSwitcher.vue",
            "pages/views/changes.vue",
            "pages/views/evidence.vue",
            "pages/views/query.vue",
            "pages/views/trends.vue",
        ])
        const vue = callsGo.filter(f => f.endsWith(".vue"))
        expect(vue.filter(f => !KNOWN.has(f)), "call Go from the feature's store or module, not the component").toEqual([])
        expect([...KNOWN].filter(f => !vue.includes(f)), "no longer calls Go: delete it from KNOWN").toEqual([])
    })
})
