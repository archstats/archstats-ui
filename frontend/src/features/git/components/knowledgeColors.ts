import { computed } from "vue"
import { useChartTheme } from "~/shared/ui/useChartTheme"
import type { StateId } from "../knowledgeLeft"

// One ramp for the knowledge ladder, read from the blue token steps so it
// holds in both appearances: the dark ramp runs light-to-dark the other way,
// so "further from the background" always means "known better". Code nobody
// still here knows is hatched, not coloured. The map, the key and the list
// all take their colour from here.

export interface KnowledgePalette {
    fill: Record<StateId, string>
    /** Text that sits on each fill. */
    ink: Record<StateId, string>
    inkSoft: Record<StateId, string>
    hatchLine: string
    hatchGround: string
    /** A package rolled into one tile. */
    rolled: string
}

function token(style: CSSStyleDeclaration, name: string, alpha = 1): string {
    const raw = style.getPropertyValue(name).trim().split(/\s+/).join(", ")
    if (!raw) return "rgb(128, 128, 128)"
    return alpha === 1 ? `rgb(${raw})` : `rgba(${raw}, ${alpha})`
}

export function knowledgePalette(): KnowledgePalette {
    const s = getComputedStyle(document.documentElement)
    const ink = token(s, "--c-neutral-900"), soft = token(s, "--c-neutral-600"), body = token(s, "--c-neutral-800")
    return {
        fill: { wrote: token(s, "--c-blue-400"), works: token(s, "--c-blue-200"), once: token(s, "--c-blue-50"), nobody: token(s, "--c-neutral-50") },
        ink: { wrote: ink, works: ink, once: ink, nobody: soft },
        inkSoft: { wrote: body, works: token(s, "--c-neutral-700"), once: soft, nobody: token(s, "--c-neutral-500") },
        hatchLine: token(s, "--c-neutral-200"),
        hatchGround: token(s, "--c-neutral-50"),
        rolled: token(s, "--c-neutral-100"),
    }
}

/** The fill as a CSS background, the hatch included. */
export function stateBackground(state: StateId, p: KnowledgePalette): string {
    if (state !== "nobody") return p.fill[state]
    return `repeating-linear-gradient(135deg, ${p.hatchLine} 0 1.5px, ${p.hatchGround} 1.5px 5px)`
}

/** The palette, redrawn when the appearance flips. */
export function useKnowledgePalette() {
    const { version } = useChartTheme()
    return computed(() => { void version.value; return knowledgePalette() })
}
