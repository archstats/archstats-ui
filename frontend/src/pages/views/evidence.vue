<template>
  <ViewWorkspaceLayout :queryable="false" title="Evidence">
    <template #stats>
      <span v-if="evidence.count">Pins <span class="text-neutral-800">{{ evidence.count }}</span></span>
      <span v-if="checkedLabel" class="text-neutral-500">checked against {{ checkedLabel }}</span>
    </template>
    <template #actions>
      <button type="button" class="ui-btn ui-btn-sm" title="A section heading to group the pins under" @click="addHeading">Add heading</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Compare every pin with the newest snapshot again" @click="evidence.recheck()">Re-check</button>
    </template>
    <template #visualizer>
      <div class="min-h-0 grow overflow-y-auto">
        <EmptyState v-if="!evidence.pins.length" title="Nothing pinned yet" text="Pin a component, file, cycle, rule finding, pair or a whole view (the bookmark on its page or in the inspector). Each pin keeps the snapshot, commit, lens and scope it was seen under, and is checked against every newer scan." icon="bookmark"/>
        <ol v-else class="mx-auto flex w-full max-w-[900px] flex-col px-6 pb-16 pt-5">
          <li
            v-for="(p, i) in evidence.pins"
            :key="p.id"
            class="group relative"
            :class="[p.kind === 'heading' ? 'pb-2 pt-6' : 'py-4 hairline-b', dragOver === i ? 'shadow-[inset_0_2px_0_rgb(var(--c-accent-500))]' : '']"
            draggable="true"
            @dragstart="dragFrom = i"
            @dragover.prevent="dragOver = i"
            @dragleave="dragOver = null"
            @drop.prevent="drop(i)"
            @dragend="dragFrom = null; dragOver = null"
          >
            <span class="absolute -left-5 top-4 cursor-grab text-neutral-300 opacity-0 group-hover:opacity-100" aria-hidden="true">⋮⋮</span>
            <template v-if="p.kind === 'heading'">
              <input :value="p.title" class="w-full bg-transparent text-lg font-semibold text-neutral-900 outline-none" aria-label="Heading" @change="evidence.update(p.id, { title: ($event.target as HTMLInputElement).value })">
            </template>
            <template v-else>
              <div class="flex items-baseline gap-2">
                <input :value="p.title" class="min-w-0 flex-1 truncate bg-transparent text-base font-medium text-neutral-900 outline-none" aria-label="Title" @change="evidence.update(p.id, { title: ($event.target as HTMLInputElement).value })">
                <span class="ui-tag shrink-0">{{ p.kind }}</span>
                <span v-if="evidence.statuses[p.id]?.text" class="ui-chip shrink-0 font-mono text-xs" :title="`Compared with ${checkedLabel}`">{{ evidence.statuses[p.id].text }}</span>
              </div>
              <textarea
                :value="p.note"
                rows="1"
                placeholder="Note"
                class="mt-1 w-full resize-none bg-transparent text-sm leading-5 text-neutral-700 outline-none placeholder:text-neutral-400 focus:rounded focus:bg-neutral-50"
                @input="autosize($event)"
                @change="evidence.update(p.id, { note: ($event.target as HTMLTextAreaElement).value })"
              ></textarea>
              <dl v-if="Object.keys(evidence.valuesOf(p)).length" class="ui-kv mt-2 max-w-[520px]">
                <template v-for="(v, k) in evidence.valuesOf(p)" :key="k">
                  <dt><MetricHint :id="String(k)">{{ data.statNiceName(String(k)) || k }}</MetricHint></dt>
                  <dd class="font-mono">{{ fmt(v) }} <span class="text-neutral-400">→</span> {{ nowOf(p, String(k)) }}</dd>
                </template>
              </dl>
              <img v-if="figures[p.id]" :src="figures[p.id]" :alt="p.title" class="mt-3 max-h-[320px] rounded border border-neutral-200">
              <div class="mt-2 flex items-center gap-3">
                <p class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400" :title="provenanceOf(p)">{{ provenanceOf(p) }}</p>
                <router-link v-if="p.route" :to="p.route" class="text-sm text-neutral-500 hover:text-neutral-900">Open</router-link>
                <button v-if="confirming !== p.id" type="button" class="text-sm text-neutral-400 opacity-0 hover:text-red-700 group-hover:opacity-100" @click="confirming = p.id">Remove</button>
                <span v-else class="flex items-center gap-2 text-sm"><span class="text-neutral-700">Remove this pin?</span><button type="button" class="text-red-700" @click="remove(p.id)">Remove</button><button type="button" class="text-neutral-500" @click="confirming = null">Keep</button></span>
              </div>
            </template>
          </li>
        </ol>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Figure } from "wailsjs/go/app/EvidenceService";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import MetricHint from "~/components/ui/common/MetricHint.vue";
import { useExportables } from "~/composables/useExportables";
import { useAuthorsStore } from "~/stores/authors";
import { useDataStore } from "~/stores/data";
import { useEvidenceStore, type Pin } from "~/stores/evidence";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { definitionMarkdown } from "~/utils/definition";
import { derivedMetric } from "~/utils/derivedMetrics";
import { saveBundle } from "~/utils/files";
import { historyAnchor, anchorLabel } from "~/utils/history";
import { buildProvenance } from "~/utils/provenance";
import { citedMetrics, namesIn, reportMarkdown, type ReportPin } from "~/utils/report";
import { formatScanTime } from "~/utils/time";

// The consultant's working file: findings kept with where they came from,
// re-checked against every newer snapshot, grouped under headings, and
// turned into a Markdown report with its method and glossary.

const evidence = useEvidenceStore();
const workspaces = useWorkspacesStore();
const data = useDataStore();
const state = useStateStore();
const authors = useAuthorsStore();
const dragFrom = ref<number | null>(null);
const dragOver = ref<number | null>(null);
const confirming = ref<string | null>(null);
const figures = ref<Record<string, string>>({});

watch(() => workspaces.active?.id, (id) => { if (id) void evidence.load(id); }, { immediate: true });
watch(() => evidence.pins.map(p => p.figurePath).join(), async () => {
  const out: Record<string, string> = {};
  for (const p of evidence.pins) if (p.figurePath) { const b = await Figure(p.figurePath).catch(() => ""); if (b) out[p.id] = `data:image/png;base64,${b}`; }
  figures.value = out;
}, { immediate: true });

const checkedLabel = computed(() => {
  const s: any = workspaces.scans.find((x: any) => x.id === evidence.checkedAgainst);
  return s ? `${s.label || formatScanTime(s.headTime ?? s.startedAt)}${s.headCommit ? ` (${s.headCommit.slice(0, 7)})` : ""}` : "";
});

const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
function nowOf(p: Pin, k: string): string {
  const now = evidence.now[p.id];
  if (now === undefined) return "…";
  if (now === null) return "gone";
  return now[k] === undefined ? "—" : fmt(now[k]);
}
function provenanceOf(p: Pin): string {
  const s: any = p.scanId ? workspaces.scans.find((x: any) => x.id === p.scanId) : null;
  return [s ? formatScanTime(s.headTime ?? s.startedAt) : "snapshot deleted", p.headCommit ? p.headCommit.slice(0, 7) : "", `r${p.revision}`, p.lens ? `lens ${p.lens}` : "", p.scope ? `scope ${p.scope}` : "", p.role ? `${p.role} files` : ""].filter(Boolean).join(" · ");
}
function autosize(e: Event) {
  const t = e.target as HTMLTextAreaElement;
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight}px`;
}
async function drop(i: number) {
  const from = dragFrom.value;
  dragOver.value = null;
  if (from === null || from === i) return;
  const ids = evidence.pins.map(p => p.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(i, 0, moved);
  await evidence.reorder(ids);
}
async function addHeading() { await evidence.heading("New section"); }
async function remove(id: string) { confirming.value = null; await evidence.remove(id); }

// ── Report ─────────────────────────────────────────────────────────────
const title = computed(() => `${workspaces.active?.name ?? "Workspace"} evidence`);
function reportPins(figureDir: string | null): ReportPin[] {
  return evidence.pins.map((p, i) => {
    const s: any = p.scanId ? workspaces.scans.find((x: any) => x.id === p.scanId) : null;
    return {
      kind: p.kind, title: p.title, note: authors.displayText(p.note), pinned: evidence.valuesOf(p), now: evidence.now[p.id] ?? null,
      status: evidence.statuses[p.id] ?? null, snapshot: s ? formatScanTime(s.headTime ?? s.startedAt) : "snapshot deleted",
      commit: p.headCommit, revision: p.revision, lens: p.lens, scope: p.scope,
      figureFile: figureDir && p.figurePath && figures.value[p.id] ? `${figureDir}/${String(i + 1).padStart(2, "0")}.png` : null,
    };
  });
}
async function buildReport(figureDir: string | null): Promise<string> {
  const prov = buildProvenance();
  const info: any = data.snapshotInfo ?? {};
  const roles = [...data.fileRoleIndex.values()].reduce((m, r) => { m[r] = (m[r] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const pins = reportPins(figureDir);
  const glossary = citedMetrics(pins).map(id => {
    const d = data.definitions.get(id) ?? (derivedMetric(id) as any);
    return { id, name: d?.name ?? id, short: d?.short ?? "" };
  });
  return reportMarkdown(title.value, {
    workspace: prov.workspace, scannedAt: prov.scannedAt, commit: prov.commit, branch: prov.branch, uncommitted: prov.uncommitted,
    appVersion: prov.appVersion, revision: prov.revision, extensions: info.extensions ?? "",
    roles: Object.entries(roles).map(([k, v]) => `${k} ${v}`).join(", "), ignoreGlobs: info.ignore_globs ?? "",
    shallow: null, historyRange: prov.historyRange ?? "", anchor: anchorLabel(0, historyAnchor()).replace(/^Last 0 days to /, ""),
    sweeping: info.git_sweeping_commits !== undefined ? Number(info.git_sweeping_commits) : null, pseudonymised: prov.pseudonymised,
  }, pins, glossary, id => data.statNiceName(id) || id);
}
// With authors pseudonymised, a note that names a real author stops the export.
const blockedBy = computed(() => {
  if (!state.get("authors.pseudonymise", false)) return [];
  const names = Object.keys(authors.labels);
  return evidence.pins.flatMap(p => namesIn(`${p.title} ${p.note}`, names));
});

useExportables().register({
  kind: "document",
  get title() { return title.value; },
  label: "Copy board as Markdown",
  savable: true,
  saveLabel: "Report as Markdown…",
  disabledReason: () => (!evidence.pins.length ? "Nothing pinned yet." : blockedBy.value.length ? `A note names ${blockedBy.value[0]}; authors are pseudonymised, so edit it first.` : null),
  markdown: () => buildReport(null),
  save: async () => {
    const dirName = `${title.value}-figures`;
    const md = await buildReport(dirName);
    const files: Array<{ name: string; text?: string; base64?: string }> = [{ name: `${title.value}.md`, text: md }];
    evidence.pins.forEach((p, i) => {
      const src = figures.value[p.id];
      if (src) files.push({ name: `${dirName}/${String(i + 1).padStart(2, "0")}.png`, base64: src.replace(/^data:image\/png;base64,/, "") });
    });
    return saveBundle("Choose a folder for the report", files);
  },
});
void definitionMarkdown;
</script>
