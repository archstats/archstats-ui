import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const openMock = vi.fn().mockResolvedValue(undefined);
const defaultQuery = async (sql: string): Promise<any[]> => {
    if (sql.includes("sqlite_master")) {
        return [{ name: "components" }, { name: "files" }];
    }
    return [];
};
const queryMock = vi.fn(defaultQuery);

vi.mock("wailsjs/go/app/QueryService", () => ({
    Open: (scanId: string) => openMock(scanId),
    Query: (sql: string) => queryMock(sql),
    // Rows answers as Go does: column names once, then values per row.
    Rows: async (_id: string, _scanId: string, sql: string) => {
        const rows = await queryMock(sql);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        return { columns, rows: rows.map((r: any) => columns.map((c) => r[c])) };
    },
    Cancel: () => Promise.resolve(),
    CurrentScan: () => Promise.resolve(""),
}));

import { useDataStore } from "./data.store";

describe("data store over Wails bindings", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        openMock.mockClear();
        queryMock.mockClear();
        queryMock.mockImplementation(defaultQuery);
    });

    it("has no data before a scan is opened", () => {
        const store = useDataStore();
        expect(store.hasData).toBe(false);
    });

    it("query returns empty before a scan is opened", async () => {
        const store = useDataStore();
        expect(await store.query("SELECT 1")).toEqual([]);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("openScan opens the snapshot and flips hasData", async () => {
        const store = useDataStore();
        await store.openScan("scan-123");

        expect(openMock).toHaveBeenCalledWith("scan-123");
        expect(store.hasData).toBe(true);
        expect(store.viewNames).toContain("components");
        expect(store.hasView("files")).toBe(true);
    });

    it("routes queries through the binding once open", async () => {
        const store = useDataStore();
        await store.openScan("scan-123");
        queryMock.mockClear();

        await store.query("SELECT count(*) FROM files");
        expect(queryMock).toHaveBeenCalledWith("SELECT count(*) FROM files");
    });

    it("re-initializes state when switching scans", async () => {
        const store = useDataStore();
        await store.openScan("scan-1");
        await store.openScan("scan-2");

        expect(openMock).toHaveBeenNthCalledWith(1, "scan-1");
        expect(openMock).toHaveBeenNthCalledWith(2, "scan-2");
        expect(store.hasData).toBe(true);
    });

    describe("a load another open cancels part of", () => {
        // Go cancels every query on the open snapshot when any window opens
        // one. A load that overlapped such an open kept its components but lost
        // its file index or its edges, so every focus scoped to nothing.
        const FILES = [{ name: "audit/A.java", component: "audit", role: "production" }];
        const EDGES = [{ from: "billing", to: "audit", kind: "import", file: "billing/B.java", reference_count: 1 }];
        const COMPONENTS = [{ name: "audit" }, { name: "billing" }];

        function snapshot(cancelled: (sql: string) => boolean) {
            queryMock.mockImplementation(async (sql: string) => {
                if (cancelled(sql)) throw new Error("cancelled");
                if (sql.includes("sqlite_master")) return [{ name: "components" }, { name: "files" }, { name: "component_connections_direct" }];
                if (sql.includes("pragma_table_info('files')")) return [{ name: "name" }, { name: "component" }, { name: "role" }];
                if (sql.includes("FROM files")) return FILES;
                if (sql.includes("FROM component_connections_direct")) return EDGES;
                if (sql === "SELECT * FROM components") return COMPONENTS;
                return [];
            });
        }

        it("asks again for each read the open cancelled", async () => {
            const cancelledOnce = new Set<string>();
            snapshot(sql => {
                const target = sql.includes("FROM files") || sql.includes("FROM component_connections_direct") || sql === "SELECT * FROM components";
                if (!target || cancelledOnce.has(sql)) return false;
                cancelledOnce.add(sql);
                return true;
            });
            const store = useDataStore();
            await store.openScan("scan-1");

            expect(cancelledOnce.size).toBe(3);
            expect(store.componentFilesIndex.get("audit")).toEqual(["audit/A.java"]);
            expect(store.componentConnections).toHaveLength(1);
            expect(store.allRawComponents.map(c => c.name)).toEqual(["audit", "billing"]);
        });

        it("still gives up on a read that keeps being cancelled", async () => {
            snapshot(sql => sql.includes("FROM files"));
            const store = useDataStore();
            await store.openScan("scan-1");

            expect(store.componentFilesIndex.size).toBe(0);
            expect(store.componentConnections).toHaveLength(1);
        });

        it("does not ask again for a read that failed for another reason", async () => {
            let asked = 0;
            queryMock.mockImplementation(async (sql: string) => {
                if (sql.includes("FROM files")) { asked++; throw new Error("no such table: files"); }
                return [];
            });
            const store = useDataStore();
            await store.openScan("scan-1");

            expect(asked).toBe(1);
            expect(store.componentFilesIndex.size).toBe(0);
        });
    });
});
