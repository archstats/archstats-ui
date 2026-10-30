// Uncaught errors, freezes and the window's heartbeat (see platform/diagnostics.ts).
// Ask's hidden stage draws views for the window and reports nothing of its own.
import { installDiagnostics, uncaught } from "~/platform/diagnostics";
import { STAGE_SCAN } from "~/platform/stage";

export default defineNuxtPlugin((nuxtApp) => {
    if (STAGE_SCAN) return;
    installDiagnostics();
    // Errors thrown while rendering, in watchers and in lifecycle hooks.
    nuxtApp.hook("vue:error", (e) => uncaught(e, "view error"));
    nuxtApp.hook("app:error", (e) => uncaught(e, "app error"));
})
