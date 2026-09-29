import { reactive, ref } from "vue"

// The reader's choices about figures. How a figure leaves the app (light or
// as shown, legend or not) holds for the session, across every figure; the
// legend under a figure in the app is remembered per figure, on this machine,
// once the reader has turned it on or off.

/** Draw the legend under exported figures. On by default: a report has no view around the figure. */
export const legendInExport = ref(true)

/** Export in the dark appearance, as the window shows it, instead of light. */
export const asShown = ref(false)

const KEY = "archstats.figure.legendHere"

function load(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {} } catch { return {} }
}

const chosen = reactive<Record<string, boolean>>(load())

/** Whether the legend shows under this figure: the reader's choice, else the figure's own default. */
export function legendHereFor(title: string, byDefault: boolean): boolean {
    return chosen[title] ?? byDefault
}

export function rememberLegendHere(title: string, on: boolean): void {
    chosen[title] = on
    try { localStorage.setItem(KEY, JSON.stringify(chosen)) } catch { /* storage refused: it holds for the session */ }
}
