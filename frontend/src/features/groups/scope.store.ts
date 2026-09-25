import { acceptHMRUpdate, defineStore } from "pinia";
import { useDataStore } from "~/features/snapshot/data.store";
import { componentMembers, useGroupsStore, type SavedGroup } from "./groups.store";
import { parseQuery, provideGraph, runQuery } from "./query";
import { detectSeparator } from "~/features/snapshot/names";
import { useStateStore } from "~/platform/state.store";
import { componentPassesFacet, passesFacet, type RoleFacet } from "~/features/snapshot/fileRole";

// The active scope: any number of saved groups. Groups in the same dimension
// widen the scope (Audits or Shipments); groups in different dimensions
// narrow it (… and Controllers). Views read `componentNames` / `fileNames`
// and filter their rows; the sidebar toggles groups and the toolbar chips
// remove them. Session-local on purpose: a scope is a lens, not a setting.
//
// The focus is the pointed half: "this component and what talks to it",
// set from a menu rather than typed. It is query text like the typed half,
// kept apart so pointing never overwrites a question someone wrote, and it
// keeps a trail so a walk through the graph can be walked back.

// Graph lines read the snapshot's runtime import graph, the one the engine's
// own coupling and cycles are measured on.
provideGraph(() => useDataStore().componentConnections);

const TRAIL = 30;

export const useScopeStore = defineStore("scope", {
    state: (): { groupIds: string[]; query: string; recents: string[]; focus: string; focusBack: string[]; focusAhead: string[] } =>
        ({ groupIds: [], query: "", recents: [], focus: "", focusBack: [], focusAhead: [] }),
    getters: {
        /**
         * Production or tests, or all: one switch per workspace that every
         * view obeys, kept with the workspace (app.db) because it is a way
         * of working, not a passing question. All by default.
         */
        facet(): RoleFacet {
            const v = useStateStore().get<string>("fileRole.facet", "all");
            return v === "production" || v === "test" ? v : "all";
        },
        /** Components on the facet's side; null when the facet is All. */
        facetComponents(): Set<string> | null {
            const facet = this.facet;
            if (facet === "all") return null;
            const data = useDataStore();
            const roles = data.fileRoleIndex;
            const out = new Set<string>();
            for (const [component, files] of data.componentFilesIndex) {
                if (componentPassesFacet(files.map(f => roles.get(f) ?? "production"), facet)) out.add(component);
            }
            return out;
        },
        /**
         * The ad-hoc half of the scope: a question typed rather than saved.
         *
         * A query narrows the scope the way another dimension does, because
         * that is what it is — one more thing that must also be true. Keeping
         * it here rather than in each view means every surface that already
         * filters by scope filters by a query without knowing queries exist.
         */
        queryMatches(state): { components: Set<string>; files: Set<string>; direct: Set<string> } | null {
            if (!state.query.trim()) return null;
            const data = useDataStore();
            const components = Array.from(data.componentFilesIndex.keys());
            const files = Array.from(data.fileComponentIndex.keys());
            if (!components.length) return null;
            const groups = useGroupsStore();
            const metrics = groups.metrics;
            const r = runQuery(parseQuery(state.query), {
                components,
                files,
                componentSep: detectSeparator(components),
                metric: metrics
                    ? (kind, id, name) => {
                        const row = (kind === "component" ? metrics.components : metrics.files).get(id);
                        if (!row) return undefined;
                        const v = row[metrics.alias.get(name.toLowerCase()) ?? name];
                        return typeof v === "number" && Number.isFinite(v) ? v : undefined;
                    }
                    : undefined,
            });
            // A query naming files scopes the components holding them, so a
            // component view is not left empty by a file-shaped question. The
            // two answers stay separate on purpose: folding the holders back
            // in would put every file of `billing` in scope for a question
            // that only asked about its DAOs.
            const direct = new Set(r.components);
            const holders = new Set(direct);
            for (const f of r.files) { const c = data.fileComponentIndex.get(f); if (c) holders.add(c); }
            return { components: holders, files: new Set(r.files), direct };
        },
        /** The components the focus holds; null with no focus. */
        focusMatches(state): Set<string> | null {
            if (!state.focus.trim()) return null;
            const data = useDataStore();
            const components = Array.from(data.componentFilesIndex.keys()) as string[];
            if (!components.length) return null;
            return new Set(runQuery(parseQuery(state.focus), { components, files: [], componentSep: detectSeparator(components) }).components);
        },
        groups(state): SavedGroup[] {
            const store = useGroupsStore();
            return state.groupIds.map(id => store.getGroupById(id)).filter((g): g is SavedGroup => !!g);
        },
        /** The first scoped group, for callers that only need one. */
        group(): SavedGroup | null {
            return this.groups[0] ?? null;
        },
        /** Kept for callers that compare against a single id. */
        groupId(state): string | null {
            return state.groupIds[0] ?? null;
        },
        isActive(): boolean {
            return this.groups.length > 0 || !!this.query.trim() || !!this.focus.trim() || this.facet !== "all";
        },
        /** Groups or a query: what Clear scope clears (the facet is a setting). */
        hasSelection(): boolean {
            return this.groups.length > 0 || !!this.query.trim() || !!this.focus.trim();
        },
        /** Groups bucketed by dimension, in the order they were added. */
        byDimension(): Array<{ dimension: string; groups: SavedGroup[] }> {
            const out = new Map<string, SavedGroup[]>();
            for (const g of this.groups) out.set(g.dimension, [...(out.get(g.dimension) ?? []), g]);
            return Array.from(out.entries()).map(([dimension, groups]) => ({ dimension, groups }));
        },
        // Component names inside the scope: union within a dimension,
        // intersection across dimensions. A component counts when the group
        // holds it whole or holds any of its files.
        componentNames(): Set<string> | null {
            if (!this.isActive) return null;
            const groups = useGroupsStore();
            let result: Set<string> | null = null;
            for (const { groups: list } of this.byDimension) {
                const union = new Set<string>();
                for (const g of list) for (const c of groups.componentsOf(g).keys()) union.add(c);
                result = result === null ? union : new Set([...result].filter(c => union.has(c)));
            }
            const typed = this.queryMatches;
            if (typed) result = result === null ? typed.components : new Set([...result].filter(c => typed.components.has(c)));
            const focus = this.focusMatches;
            if (focus) result = result === null ? focus : new Set([...result].filter(c => focus.has(c)));
            const facet = this.facetComponents;
            if (facet) result = result === null ? facet : new Set([...result].filter(c => facet.has(c)));
            return result ?? new Set();
        },
        // Components listed whole by every dimension of the scope. Files of
        // these are in scope even before the file index has loaded.
        wholeComponentNames(): Set<string> | null {
            if (!this.isActive) return null;
            let result: Set<string> | null = null;
            for (const { groups: list } of this.byDimension) {
                const union = new Set<string>();
                for (const g of list) for (const c of componentMembers(g)) union.add(c);
                result = result === null ? union : new Set([...result].filter(c => union.has(c)));
            }
            const typed = this.queryMatches;
            if (typed) result = result === null ? typed.components : new Set([...result].filter(c => typed.components.has(c)));
            const focus = this.focusMatches;
            if (focus) result = result === null ? focus : new Set([...result].filter(c => focus.has(c)));
            return result ?? new Set();
        },
        // File names inside the scope: listed files plus the files of listed components.
        fileNames(): Set<string> | null {
            if (!this.isActive) return null;
            const groups = useGroupsStore();
            let result: Set<string> | null = null;
            for (const { groups: list } of this.byDimension) {
                const union = new Set<string>();
                for (const g of list) for (const f of groups.filesOf(g)) union.add(f);
                result = result === null ? union : new Set([...result].filter(f => union.has(f)));
            }
            const focus = this.focusMatches;
            if (focus) {
                const data = useDataStore();
                const held = new Set<string>();
                for (const c of focus) for (const f of data.componentFilesIndex.get(c) ?? []) held.add(f);
                result = result === null ? held : new Set([...result].filter(f => held.has(f)));
            }
            if (this.facet !== "all") {
                const roles = useDataStore().fileRoleIndex;
                const facet = this.facet;
                const base: Iterable<string> = result ?? roles.keys();
                result = new Set([...base].filter(f => passesFacet(roles.get(f) ?? "production", facet)));
            }
            return result ?? new Set();
        },
    },
    actions: {
        /** Replace the scope with one group (or nothing). */
        setGroup(id: string | null) { this.groupIds = id ? [id] : []; },
        /** Add a group to the scope, or take it out again. */
        toggleGroup(id: string) {
            this.groupIds = this.groupIds.includes(id) ? this.groupIds.filter(x => x !== id) : [...this.groupIds, id];
        },
        removeGroup(id: string) { this.groupIds = this.groupIds.filter(x => x !== id); },
        setQuery(query: string) { this.query = query; },
        /**
         * Questions worth asking get asked twice. Kept newest-first, per
         * workspace rather than per scan: a query outlives a snapshot.
         */
        remember(query: string) {
            const text = query.trim();
            if (!text) return;
            this.recents = [text, ...this.recents.filter(q => q !== text)].slice(0, 12);
        },
        clearQuery() { this.query = ""; },
        clear() { this.groupIds = []; this.query = ""; if (this.focus) this.setFocus(""); },
        /**
         * Point the views somewhere. The focus it replaces goes on the trail,
         * so Back returns to it; a new focus drops whatever was ahead, the
         * way a browser does.
         */
        setFocus(text: string) {
            const next = text.trim();
            if (next === this.focus) return;
            this.focusBack = [...this.focusBack, this.focus].slice(-TRAIL);
            this.focusAhead = [];
            this.focus = next;
        },
        clearFocus() { this.setFocus(""); },
        back() {
            if (!this.focusBack.length) return;
            this.focusAhead = [this.focus, ...this.focusAhead].slice(0, TRAIL);
            this.focus = this.focusBack[this.focusBack.length - 1];
            this.focusBack = this.focusBack.slice(0, -1);
        },
        forward() {
            if (!this.focusAhead.length) return;
            this.focusBack = [...this.focusBack, this.focus].slice(-TRAIL);
            this.focus = this.focusAhead[0];
            this.focusAhead = this.focusAhead.slice(1);
        },
        /** Jump to a focus on the trail, keeping the rest of the trail either side. */
        jumpBack(index: number) {
            if (index < 0 || index >= this.focusBack.length) return;
            this.focusAhead = [...this.focusBack.slice(index + 1), this.focus, ...this.focusAhead].slice(0, TRAIL);
            this.focus = this.focusBack[index];
            this.focusBack = this.focusBack.slice(0, index);
        },
        setFacet(facet: RoleFacet) { useStateStore().set("fileRole.facet", facet === "all" ? null : facet); },
        componentInScope(name: string): boolean {
            const set = this.componentNames;
            return set === null || set.has(name);
        },
        fileInScope(file: string, component: string | null | undefined): boolean {
            if (!this.isActive) return true;
            if (this.facet !== "all" && !passesFacet(useDataStore().fileRoleIndex.get(file) ?? "production", this.facet)) return false;
            const typed = this.queryMatches;
            // A typed question that named files answers about those files; one
            // that named components answers about everything they hold.
            if (typed && !(typed.files.has(file) || (!!component && typed.direct.has(component)))) return false;
            const focus = this.focusMatches;
            if (focus && !(!!component && focus.has(component))) return false;
            if (this.groupIds.length === 0) return true;
            if ((this.fileNames as Set<string>).has(file)) return true;
            return !!component && (this.wholeComponentNames as Set<string>).has(component);
        },
    },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useScopeStore, import.meta.hot));
