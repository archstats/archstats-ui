// Pure helpers for the app shell (sidebar, scan flow). Kept out of the
// store so the rules that matter are unit-testable without Pinia or Wails.

// Middle-truncates a filesystem path so the start and the end survive:
// "/Users/ryan/work/clients/acme/backend" → "/Users/…/acme/backend".
// The last segment is what identifies the folder, so it is the last thing
// to be cut; when even that overflows, its own start is elided.
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

// The auto-open rule: a freshly completed scan opens on its own only when
// the user was already on the newest completed snapshot (or had none open).
// Deliberately viewing an older snapshot is the pin; nothing else is.
export function shouldAutoOpen(openScanId: string | null, scansBefore: ScanLike[]): boolean {
    if (openScanId === null) return true;
    const newestComplete = scansBefore.find((s) => s.status === "complete");
    return !newestComplete || newestComplete.id === openScanId;
}

// Workspace name from a folder path, for the default name after a pick.
export function nameFromFolder(path: string): string {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? path;
}
