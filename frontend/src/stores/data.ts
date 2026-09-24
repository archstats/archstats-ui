import {acceptHMRUpdate, defineStore} from 'pinia'
import {findCommonPrefix} from "~/utils/text";
import {
    Component,
    ComponentGraph,
    createComponentGraph,
    RawComponent,
    RawComponentConnection,
    resizeConnectionsOnComponents
} from "~/utils/components";

import type {Definition} from "~/utils/definition";
import {StatNameResolver, getNiceStatName} from "~/utils/stat_resolver";
import {WailsDb} from "~/utils/db";
import {AnalysisRevision} from "wailsjs/go/app/QueryService";

// Module-level, non-reactive handle. Historically this avoided Vue wrapping
// the sql.js worker's internals (nextId, pending Map) in reactive proxies,
// which caused infinite watchEffect re-triggers on every query. WailsDb is
// stateless, so it can simply be a constant; which scan is open lives in
// reactive store state (_openScanId) — that string is the reactivity
// trigger, never this object.
const _db = new WailsDb();


export const useDataStore = defineStore('data', {
    state: (): {
        _viewNames: string[];
        _definitions: Map<string, Definition>;
        _allRawComponents: RawComponent[];
        _componentConnections: RawComponentConnection[];
        _allCyclesExpanded: any[];
        _distinctComponentColumns: string[];
        _fileComponents: Array<{ name: string; component: string | null }>;
        _initialized: boolean;
        _openScanId: string | null;
        /** The analysis revision the open snapshot was written with; 0 for snapshots older than the stamp. */
        _snapshotRevision: number | null;
        /** The analysis revision this build scans with. */
        _engineRevision: number | null;
        /** Every key of the open snapshot's _snapshot table. */
        _snapshotInfo: Record<string, string>;
        /** Columns per table of the open snapshot. */
        _columns: Record<string, string[]>;
    } => {
        return {
            _viewNames: [],
            _definitions: new Map(),
            _allRawComponents: [],
            _componentConnections: [],
            _allCyclesExpanded: [],
            _distinctComponentColumns: [],
            _fileComponents: [],
            _initialized: false,
            _openScanId: null,
            _snapshotRevision: null,
            _engineRevision: null,
            _snapshotInfo: {},
            _columns: {},
        }
    },
    getters: {
        snapshotInfo(state: any): Record<string, string> {
            return state._snapshotInfo;
        },
        /** Whether the open snapshot has this column; older snapshots lack newer ones. */
        hasColumn(state: any) {
            return (table: string, column: string): boolean => (state._columns[table] ?? []).includes(column);
        },
        /**
         * The open snapshot was scanned before fixes this build has. A
         * snapshot never changes after it is written, so a corrected rule,
         * count or classification only reaches it through a new scan.
         */
        snapshotOutdated(state: any): boolean {
            return state._engineRevision !== null && state._snapshotRevision !== null && state._snapshotRevision < state._engineRevision;
        },

        statNames(state: any) {
            return (stats: string[]): string[] => {
                return this.statNameResolver.getStatNames(stats);
            }
        },
        statName(state: any) {
            return (stat: string): string => {
                return this.statNameResolver.getStatName(stat);
            }
        },
        statNiceName(state: any) {
            return (stat: string): string => {
                if (!stat) return "";
                const def = this.definitions.get(stat);
                if (def && def.name) {
                    return def.name;
                }
                return getNiceStatName(stat);
            }
        },

        statNameResolver(state: any) {
            // No breaking changes yet, so we can just return an empty resolver.
            return new StatNameResolver("");
        },

        getDistinctComponentColumns(state: any): string[] {
            return state._distinctComponentColumns;
        },

        getComponentName(): (component: RawComponent | string) => string {
            const prefix = this.getProjectPrefixIfAny;
            return (component: RawComponent | string): string => {
                const name = typeof component === 'string' ? component : component.name;
                return name.substring(prefix.length);
            }
        },
        getProjectPrefixIfAny(): string {
            return findCommonPrefix(this.allRawComponents.map(c => c.name).filter(c => c.trim() && !c.toLowerCase().includes("unknown")));
        },
        hasData: state => state._openScanId !== null && state._initialized,
        /** Changes whenever a different snapshot is open; views key their caches and picks on it. */
        datasetKey: state => state._openScanId,
        hasView() {
            return (viewName: string): boolean => {
                return this.viewNames.includes(viewName);
            }
        },
        viewNames(state: any): string[] {
            return state._viewNames;
        },
        definitions(state: any): Map<string, Definition> {
            return state._definitions;
        },
        allCyclesExpanded(state: any): any[] {
            return state._allCyclesExpanded;
        },
        // file path -> component name, for every file in the snapshot.
        fileComponentIndex(state: any): Map<string, string> {
            const m = new Map<string, string>();
            for (const f of state._fileComponents as Array<{ name: string; component: string | null }>) {
                if (f.component) m.set(f.name, f.component);
            }
            return m;
        },

        // component name -> its file paths, the inverse of fileComponentIndex.
        componentFilesIndex(state: any): Map<string, string[]> {
            const m = new Map<string, string[]>();
            for (const f of state._fileComponents as Array<{ name: string; component: string | null }>) {
                if (!f.component) continue;
                const list = m.get(f.component);
                if (list) list.push(f.name); else m.set(f.component, [f.name]);
            }
            return m;
        },

        allComponentsIndex(): Map<string, Component> {
            return this.componentGraph.components;
        },
        allComponents(): Component[] {
            return Array.from(this.componentGraph.components.values());
        },
        allRawComponents(state: any): RawComponent[] {
            return state._allRawComponents;
        },
        componentGraph(): ComponentGraph {
            return createComponentGraph(this.allRawComponents, this.componentConnections);
        },
        /**
         * Runtime imports only, the edges the engine's cycles, dependents and
         * coupling metrics are defined on. A type-only import (erased by the
         * compiler) made pages count a "top dependent" the dependents number
         * beside it did not, and let a cut plan chase a loop that does not
         * exist at runtime. Connections draws the same runtime edges, and marks
         * the ones made only by a runtime lookup (kind 'dynamic') as such.
         */
        componentConnections(state: any): RawComponentConnection[] {
            return (state._componentConnections as any[]).filter((c) => c.kind !== "type_only");
        },

        /**
         * component_connections_direct without its type-only edges, as SQL to
         * select from. The engine builds the component graph -- cycles,
         * coupling, reach -- from runtime edges, and a query that read the
         * whole table drew LibreChat 105 dependencies that graph does not
         * have. Snapshots from before edges had a kind are the table itself.
         */
        runtimeComponentEdges(state: any): string {
            const hasKind = (state._componentConnections as any[]).some((c) => c && "kind" in c);
            return hasKind
                ? `(SELECT * FROM component_connections_direct WHERE kind IS NULL OR kind != 'type_only')`
                : "component_connections_direct";
        },

        componentSubGraph(state: any) {
            const componentGraph = this.componentGraph;

            return (components: string[]): Component[] => {
                const componentsToReturn = Array(components.length);

                components.forEach((component, index) => {
                    componentsToReturn[index] = componentGraph.components.get(component)!;
                })

                return resizeConnectionsOnComponents(componentsToReturn);
            }
        },
    },
    actions: {
        async query<T = any>(qryString: string): Promise<T[]> {
            console.debug("Executing query:", qryString)
            if (this._openScanId === null) {
                console.debug("No scan open in store. Returning empty list.")
                return []
            }
            return _db.query<T>(qryString);
        },

        /** The same choke point, aimed at an earlier snapshot of the same workspace. */
        async queryIn<T = any>(scanId: string, qryString: string): Promise<T[]> {
            if (!scanId) return []
            return _db.queryIn<T>(scanId, qryString);
        },

        async getView<T = any>(viewName: string): Promise<T[]> {
            return this.query<T>(`SELECT * FROM ${viewName}`);
        },

        // Selects a scan snapshot as the active dataset. Flips hasData
        // false→true across the switch so every view watching it re-queries.
        async openScan(scanId: string) {
            this._initialized = false;
            await _db.open(scanId);
            this._openScanId = scanId;
            await this._initializeState();
        },

        // Leaves no snapshot open: the shell shows its empty/scanning panel
        // and every view watching hasData tears down. Used when the active
        // workspace has nothing to show yet.
        closeScan() {
            this._snapshotInfo = {};
            this._columns = {};
            this._openScanId = null;
            this._initialized = false;
            this._viewNames = [];
            this._definitions = new Map();
            this._allRawComponents = [];
            this._componentConnections = [];
            this._allCyclesExpanded = [];
            this._distinctComponentColumns = [];
            this._fileComponents = [];
        },

        async _initializeState() {
            // Populate viewNames
            const viewResults = await this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
            this._viewNames = viewResults.map(x => x.name);

            // Which analysis wrote this snapshot, against the one this build runs.
            // Every fact the snapshot records about itself, and every table's
            // columns, so a reader can ask what an older snapshot has instead
            // of guessing from errors.
            try {
                const info: Record<string, string> = {};
                if (this._viewNames.includes("_snapshot")) {
                    for (const r of await this.query<{ key: string; value: string }>("SELECT key, value FROM _snapshot")) {
                        if (!(r.key in info)) info[r.key] = String(r.value ?? "");
                    }
                }
                this._snapshotInfo = info;
                this._snapshotRevision = Number(info.analysis_revision ?? 0) || 0;
            } catch {
                this._snapshotInfo = {};
                this._snapshotRevision = null;
            }
            try {
                const cols: Record<string, string[]> = {};
                await Promise.all(this._viewNames.map(async (t) => {
                    const rows = await this.query<{ name: string }>(`SELECT name FROM pragma_table_info('${t.replace(/'/g, "''")}')`);
                    cols[t] = rows.map(r => r.name);
                }));
                this._columns = cols;
            } catch {
                this._columns = {};
            }
            if (this._engineRevision === null) {
                try { this._engineRevision = await AnalysisRevision(); } catch { this._engineRevision = null; }
            }

            // Populate definitions
            try {
                const defRows = await this.getView<any>("definitions");
                this._definitions = defRows.reduce((acc: Map<string, Definition>, def: any) => {
                    acc.set(def.id, {
                        id: def.id,
                        name: def.name,
                        short: def.short_description || def.short || "",
                        long: def.long_description || def.long || "",
                        short_description: def.short_description || def.short || "",
                        long_description: def.long_description || def.long || "",
                        category: def.category || ""
                    } as Definition);
                    return acc;
                }, new Map<string, Definition>());
            } catch {
                this._definitions = new Map();
            }

            // Populate distinct component columns
            try {
                const colRows = await this.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('components') order by 1");
                this._distinctComponentColumns = colRows
                    .map(x => x.name)
                    .filter(x => !["report_id", "report_timestamp", "name", "connections", "timestamp"].includes(x));
            } catch {
                this._distinctComponentColumns = [];
            }

            // Populate allRawComponents
            try {
                this._allRawComponents = await this.getView<RawComponent>("components");
            } catch {
                this._allRawComponents = [];
            }

            // Populate the file -> component index
            try {
                this._fileComponents = await this.query<{ name: string; component: string | null }>("SELECT name, component FROM files");
            } catch {
                this._fileComponents = [];
            }

            // Populate componentConnections
            try {
                this._componentConnections = await this.query<RawComponentConnection>("SELECT * FROM component_connections_direct");
            } catch {
                this._componentConnections = [];
            }

            // Populate allCyclesExpanded
            try {
                if (this._viewNames.includes('component_cycles_shortest')) {
                    const rawCycles = await this.query<{ cycle: string, cycle_size: number, shared_commits: number }>(`
                        SELECT DISTINCT c.cycle, c.cycle_size, COALESCE(g.shared_commits, 0) as shared_commits
                        FROM (SELECT DISTINCT cycle, cycle_size FROM component_cycles_shortest) c
                        LEFT JOIN git_component_cycles_shortest_shared_commits g ON c.cycle = g.cycle
                        ORDER BY shared_commits DESC, c.cycle_size ASC
                    `);

                    const compIndex = this.allComponentsIndex;
                    this._allCyclesExpanded = rawCycles.map((c, index) => {
                        const path = c.cycle.split('->').map(s => s.trim())
                        const nodesInCycle = [...path]
                        if (nodesInCycle.length > 1 && nodesInCycle[nodesInCycle.length - 1] === nodesInCycle[0]) {
                            nodesInCycle.pop()
                        }

                        let totalHotspot = 0
                        let validCount = 0
                        nodesInCycle.forEach(nodeName => {
                            const comp = compIndex.get(nodeName)
                            if (comp) {
                                const hotspot = Number(comp.codesmells__hotspot_score || comp.codesmells__hotspot || 0)
                                totalHotspot += hotspot
                                validCount++
                            }
                        })
                        const avgHotspot = validCount > 0 ? (totalHotspot / validCount) : 0
                        // A member with no commits shares none. Before analysis
                        // revision 2 the engine reported the others' commits
                        // as shared in that case; this table has no
                        // percentages to catch it by, so the members do.
                        const withoutCommits = nodesInCycle.some(n => {
                            const comp = compIndex.get(n)
                            return comp && Number(comp.git__commits__total ?? 1) === 0
                        })
                        if (withoutCommits) c.shared_commits = 0
                        const severity = c.cycle_size * (1 + c.shared_commits) * (1 + avgHotspot)

                        return {
                            id: index + 1,
                            cycleText: c.cycle,
                            path: path,
                            nodes: nodesInCycle,
                            size: c.cycle_size,
                            sharedCommits: c.shared_commits,
                            severity: Math.round(severity * 10) / 10
                        }
                    });
                } else {
                    this._allCyclesExpanded = [];
                }
            } catch {
                this._allCyclesExpanded = [];
            }

            this._initialized = true;
        },
    },
})

// See the note in stores/draft.ts: without this, an action or getter added
// while the dev server runs is missing from the live store until a reload.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useDataStore, import.meta.hot));
