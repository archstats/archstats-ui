import { acceptHMRUpdate, defineStore } from "pinia"
import type { AliasMap } from "~/utils/authors"

// The architect's corrections to the git history: which names are one person,
// and whether machine accounts are counted. Merges belong to a workspace --
// they are facts about that repository's history -- and survive rescans.

const key = (workspace: string) => `archstats:author-aliases:${workspace}`

export const useAuthorsStore = defineStore("authors", {
    state: () => ({
        workspace: "" as string,
        aliases: {} as AliasMap,
        showBots: false,
    }),
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
