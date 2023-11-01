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

import {Definition} from "~/utils/definition";


export const useDataStore = defineStore('data', {
    state: (): {
        sqliteDatabase: any;
        currentComponentScopeIds: string[] | null;
    } => {
        return {
            sqliteDatabase: null,
            currentComponentScopeIds: null,
        }
    },
    getters: {

        getDistinctComponentColumns() {
            const qry = this.query("SELECT name FROM PRAGMA_TABLE_INFO('components') order by 1") as { name: string }[];
            return qry.map(x => x.name).filter(x => x !== 'report_id' && x !== 'timestamp' && x!== 'name');
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
            return (this.getView("definitions") as Definition[]).reduce((acc, def) => {
                acc.set(def.id, def);
                return acc;
            }, new Map<string, Definition>());
        },
        query<T>(state: any) {
            return (qryString: string): T[] => {
                const toReturn = []
                console.debug("Executing query:", qryString)
                const stmt = state.sqliteDatabase.prepare(qryString)

                while (stmt.step()) {
                    toReturn.push(stmt.getAsObject())
                }
                return toReturn
            }
        },
        currentComponentScope(state: any): Component[] {
            if (!state.currentComponentScopeIds) {
                return this.allComponents
            }
            return this.allComponents.filter(c => state.currentComponentScopeIds.includes(c.name));
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
        setCurrentScope(components: string[] | RawComponent[]) {
            if (components.length && typeof components[0] === 'object') {
                this.currentComponentScopeIds = (components as RawComponent[]).map(c => c.name);
            } else {
                this.currentComponentScopeIds = components as string[];
            }
        }
    },
})