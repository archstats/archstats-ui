import { Cancel, Open, Rows } from "wailsjs/go/app/QueryService";
import { STAGE_SCAN } from "./stage";

// WailsDb replaces the webapp's sql.js Web Worker (DbWorker). The interface
// the data store consumes is unchanged — raw SQL in, {column: value} rows
// out — but execution happens in the Go backend against the currently
// selected scan snapshot.
//
// Rows cross the bridge as column names once and values per row, and are
// made into objects here: as objects they repeat every column name in every
// row, which on a wide table is most of the bytes, and every byte crosses
// the bridge several times over.

export interface QueryOptions {
    /** Aborting cancels the query in Go and rejects with an AbortError. */
    signal?: AbortSignal;
}

let nextId = 0;

/** query.ErrCancelled in Go. */
const CANCELLED = "cancelled";

/** Whether an error is a query (or anything else) given up on by its caller. */
export function isAbort(e: unknown): boolean {
    return (e as any)?.name === "AbortError";
}

function aborted(): DOMException {
    return new DOMException("The query was cancelled", "AbortError");
}

export class WailsDb {
    // Selects a completed scan's snapshot as the active database.
    async open(scanId: string): Promise<void> {
        // The stage never opens a snapshot globally: that would switch the person's window.
        if (STAGE_SCAN) return;
        await Open(scanId);
    }

    async query<T = any>(sql: string, options?: QueryOptions): Promise<T[]> {
        return this.rows<T>(STAGE_SCAN ?? "", sql, options?.signal);
    }

    // Reads a snapshot other than the open one, for comparing a scan against
    // an earlier one. The open snapshot stays open either way.
    async queryIn<T = any>(scanId: string, sql: string, options?: QueryOptions): Promise<T[]> {
        return this.rows<T>(scanId, sql, options?.signal);
    }

    private async rows<T>(scanId: string, sql: string, signal?: AbortSignal): Promise<T[]> {
        if (signal?.aborted) throw aborted();
        // Only a query someone can abort needs a name to cancel it by.
        const id = signal ? `q${++nextId}` : "";
        const cancel = () => { void Cancel(id).catch(() => {}); };
        signal?.addEventListener("abort", cancel, { once: true });
        try {
            const table = await Rows(id, scanId, sql);
            if (signal?.aborted) throw aborted();
            return objects<T>(table?.columns ?? [], table?.rows ?? []);
        } catch (e) {
            // Go also cancels every query on a snapshot that is being closed.
            if (signal?.aborted || String((e as any)?.message ?? e) === CANCELLED) throw aborted();
            throw e;
        } finally {
            signal?.removeEventListener("abort", cancel);
        }
    }

    // The snapshot handle lives in Go and is closed on the next open;
    // nothing to tear down on the JS side.
    terminate(): void {}
}

/** Rows of values to rows of {column: value}. */
export function objects<T>(columns: string[], rows: any[][]): T[] {
    const out = new Array(rows.length);
    const n = columns.length;
    for (let r = 0; r < rows.length; r++) {
        const values = rows[r];
        const o: Record<string, any> = {};
        for (let i = 0; i < n; i++) o[columns[i]] = values[i];
        out[r] = o;
    }
    return out as T[];
}
