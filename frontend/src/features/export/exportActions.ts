import { exportFileName, toCsv, toMarkdownTable, type ExportColumn, type ExportRow } from "./export"
import { FILTERS, copyText, saveText } from "~/platform/files"
import { buildProvenance, provenanceLines, provenanceShort } from "./provenance"
import { t } from "~/shared/i18n"

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

export async function copyTableMarkdown(tableSource: TableSource): Promise<string> {
    await copyText(toMarkdownTable(tableSource.columns(), tableSource.rows(), provenanceShort(buildProvenance())))
    return t("export.exportActions.copied")
}

export async function copyTableCsv(tableSource: TableSource): Promise<string> {
    await copyText(toCsv(tableSource.columns(), tableSource.rows(), preamble(tableSource)))
    return t("export.exportActions.copied")
}

export async function saveTableCsv(tableSource: TableSource): Promise<string | null> {
    const path = await saveText(exportFileName(tableSource.title, "csv"), toCsv(tableSource.columns(), tableSource.rows(), preamble(tableSource)), [FILTERS.csv], t("export.exportActions.saveCsv"))
    return path ? t("export.exportActions.saved") : null
}
