import { ref, watch, type Ref, type WatchSource } from 'vue'
import { useDataStore } from '~/stores/data'

/**
 * Runs an async query when dependencies change, storing the result in a ref.
 * Uses `watch` with explicit dependencies instead of `watchEffect` to avoid
 * Vue's recursive update detection issues with async effects.
 *
 * @param queryFn - Async function that returns the query result
 * @param deps - Optional additional reactive dependencies to watch (beyond store.hasData)
 * @param defaultValue - Default value for the ref
 */
export function useAsyncQuery<T>(
    queryFn: () => Promise<T>,
    deps?: WatchSource[],
    defaultValue?: T
): Ref<T> {
    const store = useDataStore()
    const result = ref(defaultValue !== undefined ? defaultValue : (Array.isArray(defaultValue) ? [] : null)) as Ref<T>

    const sources: WatchSource[] = [() => store.hasData, ...(deps || [])]

    watch(
        sources,
        async () => {
            if (!store.hasData) return
            try {
                result.value = await queryFn()
            } catch (e) {
                console.error('[useAsyncQuery] Error:', e)
            }
        },
        { immediate: true }
    )

    return result
}
