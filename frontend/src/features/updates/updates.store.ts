import { defineStore } from "pinia";
import { About, CheckForUpdate, ReleaseNotes, WhatsNew } from "wailsjs/go/app/AppService";
import { BrowserOpenURL } from "wailsjs/runtime/runtime";
import { useStateStore } from "~/platform/state.store";
import { STAGE_SCAN } from "~/platform/stage";

// The app's own releases: which build is running, whether a newer one is
// out, and what changed since the version the user last ran.
//
// The check is one anonymous request to GitHub for the latest published
// release, at launch and once a day while the app stays open, and only while
// "updates.check" is on (it is unless turned off in Settings). What's New
// reads the changelog the app was built with, so it needs no network.

const CHECK = "updates.check";
const SEEN = "updates.lastSeen";
const DISMISSED = "updates.dismissed";
const DAY = 24 * 60 * 60 * 1000;

export interface AboutInfo { version: string; engine: string; analysisRevision: number; platform: string; logPath: string; docs: string; releases: string }
export interface Release { version: string; url: string; published: string; notes: string }
export interface Section { version: string; date: string; body: string }

/** A build the release workflow made, as opposed to "dev" or a commit. */
export function isRelease(version: string): boolean {
    return /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version);
}

let timer: ReturnType<typeof setInterval> | null = null;

export const useUpdatesStore = defineStore("updates", {
    state: () => ({
        about: null as AboutInfo | null,
        latest: null as Release | null,
        newer: false,
        checking: false,
        error: "",
        checkedAt: null as Date | null,
        /** The sections the What's New sheet shows, and whether it is open. */
        notes: [] as Section[],
        notesOpen: false,
        /** True when the sheet opened by itself after an update. */
        notesAfterUpdate: false,
        started: false,
    }),
    getters: {
        checkEnabled(): boolean { return useStateStore().setting<boolean>(CHECK, true); },
        /** A newer release the user has not waved off. */
        available(state): Release | null {
            if (!state.newer || !state.latest) return null;
            return useStateStore().setting<string>(DISMISSED, "") === state.latest.version ? null : state.latest;
        },
    },
    actions: {
        async start() {
            if (this.started || STAGE_SCAN) return;
            this.started = true;
            const settings = useStateStore();
            await settings.loadSettings();
            try { this.about = (await About()) as AboutInfo; } catch { return; /* not in the desktop shell */ }
            await this.showWhatsNew();
            // A build that is not a release is never offered one, so it need not ask.
            if (this.checkEnabled && isRelease(this.about?.version ?? "")) this.schedule();
        },
        /** After an update, once: what changed since the version last run. */
        async showWhatsNew() {
            const version = this.about?.version ?? "";
            if (!isRelease(version)) return;
            const settings = useStateStore();
            const seen = settings.setting<string>(SEEN, "");
            if (seen !== version) await settings.setSetting(SEEN, version);
            if (!seen || seen === version) return;
            let sections: Section[] = [];
            try { sections = ((await WhatsNew(seen)) ?? []) as Section[]; } catch { sections = []; }
            if (!sections.length) return;
            this.notes = sections;
            this.notesAfterUpdate = true;
            this.notesOpen = true;
        },
        /** Help → What's New: this release's notes, or every release for a build that is not one. */
        async openNotes() {
            let all: Section[] = [];
            try { all = ((await ReleaseNotes()) ?? []) as Section[]; } catch { all = []; }
            const mine = all.filter(s => s.version === this.about?.version);
            this.notes = mine.length ? mine : all.slice(0, 1);
            this.notesAfterUpdate = false;
            this.notesOpen = true;
        },
        schedule() {
            void this.check();
            if (timer) clearInterval(timer);
            timer = setInterval(() => { if (this.checkEnabled) void this.check(); }, DAY);
        },
        async check() {
            if (this.checking) return;
            this.checking = true;
            this.error = "";
            try {
                const r: any = await CheckForUpdate();
                this.latest = r.latest as Release;
                this.newer = !!r.newer;
            } catch (e) {
                this.error = String((e as any)?.message ?? e ?? "");
            } finally {
                this.checking = false;
                this.checkedAt = new Date();
            }
        },
        async setCheckEnabled(on: boolean) {
            await useStateStore().setSetting(CHECK, on);
            if (on && isRelease(this.about?.version ?? "")) this.schedule();
            else if (timer) { clearInterval(timer); timer = null; }
        },
        async dismiss() {
            if (this.latest) await useStateStore().setSetting(DISMISSED, this.latest.version);
        },
        open(url: string | undefined) {
            if (!url) return;
            try { BrowserOpenURL(url); } catch { window.open(url, "_blank"); }
        },
    },
});
