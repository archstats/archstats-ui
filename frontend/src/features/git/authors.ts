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
export function authorStatsSql(where = "1", opts: { aliases?: AliasMap; includeBots?: boolean; anchor?: string } = {}): string {
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
  WITH now AS (SELECT ${opts.anchor ? `${opts.anchor} AS now` : "julianday(max(timestamp)) AS now FROM git_commits"}),
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

// ── Pseudonyms ──────────────────────────────────────────────────────────
// Works councils and privacy rules forbid naming people in evidence about
// their work. With pseudonymisation on, every author reads "Author N", in
// order of first commit so the numbering is the same on every screen and in
// every export of the same snapshot; merged aliases share one label.

/** Canonical author → "Author N", numbered by first commit (then name, for ties). */
export function pseudonymLabels(rows: Array<{ name: string; first: string | null }>, aliases: AliasMap = {}): Record<string, string> {
    const first = new Map<string, string>()
    for (const r of rows) {
        if (!r.name) continue
        const c = canonicalAuthor(aliases, r.name)
        const t = r.first ?? "9999"
        const prev = first.get(c)
        if (prev === undefined || t < prev) first.set(c, t)
    }
    const ordered = [...first.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    return Object.fromEntries(ordered.map(([name], i) => [name, `Author ${i + 1}`]))
}

/** Hides what names a person inside free text: @handles, email addresses and trailer lines. */
export function maskPeople(text: string): string {
    return text
        .replace(/^(co-authored-by|signed-off-by|reviewed-by|reported-by|acked-by):.*$/gim, "$1: …")
        .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "…@…")
        .replace(/(^|[^\w@])@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/g, "$1@…")
}

// ── Knowledge concentration ──────────────────────────────────────────────
// Who added a component's lines: lines added by each person (aliases merged,
// bots out), across the files the component has now. Lines added, not blame:
// a person who wrote a file and saw it rewritten still counts, which is the
// right reading for "whom to ask", and the wrong one for "who owns it now".

/** How many of the largest contributions it takes to reach `fraction` of the total. */
export function coverCount(added: number[], fraction: number): number {
    const sorted = [...added].filter(n => n > 0).sort((a, b) => b - a)
    const total = sorted.reduce((s, n) => s + n, 0)
    if (!total) return 0
    let sum = 0
    for (let i = 0; i < sorted.length; i++) {
        sum += sorted[i]
        if (sum >= fraction * total - 1e-9) return i + 1
    }
    return sorted.length
}

/** One component's contributors: author, lines added, last commit. */
export function componentAuthorsSql(component: string, aliases: AliasMap, includeBots = false): string {
    const lit = `'${component.replace(/'/g, "''")}'`
    return `SELECT ${canonicalAuthorSql(aliases, "c.author_name")} AS author, sum(coalesce(c.file_additions, 0)) AS added, max(c.commit_time) AS last
    FROM git_commits c JOIN files f ON f.name = c.file
    WHERE f.component = ${lit}${includeBots ? "" : ` AND ${NOT_BOT_SQL}`}
    GROUP BY 1 HAVING added > 0 ORDER BY added DESC, author`
}

/**
 * Every component: authors, how few cover half and four fifths of the lines
 * added, the main author with their share and last commit.
 */
export function knowledgeSql(aliases: AliasMap, includeBots = false): string {
    return `
    WITH a AS (
      SELECT f.component AS component, ${canonicalAuthorSql(aliases, "c.author_name")} AS author,
             sum(coalesce(c.file_additions, 0)) AS added, max(c.commit_time) AS last
      FROM git_commits c JOIN files f ON f.name = c.file
      WHERE f.component IS NOT NULL AND f.component <> ''${includeBots ? "" : ` AND ${NOT_BOT_SQL}`}
      GROUP BY 1, 2
    ), r AS (
      SELECT component, author, added, last,
             sum(added) OVER (PARTITION BY component) AS total,
             sum(added) OVER (PARTITION BY component ORDER BY added DESC, author ROWS UNBOUNDED PRECEDING) AS cum,
             row_number() OVER (PARTITION BY component ORDER BY added DESC, author) AS rank
      FROM a WHERE added > 0
    )
    SELECT component, count(*) AS authors, max(total) AS added,
           min(CASE WHEN cum >= 0.5 * total THEN rank END) AS cover50,
           min(CASE WHEN cum >= 0.8 * total THEN rank END) AS cover80,
           max(CASE WHEN rank = 1 THEN author END) AS main,
           max(CASE WHEN rank = 1 THEN added * 1.0 / total END) AS mainShare,
           max(CASE WHEN rank = 1 THEN last END) AS mainLast
    FROM r GROUP BY component`
}
