// Pure helpers for the app shell (sidebar, scan flow). Kept out of the
// store so the rules that matter are unit-testable without Pinia or Wails.

// Middle-truncates a filesystem path so the start and the end survive:
// "/Users/ryan/work/clients/acme/backend" → "/Users/…/acme/backend".
// The last segment is what identifies the folder, so it is the last thing
// to be cut; when even that overflows, its own start is elided.
import { t } from "~/shared/i18n"

export function shortenPath(path: string, max = 36): string {
    if (!path || path.length <= max) return path;
    const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
    const parts = path.split(sep).filter(Boolean);
    const rooted = path.startsWith(sep) ? sep : "";
    if (parts.length <= 2) {
        return elideStart(path, max);
    }
    const first = parts[0];
    for (let keep = Math.min(3, parts.length - 1); keep >= 1; keep--) {
        const tail = parts.slice(-keep).join(sep);
        const candidate = `${rooted}${first}${sep}…${sep}${tail}`;
        if (candidate.length <= max) return candidate;
    }
    return elideStart(`…${sep}${parts[parts.length - 1]}`, max);
}

function elideStart(s: string, max: number): string {
    if (s.length <= max) return s;
    return `…${s.slice(s.length - (max - 1))}`;
}

export interface ScanLike {
    id: string;
    status: string;
}

// What the shell remembers about a scan while it runs: what it reads and
// where the user was when it began.
export interface ScanWatch {
    /** The commit or tag a rescan reads; empty for a scan of the working copy. */
    ref: string;
    /** The snapshot that was open when the scan began. */
    openAtStart: string | null;
}

// The auto-open rule. A scan of the working copy opens its result when it
// finishes, unless the user opened another snapshot while it ran: moving on
// is the only thing that keeps the view where it is. A rescan reads older
// code and never takes the view over, except when nothing is open at all.
// A scan the shell did not see begin (started before a reload) opens only
// into an empty view.
export function shouldOpenResult(watch: ScanWatch | null, openNow: string | null): boolean {
    if (openNow === null) return true;
    if (!watch || watch.ref) return false;
    return watch.openAtStart === openNow;
}

// "v1.9.0" stays a tag; a full commit hash reads as its short form.
export function refLabel(ref: string): string {
    return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

// Two letters that tell workspaces apart at a glance, the way an IDE badges
// its projects: the first letters of the first two words ("archstats-ui" →
// "AU", "BroadleafCommerce" → "BC"), or the first two of a single word.
export function monogram(name: string): string {
    const words = name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    if (words.length === 0) return "?";
    const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return letters.toUpperCase();
}

export interface TimedScan {
    status: string;
    origin?: string;
    startedAt: string | Date;
    finishedAt?: string | Date | null;
}

// How long the next scan of the working copy will take: the median of the
// last three that finished. Rescans read other commits in fresh clones and
// imports never ran here, so neither says anything about this folder.
export function scanEstimate(scans: TimedScan[]): number | null {
    const took = scans
        .filter((s) => s.status === "complete" && s.finishedAt && (!s.origin || s.origin === "scan"))
        .map((s) => ({ at: new Date(s.startedAt).getTime(), ms: new Date(s.finishedAt as any).getTime() - new Date(s.startedAt).getTime() }))
        .filter((s) => Number.isFinite(s.ms) && s.ms > 0)
        .sort((a, b) => b.at - a.at)
        .slice(0, 3)
        .map((s) => s.ms)
        .sort((a, b) => a - b);
    if (!took.length) return null;
    return took[Math.floor(took.length / 2)];
}

// "about 40s left", "about 3 min left", or the honest version once the
// estimate has run out. Progress is time against the estimate, capped short
// of full so the bar never claims to be done before the scan is.
export function scanEta(elapsedMs: number, estimateMs: number | null): { fraction: number | null; label: string } {
    if (!estimateMs) return { fraction: null, label: "" };
    const left = estimateMs - elapsedMs;
    const fraction = Math.min(0.96, Math.max(0, elapsedMs / estimateMs));
    if (left <= 0) return { fraction, label: t("workspace.scanFlow.takingLongerThanLast") };
    if (left < 10_000) return { fraction, label: t("workspace.scanFlow.almostDone") };
    if (left < 60_000) return { fraction, label: t("workspace.scanFlow.aboutSLeft", { value: Math.round(left / 10_000) * 10 }) };
    return { fraction, label: t("workspace.scanFlow.aboutMinLeft", { value: Math.round(left / 60_000) }) };
}

// Workspace name from a folder path, for the default name after a pick.
export function nameFromFolder(path: string): string {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? path;
}
