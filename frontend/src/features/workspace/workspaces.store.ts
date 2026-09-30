import { STAGE_SCAN } from "~/platform/stage";
import { newestFirst } from "./scanOrder";
import { useStateStore } from "~/platform/state.store";
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
    InspectFolder,
    LabelScan,
    SetBaseline,
    WorkingCopy,
} from "wailsjs/go/app/WorkspaceService";
import { Start, StartAt } from "wailsjs/go/app/ScanService";
import type { app, store } from "wailsjs/go/models";
import { useDataStore } from "~/features/snapshot/data.store";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useAuthorsStore } from "~/features/git/authors.store";
import { useLensStore } from "~/features/groups/lens.store";
import { useDraftStore } from "~/features/lens-builder/draft.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { scanEstimate, shouldOpenResult, type ScanWatch } from "./scanFlow";

// "updating" brings a clone the app made up to its upstream first;
// "running" is a scan found in flight after a reload, whose phase was missed.
export type ScanPhase = "starting" | "updating" | "detecting" | "analyzing" | "rendering" | "saving" | "running";

export interface ScanProgress extends ScanWatch {
    scanId: string;
    phase: ScanPhase;
    extensions: string[];
    startedAt: number;
    /** What the scan wants said about itself: a clone that could not be updated. */
    note?: string;
}

// A finished scan that did not open because the user had moved on, and a
// failed scan of the working copy: both wait in the rail until acted on.
export interface ScanNotice {
    workspaceId: string;
    scanId: string;
    error?: string;
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
    ref?: string;
    note?: string;
}

const LAST_WORKSPACE_KEY = "archstats.shell.activeWorkspace";
const openScanKey = (workspaceId: string) => `archstats.shell.openScan.${workspaceId}`;

function remember(key: string, value: string | null) {
    // The stage (Ask's hidden copy of the app) shares this storage; it must not change what the person's window remembers.
    if (STAGE_SCAN) return;
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
        /** The scan whose commit the rescan sheet is offering to rebuild. */
        rescanFor: null as string | null,
        /** A snapshot file the import sheet is offering to take in. */
        importPath: null as string | null,
        // Scans of the active workspace, newest first.
        scans: [] as store.Scan[],
        // Snapshot counts per workspace, for the switcher's meta line.
        scanCounts: {} as Record<string, number>,
        lastScanAt: {} as Record<string, string | null>,
        // Scans in flight, keyed by workspace. Only one per workspace can run.
        progress: {} as Record<string, ScanProgress>,
        ready: null as ScanNotice | null,
        // What a scan of the active workspace would read now, against its
        // newest snapshot's commit. Null until read, or outside git.
        workingCopy: null as app.WorkingCopy | null,
        failed: null as ScanNotice | null,
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
        /**
         * How long a scan of the active workspace takes, from its recent
         * scans of the working copy; null before there is one to go by.
         */
        estimateMs(state): number | null {
            return scanEstimate(state.scans as any);
        },
        /**
         * The commit Scan's news is counted from: the latest scan of the
         * working copy that recorded one. By when it ran, not by code time:
         * a scan without a commit has no code time and would sort first.
         */
        comparedCommit(state): string | null {
            const own = (state.scans as any[])
                .filter((s) => s.status === "complete" && s.headCommit && s.origin !== "backfill" && s.origin !== "import")
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
            return own[0]?.headCommit ?? null;
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
                // The shell's own claim (from startScan) knows where the user
                // was; a scan started elsewhere, a backfill, is seen here first.
                const claim = this.progress[e.workspaceId];
                this.progress[e.workspaceId] = {
                    scanId: e.scanId,
                    phase: "detecting",
                    extensions: [],
                    startedAt: claim?.startedAt ?? Date.now(),
                    ref: e.ref ?? claim?.ref ?? "",
                    openAtStart: claim ? claim.openAtStart : this.openAtStartFor(e.workspaceId),
                };
                if (!e.ref && this.failed?.workspaceId === e.workspaceId) this.failed = null;
                this.refreshScansIfActive(e.workspaceId);
            });
            EventsOn("scan:phase", (e: ScanEvent) => {
                const p = this.progress[e.workspaceId];
                if (!p || (p.scanId && p.scanId !== e.scanId)) return;
                if (e.extensions) p.extensions = e.extensions;
                if (e.note) p.note = e.note;
                if (e.phase === "updating" || e.phase === "analyzing" || e.phase === "rendering" || e.phase === "saving") {
                    p.phase = e.phase;
                }
            });
            EventsOn("scan:done", async (e: ScanEvent) => {
                const watch = this.takeProgress(e);
                await this.refreshCounts();
                if (this.activeWorkspaceId !== e.workspaceId) return;
                await this.refreshScans();
                void this.refreshWorkingCopy();
                if (shouldOpenResult(watch, this.openScanId)) {
                    await this.openSnapshot(e.scanId);
                } else if (watch && !watch.ref) {
                    this.ready = { workspaceId: e.workspaceId, scanId: e.scanId };
                }
            });
            EventsOn("scan:failed", async (e: ScanEvent) => {
                const watch = this.takeProgress(e);
                // A failed rescan is reported by its own row and the backfill
                // queue; only the working copy's failure needs the rail.
                if (!watch?.ref) this.failed = { workspaceId: e.workspaceId, scanId: e.scanId, error: e.error };
                await this.refreshCounts();
                await this.refreshScansIfActive(e.workspaceId);
            });
        },

        /** Clears the workspace's progress and returns what it knew, when it belongs to this scan. */
        takeProgress(e: ScanEvent): ScanProgress | null {
            const p = this.progress[e.workspaceId] ?? null;
            if (!p || (p.scanId && p.scanId !== e.scanId)) return null;
            delete this.progress[e.workspaceId];
            return p;
        },

        openAtStartFor(workspaceId: string): string | null {
            return this.activeWorkspaceId === workspaceId ? this.openScanId : recall(openScanKey(workspaceId));
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
            const workspaceId = this.activeWorkspaceId;
            try {
                // Ordered by the code each scan read, then by when it ran.
                this.scans = newestFirst((await ListScans(workspaceId)) ?? []);
            } catch (e) {
                this.error = errorText(e);
                return;
            }
            if (this.activeWorkspaceId === workspaceId) this.reconcile(workspaceId);
        },

        // The registry is the truth about what is running. Events can be
        // missed (a reload mid-scan, a hot update), and a rail that says
        // "Scan" over a running row, or spins after the scan ended, is the
        // unpredictable behaviour this closes.
        reconcile(workspaceId: string) {
            const running = this.scans.find((s) => s.status === "running");
            const p = this.progress[workspaceId];
            if (running && !p) {
                const r: any = running;
                this.progress[workspaceId] = {
                    scanId: running.id,
                    phase: "running",
                    extensions: [],
                    startedAt: new Date(running.startedAt as any).getTime() || Date.now(),
                    ref: r.origin === "backfill" ? String(r.revisionRef ?? "") : "",
                    openAtStart: null,
                };
            } else if (!running && p?.scanId && this.scans.some((s) => s.id === p.scanId)) {
                // Only a claim the registry has already settled is dropped; a
                // claim still waiting for its row (scanId empty) is kept.
                delete this.progress[workspaceId];
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
            this.ready = null;
            if (this.failed?.workspaceId !== workspaceId) this.failed = null;
            this.activeWorkspaceId = workspaceId;
            remember(LAST_WORKSPACE_KEY, workspaceId);
            // Another workspace is another world: nothing scoped, drafted or
            // looked through carries over.
            useScopeStore().clear();
            // Durable state first: lenses, merges and facets read it as they load.
            await useStateStore().hydrate(workspaceId);
            if (this.activeWorkspaceId !== workspaceId) return;
            useGroupsStore().initForProject(workspaceId);
            useLensStore().load(workspaceId);
            useAuthorsStore().load(workspaceId, true);
            useDraftStore().load(workspaceId);
            this.workingCopy = null;
            await this.refreshScans();
            void this.refreshWorkingCopy();

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
                if (this.ready?.scanId === scanId || this.ready?.workspaceId !== scan.workspaceId) this.ready = null;
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
            return this.adopt(pick);
        },

        /** A folder that arrived another way: dropped on the window. */
        async addWorkspaceAt(path: string): Promise<store.Workspace | null> {
            this.error = null;
            this.pickConflict = null;
            try {
                return await this.adopt(await InspectFolder(path));
            } catch (e) {
                this.error = errorText(e);
                return null;
            }
        },

        // A picked folder becomes the active workspace and is scanned; one
        // that already has a workspace simply opens it.
        async adopt(pick: app.FolderPick | null): Promise<store.Workspace | null> {
            if (!pick || !pick.path) return null;
            if (pick.existing) {
                // Going there is what picking it meant. The note says why
                // nothing new appeared.
                const conflict = { path: pick.path, existing: pick.existing };
                if (pick.existing.id !== this.activeWorkspaceId) await this.select(pick.existing.id);
                this.pickConflict = conflict;
                return pick.existing;
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
        /** Scans a workspace's folder: the active one unless another is named. */
        async startScan(workspaceId?: string) {
            const ws = workspaceId ? this.workspaces.find((w) => w.id === workspaceId) : this.active;
            if (!ws || this.progress[ws.id]) return;
            const here = ws.id === this.activeWorkspaceId;
            if (here) {
                this.error = null;
                this.ready = null;
            }
            if (this.failed?.workspaceId === ws.id) this.failed = null;
            // Claim the slot before the round trip so a second click, or a
            // keyboard repeat, cannot start a second scan in the gap.
            this.progress[ws.id] = { scanId: "", phase: "starting", extensions: [], startedAt: Date.now(), ref: "", openAtStart: here ? this.openScanId : null };
            try {
                const scan = await Start(ws.id);
                const p = this.progress[ws.id];
                if (p && !p.scanId) p.scanId = scan.id;
                await this.refreshScansIfActive(ws.id);
            } catch (e) {
                delete this.progress[ws.id];
                if (here) this.error = errorText(e);
            }
        },

        /**
         * Scans the workspace as it was at one commit, in a clone; the
         * checkout is untouched. Tracked like any scan.
         */
        async startScanAt(rev: string) {
            const ws = this.active;
            if (!ws || this.progress[ws.id]) return;
            this.error = null;
            this.progress[ws.id] = { scanId: "", phase: "starting", extensions: [], startedAt: Date.now(), ref: rev, openAtStart: this.openScanId };
            try {
                const scan = await StartAt(ws.id, rev);
                const p = this.progress[ws.id];
                if (p && !p.scanId) p.scanId = scan.id;
                await this.refreshScans();
            } catch (e) {
                delete this.progress[ws.id];
                this.error = errorText(e);
                throw e;
            }
        },
        /**
         * Reads the working copy's git state against the newest snapshot of
         * the working copy (a rescan of an old tag is not what Scan compares to).
         */
        async refreshWorkingCopy() {
            const id = this.activeWorkspaceId;
            if (!id) return;
            try {
                const wc = await WorkingCopy(id, this.comparedCommit ?? "");
                if (this.activeWorkspaceId === id) this.workingCopy = wc;
            } catch {
                if (this.activeWorkspaceId === id) this.workingCopy = null;
            }
        },

        /** Opens the rescan sheet for a scan's commit (or the commit at its scan time). */
        requestRescan(scanId: string) {
            this.rescanFor = scanId;
        },

        /** Names a scan ("before the split"); an empty label clears it. */
        async labelScan(scanId: string, label: string) {
            await LabelScan(scanId, label.trim());
            await this.refreshScans();
        },
        /** Pins the scan comparisons default to; null unpins. */
        async setBaseline(scanId: string | null) {
            if (!this.activeWorkspaceId) return;
            await SetBaseline(this.activeWorkspaceId, scanId ?? "");
            await this.refreshWorkspaces();
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
        dismissReady() {
            this.ready = null;
        },
        dismissFailed() {
            this.failed = null;
        },
    },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useWorkspacesStore, import.meta.hot));
