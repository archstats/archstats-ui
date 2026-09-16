import { useDataStore } from "~/stores/data";

// Redirects everything to the scan picker until a scan is open. Global so
// pages don't need per-page definePageMeta wiring. The store MUST be
// instantiated inside the middleware function (after Pinia is active) —
// never at module scope.
export default defineNuxtRouteMiddleware((to) => {
    const store = useDataStore();
    if (!store.hasData && to.path !== "/open") {
        return navigateTo("/open");
    }
});
