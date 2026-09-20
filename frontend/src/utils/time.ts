// Time formatting for the shell: scan timestamps and how long ago they were.
// Pure functions; `now` is injectable so tests are deterministic.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: Date | string | number): Date {
    return value instanceof Date ? value : new Date(value);
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

// "16 Sep, 18:42" within the current year, "16 Sep 2024, 18:42" otherwise.
export function formatScanTime(value: Date | string | number, now: Date = new Date()): string {
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return "";
    const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
    return `${day}${year}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Coarse relative age, always one unit: "just now", "4 min ago", "2 h ago",
// "3 d ago", "2 mo ago", "1 y ago". Future timestamps (clock skew) read as
// "just now" rather than a negative age.
export function relativeAge(value: Date | string | number, now: Date = new Date()): string {
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return "";
    const seconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} mo ago`;
    return `${Math.floor(days / 365)} y ago`;
}

// Elapsed time for a running scan: "0:07", "1:42", "1:02:05".
export function formatElapsed(startedAt: Date | string | number, now: Date = new Date()): string {
    const start = toDate(startedAt);
    const total = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// "16 Sep 2024" for commit and file dates: always the year, never the time.
export function formatDate(value: Date | string | number): string {
    const d = toDate(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
