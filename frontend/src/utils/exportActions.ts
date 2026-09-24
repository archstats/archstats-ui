import { exportFileName, toCsv, toMarkdownTable, type ExportColumn, type ExportRow } from "~/utils/export"
import { FILTERS, copyText, saveText } from "~/utils/files"
import { buildProvenance, provenanceLines, provenanceShort } from "~/utils/provenance"

// The three things any table offers, with the provenance attached. Each
// resolves to the word the button shows ("Copied", "Saved"), or null when the
// user cancelled the dialog; failures throw with what failed.

export interface TableSource {
    title: string
    columns: () => ExportColumn[]
    rows: () => ExportRow[]
    /** How the table's numbers were made (a rollup rule per column), kept with the rows. */
    notes?: () => Array<[string, string]>
}

const preamble = (t: TableSource) => [...provenanceLines(buildProvenance()), ...(t.notes?.() ?? [])]

export async function copyTableMarkdown(t: TableSource): Promise<string> {
    await copyText(toMarkdownTable(t.columns(), t.rows(), provenanceShort(buildProvenance())))
    return "Copied"
}

export async function copyTableCsv(t: TableSource): Promise<string> {
    await copyText(toCsv(t.columns(), t.rows(), preamble(t)))
    return "Copied"
}

export async function saveTableCsv(t: TableSource): Promise<string | null> {
    const path = await saveText(exportFileName(t.title, "csv"), toCsv(t.columns(), t.rows(), preamble(t)), [FILTERS.csv], "Save CSV")
    return path ? "Saved" : null
}
