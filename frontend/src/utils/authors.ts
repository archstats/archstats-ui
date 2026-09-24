// Author figures, counted one way everywhere.
//
// The engine's git_authors table counts an author's whole history: files long
// deleted, folders the scan skipped, and a file outside every component as a
// component called "". Activity and the Overview count only commits that touch
// a file in the snapshot. The two disagreed on every repository -- Sylius read
// 966 contributors on one screen and 434 on the next -- so every author figure
// is counted here from git_commits, in the snapshot's scope.

export const AUTHOR_PERIODS = [
    { id: "total", label: "Total", title: "All time", days: null },
    { id: "180", label: "180 d", title: "Last 180 days", days: 180 },
    { id: "90", label: "90 d", title: "Last 90 days", days: 90 },
    { id: "30", label: "30 d", title: "Last 30 days", days: 30 },
] as const

export type AuthorPeriodId = (typeof AUTHOR_PERIODS)[number]["id"]

export interface AuthorPeriodStats { commits: number; additions: number; deletions: number; files: number; components: number }

/** Commits that touch a file in this snapshot: the scope every author figure is counted in. */
export const IN_SNAPSHOT = "file IN (SELECT name FROM files)"

/**
 * One row per author with every period's figures and the first and last
 * commit. Periods count back from the scan, not from today: a snapshot keeps
 * saying what it said when it was taken.
 */
export function authorStatsSql(where = "1", opts: { aliases?: AliasMap; includeBots?: boolean } = {}): string {
    const periods = AUTHOR_PERIODS.map(p => {
        const inPeriod = p.days === null ? "1" : `t >= now - ${p.days}`
        return [
            `count(distinct case when ${inPeriod} then commit_hash end) as commits_${p.id}`,
            `sum(case when ${inPeriod} then a else 0 end) as additions_${p.id}`,
            `sum(case when ${inPeriod} then d else 0 end) as deletions_${p.id}`,
            `count(distinct case when ${inPeriod} then file end) as files_${p.id}`,
            `count(distinct case when ${inPeriod} and component is not null and component != '' then component end) as components_${p.id}`,
        ].join(", ")
    }).join(",\n    ")
    return `
  WITH now AS (SELECT julianday(max(timestamp)) AS now FROM git_commits),
  c AS (
    SELECT ${canonicalAuthorSql(opts.aliases ?? {})} AS author_name, author_email, commit_hash, file, component, commit_time,
           coalesce(file_additions, 0) AS a, coalesce(file_deletions, 0) AS d, julianday(commit_time) AS t
    FROM git_commits WHERE ${IN_SNAPSHOT} AND (${where})${opts.includeBots ? "" : ` AND ${NOT_BOT_SQL}`}
  )
  SELECT author_name, max(author_email) AS author_email,
    min(commit_time) AS first_commit, max(commit_time) AS last_commit, max(now) - max(t) AS days_since_last,
    ${periods}
  FROM c, now GROUP BY author_name`
}

export function periodStats(row: Record<string, any> | null | undefined, id: AuthorPeriodId): AuthorPeriodStats {
    const n = (metric: string) => Number(row?.[`${metric}_${id}`]) || 0
    return {
        commits: n("commits"),
        additions: n("additions"),
        deletions: n("deletions"),
        files: n("files"),
        components: n("components"),
    }
}

// ── Bots ────────────────────────────────────────────────────────────────
// Release plugins, dependency bumpers and CI accounts commit like people and
// are counted like people: jenkins filled Broadleaf's commit list and
// dependabot sat among LibreChat's top contributors. They are hidden by
// default everywhere authors are counted, never deleted.

const BOT_NAME = /\[bot\]$|(^|[\s_-])bot$|^(dependabot|renovate|github-actions|greenkeeper|snyk|pyup|jenkins|travis|circleci|gitlab-ci|semantic-release|allcontributors|codecov|mergify|imgbot|web-flow)\b/i
const BOT_EMAIL = /\[bot\]@|noreply@github\.com$|^(jenkins|ci|build|buildbot|release)@/i
const BOT_MESSAGE = /^\[maven-release-plugin\]/

export function isBotAuthor(name: string | null | undefined, email?: string | null): boolean {
    return BOT_NAME.test((name ?? "").trim()) || (!!email && BOT_EMAIL.test(email.trim()))
}

/** A commit a machine made, whoever it was made as: Maven's release commits carry the releaser's name. */
export function isBotCommit(name: string | null | undefined, email?: string | null, message?: string | null): boolean {
    return isBotAuthor(name, email) || BOT_MESSAGE.test((message ?? "").trim())
}

/**
 * The same predicate in SQL, over git_commits' columns. Every count uses this
 * one, so Authors, Activity and the Overview agree to the commit; the
 * functions above serve tests and single rows.
 */
export const NOT_BOT_SQL = `NOT (
    author_name LIKE '%[bot]' OR lower(author_name) LIKE '% bot' OR lower(author_name) LIKE '%-bot' OR lower(author_name) LIKE '%\\_bot' ESCAPE '\\' OR lower(author_name) = 'bot'
    OR lower(author_name) IN ('dependabot', 'renovate', 'github-actions', 'greenkeeper', 'snyk', 'pyup', 'jenkins', 'travis', 'circleci', 'gitlab-ci', 'semantic-release', 'allcontributors', 'codecov', 'mergify', 'imgbot', 'web-flow')
    OR author_email LIKE '%[bot]@%' OR author_email LIKE '%noreply@github.com'
    OR lower(author_email) LIKE 'jenkins@%' OR lower(author_email) LIKE 'ci@%' OR lower(author_email) LIKE 'build@%' OR lower(author_email) LIKE 'buildbot@%' OR lower(author_email) LIKE 'release@%'
    OR commit_message LIKE '[maven-release-plugin]%'
  )`

// ── Aliases ─────────────────────────────────────────────────────────────
// One person under two names ("jefffischer" and "Jeff Fischer") is two
// contributors, two rows in "Works with" and half a bus factor each. The
// engine merges what it can prove from emails; the rest the architect merges
// by hand, and every author query folds the aliases into one name.

export type AliasMap = Record<string, string>

/** SQL for the canonical author name: aliases folded into the name they were merged into. */
export function canonicalAuthorSql(aliases: AliasMap, column = "author_name"): string {
    const entries = Object.entries(aliases)
    if (entries.length === 0) return column
    const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
    return `CASE ${column} ${entries.map(([a, c]) => `WHEN ${lit(a)} THEN ${lit(c)}`).join(" ")} ELSE ${column} END`
}

export function canonicalAuthor(aliases: AliasMap, name: string): string {
    return aliases[name] ?? name
}

/** Every name recorded for a person: the canonical one and whatever was merged into it. */
export function namesOf(aliases: AliasMap, canonical: string): string[] {
    return [canonical, ...Object.entries(aliases).filter(([, c]) => c === canonical).map(([a]) => a)]
}

/** SQL matching every name a person committed under. */
export function authorNamesSql(aliases: AliasMap, canonical: string): string {
    const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
    return `author_name IN (${namesOf(aliases, canonical).map(lit).join(", ")})`
}
