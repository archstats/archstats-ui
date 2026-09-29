import { computed, inject, onBeforeUnmount, provide, shallowRef, type ComputedRef, type InjectionKey } from "vue"
import type { FigureExportable, TableExportable } from "./useExportables"

// An exhibit is what a reader can take out of a view: a figure or a table.
// Each sits in an ExhibitFrame, which owns its header row and its export
// button. A chart or table component frames itself; a page that already has
// the exhibit's heading, controls or strip wraps the component in a frame of
// its own (a host frame, with no `exhibit`), and the component's frame then
// steps aside and hands its exhibit up. That way the button always sits on
// the row that names the exhibit, whoever draws that row.

export type Exhibit = FigureExportable | TableExportable

export interface FrameContext {
    /** The exhibit this frame exports: its own, or the one a component inside handed up. */
    exhibit: ComputedRef<Exhibit | null>
    /** Whether this frame takes an exhibit from a component inside it. */
    hosts: boolean
    attach: (e: Exhibit) => () => void
}

export const FRAME: InjectionKey<FrameContext> = Symbol("exhibit-frame")

/**
 * The frame's side of the handshake. `own` is the exhibit prop: undefined for
 * a host frame, an exhibit or null for a component's own frame.
 */
export function useFrameContext(own: () => Exhibit | null | undefined) {
    const outer = inject(FRAME, null)
    const hosts = own() === undefined
    const attached = shallowRef<Exhibit | null>(null)
    const exhibit = computed(() => own() ?? attached.value)

    // A component's own frame inside a host frame: hand the exhibit up and draw only the chart.
    let passThrough = false
    if (!hosts && outer?.hosts && own()) {
        passThrough = true
        const detach = outer.attach(own()!)
        onBeforeUnmount(detach)
    }

    const ctx: FrameContext = {
        exhibit,
        hosts,
        attach: (e) => {
            attached.value = e
            return () => { if (attached.value === e) attached.value = null }
        },
    }
    // A pass-through frame provides the host's context, so a button placed inside still finds it.
    provide(FRAME, passThrough && outer ? outer : ctx)
    return { exhibit, passThrough }
}
