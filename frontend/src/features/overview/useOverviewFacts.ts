import { computed } from "vue";
import { ReadingsOf } from "wailsjs/go/app/ChangesService";
import { useDataStore } from "~/features/snapshot/data.store";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useAuthorsStore } from "~/features/git/authors.store";
import { IN_SNAPSHOT, NOT_BOT_SQL, canonicalAuthorSql, knowledgeSql } from "~/features/git/authors";
import { anchorSql } from "~/features/git/history";
import { roleOf } from "~/features/snapshot/fileRole";
import type { FileRole } from "~/features/snapshot/languages";
import type { ArchFacts, FileFact, OverviewFacts } from "./findings";

// The facts the Overview reads, loaded once per snapshot: the panels at the
// top and the findings under them draw on the same numbers.

const DEPENDENTS = "modularity__coupling__dependents";

export function useOverviewFacts() {
  const data = useDataStore();
  const workspaces = useWorkspacesStore();
  const authors = useAuthorsStore();
  const key = () => data.datasetKey;
  const git = () => data.hasView("git_commits");
  const people = (column = "author_name") => canonicalAuthorSql(authors.aliases, column);
  const humans = () => (authors.showBots ? "1" : NOT_BOT_SQL);

  const { data: files, loading } = useAsyncQuery<FileFact[]>(async (signal) => {
    if (!data.hasData) return [];
    const col = (c: string) => (data.hasColumn("files", c) ? c : "NULL");
    const rows = await data.query<any>(`SELECT name, coalesce(complexity__lines, 0) AS lines, ${col("role")} AS role,
      ${col("codesmells__code_health")} AS health, ${col("codesmells__hotspot_score")} AS hotspot,
      component, ${col("git__commits__total")} AS commits FROM files`, { signal });
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    return rows.map((r) => ({
      name: String(r.name),
      lines: Number(r.lines) || 0,
      role: (r.role || roleOf({ name: String(r.name) })) as FileRole,
      health: num(r.health),
      hotspot: num(r.hotspot),
      component: r.component ? String(r.component) : null,
      commits: num(r.commits),
    }));
    // The columns arrive with the snapshot's schema; read before them, every file fell back to "production".
  }, [key, () => data.hasColumn("files", "role"), () => data.hasColumn("files", "codesmells__code_health")], { initial: [] });

  // The app's readings of this scan, computed once per scan in Go.
  const { data: readings } = useAsyncQuery<Record<string, number | null>>(async () => {
    const id = workspaces.openScanId;
    if (!id) return {};
    try { return ((await ReadingsOf(id)) ?? {}) as any; } catch { return {}; }
  }, [() => workspaces.openScanId], { initial: {} });

  const { data: tangles } = useAsyncQuery<OverviewFacts["tangles"]>(async (signal) => {
    if (!data.hasView("component_strongly_connected_groups")) return [];
    const rows = await data.query<{ size: number; members: string }>(`SELECT count(*) AS size, group_concat(component, char(10)) AS members
      FROM component_strongly_connected_groups GROUP BY "group" HAVING count(*) > 1 ORDER BY 1 DESC`, { signal });
    return rows.map((r) => ({ size: Number(r.size), members: String(r.members).split("\n") }));
  }, [key], { initial: [] });

  const { data: knowledge } = useAsyncQuery<OverviewFacts["knowledge"]>(async (signal) => {
    if (!git()) return [];
    const rows = await data.query<any>(knowledgeSql(authors.aliases, authors.showBots), { signal });
    return rows.map((r) => ({ component: String(r.component), added: Number(r.added) || 0, cover80: Number(r.cover80) || 0, mainShare: Number(r.mainShare) || 0, mainLast: r.mainLast ? String(r.mainLast) : null }));
  }, [key, () => authors.aliases, () => authors.showBots], { initial: [] });

  const { data: rules } = useAsyncQuery<OverviewFacts["rules"]>(async (signal) => {
    if (!data.hasView("rules")) return [];
    const rows = await data.query<any>(`SELECT "from" AS component, count(*) AS n FROM rules WHERE status = 'violation' GROUP BY 1 ORDER BY 2 DESC`, { signal });
    return rows.map((r) => ({ component: String(r.component), n: Number(r.n) }));
  }, [key], { initial: [] });

  // When the history runs, who worked on it lately, and the day the most of
  // today's code first appeared.
  const { data: history } = useAsyncQuery<{ first: string | null; last: string | null; recentAuthors: number; arrival: OverviewFacts["arrival"]; recent: OverviewFacts["recent"] }>(async (signal) => {
    const none = { first: null, last: null, recentAuthors: 0, arrival: null, recent: [] };
    if (!git()) return none;
    const recentWhere = [IN_SNAPSHOT, humans(), `julianday(commit_time) >= ${anchorSql()} - 90`].join(" AND ");
    const [span] = await data.query<any>(`SELECT min(commit_time) AS first, max(commit_time) AS last FROM git_commits WHERE ${IN_SNAPSHOT} AND ${humans()}`, { signal });
    const [active] = await data.query<any>(`SELECT count(DISTINCT ${people()}) AS n FROM git_commits WHERE ${recentWhere}`, { signal });
    const recent = await data.query<any>(`SELECT component, count(DISTINCT commit_hash) AS n FROM git_commits
      WHERE ${recentWhere} AND component IS NOT NULL AND component <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, { signal });
    const [arrival] = await data.query<any>(`SELECT d AS date, sum(lines) AS lines FROM (
        SELECT f.name, coalesce(f.complexity__lines, 0) AS lines, min(substr(c.commit_time, 1, 10)) AS d
        FROM files f JOIN git_commits c ON c.file = f.name GROUP BY f.name)
      GROUP BY d ORDER BY 2 DESC LIMIT 1`, { signal });
    return {
      first: span?.first ?? null,
      last: span?.last ?? null,
      recentAuthors: Number(active?.n ?? 0),
      arrival: arrival?.date ? { date: String(arrival.date), lines: Number(arrival.lines) || 0 } : null,
      recent: recent.map((r) => ({ component: String(r.component), n: Number(r.n) })),
    };
    // The 90 days count back from the scanned commit, which arrives with the snapshot info.
  }, [key, () => authors.aliases, () => authors.showBots, () => data.snapshotInfo?.git_based_on], { initial: { first: null, last: null, recentAuthors: 0, arrival: null, recent: [] } });

  const { data: shallow } = useAsyncQuery<boolean>(async (signal) => {
    if (!data.hasView("git_repos")) return false;
    try {
      const rows = await data.query<{ n: number }>("SELECT count(*) AS n FROM git_repos WHERE git__shallow_clone = 1", { signal });
      return Number(rows[0]?.n ?? 0) > 0;
    } catch {
      // Snapshots taken before the column existed say nothing either way.
      return false;
    }
  }, [key], { initial: false });

  // The architecture findings' facts: one query per question, each skipped
  // when the snapshot lacks its table. History windows count back from the
  // last commit, the way the rest of the page does.
  const { data: arch } = useAsyncQuery<ArchFacts | null>(async (signal) => {
    if (!data.hasData) return null;
    const q = <T = any>(sql: string) => data.query<T>(sql, { signal }).catch(() => [] as T[]);
    const has = (view: string) => data.hasView(view);
    const runtime = data.hasColumn("component_connections_direct", "kind") ? "AND kind != 'type_only'" : "";
    const lastCommit = "(SELECT max(commit_time) FROM git_commits)";
    const [edges, modules, entries, coChange, shotgun, frozen, growth, fnTotals, complexFiles, longFiles, sameNames, entities, http, withData, outbound, outboundTop] = await Promise.all([
      has("component_connections_direct") ? q<{ f: string; t: string }>(`SELECT DISTINCT "from" AS f, "to" AS t FROM component_connections_direct WHERE "from" != "to" ${runtime}`) : [],
      data.hasColumn("files", "module") ? q<{ component: string; module: string }>(`SELECT component, min(module) AS module FROM files WHERE component IS NOT NULL AND module IS NOT NULL AND module <> '' GROUP BY 1`) : [],
      has("entry_points") ? q<{ component: string }>(`SELECT DISTINCT component FROM entry_points WHERE component IS NOT NULL`) : [],
      has("git_component_shared_commits") && has("component_connections_direct") ? q<any>(`
        SELECT pair_1 AS a, pair_2 AS b, shared_commits AS shared,
               max(percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2) / 100.0 AS share
        FROM git_component_shared_commits g
        WHERE pair_1 < pair_2 AND shared_commits >= 10 AND max(percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2) >= 50
          AND NOT EXISTS (SELECT 1 FROM component_connections_direct c
                          WHERE (c."from" = g.pair_1 AND c."to" = g.pair_2) OR (c."from" = g.pair_2 AND c."to" = g.pair_1))
        ORDER BY shared_commits * share DESC LIMIT 50`) : [],
      has("git_commits") ? q<any>(`SELECT count(*) AS commits, sum(n >= 5) AS wide FROM (
          SELECT commit_hash, count(DISTINCT component) AS n FROM git_commits WHERE ${IN_SNAPSHOT} AND ${humans()} GROUP BY 1)`) : [],
      has("git_commits") ? q<any>(`SELECT sum(lines) AS total, sum(CASE WHEN julianday(${lastCommit}) - julianday(last) > 730 THEN lines END) AS frozen FROM (
          SELECT f.name, coalesce(f.complexity__lines, 0) AS lines, max(c.commit_time) AS last
          FROM files f JOIN git_commits c ON c.file = f.name ${data.hasColumn("files", "role") ? "WHERE f.role = 'production'" : ""} GROUP BY f.name)`) : [],
      has("git_commits") ? q<any>(`SELECT component, sum(file_additions) - sum(file_deletions) AS lines FROM git_commits
          WHERE ${IN_SNAPSHOT} AND component IS NOT NULL AND component <> '' AND julianday(commit_time) >= julianday(${lastCommit}) - 180
          GROUP BY 1 ORDER BY 2 DESC LIMIT 40`) : [],
      has("functions") ? q<any>(`SELECT count(*) AS total, sum(cognitive >= 25) AS complex, sum(lines >= 150) AS long FROM functions`) : [],
      has("functions") ? q<any>(`SELECT file, count(*) AS n FROM functions WHERE cognitive >= 25 GROUP BY 1 ORDER BY 2 DESC LIMIT 40`) : [],
      has("functions") ? q<any>(`SELECT file, count(*) AS n FROM functions WHERE lines >= 150 GROUP BY 1 ORDER BY 2 DESC LIMIT 40`) : [],
      has("units") ? q<any>(`SELECT name, count(DISTINCT component) AS components FROM units WHERE kind = 'type' GROUP BY 1 HAVING count(DISTINCT component) >= 3 ORDER BY 2 DESC LIMIT 200`) : [],
      has("data_access") ? q<any>(`SELECT entity, count(DISTINCT component) AS components FROM data_access WHERE entity IS NOT NULL AND entity <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 60`) : [],
      has("entry_points") ? q<any>(`SELECT count(*) AS endpoints, sum(auth IS NULL OR auth = '') AS no_auth, sum(documented IS NOT NULL AND documented <> '') AS documented FROM entry_points WHERE kind = 'http'`) : [],
      has("entry_points") && has("data_access") ? q<{ component: string }>(`SELECT DISTINCT e.component FROM entry_points e WHERE e.kind = 'http' AND e.component IS NOT NULL
          AND EXISTS (SELECT 1 FROM data_access d WHERE d.component = e.component)`) : [],
      has("outbound_calls") ? q<any>(`SELECT count(*) AS calls, count(DISTINCT CASE WHEN system <> '' THEN system END) AS systems, count(DISTINCT component) AS components,
          sum(resilience IS NOT NULL AND resilience <> '') AS resilient FROM outbound_calls`) : [],
      has("outbound_calls") ? q<any>(`SELECT component, count(*) AS n FROM outbound_calls WHERE component IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 40`) : [],
    ]);
    const num = (v: unknown) => Number(v) || 0;
    const fn = fnTotals[0], h = http[0], o = outbound[0], s = shotgun[0], fz = frozen[0];
    return {
      edges: edges.map((e) => [String(e.f), String(e.t)] as [string, string]),
      modules: modules.map((m) => ({ component: String(m.component), module: String(m.module) })),
      entryComponents: entries.map((e) => String(e.component)),
      coChange: coChange.map((p) => ({ a: String(p.a), b: String(p.b), shared: num(p.shared), share: num(p.share) })),
      shotgun: s && num(s.commits) ? { commits: num(s.commits), wide: num(s.wide) } : null,
      frozen: fz && num(fz.total) ? { total: num(fz.total), frozen: num(fz.frozen) } : null,
      growth: growth.map((g) => ({ component: String(g.component), lines: num(g.lines) })),
      functions: fn && num(fn.total) ? {
        total: num(fn.total), complex: num(fn.complex), long: num(fn.long),
        complexFiles: complexFiles.map((r) => ({ file: String(r.file), n: num(r.n) })),
        longFiles: longFiles.map((r) => ({ file: String(r.file), n: num(r.n) })),
      } : null,
      sameNames: sameNames.map((r) => ({ name: String(r.name), components: num(r.components) })),
      entities: entities.map((r) => ({ entity: String(r.entity), components: num(r.components) })),
      http: h && num(h.endpoints) ? { endpoints: num(h.endpoints), noAuth: num(h.no_auth), documented: num(h.documented), withData: withData.map((r) => String(r.component)) } : null,
      outbound: o && num(o.calls) ? { calls: num(o.calls), systems: num(o.systems), components: num(o.components), resilient: num(o.resilient), top: outboundTop.map((r) => ({ component: String(r.component), n: num(r.n) })) } : null,
    };
  }, [key, () => authors.showBots], { initial: null });

  const facts = computed<OverviewFacts>(() => ({
    files: files.value,
    readings: readings.value,
    components: (data.allComponents as any[]).map((c) => ({
      name: String(c.name),
      dependents: c[DEPENDENTS] == null ? null : Number(c[DEPENDENTS]),
      instability: c.modularity__instability == null ? null : Number(c.modularity__instability),
      abstractness: c.modularity__abstractness == null ? null : Number(c.modularity__abstractness),
      dependencies: c.modularity__coupling__dependencies == null ? null : Number(c.modularity__coupling__dependencies),
      betweenness: c.graph__betweenness == null ? null : Number(c.graph__betweenness),
      lines: c.complexity__lines == null ? null : Number(c.complexity__lines),
    })),
    tangles: tangles.value,
    knowledge: knowledge.value,
    rules: rules.value,
    history: { first: history.value.first, last: history.value.last, scan: (workspaces.openScan as any)?.startedAt ?? null },
    arrival: history.value.arrival,
    recent: history.value.recent,
    shallow: shallow.value,
    arch: arch.value ?? undefined,
  }));

  return { facts, loading, recentAuthors: computed(() => history.value.recentAuthors) };
}

export type OverviewFactsHandle = ReturnType<typeof useOverviewFacts>;
