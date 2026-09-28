/** Commits touching more files than this say nothing about which change together. */
export function sweepingLimit(snapshotInfo: Record<string, string>): number {
  return Number(snapshotInfo.git_max_changes_per_commit) || 100
}

/**
 * File pairs that changed together, counted from git_commits: one row per
 * pair (`from` < `to`) with the commits they share. file_matrix held these
 * until analysis revision 4 made it opt-in; the rule is the one it used --
 * a commit touching more than `sweeping` files is left out, and only scanned
 * files pair up. `touching`, a subquery of file names, keeps only pairs with
 * a file in it, which keeps a single component's question cheap.
 */
export function fileCoChangeSql(sweeping: number, touching?: string): string {
  return `
    ${touchedSql(sweeping, touching)}
    SELECT a.file AS "from", b.file AS "to", count(*) AS shared
    FROM touched a JOIN touched b ON b.commit_hash = a.commit_hash AND b.file > a.file
    ${touching ? `WHERE a.file IN (${touching}) OR b.file IN (${touching})` : ""}
    GROUP BY 1, 2`
}

/**
 * The same pairs as fileCoChangeSql over the whole snapshot, paired here
 * rather than in SQL. A large repository has more pairs than one query may
 * return (Fineract: 329,097 against the backend's 300,000-row cap, which
 * blanked the lens room), but it has one row per commit: 9,430 there. So the
 * snapshot sends each commit's files and the pairs are counted here.
 */
export async function fileCoChangePairs(
  query: (sql: string) => Promise<any[]>,
  sweeping: number,
): Promise<Array<{ from: string; to: string; shared: number }>> {
  const rows = await query(`
    ${touchedSql(sweeping)}
    SELECT group_concat(file, char(31)) AS files FROM touched GROUP BY commit_hash HAVING count(*) > 1`) as Array<{ files: string }>
  const counts = new Map<string, number>()
  for (const row of rows) {
    const files = String(row.files).split(SEP).sort()
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = files[i] + SEP + files[j]
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return Array.from(counts, ([key, shared]) => {
    const [from, to] = key.split(SEP)
    return { from, to, shared }
  })
}

/** The unit separator: it cannot occur in a file path. */
const SEP = "\x1f"

/** A commit's scanned files, as `touched`, for commits that do not sweep. */
function touchedSql(sweeping: number, touching?: string): string {
  const commits = touching ? `commit_hash IN (SELECT commit_hash FROM git_commits WHERE file IN (${touching}))` : ""
  const mine = touching ? `AND g.${commits}` : ""
  return `WITH sized AS (SELECT commit_hash, count(*) AS n FROM git_commits ${touching ? `WHERE ${commits}` : ""} GROUP BY commit_hash),
    touched AS (
      SELECT DISTINCT g.commit_hash, g.file
      FROM git_commits g JOIN sized s ON s.commit_hash = g.commit_hash
      WHERE g.commit_hash <> '' AND s.n <= ${Math.floor(sweeping)}
        AND g.file IN (SELECT name FROM files) ${mine}
    )`
}
