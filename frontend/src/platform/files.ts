import { ref } from "vue"
import { CopyText, Reveal, SaveBundle, SaveFile } from "wailsjs/go/app/FilesService"
import { t } from "~/shared/i18n"

// The one way anything leaves the app: a native save dialog, the system
// clipboard, a reveal in the file manager. Every export and every "Copy …"
// goes through here, so they all behave the same: cancelling changes
// nothing, a failure says what failed, and the last export can be revealed.

export interface Filter { name: string; patterns: string }

export const FILTERS = {
    csv: { name: t("platform.files.csvTable"), patterns: "*.csv" },
    md: { name: t("platform.files.markdown"), patterns: "*.md" },
    png: { name: t("platform.files.pngImage"), patterns: "*.png" },
    svg: { name: t("platform.files.svgImage"), patterns: "*.svg" },
    json: { name: t("platform.files.json"), patterns: "*.json" },
    db: { name: t("platform.files.archstatsSnapshot"), patterns: "*.db" },
    pdf: { name: t("platform.files.pdfDocument"), patterns: "*.pdf" },
} satisfies Record<string, Filter>

/** The path of the last file saved this session, for "Reveal last export". */
export const lastExport = ref<string | null>(null)

/** Saves text; resolves to the path, or null when the user cancelled. */
export async function saveText(defaultName: string, text: string, filters: Filter[], title = t("platform.files.save")): Promise<string | null> {
    const path = await SaveFile({ defaultName, title, filters, text, base64: "" } as any)
    if (path) lastExport.value = path
    return path || null
}

/** Saves binary content given as base64 (a PNG, say). */
export async function saveBase64(defaultName: string, base64: string, filters: Filter[], title = t("platform.files.save")): Promise<string | null> {
    const path = await SaveFile({ defaultName, title, filters, text: "", base64 } as any)
    if (path) lastExport.value = path
    return path || null
}

/** Asks for a folder and writes several files into it. */
export async function saveBundle(title: string, files: Array<{ name: string; text?: string; base64?: string }>): Promise<string | null> {
    const dir = await SaveBundle(title, files.map(f => ({ name: f.name, text: f.text ?? "", base64: f.base64 ?? "" })) as any)
    if (dir) lastExport.value = dir
    return dir || null
}

export async function reveal(path: string): Promise<void> {
    await Reveal(path)
}

/** Copies text; the native clipboard first, the browser's when that is absent. */
export async function copyText(text: string): Promise<void> {
    try {
        await CopyText(text)
        return
    } catch { /* not in the desktop shell */ }
    await navigator.clipboard.writeText(text)
}
