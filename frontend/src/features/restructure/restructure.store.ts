import { acceptHMRUpdate, defineStore } from "pinia"
import { readDurable, writeDurable } from "~/platform/durable"
import { useStateStore } from "~/platform/state.store"
import { emptyPlan, moduleId, type Plan, type PlanModule } from "./plan"

// The workspace's restructure plan. It outlives the snapshot on purpose:
// rescan after a step of the move and the same plan reads the new code.

const KEY = "restructure.plan"
const legacyKey = (ws: string) => `archstats:restructure:${ws}`

export const useRestructureStore = defineStore("restructure", {
    state: () => ({
        plan: emptyPlan() as Plan,
        workspace: "" as string,
        /** Whether the plan was read from app.db, not the pre-hydration browser copy. */
        fromDb: false,
    }),
    getters: {
        byId: (s) => new Map(s.plan.modules.map(m => [m.id, m])),
        name: (s) => (id: string) => s.plan.modules.find(m => m.id === id)?.name ?? id,
    },
    actions: {
        load(workspace: string) {
            const state = useStateStore()
            const hydrated = state.hydrated && state.workspace === workspace
            // Read again once app.db is hydrated: selection sets the workspace before it is.
            if (!workspace || (this.workspace === workspace && (this.fromDb || !hydrated))) return
            this.workspace = workspace
            this.fromDb = hydrated
            let plan = emptyPlan()
            try {
                const raw = readDurable(workspace, KEY, legacyKey(workspace))
                if (raw) plan = { ...emptyPlan(), ...JSON.parse(raw) }
            } catch { /* a broken plan starts over */ }
            this.plan = plan
        },
        save() {
            if (this.workspace) writeDurable(this.workspace, KEY, legacyKey(this.workspace), JSON.stringify(this.plan))
        },
        set(modules: PlanModule[]) { this.plan.modules = modules; this.save() },
        add(m: Partial<PlanModule> & { name: string }): string {
            const mod: PlanModule = { id: moduleId(), dir: "", patterns: "", files: [], ...m }
            // Files placed by hand belong to one module only.
            if (mod.files.length) { const fs = new Set(mod.files); for (const o of this.plan.modules) o.files = o.files.filter(f => !fs.has(f)) }
            this.plan.modules.push(mod)
            this.save()
            return mod.id
        },
        update(id: string, patch: Partial<PlanModule>) {
            const m = this.plan.modules.find(x => x.id === id)
            if (m) { Object.assign(m, patch); this.save() }
        },
        remove(id: string) { this.plan.modules = this.plan.modules.filter(m => m.id !== id); this.save() },
        shift(id: string, by: -1 | 1) {
            const i = this.plan.modules.findIndex(m => m.id === id), j = i + by
            if (i < 0 || j < 0 || j >= this.plan.modules.length) return
            const ms = [...this.plan.modules];
            [ms[i], ms[j]] = [ms[j], ms[i]]
            this.plan.modules = ms
            this.save()
        },
        /** Places files in a module by hand, taking them out of any other. */
        place(files: string[], id: string) {
            const fs = new Set(files)
            for (const m of this.plan.modules) {
                if (m.id === id) m.files = [...new Set([...m.files, ...files])]
                else m.files = m.files.filter(f => !fs.has(f))
            }
            this.save()
        },
        /** Takes files out of their hand placement, back to what the patterns say. */
        unplace(files: string[]) {
            const fs = new Set(files)
            for (const m of this.plan.modules) m.files = m.files.filter(f => !fs.has(f))
            this.save()
        },
        setOrdered(v: boolean) { this.plan.ordered = v; this.save() },
        clear() { this.plan = emptyPlan(); this.save() },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useRestructureStore, import.meta.hot))
