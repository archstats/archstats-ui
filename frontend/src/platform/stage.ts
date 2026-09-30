// The stage: this app loaded a second time, out of sight, so Ask can show a
// view's real figure without moving the window the person is looking at.
// Loaded with ?askStage=<scanId>, it reads only that snapshot (never opening
// it globally, which would switch the person's window too) and writes no
// state, so nothing it does can be seen outside it.

export const STAGE_SCAN: string | null = (() => {
    try { return typeof location === "undefined" ? null : new URLSearchParams(location.search).get("askStage") } catch { return null }
})()

/**
 * In the native window the stage cannot talk to Go on its own: Wails injects
 * its runtime into every frame, but delivers every call's result by running
 * script in the main frame only, so a call made from this frame would never
 * resolve. The stage borrows the window's bindings instead (same origin), so
 * its calls go out and come back through the main frame. The generated
 * bindings look `window.go` up at call time, so replacing it here, before
 * anything calls Go, is enough.
 */
if (STAGE_SCAN && typeof window !== "undefined") {
    try {
        const parent = window.parent as any
        if (parent && parent !== window && parent.go) {
            ;(window as any).go = parent.go
            if (parent.runtime) (window as any).runtime = parent.runtime
        }
    } catch { /* not same-origin: the stage keeps its own and reports that it cannot start */ }
}
