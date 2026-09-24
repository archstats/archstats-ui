import { acceptHMRUpdate, defineStore } from "pinia";
import { PutMany, PutSetting, Settings, Workspace } from "wailsjs/go/app/StateService";

// Durable state, in app.db rather than the webview's localStorage (which a
// reinstall, a new dev origin or a cleared cache silently empties).
//
// Per-workspace keys hold lenses, merges, facets and arrangements; settings
// hold global preferences. Values are JSON. Reads are synchronous against a
// hydrated copy; `hydrate(workspace)` must resolve before anything reads a
// workspace key, which is what the workspaces store awaits on select.
// Writes are debounced and flushed on close.

const FLUSH_MS = 300;

type Json = unknown;

export const useStateStore = defineStore("state", {
    state: () => ({
        workspace: "" as string,
        values: {} as Record<string, Json>,
        settings: {} as Record<string, Json>,
        hydrated: false,
        settingsLoaded: false,
    }),
    actions: {
        async hydrate(workspaceId: string) {
            await this.flush();
            if (this.workspace === workspaceId && this.hydrated) return;
            this.hydrated = false;
            this.workspace = workspaceId;
            let raw: Record<string, string> = {};
            try { raw = (await Workspace(workspaceId)) ?? {}; } catch { raw = {}; }
            // A stale response for a workspace no longer selected is dropped.
            if (this.workspace !== workspaceId) return;
            const values: Record<string, Json> = {};
            for (const [k, v] of Object.entries(raw)) values[k] = parse(v);
            this.values = values;
            this.hydrated = true;
        },
        async loadSettings() {
            if (this.settingsLoaded) return;
            let raw: Record<string, string> = {};
            try { raw = (await Settings()) ?? {}; } catch { raw = {}; }
            const out: Record<string, Json> = {};
            for (const [k, v] of Object.entries(raw)) out[k] = parse(v);
            this.settings = out;
            this.settingsLoaded = true;
        },
        get<T>(key: string, fallback: T): T {
            return (key in this.values ? (this.values[key] as T) : fallback);
        },
        /** Undefined or null deletes the key. */
        set(key: string, value: Json) {
            if (!this.workspace) return;
            const next = { ...this.values };
            if (value === undefined || value === null) delete next[key];
            else next[key] = value;
            this.values = next;
            pending.set(key, value === undefined || value === null ? "" : JSON.stringify(value));
            pendingWorkspace = this.workspace;
            schedule(() => this.flush());
        },
        setting<T>(key: string, fallback: T): T {
            return (key in this.settings ? (this.settings[key] as T) : fallback);
        },
        async setSetting(key: string, value: Json) {
            const next = { ...this.settings };
            if (value === undefined || value === null) delete next[key];
            else next[key] = value;
            this.settings = next;
            try { await PutSetting(key, value === undefined || value === null ? "" : JSON.stringify(value)); } catch { /* kept in memory */ }
        },
        async flush() {
            if (timer) { clearTimeout(timer); timer = null; }
            if (pending.size === 0 || !pendingWorkspace) return;
            const batch = Object.fromEntries(pending);
            const ws = pendingWorkspace;
            pending.clear();
            try { await PutMany(ws, batch); } catch { /* the next write retries the key */ }
        },
    },
});

const pending = new Map<string, string>();
let pendingWorkspace = "";
let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(fn: () => void) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, FLUSH_MS);
}

function parse(v: string): Json {
    try { return JSON.parse(v); } catch { return v; }
}

// Closing the window must not lose the last 300 ms of changes.
if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
        if (pending.size && pendingWorkspace) void PutMany(pendingWorkspace, Object.fromEntries(pending));
    });
}

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useStateStore, import.meta.hot));
