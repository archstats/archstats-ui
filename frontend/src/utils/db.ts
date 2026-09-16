import { Open, Query } from "wailsjs/go/app/QueryService";

// WailsDb replaces the webapp's sql.js Web Worker (DbWorker). The interface
// the data store consumes is unchanged — raw SQL in, {column: value} rows
// out — but execution happens in the Go backend against the currently
// selected scan snapshot.
export class WailsDb {
    // Selects a completed scan's snapshot as the active database.
    async open(scanId: string): Promise<void> {
        await Open(scanId);
    }

    async query<T = any>(sql: string): Promise<T[]> {
        const rows = await Query(sql);
        return (rows ?? []) as T[];
    }

    // The snapshot handle lives in Go and is closed on the next open;
    // nothing to tear down on the JS side.
    terminate(): void {}
}
