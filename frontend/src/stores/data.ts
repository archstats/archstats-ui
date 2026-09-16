import {defineStore} from 'pinia'
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
        _initialized: boolean;
        _openScanId: string | null;
    } => {
        return {
            _viewNames: [],
            _definitions: new Map(),
            _allRawComponents: [],
            _componentConnections: [],
            _allCyclesExpanded: [],
            _distinctComponentColumns: [],
            _initialized: false,
            _openScanId: null,
        }
    },
    getters: {

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
        componentConnections(state: any): RawComponentConnection[] {
            return state._componentConnections;
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

        async _initializeState() {
            // Populate viewNames
            const viewResults = await this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
            this._viewNames = viewResults.map(x => x.name);

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
                        long_description: def.long_description || def.long || ""
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