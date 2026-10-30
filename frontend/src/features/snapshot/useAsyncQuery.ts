import { getCurrentScope, onScopeDispose, ref, watch, type Ref, type WatchSource } from "vue";
import { useDataStore } from "./data.store";
import { isAbort } from "~/platform/db";

// Async data for a view with explicit loading, empty and error states. Runs
// `load` whenever the snapshot or any dependency changes, drops stale results
// from earlier runs, and never leaves the view showing yesterday's rows while
// today's query is still running.
//
// `load` gets a signal that aborts when its answer stops mattering: the next
// run started, or the view went away. Passing it on to `store.query(sql,
// { signal })` cancels the query in Go too, instead of letting it run out its
// minute against the queries of the view the person moved on to. Never pass
// it to a query whose promise is cached and shared with other views.
export function useAsyncQuery<T>(
    load: (signal: AbortSignal) => Promise<T>,
    deps: WatchSource[] = [],
    options: { initial: T; immediate?: boolean } ,
): { data: Ref<T>; loading: Ref<boolean>; error: Ref<string | null>; reload: () => Promise<void> } {
    const store = useDataStore();
    const data = ref(options.initial) as Ref<T>;
    const loading = ref(false);
    const error = ref<string | null>(null);
    let token = 0;
    let running: AbortController | null = null;

    async function reload() {
        const mine = ++token;
        running?.abort();
        running = null;
        if (!store.hasData) {
            data.value = options.initial;
            loading.value = false;
            error.value = null;
            return;
        }
        const controller = new AbortController();
        running = controller;
        loading.value = true;
        error.value = null;
        try {
            const result = await load(controller.signal);
            if (mine !== token) return;
            data.value = result;
        } catch (e: any) {
            if (mine !== token || isAbort(e)) return;
            data.value = options.initial;
            error.value = e?.message ? String(e.message) : String(e);
        } finally {
            if (mine === token) {
                loading.value = false;
                running = null;
            }
        }
    }

    // Both signals: a snapshot can be swapped for another without hasData
    // ever reading false in between.
    watch([() => store.hasData, () => store.datasetKey, ...deps], () => { void reload(); }, { immediate: options.immediate ?? true });

    // A view that is left cancels what it was still asking.
    if (getCurrentScope()) onScopeDispose(() => {
        token++;
        running?.abort();
        running = null;
    });

    return { data, loading, error, reload };
}
