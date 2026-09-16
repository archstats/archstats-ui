import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const openMock = vi.fn().mockResolvedValue(undefined);
const queryMock = vi.fn(async (sql: string) => {
    if (sql.includes("sqlite_master")) {
        return [{ name: "components" }, { name: "files" }];
    }
    return [];
});

vi.mock("wailsjs/go/app/QueryService", () => ({
    Open: (scanId: string) => openMock(scanId),
    Query: (sql: string) => queryMock(sql),
    CurrentScan: () => Promise.resolve(""),
}));

import { useDataStore } from "./data";

describe("data store over Wails bindings", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        openMock.mockClear();
        queryMock.mockClear();
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
});
