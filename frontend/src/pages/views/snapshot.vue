<template>
  <ViewWorkspaceLayout :queryable="false" title="About this snapshot">
    <template #stats>
      <span v-if="scanLabel" class="font-mono">{{ scanLabel }}</span>
    </template>
    <template #visualizer>
      <EmptyState v-if="!data.hasData" title="No snapshot open" text="Open a scan to see what it read and what it left out." icon="file-text"/>
      <div v-else class="min-h-0 grow overflow-y-auto">
        <div class="mx-auto w-full max-w-[920px] px-6 pb-12 pt-6">

          <!-- 1. What the code is made of. -->
          <ReadingBand title="Composition" :lede="compositionLede">
            <LoadingState v-if="filesLoading" text="Counting files…"/>
            <div v-else class="overflow-hidden rounded-lg hairline">
              <table class="ui-table">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th class="w-[90px] text-right">Files</th>
                    <th class="w-[120px] text-right">Lines</th>
                    <th class="w-[70px] text-right">Share</th>
                    <th class="w-[200px]">By role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in visibleComposition" :key="r.language">
                    <td>
                      <router-link v-if="r.extension" :to="{ path: '/views/metrics', query: { grain: 'files', q: r.extension } }" class="text-neutral-900 underline-offset-2 hover:underline" :title="`Files ending ${r.extension} in Metrics`">{{ r.language }}</router-link>
                      <span v-else class="text-neutral-900">{{ r.language }}</span>
                    </td>
                    <td class="is-num text-right">{{ fmt(r.files) }}</td>
                    <td class="is-num text-right">{{ fmt(r.lines) }}</td>
                    <td class="is-num text-right text-neutral-500">{{ pct(r.lines, totalLines) }}</td>
                    <td>
                      <span class="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100" :title="roleTitle(r)">
                        <span v-for="role in ROLE_ORDER" :key="role" class="h-full" :class="ROLE_INK[role]" :style="{ width: r.lines ? `${(r.roles[role] / r.lines) * 100}%` : '0%' }"></span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="compositionRows.length > COMPOSITION_PREVIEW" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-2" @click="showAllLanguages = !showAllLanguages">
              {{ showAllLanguages ? "Show fewer" : `Show all ${compositionRows.length} languages` }}
            </button>
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
              <span v-for="role in ROLE_ORDER" :key="role" class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" :class="ROLE_INK[role]"></span>{{ ROLE_LABELS[role] }} {{ fmt(roleTotals[role]) }} lines</span>
            </div>
            <p v-if="!hasRoles" class="mt-2 text-sm text-neutral-500">This snapshot does not record which files are tests; scan again to tell production code from tests.</p>
          </ReadingBand>

          <!-- 2. Which code: the commit, and how complete its history is. -->
          <ReadingBand title="Repositories" :lede="repoLede">
            <p v-if="repos.length === 0" class="text-base text-neutral-600">Not a git checkout: no history, authors or co-change were read.</p>
            <dl v-for="r in repos" :key="r.name" class="ui-kv mb-4 max-w-[640px]">
              <dt>Repository</dt><dd class="font-mono">{{ r.name === "." ? workspaceName + " (root)" : r.name }}<span v-if="r.shallow" class="ui-tag ml-2" title="Cloned with --depth: history stops where the clone did">shallow clone</span></dd>
              <template v-if="r.head"><dt>Head</dt><dd class="font-mono">{{ r.branch || "detached" }} @ {{ r.head.slice(0, 12) }}</dd></template>
              <template v-if="r.headTime"><dt>Head committed</dt><dd>{{ formatDay(r.headTime) }}</dd></template>
              <template v-if="r.dirty !== null"><dt>Uncommitted files</dt><dd>{{ fmt(r.dirty) }}</dd></template>
              <template v-if="r.commits !== null"><dt>Commits read</dt><dd>{{ fmt(r.commits) }}</dd></template>
              <template v-if="r.first"><dt>History</dt><dd>{{ formatDay(r.first) }} – {{ formatDay(r.last) }}</dd></template>
            </dl>
            <p v-if="repos.length && !hasHeads" class="text-sm text-neutral-500">This snapshot does not record the commit it read; scan again to pin it.</p>
          </ReadingBand>

          <!-- 3. Manifests: the modules the build declares. -->
          <ReadingBand v-if="manifests.length" title="Manifests" :lede="manifestLede">
            <dl class="ui-kv max-w-[360px]">
              <template v-for="m in manifestKinds" :key="m.kind"><dt>{{ m.kind }}</dt><dd>{{ fmt(m.count) }}</dd></template>
            </dl>
            <details class="mt-3">
              <summary class="cursor-pointer text-sm text-neutral-500 hover:text-neutral-900">All {{ manifests.length }} manifests</summary>
              <ul class="mt-2 flex flex-col gap-0.5">
                <li v-for="m in manifests" :key="m.manifest" class="flex gap-3 text-sm"><span class="w-20 shrink-0 text-neutral-500">{{ m.kind }}</span><span class="min-w-0 truncate font-mono text-neutral-800" :title="m.manifest">{{ m.name || m.manifest }}</span><span class="ml-auto shrink-0 font-mono text-xs text-neutral-400">{{ fmt(m.files) }} files</span></li>
              </ul>
            </details>
          </ReadingBand>

          <!-- Declared owners: the file that was read, and what it leaves unowned. -->
          <ReadingBand title="Declared owners" :lede="ownersLede" to="/views/dimensions?propose=1" link-label="Propose as a lens">
            <template v-if="owners.owned.value">
              <dl class="ui-kv max-w-[640px]">
                <template v-for="o in owners.owned.value.sets.slice(0, 12)" :key="o.key">
                  <dt class="!whitespace-normal">{{ owners.ownersLabel(o.owners) }}</dt>
                  <dd>{{ fmt(o.files.length) }} files <span class="text-neutral-400">· line {{ o.lines.join(", ") }}</span></dd>
                </template>
              </dl>
              <div v-if="owners.owned.value.unowned.length" class="mt-4">
                <div class="flex items-baseline gap-3">
                  <h4 class="ui-label">Unowned paths</h4>
                  <span class="text-xs text-neutral-500">{{ fmt(owners.owned.value.unowned.length) }} files no rule matches</span>
                  <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="unownedSel = allUnownedSelected ? new Set() : new Set(unownedShown)">{{ allUnownedSelected ? "Clear" : "Select all shown" }}</button>
                </div>
                <ul class="mt-1 flex max-h-[320px] flex-col overflow-y-auto">
                  <li v-for="f in unownedShown" :key="f" class="flex h-7 items-center gap-2">
                    <Checkbox :model-value="unownedSel.has(f)" :aria-label="`Select ${f}`" @update:model-value="toggleUnowned(f)"/>
                    <router-link :to="filePath(f)" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="f">{{ f }}</router-link>
                  </li>
                </ul>
                <p v-if="owners.owned.value.unowned.length > unownedShown.length" class="mt-1 text-xs text-neutral-500">First {{ fmt(unownedShown.length) }} shown.</p>
              </div>
            </template>
          </ReadingBand>
          <GroupActionBar v-if="unownedSel.size" :selected-items="[...unownedSel]" kind="file" @clear="unownedSel = new Set()" @created="unownedSel = new Set()"/>

          <!-- 4. Frameworks, one reading per language. -->
          <ReadingBand title="Frameworks" lede="What the code's types and imports point to, read per language. Units and Connections use this to name lanes.">
            <LoadingState v-if="frameworksLoading" text="Reading types…"/>
            <p v-else-if="frameworks.length === 0" class="text-base text-neutral-600">No types or functions were recorded, so no framework could be read.</p>
            <dl v-else class="ui-kv max-w-[720px]">
              <template v-for="f in frameworks" :key="f.language">
                <dt>{{ f.language }}</dt>
                <dd class="!whitespace-normal !text-left font-sans">{{ f.label }} <span class="ml-1 text-sm text-neutral-500">{{ f.reason }}</span></dd>
              </template>
            </dl>
          </ReadingBand>

          <!-- 5. How dependencies were found. -->
          <div id="dependencies"></div>
          <ReadingBand title="Dependency evidence" :lede="evidenceLede">
            <dl v-if="evidence" class="ui-kv max-w-[520px]">
              <dt>By import</dt><dd>{{ fmt(evidence.importPairs) }} pairs</dd>
              <dt>Only by runtime lookup</dt><dd>{{ fmt(evidence.dynamicOnly) }} pairs</dd>
              <dt>Types only (left out of coupling)</dt><dd>{{ fmt(evidence.typeOnly) }} pairs</dd>
              <dt>Lookups unresolved</dt><dd>{{ fmt(evidence.unresolved) }}</dd>
            </dl>
            <p v-else class="text-base text-neutral-600">This snapshot records every dependency as an import.</p>
            <ul v-if="unresolvedByReason.length" class="mt-3 flex flex-col gap-1">
              <li v-for="u in unresolvedByReason" :key="u.reason" class="text-sm text-neutral-600"><span class="font-mono text-neutral-800">{{ fmt(u.n) }}</span> {{ u.reason }}</li>
            </ul>
          </ReadingBand>

          <!-- 6. What was not read, so no number above covers it. -->
          <ReadingBand title="What the scan left out" :lede="leftOutLede">
            <dl class="ui-kv max-w-[640px]">
              <template v-if="ignored.files !== null"><dt>Ignored files</dt><dd>{{ fmt(ignored.files) }}</dd></template>
              <template v-if="ignored.dirs !== null"><dt>Ignored directories</dt><dd>{{ fmt(ignored.dirs) }}</dd></template>
              <template v-if="sweeping !== null"><dt>Sweeping commits</dt><dd :title="`Commits touching more than ${maxChanges ?? 100} files: renames, reformats and merges. Left out of co-change only; they count everywhere else.`">{{ fmt(sweeping) }} left out of co-change only</dd></template>
              <dt>Third-party files</dt><dd>{{ fmt(roleFiles.third_party) }}</dd>
              <dt>Generated files</dt><dd>{{ fmt(roleFiles.generated) }}</dd>
              <dt>Not code</dt><dd>{{ fmt(roleFiles.non_code) }}</dd>
            </dl>
            <details v-if="ignored.top.length" class="mt-3">
              <summary class="cursor-pointer text-sm text-neutral-500 hover:text-neutral-900">What was ignored, by rule</summary>
              <ul class="mt-2 flex flex-col gap-0.5">
                <li v-for="p in ignored.top" :key="p" class="font-mono text-sm text-neutral-700">{{ p }}</li>
              </ul>
            </details>
            <p v-if="ignored.files === null" class="mt-2 text-sm text-neutral-500">This snapshot does not record what the walker skipped; scan again to see it.</p>
          </ReadingBand>

          <!-- 7. The analysis that wrote it. -->
          <ReadingBand title="Analysis">
            <dl class="ui-kv max-w-[640px]">
              <dt>Revision</dt><dd>{{ data._snapshotRevision ?? 0 }}<span v-if="data.snapshotOutdated" class="ml-2 text-amber-700">older than this build's {{ data._engineRevision }}</span></dd>
              <template v-if="extensions"><dt>Language packs</dt><dd>{{ extensions }}</dd></template>
              <template v-if="ignoreGlobs"><dt>Ignore patterns</dt><dd class="font-mono !whitespace-normal">{{ ignoreGlobs }}</dd></template>
              <template v-if="basedOn"><dt>Windows count back from</dt><dd>{{ basedOn }}</dd></template>
              <template v-if="duration"><dt>Scan took</dt><dd>{{ duration }}</dd></template>
              <template v-if="scan?.startedAt"><dt>Scanned</dt><dd>{{ formatDay(scan.startedAt) }}</dd></template>
              <dt>Archstats desktop</dt><dd class="font-mono">{{ provenance.appVersion }}</dd>
            </dl>
          </ReadingBand>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import { useCodeowners } from "~/composables/useCodeowners";
import { filePath } from "~/utils/routes";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import ReadingBand from "~/components/component/ReadingBand.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { detectFramework, languageOfFile } from "~/utils/javaFrameworks";
import { composition, ROLE_LABELS, type CompositionRow, type FileRole } from "~/utils/languages";
import { buildProvenance, provenanceMarkdown } from "~/utils/provenance";
import { loadUnits } from "~/utils/units";

// Everything a report says before its first finding: what the code is made
// of, which commit it was, what the scan left out and how dependencies were
// found. Numbers only, from the open snapshot; no folder path, ever.

const data = useDataStore();
const workspaces = useWorkspacesStore();
const scan = computed<any>(() => workspaces.openScan);
const workspaceName = computed(() => workspaces.active?.name ?? "project");
const info = computed<Record<string, string>>(() => data.snapshotInfo ?? {});
const provenance = computed(() => buildProvenance());
const scanLabel = computed(() => provenance.value.snapshot);

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US"));
const pct = (n: number, total: number) => {
  if (!total) return "—";
  const p = (n / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 1 : 0 })}%`;
};
const LANGUAGE_NAMES: Record<string, string> = { java: "Java", kotlin: "Kotlin", csharp: "C#", typescript: "TypeScript/JS", python: "Python", go: "Go", php: "PHP" };
const formatDay = (v: string | number | Date | null | undefined) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// ── Composition ─────────────────────────────────────────────────────────
const ROLE_ORDER: FileRole[] = ["production", "test", "generated", "third_party", "non_code"];
const ROLE_INK: Record<FileRole, string> = {
  production: "bg-neutral-500",
  test: "bg-blue-400",
  generated: "bg-violet-300",
  third_party: "bg-amber-400",
  non_code: "bg-neutral-200",
};
const COMPOSITION_PREVIEW = 12;
const hasRoles = computed(() => data.hasColumn("files", "role"));

const { data: fileRows, loading: filesLoading } = useAsyncQuery<Array<{ name: string; lines: number; role: FileRole }>>(
  async () => {
    const col = (c: string, fallback = "NULL") => (data.hasColumn("files", c) ? c : fallback);
    const rows = await data.query<any>(`SELECT name, coalesce(complexity__lines, 0) AS lines, ${col("role")} AS role,
      ${col("complexity__files__third_party", "0")} AS third_party, ${col("complexity__files__generated", "0")} AS generated,
      ${col("codesmells__code_health")} IS NULL AS no_health FROM files`);
    // Older snapshots: the flags they carry, and "no health reading" for non-code.
    return rows.map(r => ({
      name: String(r.name),
      lines: Number(r.lines) || 0,
      role: (r.role || (Number(r.third_party) === 1 ? "third_party" : Number(r.generated) === 1 ? "generated" : Number(r.no_health) === 1 && Number(r.lines) > 0 ? "non_code" : "production")) as FileRole,
    }));
  },
  [() => data.datasetKey],
  { initial: [] },
);

const showAllLanguages = ref(false);
const compositionRows = computed(() => composition(fileRows.value));
const visibleComposition = computed(() => (showAllLanguages.value ? compositionRows.value : compositionRows.value.slice(0, COMPOSITION_PREVIEW)));
const totalLines = computed(() => compositionRows.value.reduce((s, r) => s + r.lines, 0));
const roleTotals = computed(() => {
  const t: Record<FileRole, number> = { production: 0, test: 0, generated: 0, third_party: 0, non_code: 0 };
  for (const r of compositionRows.value) for (const k of ROLE_ORDER) t[k] += r.roles[k];
  return t;
});
const roleFiles = computed(() => {
  const t: Record<FileRole, number> = { production: 0, test: 0, generated: 0, third_party: 0, non_code: 0 };
  for (const f of fileRows.value) t[f.role]++;
  return t;
});
function roleTitle(r: CompositionRow): string {
  return ROLE_ORDER.filter(k => r.roles[k]).map(k => `${ROLE_LABELS[k]}: ${fmt(r.roles[k])} lines`).join("\n");
}
const compositionLede = computed(() => {
  const rows = compositionRows.value;
  if (!rows.length) return "";
  const top = rows[0];
  const lead = `${fmt(totalLines.value)} lines in ${fmt(fileRows.value.length)} files. ${top.language} is ${pct(top.lines, totalLines.value)} of the lines`;
  const nonCode = roleTotals.value.non_code;
  return nonCode / (totalLines.value || 1) > 0.25
    ? `${lead}; ${pct(nonCode, totalLines.value)} of all lines are not code and get no health reading.`
    : `${lead}.`;
});

// ── Repositories ────────────────────────────────────────────────────────
interface Repo { name: string; head: string; branch: string; headTime: string; dirty: number | null; shallow: boolean; commits: number | null; first: string; last: string }
const { data: repos } = useAsyncQuery<Repo[]>(
  async () => {
    if (!data.hasView("git_repos")) return [];
    const has = (c: string) => data.hasColumn("git_repos", c);
    const rows = await data.query<any>(`SELECT name, ${has("git__head_commit") ? "git__head_commit" : "NULL"} AS head, ${has("git__branch") ? "git__branch" : "NULL"} AS branch,
      ${has("git__head_time") ? "git__head_time" : "NULL"} AS head_time, ${has("git__dirty_files") ? "git__dirty_files" : "NULL"} AS dirty,
      ${has("git__shallow_clone") ? "git__shallow_clone" : "0"} AS shallow, git__commits__total AS commits FROM git_repos WHERE name <> 'Unknown'`);
    const span = data.hasView("git_commits") ? await data.query<any>(`SELECT min(commit_time) AS first, max(commit_time) AS last FROM git_commits`) : [];
    const single = rows.length === 1;
    return rows.map(r => ({
      name: String(r.name),
      head: r.head || (single ? info.value.git_head_commit ?? "" : ""),
      branch: r.branch || (single ? info.value.git_branch ?? "" : ""),
      headTime: r.head_time || (single ? info.value.git_head_time ?? "" : ""),
      dirty: r.dirty !== null && r.dirty !== undefined ? Number(r.dirty) : single && info.value.git_dirty_files !== undefined ? Number(info.value.git_dirty_files) : null,
      shallow: Number(r.shallow) === 1,
      commits: r.commits !== null ? Number(r.commits) : null,
      first: single ? span[0]?.first ?? "" : "",
      last: single ? span[0]?.last ?? "" : "",
    }));
  },
  [() => data.datasetKey],
  { initial: [] },
);
const hasHeads = computed(() => repos.value.some(r => r.head));
const repoLede = computed(() => {
  const r = repos.value;
  if (!r.length) return "";
  const shallow = r.some(x => x.shallow);
  const base = r.length === 1 ? "One git repository." : `${r.length} git repositories.`;
  return shallow ? `${base} Shallow: commit counts, contributors and ages cover only the fetched history.` : base;
});

// ── Declared owners ─────────────────────────────────────────────────────
const owners = useCodeowners();
const ownersLede = computed(() => {
  const why = owners.reason.value;
  if (why) return why;
  const o = owners.owned.value!;
  const total = o.sets.reduce((n, x) => n + x.files.length, 0) + o.unowned.length;
  const rules = owners.parsed.value!.rules.length;
  const single = owners.singleRule.value ? " One rule owns everything, so it names reviewers rather than dividing the code." : "";
  return `Read from ${owners.found.value!.path}: ${fmt(rules)} ${rules === 1 ? "rule" : "rules"}, ${fmt(o.sets.length)} owner ${o.sets.length === 1 ? "set" : "sets"}, ${fmt(total - o.unowned.length)} of ${fmt(total)} files owned; the last matching line wins.${single}`;
});
const unownedShown = computed(() => owners.owned.value?.unowned.slice(0, 500) ?? []);
const unownedSel = ref<Set<string>>(new Set());
const allUnownedSelected = computed(() => unownedShown.value.length > 0 && unownedShown.value.every(f => unownedSel.value.has(f)));
function toggleUnowned(f: string) { const s = new Set(unownedSel.value); s.has(f) ? s.delete(f) : s.add(f); unownedSel.value = s; }

// ── Manifests ───────────────────────────────────────────────────────────
const { data: manifests } = useAsyncQuery<Array<{ name: string; kind: string; manifest: string; files: number }>>(
  () => (data.hasView("modules") ? data.query(`SELECT name, kind, manifest, files FROM modules ORDER BY kind, manifest`) : Promise.resolve([])),
  [() => data.datasetKey],
  { initial: [] },
);
const manifestKinds = computed(() => {
  const m = new Map<string, number>();
  for (const x of manifests.value) m.set(x.kind, (m.get(x.kind) ?? 0) + 1);
  return [...m.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
});
const manifestLede = computed(() => `${fmt(manifests.value.length)} build manifests: ${manifestKinds.value.map(k => `${fmt(k.count)} ${k.kind}`).join(", ")}.`);

// ── Frameworks ──────────────────────────────────────────────────────────
const { data: frameworks, loading: frameworksLoading } = useAsyncQuery<Array<{ language: string; label: string; reason: string }>>(
  async () => {
    const units = await loadUnits(sql => data.query(sql), v => data.hasView(v));
    const byLanguage = new Map<string, any[]>();
    for (const u of units.values()) {
      const lang = languageOfFile(u.file);
      if (!lang) continue;
      byLanguage.set(lang, [...(byLanguage.get(lang) ?? []), u.facts]);
    }
    return [...byLanguage.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([language, facts]) => {
        const d = detectFramework(facts, language as any);
        const best = d.candidates[0];
        return { language: LANGUAGE_NAMES[language] ?? language, label: d.confident && best ? best.label : "No framework settled", reason: d.reason };
      });
  },
  [() => data.datasetKey],
  { initial: [] },
);

// ── Dependency evidence ─────────────────────────────────────────────────
const { data: evidence } = useAsyncQuery<{ importPairs: number; dynamicOnly: number; typeOnly: number; unresolved: number } | null>(
  async () => {
    if (!data.hasColumn("component_connections_direct", "kind")) return null;
    const [p] = await data.query<any>(`WITH p AS (SELECT "from", "to", max(kind = 'import') AS s, max(kind = 'dynamic') AS d, max(kind = 'type_only') AS t
        FROM component_connections_direct WHERE "from" <> "to" GROUP BY 1, 2)
      SELECT sum(s) AS import_pairs, sum(d = 1 AND s = 0) AS dynamic_only, sum(t = 1 AND s = 0 AND d = 0) AS type_only FROM p`);
    const unresolved = data.hasView("unresolved_edges") ? Number((await data.query<any>("SELECT count(*) AS n FROM unresolved_edges"))[0]?.n ?? 0) : 0;
    const e = { importPairs: Number(p?.import_pairs ?? 0), dynamicOnly: Number(p?.dynamic_only ?? 0), typeOnly: Number(p?.type_only ?? 0), unresolved };
    return e.dynamicOnly || e.typeOnly || e.unresolved ? e : null;
  },
  [() => data.datasetKey],
  { initial: null },
);
const { data: unresolvedByReason } = useAsyncQuery<Array<{ reason: string; n: number }>>(
  () => (data.hasView("unresolved_edges") ? data.query(`SELECT reason, count(*) AS n FROM unresolved_edges GROUP BY reason ORDER BY n DESC`) : Promise.resolve([])),
  [() => data.datasetKey],
  { initial: [] },
);
const evidenceLede = computed(() => {
  const e = evidence.value;
  if (!e) return "Every dependency here is an import that names its target.";
  const parts = [];
  if (e.dynamicOnly) parts.push(`${fmt(e.dynamicOnly)} component pairs are joined only by a string naming a module at runtime; no import names them, so a rename breaks them silently`);
  if (e.typeOnly) parts.push(`${fmt(e.typeOnly)} are joined only by types the compiler erases, and are left out of coupling`);
  return parts.length ? parts.join("; ") + "." : "Every dependency here is an import that names its target.";
});

// ── Left out ────────────────────────────────────────────────────────────
const ignored = computed(() => {
  const i = info.value;
  let top: string[] = [];
  try { top = i.walker_ignored_top ? JSON.parse(i.walker_ignored_top) : []; } catch { top = []; }
  return {
    files: i.walker_ignored_files !== undefined ? Number(i.walker_ignored_files) : null,
    dirs: i.walker_ignored_dirs !== undefined ? Number(i.walker_ignored_dirs) : null,
    top,
  };
});
const sweeping = computed(() => (info.value.git_sweeping_commits !== undefined ? Number(info.value.git_sweeping_commits) : null));
const maxChanges = computed(() => (info.value.git_max_changes_per_commit !== undefined ? Number(info.value.git_max_changes_per_commit) : null));
const leftOutLede = computed(() => {
  const parts = [];
  if (ignored.value.files !== null) parts.push(`${fmt(ignored.value.files)} files and ${fmt(ignored.value.dirs)} directories matched an ignore rule and were not read`);
  const excluded = roleFiles.value.third_party + roleFiles.value.generated;
  if (excluded) parts.push(`${fmt(excluded)} third-party or generated files are counted but never scored`);
  return parts.length ? parts.join("; ") + "." : "";
});

// ── Analysis ────────────────────────────────────────────────────────────
const extensions = computed(() => (info.value.extensions || scan.value?.extensions || "").split(",").filter(Boolean).join(", "));
const ignoreGlobs = computed(() => scan.value?.ignoreGlobs || "");
const basedOn = computed(() => (info.value.git_based_on ? `the head commit, ${formatDay(info.value.git_based_on)}` : ""));
const duration = computed(() => {
  const s = scan.value;
  if (!s?.startedAt || !s?.finishedAt) return "";
  const secs = Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
  return secs < 90 ? `${secs} s` : `${Math.round(secs / 60)} min`;
});

// ── Methodology ─────────────────────────────────────────────────────────
function methodology(): string {
  const p = provenance.value;
  const lines: string[] = ["## Method", ""];
  lines.push(`The figures come from one Archstats snapshot of ${p.workspace}${p.commit ? `, read at ${p.branch ? p.branch + " " : ""}${p.commit.slice(0, 12)}` : ""}${p.uncommitted ? ` with ${p.uncommitted} uncommitted files` : ""}, analysis revision ${p.revision}.`);
  if (compositionLede.value) lines.push("", compositionLede.value);
  const repo = repos.value[0];
  if (repo?.first) lines.push("", `History covers ${formatDay(repo.first)} to ${formatDay(repo.last)}${repos.value.some(r => r.shallow) ? ", from a shallow clone, so only the fetched commits are counted" : ""}.`);
  if (!repos.value.length) lines.push("", "The code is not a git checkout, so there are no history, author or co-change figures.");
  const limits: string[] = [];
  if (ignored.value.files) limits.push(`${fmt(ignored.value.files)} files matched an ignore rule and were not read.`);
  if (sweeping.value) limits.push(`${fmt(sweeping.value)} commits touching more than ${maxChanges.value ?? 100} files are left out of co-change, and only there.`);
  if (evidence.value?.dynamicOnly) limits.push(`${fmt(evidence.value.dynamicOnly)} component pairs are joined only by runtime lookups rather than imports.`);
  if (evidence.value?.unresolved) limits.push(`${fmt(evidence.value.unresolved)} runtime lookups named modules outside the scan and count in no coupling figure.`);
  if (evidence.value?.typeOnly) limits.push(`${fmt(evidence.value.typeOnly)} component pairs joined only by erased types are left out of coupling.`);
  if (roleFiles.value.third_party || roleFiles.value.generated) limits.push(`Third-party (${fmt(roleFiles.value.third_party)}) and generated (${fmt(roleFiles.value.generated)}) files are counted in size but not scored for health or hotspots.`);
  if (roleTotals.value.non_code) limits.push(`${fmt(roleTotals.value.non_code)} lines are not code and get no health reading.`);
  if (limits.length) lines.push("", "### Limits of the evidence", "", ...limits.map(l => `- ${l}`));
  lines.push("", "### Definitions", "", "Code health is 10 less three capped deductions (size over 500 lines, deepest nesting and average nesting over the language's thresholds), never below 1; a component's is the line-weighted mean of its files'. The hotspot score is log2(commits + 1) × lines, scaled so the hottest file in the snapshot reads 100.");
  lines.push("", "### Provenance", "", provenanceMarkdown(p), "");
  return lines.join("\n");
}

useExportables().register({ kind: "document", title: "About this snapshot", label: "Copy methodology", savable: true, markdown: methodology });
useExportables().register({
  kind: "table",
  title: "Composition by language",
  rows: () => compositionRows.value.map(r => ({ language: r.language, files: r.files, lines: r.lines, ...Object.fromEntries(ROLE_ORDER.map(k => [`lines_${k}`, r.roles[k]])) })),
  columns: () => [{ id: "language", label: "Language" }, { id: "files", label: "Files" }, { id: "lines", label: "Lines" }, ...ROLE_ORDER.map(k => ({ id: `lines_${k}`, label: `${ROLE_LABELS[k]} lines` }))],
});
</script>
