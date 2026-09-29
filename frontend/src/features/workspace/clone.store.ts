import { acceptHMRUpdate, defineStore } from "pinia";
import { EventsOn } from "wailsjs/runtime/runtime";
import { Cancel, Forget, Jobs, Start } from "wailsjs/go/app/CloneService";
import type { clone } from "wailsjs/go/models";
import { useWorkspacesStore } from "./workspaces.store";

export type History = "full" | "year" | "latest";

// Clones in flight and the sheet that starts them. A clone the user is
// watching (the sheet still open on it) opens its workspace when it lands;
// one sent to the background is scanned there and waits in the rail.
export const useCloneStore = defineStore("clone", {
    state: () => ({
        jobs: [] as clone.Job[],
        sheetOpen: false,
        /** An address handed to the sheet from elsewhere (the first-run field). */
        sheetInput: "",
        /** The job the open sheet is showing. */
        watching: null as string | null,
        /** A finished clone the user was not watching, waiting to be opened. */
        landed: null as clone.Job | null,
        /** Asks the shell to show a workspace from the top; the layout routes. */
        openRequest: 0,
        _subscribed: false,
    }),

    getters: {
        running(state): clone.Job[] {
            return state.jobs.filter((j) => j.state === "running");
        },
        watched(state): clone.Job | null {
            return state.watching ? state.jobs.find((j) => j.id === state.watching) ?? null : null;
        },
    },

    actions: {
        async init() {
            if (this._subscribed) return;
            this._subscribed = true;
            try {
                // A reloaded window finds the clone that is still running.
                this.jobs = ((await Jobs()) ?? []).filter((j) => j.state === "running");
            } catch {
                this.jobs = [];
            }
            try {
                EventsOn("clone:progress", (j: clone.Job) => this.put(j));
                EventsOn("clone:failed", (j: clone.Job) => {
                    this.put(j);
                    // A cancelled clone the user is not looking at is simply gone.
                    if (j.state === "cancelled" && this.watching !== j.id) this.drop(j.id);
                });
                EventsOn("clone:done", (j: clone.Job) => { void this.landedJob(j); });
            } catch {
                // Not in the desktop shell.
            }
        },

        put(j: clone.Job) {
            const i = this.jobs.findIndex((x) => x.id === j.id);
            if (i < 0) this.jobs = [j, ...this.jobs];
            else this.jobs.splice(i, 1, j);
        },

        drop(id: string) {
            this.jobs = this.jobs.filter((j) => j.id !== id);
            void Forget(id).catch(() => {});
        },

        open(input = "") {
            this.sheetInput = input;
            // Reopening while a clone runs shows that clone, not a blank form.
            this.watching = this.running[0]?.id ?? null;
            this.sheetOpen = true;
        },

        /** Shows one job in the sheet (from the rail's progress line). */
        show(id: string) {
            this.watching = id;
            this.sheetInput = "";
            this.sheetOpen = true;
        },

        close() {
            this.sheetOpen = false;
            // A finished or failed job has been seen; a running one carries on.
            const w = this.watched;
            if (w && w.state !== "running") this.drop(w.id);
            this.watching = null;
        },

        async start(req: { input: string; dest: string; history: History; name: string }) {
            const job = await Start(req as any);
            this.put(job);
            this.watching = job.id;
            return job;
        },

        async cancel(id: string) {
            await Cancel(id);
        },

        async landedJob(j: clone.Job) {
            this.put(j);
            const workspaces = useWorkspacesStore();
            await workspaces.refreshWorkspaces();
            if (this.sheetOpen && this.watching === j.id) {
                // The user waited for it: show it and scan it.
                this.sheetOpen = false;
                this.watching = null;
                this.drop(j.id);
                await workspaces.select(j.workspaceId);
                this.openRequest++;
                await workspaces.startScan();
            } else {
                this.landed = j;
                this.drop(j.id);
                await workspaces.startScan(j.workspaceId);
            }
        },

        async openLanded() {
            const j = this.landed;
            this.landed = null;
            if (!j) return;
            await useWorkspacesStore().select(j.workspaceId);
            this.openRequest++;
        },

        dismissLanded() {
            this.landed = null;
        },
    },
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useCloneStore, import.meta.hot));
