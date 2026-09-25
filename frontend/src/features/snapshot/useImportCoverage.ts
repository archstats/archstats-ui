import { useDataStore } from "./data.store";
import { useAsyncQuery } from "./useAsyncQuery";
import { loadImportCoverage, type ImportCoverage } from "./coverage";

// One read per snapshot, shared by the banner, About and every view that
// reasons from imports.
const cache = new Map<string, Promise<ImportCoverage>>();

export function useImportCoverage() {
    const store = useDataStore();
    return useAsyncQuery<ImportCoverage | null>(
        () => {
            const key = String(store.datasetKey);
            let p = cache.get(key);
            if (!p) {
                p = loadImportCoverage(sql => store.query<any>(sql), (t, c) => (c ? store.hasColumn(t, c) : store.hasView(t)));
                p.catch(() => cache.delete(key));
                cache.set(key, p);
            }
            return p;
        },
        [],
        { initial: null },
    );
}
