import { acceptHMRUpdate, defineStore } from "pinia";
import { EventsOn } from "wailsjs/runtime/runtime";
import {
    Create,
    Delete,
    DeleteScan,
    List,
    ListScans,
    Rename,
    SelectFolder,
} from "wailsjs/go/app/WorkspaceService";
import { Start } from "wailsjs/go/app/ScanService";
import type { store } from "wailsjs/go/models";
import { useDataStore } from "~/stores/data";
import { useGroupsStore } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";
import { useDraftStore } from "~/stores/draft";
import { useScopeStore } from "~/stores/scope";
import { shouldAutoOpen } from "~/utils/shell";

export type ScanPhase = "starting" | "detecting" | "analyzing" | "rendering" | "saving";

export interface ScanProgress {
    scanId: string;
    phase: ScanPhase;
    extensions: string[];
    startedAt: number;
}

// A refused folder pick: the folder already belongs to another workspace.
export interface PickConflict {
    path: string;
    existing: store.Workspace;
}

interface ScanEvent {
    workspaceId: string;
    scanId: string;
    phase?: string;
    extensions?: string[];
    error?: string;
}

const LAST_WORKSPACE_KEY = "archstats.shell.activeWorkspace";
const openScanKey = (workspaceId: string) => `archstats.shell.openScan.${workspaceId}`;

function remember(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Per-viewer convenience only; a blocked storage is not an error.
    }
}

function recall(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function errorText(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

export const useWorkspacesStore = defineStore("workspaces", {
    state: () => ({
        workspaces: [] as store.Workspace[],
        activeWorkspaceId: null as string | null,
        // Scans of the active workspace, newest first.
        scans: [] as store.Scan[],
        // Snapshot counts per workspace, for the switcher's meta line.
        scanCounts: {} as Record<string, number>,
        lastScanAt: {} as Record<string, string | null>,
        // Scans in flight, keyed by workspace. Only one per workspace can run.
        progress: {} as Record<string, ScanProgress>,
        loaded: false,
        busy: false,
        error: null as string | null,
        pickConflict: null as PickConflict | null,
        // One clock for every relative age and elapsed counter in the shell,
        // so no two readouts of the same scan can disagree by a second.
        now: Date.now(),
        _subscribed: false,
    }),

    getters: {
        active(state): store.Workspace | null {
            return state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;
        },
        activeProgress(state): ScanProgress | null {
            return state.activeWorkspaceId ? state.progress[state.activeWorkspaceId] ?? null : null;
        },
        isScanning(): boolean {
            return this.activeProgress !== null;
        },
        anyScanning(state): boolean {
            return Object.keys(state.progress).length > 0;
        },
        openScanId(): string | null {
            return useDataStore()._openScanId;
        },
        openScan(state): store.Scan | null {
            const id = useDataStore()._openScanId;
            return id ? state.scans.find((s) => s.id === id) ?? null : null;
        },
        newestComplete(state): store.Scan | null {
            return state.scans.find((s) => s.status === "complete") ?? null;
        },
        latestFailure(state): store.Scan | null {
            const newest = state.scans[0];
            return newest && newest.status === "failed" ? newest : null;
        },
    },

    actions: {
        // ── Lifecycle ──────────────────────────────────────
        async init() {
            this.subscribe();
            await this.refreshWorkspaces();
            const remembered = recall(LAST_WORKSPACE_KEY);
            const target =
                this.workspaces.find((w) => w.id === remembered) ?? this.workspaces[0] ?? null;
            if (target) {
                await this.select(target.id);
            } else {
                useDataStore().closeScan();
            }
            this.loaded = true;
        },

        subscribe() {
            if (this._subscribed) return;
            this._subscribed = true;
            setInterval(() => {
                this.now = Date.now();
            }, 1000);
            EventsOn("scan:started", (e: ScanEvent) => {
                const existing = this.progress[e.workspaceId];
                this.progress[e.workspaceId] = {
                    scanId: e.scanId,
                    phase: "starting",
                    extensions: [],
                    startedAt: existing?.startedAt ?? Date.now(),
                };
                this.refreshScansIfActive(e.workspaceId);
            });
            EventsOn("scan:phase", (e: ScanEvent) => {
                const p = this.progress[e.workspaceId];
                if (!p) return;
                if (e.extensions) p.extensions = e.extensions;
                // The backend reports "analyzing" once extensions are detected;
                // the UI keeps a distinct "detecting" phase before the engine
                // itself reports in, so the user sees movement immediately.
                if (e.phase === "analyzing" || e.phase === "rendering" || e.phase === "saving") {
                    p.phase = e.phase;
                }
            });
            EventsOn("scan:done", async (e: ScanEvent) => {
                const scansBefore = this.activeWorkspaceId === e.workspaceId ? [...this.scans] : [];
                delete this.progress[e.workspaceId];
                await this.refreshCounts();
                if (this.activeWorkspaceId !== e.workspaceId) return;
                await this.refreshScans();
                if (shouldAutoOpen(this.openScanId, scansBefore)) {
                    await this.openSnapshot(e.scanId);
                }
            });
            EventsOn("scan:failed", async (e: ScanEvent) => {
                delete this.progress[e.workspaceId];
                await this.refreshCounts();
                await this.refreshScansIfActive(e.workspaceId);
            });
        },

        // ── Loading ────────────────────────────────────────
        async refreshWorkspaces() {
            try {
                this.workspaces = (await List()) ?? [];
                await this.refreshCounts();
            } catch (e) {
                this.error = errorText(e);
            }
        },

        async refreshCounts() {
            const counts: Record<string, number> = {};
            const last: Record<string, string | null> = {};
            await Promise.all(
                this.workspaces.map(async (w) => {
                    const scans = (await ListScans(w.id)) ?? [];
                    counts[w.id] = scans.filter((s) => s.status === "complete").length;
                    const newest = scans.find((s) => s.status === "complete");
                    last[w.id] = newest ? String(newest.startedAt) : null;
                }),
            );
            this.scanCounts = counts;
            this.lastScanAt = last;
        },

        async refreshScans() {
            if (!this.activeWorkspaceId) {
                this.scans = [];
                return;
            }
            try {
                this.scans = (await ListScans(this.activeWorkspaceId)) ?? [];
            } catch (e) {
                this.error = errorText(e);
            }
        },

        async refreshScansIfActive(workspaceId: string) {
            if (this.activeWorkspaceId === workspaceId) await this.refreshScans();
        },

        // ── Selection ──────────────────────────────────────
        async select(workspaceId: string) {
            if (!this.workspaces.some((w) => w.id === workspaceId)) return;
            this.error = null;
            this.pickConflict = null;
            this.activeWorkspaceId = workspaceId;
            remember(LAST_WORKSPACE_KEY, workspaceId);
            // Another workspace is another world: nothing scoped, drafted or
            // looked through carries over.
            useScopeStore().clear();
            useGroupsStore().initForProject(workspaceId);
            useLensStore().load(workspaceId);
            useDraftStore().load(workspaceId);
            await this.refreshScans();

            const remembered = recall(openScanKey(workspaceId));
            const candidate =
                this.scans.find((s) => s.id === remembered && s.status === "complete") ??
                this.newestComplete;
            if (candidate) {
                await this.openSnapshot(candidate.id);
            } else {
                useDataStore().closeScan();
            }
        },

        async openSnapshot(scanId: string) {
            const scan = this.scans.find((s) => s.id === scanId);
            if (!scan || scan.status !== "complete") return;
            this.busy = true;
            this.error = null;
            try {
                await useDataStore().openScan(scanId);
                remember(openScanKey(scan.workspaceId), scanId);
            } catch (e) {
                this.error = errorText(e);
            } finally {
                this.busy = false;
            }
        },

        // ── Workspaces ─────────────────────────────────────
        // Opens the native picker. Returns the new workspace, or null when the
        // user cancelled or the folder was refused as a duplicate (then
        // `pickConflict` names the owner).
        async addWorkspace(): Promise<store.Workspace | null> {
            this.error = null;
            this.pickConflict = null;
            let pick;
            try {
                pick = await SelectFolder();
            } catch (e) {
                this.error = errorText(e);
                return null;
            }
            if (!pick || !pick.path) return null;
            if (pick.existing) {
                this.pickConflict = { path: pick.path, existing: pick.existing };
                return null;
            }
            try {
                const created = await Create(pick.suggestedName, pick.path);
                await this.refreshWorkspaces();
                await this.select(created.id);
                await this.startScan();
                return created;
            } catch (e) {
                this.error = errorText(e);
                return null;
            }
        },

        async rename(workspaceId: string, name: string) {
            const trimmed = name.trim();
            const current = this.workspaces.find((w) => w.id === workspaceId);
            if (!current || !trimmed || trimmed === current.name) return;
            try {
                const updated = await Rename(workspaceId, trimmed);
                this.workspaces = this.workspaces.map((w) => (w.id === workspaceId ? updated : w));
            } catch (e) {
                this.error = errorText(e);
            }
        },

        async removeWorkspace(workspaceId: string) {
            try {
                await Delete(workspaceId);
            } catch (e) {
                this.error = errorText(e);
                return;
            }
            delete this.progress[workspaceId];
            remember(openScanKey(workspaceId), null);
            await this.refreshWorkspaces();
            if (this.activeWorkspaceId === workspaceId) {
                const next = this.workspaces[0];
                if (next) {
                    await this.select(next.id);
                } else {
                    this.activeWorkspaceId = null;
                    this.scans = [];
                    remember(LAST_WORKSPACE_KEY, null);
                    useDataStore().closeScan();
                }
            }
        },

        // ── Scans ──────────────────────────────────────────
        async startScan() {
            const ws = this.active;
            if (!ws || this.progress[ws.id]) return;
            this.error = null;
            // Claim the slot before the round trip so a second click, or a
            // keyboard repeat, cannot start a second scan in the gap.
            this.progress[ws.id] = { scanId: "", phase: "starting", extensions: [], startedAt: Date.now() };
            try {
                const scan = await Start(ws.id);
                const p = this.progress[ws.id];
                if (p && !p.scanId) p.scanId = scan.id;
                await this.refreshScans();
            } catch (e) {
                delete this.progress[ws.id];
                this.error = errorText(e);
            }
        },

        async removeScan(scanId: string) {
            const scan = this.scans.find((s) => s.id === scanId);
            if (!scan) return;
            const wasOpen = this.openScanId === scanId;
            try {
                await DeleteScan(scanId);
            } catch (e) {
                this.error = errorText(e);
                return;
            }
            await this.refreshScans();
            await this.refreshCounts();
            if (wasOpen) {
                remember(openScanKey(scan.workspaceId), null);
                const next = this.newestComplete;
                if (next) await this.openSnapshot(next.id);
                else useDataStore().closeScan();
            }
        },

        clearError() {
            this.error = null;
        },
        clearConflict() {
            this.pickConflict = null;
        },
    },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useWorkspacesStore, import.meta.hot));
