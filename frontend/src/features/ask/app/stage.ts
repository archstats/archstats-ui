// The window's side of the stage: one hidden copy of the app, made when a
// preview is first wanted, reused, and taken down when idle. Takes run one
// at a time; results are cached per snapshot, route and focus.

import { STAGE_SCAN } from "~/platform/stage"
import type { StageTake } from "./stageHost"
import { t } from "~/shared/i18n"

interface StageApi { ready: () => boolean; take: (route: string, opts: { focus?: string; take?: string; figures?: number; vision?: boolean; report?: boolean }) => Promise<StageTake> }

let frame: HTMLIFrameElement | null = null
let frameScan = ""
let booting: Promise<StageApi> | null = null
let idle: ReturnType<typeof setTimeout> | null = null
let chain: Promise<unknown> = Promise.resolve()
const cache = new Map<string, Promise<StageTake>>()
const IDLE_MS = 120_000

function teardown() {
    frame?.remove()
    frame = null
    frameScan = ""
    booting = null
}

function boot(scanId: string): Promise<StageApi> {
    if (booting && frameScan === scanId) return booting
    teardown()
    frameScan = scanId
    const f = document.createElement("iframe")
    // Laid out at a desktop size (figures measure their box) and inside the viewport, so WebKit keeps
    // animating it (force layouts settle on animation frames); invisible, behind everything, out of the tab order.
    f.setAttribute("aria-hidden", "true")
    f.tabIndex = -1
    f.style.cssText = "position:fixed;left:0;top:0;width:1480px;height:960px;border:0;opacity:0;pointer-events:none;z-index:-1;"
    // Relative to the page itself: the native window's scheme (wails://) need not report a usable origin.
    f.src = new URL(`?askStage=${encodeURIComponent(scanId)}#/`, location.href).toString()
    document.body.appendChild(f)
    frame = f
    booting = new Promise<StageApi>((resolve, reject) => {
        const t0 = Date.now()
        const poll = () => {
            const api = (f.contentWindow as any)?.__askStage as StageApi | undefined
            if (api?.ready()) return resolve(api)
            if (Date.now() - t0 > 30000) {
                let why = t("ask.stage.hiddenViewDidNot")
                try { const w = f.contentWindow as any; why = !w ? t("ask.stage.noFrame") : !w.go ? t("ask.stage.noConnectionApp") : w.__askStage ? t("ask.stage.snapshotDidNotOpen") : t("ask.stage.appDidNotFinish") } catch { why = t("ask.stage.frameNotReachable") }
                return reject(new Error(t("ask.stage.previewCouldNotStart", { why })))
            }
            setTimeout(poll, 250)
        }
        poll()
    })
    booting.catch(() => teardown())
    return booting
}

/** A view's figures and tables, drawn out of sight on the given snapshot. */
export function takeView(scanId: string, route: string, opts: { focus?: string; take?: string; figures?: number; vision?: boolean; report?: boolean } = {}): Promise<StageTake> {
    if (STAGE_SCAN) return Promise.reject(new Error(t("ask.stage.noStageInsideStage")))
    const key = `${scanId}|${route}|${opts.focus ?? ""}|${opts.take ?? ""}|${opts.figures ?? 2}|${opts.vision ? 1 : 0}|${opts.report ? 1 : 0}`
    const hit = cache.get(key)
    if (hit) return hit
    const run = chain.then(async () => {
        if (idle) clearTimeout(idle)
        const api = await boot(scanId)
        const out = await Promise.race([
            api.take(route, opts),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t("ask.stage.viewTookTooLong"))), 30000)),
        ])
        idle = setTimeout(teardown, IDLE_MS)
        return out
    }) as Promise<StageTake>
    chain = run.catch(() => undefined)
    cache.set(key, run)
    run.catch(() => cache.delete(key))
    if (cache.size > 60) cache.delete(cache.keys().next().value!)
    return run
}
