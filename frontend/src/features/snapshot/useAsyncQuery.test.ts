import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";

vi.mock("wailsjs/go/app/QueryService", () => ({
    Open: () => Promise.resolve(),
    Query: () => Promise.resolve([]),
    Rows: async () => ({ columns: [], rows: [] }),
    Cancel: () => Promise.resolve(),
    CurrentScan: () => Promise.resolve(""),
}));

import { useDataStore } from "./data.store";
import { useAsyncQuery } from "./useAsyncQuery";

const flush = () => new Promise(r => setTimeout(r, 0));

describe("useAsyncQuery", () => {
    it("never shows one snapshot's rows while the next one's load runs", async () => {
        setActivePinia(createPinia());
        const store = useDataStore();
        await store.openScan("scan-1");
        let answer!: (rows: string[]) => void;
        const scope = effectScope();
        const q = scope.run(() => useAsyncQuery(() => new Promise<string[]>(r => { answer = r; }), [], { initial: [] as string[] }))!;
        await nextTick();
        answer(["from scan-1"]);
        await flush();
        expect(q.data.value).toEqual(["from scan-1"]);

        await store.openScan("scan-2");
        await nextTick();
        expect(q.loading.value).toBe(true);
        expect(q.data.value).toEqual([]);
        answer(["from scan-2"]);
        await flush();
        expect(q.data.value).toEqual(["from scan-2"]);
        scope.stop();
    });
});
