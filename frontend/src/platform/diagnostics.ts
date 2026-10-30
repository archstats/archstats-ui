import { reactive } from "vue";
import { Heartbeat, Log, LogPath, TakeRecovered } from "wailsjs/go/app/AppService";
import { Reveal } from "wailsjs/go/app/FilesService";

// What goes wrong in the window, written to the app's log and, when the
// person should know, shown as a notice.
//
// Without this an uncaught error or a rejected promise nobody handled left
// no trace: the view just stopped, and "it crashed" was all anyone could
// say afterwards. Now every one is logged with its stack and the route it
// happened on, freezes of a second or more are logged with how long they
// lasted, and the window beats every few seconds so Go can reload it when
// the system kills the page (see app/diag/watchdog.go).

export type NoticeKind = "error" | "reloaded";

export interface Notice {
    id: number;
    kind: NoticeKind;
    message: string;
}

/** What the window should show the person; ProblemNotice draws it. */
export const notices = reactive<Notice[]>([]);

let nextNotice = 0;
let lastErrorNotice = 0;

export function dismiss(id: number): void {
    const i = notices.findIndex((n) => n.id === id);
    if (i >= 0) notices.splice(i, 1);
}

function notify(kind: NoticeKind, message: string): void {
    // One error notice at a time, and not more than one every half minute:
    // an error in a loop must not become a wall of notices.
    if (kind === "error") {
        const now = Date.now();
        if (now - lastErrorNotice < 30_000 || notices.some((n) => n.kind === "error")) return;
        lastErrorNotice = now;
    }
    notices.push({ id: ++nextNotice, kind, message });
}

/** Opens the folder holding the log, with the log selected. */
export async function showLog(): Promise<void> {
    try { await Reveal(await LogPath()); } catch { /* nothing to show */ }
}

const recent = new Map<string, number>();

/** Writes one line to the app's log; the same message within ten seconds is written once. */
export function report(level: "error" | "warn" | "info", message: string, detail = ""): void {
    const now = Date.now();
    const key = level + message;
    if (now - (recent.get(key) ?? 0) < 10_000) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();
    const where = `route: ${location.hash || "/"}`;
    void Log(level, message, detail ? `${where}\n${detail}` : where).catch(() => {});
}

/** Whether an error is noise the browser raises about itself, or a caller giving up on purpose. */
function ignorable(e: unknown): boolean {
    const name = (e as any)?.name;
    const message = String((e as any)?.message ?? e ?? "");
    return name === "AbortError" || /ResizeObserver loop/.test(message);
}

function describe(e: unknown): { message: string; detail: string } {
    if (e instanceof Error) return { message: e.message || e.name, detail: e.stack ?? "" };
    return { message: typeof e === "string" ? e : JSON.stringify(e) ?? String(e), detail: "" };
}

/** An error nothing else handled: logged, and shown. */
export function uncaught(e: unknown, where: string): void {
    if (ignorable(e)) return;
    const { message, detail } = describe(e);
    report("error", `${where}: ${message}`, detail);
    notify("error", message);
}

let installed = false;

/** Starts listening; the plugin calls it once. */
export function installDiagnostics(): void {
    if (installed || typeof window === "undefined") return;
    installed = true;

    window.addEventListener("error", (ev) => uncaught(ev.error ?? ev.message, "uncaught error"));
    window.addEventListener("unhandledrejection", (ev) => uncaught(ev.reason, "unhandled rejection"));

    watchForFreezes();
    beat();

    TakeRecovered().then((recovered) => {
        if (!recovered) return;
        report("warn", "the window was reloaded after it stopped answering");
        notify("reloaded", "");
    }).catch(() => {});
}

// WebKit has no long-task API, so a freeze is measured as a timer that came
// back late. A hidden window's timers are throttled on purpose; only a
// visible window's lateness counts.
const FREEZE_MS = 1000;

function watchForFreezes(): void {
    const every = 250;
    let last = performance.now();
    let wasVisible = document.visibilityState === "visible";
    setInterval(() => {
        const now = performance.now();
        const late = now - last - every;
        const visible = document.visibilityState === "visible";
        if (late >= FREEZE_MS && visible && wasVisible) {
            report("warn", `the window froze for ${Math.round(late)} ms`);
        }
        last = now;
        wasVisible = visible;
    }, every);
}

// The heartbeat Go's watchdog listens for. Hiding says so at once, because a
// hidden window's timers slow down and its silence means nothing. Only the
// app's own window beats: a browser tab on the dev server talks to the same
// Go process, and a closed tab must not get the window reloaded.
function beat(): void {
    const w = window as any;
    if (!w.webkit?.messageHandlers && !w.chrome?.webview) return;
    const send = () => { void Heartbeat(document.visibilityState === "visible").catch(() => {}); };
    send();
    setInterval(send, 5000);
    document.addEventListener("visibilitychange", send);
}
