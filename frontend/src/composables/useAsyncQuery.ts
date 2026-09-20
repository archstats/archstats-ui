import { ref, watch, type Ref, type WatchSource } from "vue";
import { useDataStore } from "~/stores/data";

// Async data for a view with explicit loading, empty and error states. Runs
// `load` whenever the snapshot or any dependency changes, drops stale results
// from earlier runs, and never leaves the view showing yesterday's rows while
// today's query is still running.
export function useAsyncQuery<T>(
    load: () => Promise<T>,
    deps: WatchSource[] = [],
    options: { initial: T; immediate?: boolean } ,
): { data: Ref<T>; loading: Ref<boolean>; error: Ref<string | null>; reload: () => Promise<void> } {
    const store = useDataStore();
    const data = ref(options.initial) as Ref<T>;
    const loading = ref(false);
    const error = ref<string | null>(null);
    let token = 0;

    async function reload() {
        const mine = ++token;
        if (!store.hasData) {
            data.value = options.initial;
            loading.value = false;
            error.value = null;
            return;
        }
        loading.value = true;
        error.value = null;
        try {
            const result = await load();
            if (mine !== token) return;
            data.value = result;
        } catch (e: any) {
            if (mine !== token) return;
            data.value = options.initial;
            error.value = e?.message ? String(e.message) : String(e);
        } finally {
            if (mine === token) loading.value = false;
        }
    }

    // Both signals: a snapshot can be swapped for another without hasData
    // ever reading false in between.
    watch([() => store.hasData, () => store.datasetKey, ...deps], () => { void reload(); }, { immediate: options.immediate ?? true });

    return { data, loading, error, reload };
}
