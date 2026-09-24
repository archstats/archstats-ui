<template>
  <ViewWorkspaceLayout
    title="Find in code"
    :queryable="true"
    :tabs="[{ id: 'hits', label: 'Hits' }]"
    active-tab="hits"
    :is-sidebar-open="!!inspected"
  >
    <template #stats>
      <template v-if="result && !error">
        <span><span class="text-neutral-800">{{ totalHits.toLocaleString("en-US") }}</span> hits in <span class="text-neutral-800">{{ fileRows.length.toLocaleString("en-US") }}</span> of {{ result.searched.toLocaleString("en-US") }} files</span>
        <span class="text-neutral-400">·</span>
        <span>{{ result.elapsedMs }} ms</span>
        <span v-if="result.truncated" class="text-amber-700" :title="`Only the ${FILE_CAP.toLocaleString('en-US')} files with the most hits are listed`">· first {{ FILE_CAP.toLocaleString("en-US") }} files</span>
        <span v-if="outOfScope" class="text-neutral-500" title="Files the scope or the Files switch leaves out">· {{ outOfScope.toLocaleString("en-US") }} out of scope</span>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Roll up by">
        <button v-for="g in GRAINS" :key="g.id" type="button" :aria-pressed="grain === g.id" @click="setRoute({ grain: g.id === 'components' ? undefined : g.id })">{{ g.label }}</button>
      </div>
    </template>
    <template #actions>
      <button
        type="button"
        class="ui-btn ui-btn-sm"
        :disabled="!canKeep"
        :title="canKeep ? `A live group of everything that contains “${needle}”, re-answered on every scan` : 'A live group keeps a plain text: turn off .* and whole word'"
        @click="keepLive"
      >
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span>Keep as live group</span>
      </button>
    </template>

    <template #visualizer>
      <div class="flex shrink-0 flex-col gap-1 px-4 pb-2 pt-3">
        <div class="flex items-center gap-2">
          <label class="relative flex min-w-0 flex-1 items-center">
            <Icon icon="search-code" :size="14" class="pointer-events-none absolute left-2.5 text-neutral-400"/>
            <input
              ref="inputEl"
              :value="typed"
              type="text"
              spellcheck="false"
              autocomplete="off"
              class="ui-input h-8 w-full pl-8 font-mono"
              :class="error ? '!border-red-400' : ''"
              placeholder="Text in the code: a class, a call, a table name, a string"
              aria-label="Text to find"
              :aria-invalid="!!error"
              @input="typed = ($event.target as HTMLInputElement).value"
              @keydown.enter="commit"
            >
          </label>
          <div class="ui-segmented" role="group" aria-label="Match options">
            <button type="button" :aria-pressed="opts.caseSensitive" title="Match case" class="font-mono" @click="setRoute({ case: opts.caseSensitive ? undefined : '1' })">Aa</button>
            <button type="button" :aria-pressed="opts.word" title="Whole word" class="font-mono" @click="setRoute({ word: opts.word ? undefined : '1' })">W</button>
            <button type="button" :aria-pressed="opts.regex" title="Regular expression (RE2)" class="font-mono" @click="setRoute({ regex: opts.regex ? undefined : '1' })">.*</button>
          </div>
        </div>
        <p v-if="error" class="font-mono text-sm text-red-700" role="alert">{{ error }}</p>
        <p v-else-if="!hasSource" class="text-sm text-neutral-500">This snapshot kept no source, so there is nothing to search. Scans keep it by default; scan again.</p>
      </div>

      <div class="min-h-0 grow overflow-y-auto">
        <EmptyState v-if="!needle" class="h-full" title="Find text in the code" text="Where the payment gateway is called, which components write raw SQL, who still reads a retired flag. Rolled up by component, by the groups of the lens, or by file." icon="search"/>
        <LoadingState v-else-if="loading && !result" class="h-full"/>
        <EmptyState v-else-if="result && !rows.length && !error" class="h-full" :title="`No “${needle}” in scope`" :text="outOfScope ? `${outOfScope.toLocaleString('en-US')} files outside the scope hold it.` : 'Not in any file this snapshot kept.'" icon="search"/>
        <EmptyState v-else-if="grain === 'groups' && !lens.active" class="h-full" title="Pick a lens" text="Hits roll up by the groups of the active lens. Choose one in the sidebar." icon="layers"/>
        <table v-else-if="rows.length" class="ui-table w-full">
          <thead>
            <tr>
              <th v-if="selectable" class="w-8"><Checkbox :model-value="allSelected" aria-label="Select all" @update:model-value="toggleAll"/></th>
              <th class="text-left">{{ grain === 'files' ? 'File' : grain === 'groups' ? 'Group' : 'Component' }}</th>
              <th v-if="grain !== 'files'" class="w-20 text-right">Files</th>
              <th class="w-20 text-right">Hits</th>
              <th class="w-40"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in shownRows"
              :key="r.key"
              class="cursor-default"
              :class="inspected?.key === r.key ? 'bg-accent-50' : ''"
              @click="inspect(r)"
            >
              <td v-if="selectable" @click.stop><Checkbox :model-value="selected.has(r.key)" :aria-label="`Select ${r.label}`" @update:model-value="toggle(r.key)"/></td>
              <td class="max-w-0 truncate font-mono text-sm" :title="r.key">
                <span v-if="r.color" class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" :style="{ background: r.color }" aria-hidden="true"></span>{{ r.label }}
              </td>
              <td v-if="grain !== 'files'" class="text-right font-mono text-sm tabular-nums">{{ r.files.length.toLocaleString("en-US") }}</td>
              <td class="text-right font-mono text-sm tabular-nums">{{ r.hits.toLocaleString("en-US") }}</td>
              <td><span class="block h-1.5 rounded-sm bg-accent-400/70" :style="{ width: `${Math.max(2, (r.hits / maxHits) * 100)}%` }"></span></td>
            </tr>
          </tbody>
        </table>
        <button v-if="rows.length > shownRows.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 500">Show {{ Math.min(500, rows.length - shownRows.length) }} more of {{ (rows.length - shownRows.length).toLocaleString("en-US") }}</button>
      </div>
      <GroupActionBar v-if="selectable && selected.size" :selected-items="[...selected]" :kind="grain === 'files' ? 'file' : 'component'" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-hits>
      <template v-if="inspected">
        <div class="flex items-baseline gap-2">
          <h2 class="min-w-0 flex-1 truncate font-mono text-base font-medium text-neutral-900" :title="inspected.key">{{ inspected.label }}</h2>
          <router-link v-if="inspected.to" :to="inspected.to" class="shrink-0 text-sm text-neutral-500 hover:text-neutral-900">Open</router-link>
        </div>
        <p class="text-sm text-neutral-500">{{ inspected.hits.toLocaleString("en-US") }} hits in {{ inspected.files.length.toLocaleString("en-US") }} {{ inspected.files.length === 1 ? 'file' : 'files' }}</p>
        <section v-for="f in inspectedFiles" :key="f.file" class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <router-link :to="filePath(f.file, 'source')" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800 hover:text-neutral-950" :title="f.file">{{ basename(f.file) }}</router-link>
            <span class="shrink-0 font-mono text-xs text-neutral-400">{{ f.hits }}</span>
          </div>
          <ol v-if="lines[f.file]" class="overflow-x-auto rounded border border-neutral-200 bg-neutral-50 font-mono text-xs leading-5">
            <template v-for="(l, i) in lines[f.file]" :key="l.line">
              <li v-if="i > 0 && l.line > lines[f.file][i - 1].line + 1" class="px-2 text-neutral-300" aria-hidden="true">⋯</li>
              <li>
                <router-link :to="`${filePath(f.file, 'source')}#L${l.line}`" class="flex gap-2 px-2 hover:bg-neutral-100" :class="l.context ? 'text-neutral-400' : 'text-neutral-800'">
                  <span class="w-9 shrink-0 select-none text-right text-neutral-400">{{ l.line }}</span>
                  <span class="min-w-0 whitespace-pre"><template v-for="(part, j) in pieces(l)" :key="j"><mark v-if="part.hit" class="rounded-sm bg-accent-200 text-neutral-950">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                </router-link>
              </li>
            </template>
          </ol>
          <p v-else-if="lineErrors[f.file]" class="text-xs text-neutral-500">{{ lineErrors[f.file] }}</p>
          <p v-else class="text-xs text-neutral-400">Reading…</p>
        </section>
        <p v-if="inspected.files.length > inspectedFiles.length" class="text-sm text-neutral-500">And {{ (inspected.files.length - inspectedFiles.length).toLocaleString("en-US") }} more files; choose Files above to see them all.</p>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { DEFAULT_DIMENSION, useGroupsStore } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";
import { useScopeStore } from "~/stores/scope";
import { findInCode, findLines, type FindOptions, type FindResult, type HitLine } from "~/utils/codeSearch";
import { componentLabel, componentPath, filePath, groupPath } from "~/utils/routes";
import { useWorkspacesStore } from "~/stores/workspaces";

// Where a text lives in the code, rolled up the way the architect slices it:
// by component, by the groups of the lens, or file by file. Reached from ⌘P's
// last row. The search runs over the source the snapshot kept, not the disk.

interface Row { key: string; label: string; files: Array<{ file: string; hits: number }>; hits: number; to?: string; color?: string | null }

const FILE_CAP = 5000;
const GRAINS = [{ id: "components", label: "Components" }, { id: "groups", label: "Groups" }, { id: "files", label: "Files" }] as const;

const route = useRoute();
const router = useRouter();
const data = useDataStore();
const scope = useScopeStore();
const lens = useLensStore();
const groups = useGroupsStore();
const workspaces = useWorkspacesStore();

const needle = computed(() => (typeof route.query.q === "string" ? route.query.q : ""));
const grain = computed(() => (route.query.grain === "files" || route.query.grain === "groups" ? route.query.grain : "components"));
const opts = computed<FindOptions>(() => ({ regex: route.query.regex === "1", caseSensitive: route.query.case === "1", word: route.query.word === "1" }));
function setRoute(patch: Record<string, string | undefined>) {
  const q: Record<string, any> = { ...route.query, ...patch };
  for (const k of Object.keys(q)) if (q[k] === undefined || q[k] === "") delete q[k];
  void router.replace({ query: q });
}

// Typing searches after a pause; Enter searches now.
const typed = ref(needle.value);
watch(needle, v => { if (v !== typed.value) typed.value = v; });
let timer: ReturnType<typeof setTimeout> | null = null;
watch(typed, v => { if (timer) clearTimeout(timer); timer = setTimeout(() => setRoute({ q: v.trim() || undefined }), 300); });
function commit() { if (timer) clearTimeout(timer); setRoute({ q: typed.value.trim() || undefined }); }

// Declared before the search watch below, which resets them on every new search.
const inspected = shallowRef<Row | null>(null);
const selected = ref<Set<string>>(new Set());
const limit = ref(500);

const result = shallowRef<FindResult | null>(null);
const error = ref("");
const loading = ref(false);
const hasSource = computed(() => !result.value || result.value.searched > 0);
let asked = 0;
watch([needle, opts, () => data._openScanId], async ([n, o, scanId]) => {
  const mine = ++asked;
  error.value = "";
  inspected.value = null;
  selected.value = new Set();
  limit.value = 500;
  if (!n || !scanId) { result.value = null; return; }
  loading.value = true;
  try {
    const r = await findInCode(String(scanId), n, o);
    if (mine === asked) result.value = r;
  } catch (e: any) {
    if (mine === asked) { result.value = null; error.value = String(e?.message ?? e); }
  } finally {
    if (mine === asked) loading.value = false;
  }
}, { immediate: true, deep: true });

// ── Rows ───────────────────────────────────────────────────────────────
const inScope = computed(() => {
  const r = result.value;
  if (!r) return [];
  const comp = data.fileComponentIndex;
  return r.files.filter(f => scope.fileInScope(f.file, comp.get(f.file)));
});
const outOfScope = computed(() => (result.value?.files.length ?? 0) - inScope.value.length);
const fileRows = computed(() => inScope.value);
const totalHits = computed(() => inScope.value.reduce((s, f) => s + f.hits, 0));

function rollup(keyOf: (file: string) => string[], label: (k: string) => string, to: (k: string) => string | undefined, color?: (k: string) => string | null): Row[] {
  const by = new Map<string, Row>();
  for (const f of inScope.value) {
    for (const k of keyOf(f.file)) {
      let r = by.get(k);
      if (!r) { r = { key: k, label: label(k), files: [], hits: 0, to: to(k), color: color?.(k) }; by.set(k, r); }
      r.files.push(f);
      r.hits += f.hits;
    }
  }
  return [...by.values()].sort((a, b) => b.hits - a.hits || b.files.length - a.files.length || a.label.localeCompare(b.label));
}

const NO_GROUP = "\u0000none";
const lensGroups = computed(() => {
  const dim = lens.active;
  if (!dim) return [];
  return groups.groups.filter(g => g.dimension === dim).map(g => {
    const members = groups.membership.get(g.id) ?? [];
    return { g, files: new Set(members.filter(m => m.kind === "file").map(m => m.name)), components: new Set(members.filter(m => m.kind === "component").map(m => m.name)) };
  });
});

const rows = computed<Row[]>(() => {
  const comp = data.fileComponentIndex;
  const project = workspaces.active?.name ?? "";
  if (grain.value === "files") {
    return inScope.value.map(f => ({ key: f.file, label: f.file, files: [f], hits: f.hits, to: filePath(f.file) }));
  }
  if (grain.value === "groups") {
    if (!lens.active) return [];
    const byId = new Map(lensGroups.value.map(x => [x.g.id, x.g]));
    return rollup(
      file => {
        const c = comp.get(file);
        const ids = lensGroups.value.filter(x => x.files.has(file) || (!!c && x.components.has(c))).map(x => x.g.id);
        return ids.length ? ids : [NO_GROUP];
      },
      k => (k === NO_GROUP ? "In no group" : byId.get(k)?.name ?? k),
      k => (k === NO_GROUP ? undefined : groupPath(k)),
      k => (k === NO_GROUP ? null : byId.get(k)?.color ?? null),
    );
  }
  return rollup(file => [comp.get(file) ?? "(no component)"], k => componentLabel(k, project), k => (k === "(no component)" ? undefined : componentPath(k)));
});
const shownRows = computed(() => rows.value.slice(0, limit.value));
const maxHits = computed(() => rows.value[0]?.hits || 1);

// ── Selection: components or files become a group ─────────────────────
const selectable = computed(() => grain.value !== "groups");
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.has(r.key) || r.key === "(no component)"));
function toggle(key: string) { const s = new Set(selected.value); s.has(key) ? s.delete(key) : s.add(key); selected.value = s; }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(rows.value.map(r => r.key).filter(k => k !== "(no component)")); }
watch(grain, () => { selected.value = new Set(); inspected.value = null; limit.value = 500; });

// A plain text becomes a group that is answered again on every scan.
const canKeep = computed(() => !!needle.value && !opts.value.regex && !opts.value.word && !needle.value.includes('"') && !!result.value?.files.length);
function keepLive() {
  if (!canKeep.value) return;
  const g = groups.createGroup(needle.value, [], lens.active ?? DEFAULT_DIMENSION);
  groups.setQuery(g.id, `contains "${needle.value}"`, "live");
  void router.push(groupPath(g.id));
}

// ── Inspector ───────────────────────────────────────────────────────────
const lines = ref<Record<string, HitLine[]>>({});
const lineErrors = ref<Record<string, string>>({});
const inspectedFiles = computed(() => (inspected.value?.files ?? []).slice(0, 12));
function inspect(r: Row) { inspected.value = inspected.value?.key === r.key ? null : r; }
watch(inspectedFiles, async (files) => {
  const scanId = String(data._openScanId ?? "");
  for (const f of files) {
    if (lines.value[f.file] || lineErrors.value[f.file]) continue;
    try { lines.value = { ...lines.value, [f.file]: await findLines(scanId, f.file, needle.value, opts.value) }; }
    catch (e: any) { lineErrors.value = { ...lineErrors.value, [f.file]: String(e?.message ?? e) }; }
  }
});
watch([needle, opts], () => { lines.value = {}; lineErrors.value = {}; }, { deep: true });

function pieces(l: HitLine): Array<{ text: string; hit: boolean }> {
  const out: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  for (const [a, b] of l.ranges ?? []) {
    if (a > at) out.push({ text: l.text.slice(at, a), hit: false });
    out.push({ text: l.text.slice(a, b), hit: true });
    at = b;
  }
  if (at < l.text.length) out.push({ text: l.text.slice(at), hit: false });
  return out;
}
const basename = (f: string) => f.slice(f.lastIndexOf("/") + 1);

// ── Export ──────────────────────────────────────────────────────────────
useExportables().register({
  kind: "table",
  get title() { return `Find ${needle.value} by ${grain.value}`; },
  rows: () => rows.value.map(r => ({ [grain.value === "files" ? "file" : grain.value === "groups" ? "group" : "component"]: r.label, files: r.files.length, hits: r.hits })),
  columns: () => [
    { id: grain.value === "files" ? "file" : grain.value === "groups" ? "group" : "component", label: grain.value === "files" ? "File" : grain.value === "groups" ? "Group" : "Component" },
    { id: "files", label: "Files" },
    { id: "hits", label: "Hits" },
  ],
  disabledReason: () => (!rows.value.length ? "Nothing found yet." : null),
});
</script>
