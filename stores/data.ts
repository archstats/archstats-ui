import {defineStore} from 'pinia'
import {findCommonPrefix} from "~/utils/text";
import {
    Component,
    ComponentGraph,
    createComponentGraph,
    RawComponent,
    RawComponentConnection
} from "~/utils/components";
import initSqlJs from 'sql.js';
import {Raw} from "@vue/reactivity";
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
        }
    },
    actions: {
        async setViews(views: any) {
            let SQL = await initSqlJs({
                locateFile: file => `/${file}`
            });
            this.sqliteDatabase = new SQL.Database(views);
        },
        setCurrentScope(components: string[] | RawComponent[]) {
            if (components.length && typeof components[0] === 'object') {
                this.currentComponentScopeIds = (components as RawComponent[]).map(c => c.name);
            }
            this.currentComponentScopeIds = components as string[];
        }
    },
})