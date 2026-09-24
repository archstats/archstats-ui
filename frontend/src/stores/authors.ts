import { acceptHMRUpdate, defineStore } from "pinia"
import { canonicalAuthor, maskPeople, pseudonymLabels, type AliasMap } from "~/utils/authors"
import { useDataStore } from "~/stores/data"
import { useStateStore } from "~/stores/state"

// The architect's corrections to the git history: which names are one person,
// and whether machine accounts are counted. Merges belong to a workspace --
// they are facts about that repository's history -- and survive rescans.

const key = (workspace: string) => `archstats:author-aliases:${workspace}`

export const useAuthorsStore = defineStore("authors", {
    state: () => ({
        workspace: "" as string,
        aliases: {} as AliasMap,
        showBots: false,
        /** Canonical name → "Author N" for the open snapshot; filled while pseudonymisation is on. */
        labels: {} as Record<string, string>,
        labelsFor: "" as string,
    }),
    getters: {
        /** Per workspace: a works-council-safe workspace stays safe on the next launch. */
        pseudonymise(): boolean {
            return !!useStateStore().get<boolean>("authors.pseudonymise", false)
        },
        /** The name to show for an author: the name, or its pseudonym. */
        display(): (name: string | null | undefined) => string {
            const on = this.pseudonymise
            const labels = this.labels
            const aliases = this.aliases
            return (name) => {
                if (!on) return name || "Unknown"
                if (!name) return "Unknown"
                return labels[canonicalAuthor(aliases, name)] ?? "Author"
            }
        },
        /** An email, or nothing when authors are pseudonymised. */
        displayEmail(): (email: string | null | undefined) => string {
            const on = this.pseudonymise
            return (email) => (on ? "" : email ?? "")
        },
        /** Free text (a commit message) with people masked when pseudonymised. */
        displayText(): (text: string | null | undefined) => string {
            const on = this.pseudonymise
            return (text) => (on ? maskPeople(text ?? "") : text ?? "")
        },
        /** The author page's path; pseudonymised, it carries the label. */
        authorPath(): (name: string | null | undefined) => string {
            const display = this.display
            const on = this.pseudonymise
            return (name) => `/views/git/authors/${encodeURIComponent(on ? display(name) : name || "")}`
        },
        /** The author a route names: pseudonymised routes carry the label, never the name. */
        resolve(): (param: string) => string {
            const on = this.pseudonymise
            const labels = this.labels
            return (param) => {
                if (!on) return param
                for (const [name, label] of Object.entries(labels)) if (label === param) return name
                return param
            }
        },
    },
    actions: {
        load(workspace: string) {
            if (this.workspace === workspace) return
            this.workspace = workspace
            try {
                const raw = localStorage.getItem(key(workspace))
                this.aliases = raw ? JSON.parse(raw) : {}
            } catch {
                this.aliases = {}
            }
        },
        async setPseudonymise(on: boolean) {
            if (on) await this.loadLabels(true)
            useStateStore().set("authors.pseudonymise", on ? true : null)
        },
        /** Numbers the open snapshot's authors; cheap, and redone when the snapshot or the merges change. */
        async loadLabels(force = false) {
            const data = useDataStore()
            const key = `${data._openScanId ?? ""}:${JSON.stringify(this.aliases)}`
            if (!force && key === this.labelsFor) return
            if (!data.hasData || !data.hasView("git_commits")) { this.labels = {}; this.labelsFor = key; return }
            const rows = await data.query<{ name: string; first: string | null }>("SELECT author_name AS name, min(commit_time) AS first FROM git_commits GROUP BY author_name")
            this.labels = pseudonymLabels(rows, this.aliases)
            this.labelsFor = key
        },
        save() {
            try { localStorage.setItem(key(this.workspace), JSON.stringify(this.aliases)) } catch { /* private mode */ }
        },
        /** Fold `alias` (and anything already merged into it) into `into`. */
        merge(alias: string, into: string) {
            if (!alias || !into || alias === into) return
            const target = this.aliases[into] ?? into
            const next: AliasMap = {}
            for (const [a, c] of Object.entries(this.aliases)) next[a] = c === alias ? target : c
            next[alias] = target
            delete next[target]
            this.aliases = next
            this.save()
        },
        unmerge(alias: string) {
            const next = { ...this.aliases }
            delete next[alias]
            this.aliases = next
            this.save()
        },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAuthorsStore, import.meta.hot))
