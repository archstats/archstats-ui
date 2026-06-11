import {defineStore} from 'pinia'
import initSqlJs from 'sql.js';
import {findCommonPrefix} from "~/utils/text";
import {
    Component,
    ComponentGraph,
    createComponentGraph,
    RawComponent,
    RawComponentConnection
} from "~/utils/components";

import type {Definition} from "~/utils/definition";
import {StatNameResolver, getNiceStatName} from "~/utils/stat_resolver";


export const useDataStore = defineStore('data', {
    state: (): {
        sqliteDatabase: any;
    } => {
        return {
            sqliteDatabase: null,
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

        getDistinctComponentColumns() {
            const qry = this.query("SELECT name FROM PRAGMA_TABLE_INFO('components') order by 1") as { name: string }[];
            return qry.map(x => x.name).filter(x => !["report_id", "report_timestamp", "name", "connections", "timestamp"].includes(x));
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
        hasData: state => state.sqliteDatabase !== null,
        hasView() {
            return (viewName: string): boolean => {
                return this.viewNames.includes(viewName);
            }
        },
        viewNames(): string[] {
            let results = this.query("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[]
            return results.map(x => x.name);
        },
        getView<T>() {
            return (viewName: string): T[] => {
                return this.query(`SELECT *
                                   FROM ${viewName}`) as T[];
            }
        },
        definitions(): Map<string, Definition> {
            return (this.getView("definitions") as any[]).reduce((acc, def) => {
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
        },
        allCyclesExpanded(): any[] {
            if (!this.hasData) return []
            
            const rawCycles = this.query(`
                SELECT DISTINCT c.cycle, c.cycle_size, COALESCE(g.shared_commits, 0) as shared_commits
                FROM (SELECT DISTINCT cycle, cycle_size FROM component_cycles_shortest) c
                LEFT JOIN git_component_cycles_shortest_shared_commits g ON c.cycle = g.cycle
                ORDER BY shared_commits DESC, c.cycle_size ASC
            `) as { cycle: string, cycle_size: number, shared_commits: number }[]
            
            const compIndex = this.allComponentsIndex
            return rawCycles.map((c, index) => {
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
            })
        },
        query<T>(state: any) {
            return (qryString: string): T[] => {
                const toReturn = []
                console.debug("Executing query:", qryString)
                if (!state.sqliteDatabase) {
                    console.debug("No SQLite database available in store. Returning empty list.")
                    return []
                }
                const stmt = state.sqliteDatabase.prepare(qryString)

                while (stmt.step()) {
                    toReturn.push(stmt.getAsObject())
                }
                return toReturn
            }
        },


        allComponentsIndex(): Map<string, Component> {
            return this.componentGraph.components;
        },
        allComponents(): Component[] {
            return Array.from(this.componentGraph.components.values());
        },
        allRawComponents(): RawComponent[] {
            return this.getView("components") as RawComponent[]
        },
        componentGraph(): ComponentGraph {
            return createComponentGraph(this.allRawComponents, this.componentConnections);
        },
        componentConnections() {
            return this.query("SELECT * FROM component_connections_direct") as unknown as RawComponentConnection[]
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
        async setViews(views: any) {
            let SQL = await initSqlJs({
                locateFile: (file: string) => `/${file}`
            });
            this.sqliteDatabase = new SQL.Database(views);
        },
    },
})