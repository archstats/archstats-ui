// How often a pipeline file or Dockerfile has changed, from the snapshot's
// git rows: changes in the year before the scanned commit, the last change,
// and who made them (names go through the authors store, so pseudonyms hold).

import { NOT_BOT_SQL } from "~/features/git/authors"

export interface FileHistory { changes: number; last: string | null; authors: string[] }

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

/** The query for one file's history; files are matched with and without the walker's ./ prefix. */
export function historySql(file: string, anchor: string): string {
  const clean = file.replace(/^\.\//, "")
  const names = [clean, "./" + clean].map(lit).join(", ")
  return `SELECT
    count(DISTINCT CASE WHEN julianday(commit_time) > ${anchor} - 365 THEN commit_hash END) AS changes,
    max(commit_time) AS last,
    group_concat(DISTINCT CASE WHEN julianday(commit_time) > ${anchor} - 365 THEN author_name END) AS authors
  FROM git_commits WHERE file IN (${names}) AND julianday(commit_time) <= ${anchor} AND ${NOT_BOT_SQL}`
}

export function readHistory(row: { changes?: number | null; last?: string | null; authors?: string | null } | undefined): FileHistory {
  return {
    changes: Number(row?.changes ?? 0),
    last: row?.last ?? null,
    authors: (row?.authors ?? "").split(",").map(s => s.trim()).filter(Boolean).sort(),
  }
}
