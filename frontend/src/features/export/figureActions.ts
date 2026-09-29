import { provideService, serviceOf } from "~/platform/commands"
import { FILTERS, saveBase64, saveText } from "~/platform/files"
import { exportFileName } from "./export"
import { pngBase64, svgDocument, type ExportOptions, type FigureOutput } from "./figure"
import { buildProvenance, provenanceShort } from "./provenance"
import type { FigureExportable, TableExportable } from "./useExportables"

// What an exhibit's own button does. Saving happens here; adding to a report
// and pinning belong to the reports feature, which hands its two actions in
// (exhibitHandoff) when the shell mounts, so export never imports reports.

/** How the reader wants this figure to leave: light or as shown, with or without its legend. */
export interface FigureChoice {
    light: boolean
    legend: boolean
}

export interface ExhibitHandoff {
    /** The choice matters to figures only. */
    addToReport: (e: FigureExportable | TableExportable, choice: FigureChoice) => Promise<void>
    pin: (f: FigureExportable, choice: FigureChoice) => Promise<void>
}

const HANDOFF = "exhibit-handoff"

/** Offered by the reports feature when the shell mounts. */
export const provideExhibitHandoff = (h: ExhibitHandoff): (() => void) => provideService(HANDOFF, h)

/** Read when an item is clicked, not when the menu draws: the menu always lists Add to report. */
export const exhibitHandoff = (): ExhibitHandoff | null => serviceOf<ExhibitHandoff>(HANDOFF)

export const exportOptions = (f: FigureExportable, choice: FigureChoice): ExportOptions =>
    ({ light: choice.light, legend: choice.legend ? f.legend() : null })

async function drawn(f: FigureExportable, choice: FigureChoice): Promise<FigureOutput> {
    const out = await f.render({ light: choice.light })
    if (!out) throw new Error("the chart has nothing drawn yet")
    return out
}

const caption = () => provenanceShort(buildProvenance())

/** The figure as a PNG with its footer, base64; `withCaption` false for a report, which prints provenance itself. */
export async function figurePng(f: FigureExportable, choice: FigureChoice, withCaption = true): Promise<string> {
    return pngBase64(await drawn(f, choice), withCaption ? caption() : "", exportOptions(f, choice))
}

/** Resolves to "Saved", or null when the dialog was cancelled. */
export async function saveFigurePng(f: FigureExportable, choice: FigureChoice): Promise<string | null> {
    const b64 = await figurePng(f, choice)
    return (await saveBase64(exportFileName(f.title, "png"), b64, [FILTERS.png], "Save PNG")) ? "Saved" : null
}

export async function saveFigureSvg(f: FigureExportable, choice: FigureChoice): Promise<string | null> {
    const out = await drawn(f, choice)
    if (out.kind !== "svg") throw new Error("this chart is drawn on a canvas; save it as PNG")
    return (await saveText(exportFileName(f.title, "svg"), svgDocument(out, caption(), exportOptions(f, choice)), [FILTERS.svg], "Save SVG")) ? "Saved" : null
}
