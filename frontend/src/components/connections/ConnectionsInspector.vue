<template>
  <div v-if="!selection" class="text-sm leading-relaxed text-neutral-500">
    Click a node or a cell to inspect it. Double-click opens a node one level; shift-click selects several, then create a group from the selection.
  </div>

  <!-- A cycle: how big it is, which edges hold it shut, and who is most
       tangled in it. -->
  <div v-else-if="selection.type === 'cycle'" class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Icon icon="refresh" :size="14" class="text-red-600"/>
      <span class="text-base font-medium text-neutral-900">Cycle of {{ cycleMembers.length }}</span>
    </div>
    <StatStrip :cells="cycleCells"/>
    <p class="-mt-2 text-xs leading-4 text-neutral-400">Every one of these can reach every other. Nothing here can be built, tested or released on its own.</p>

    <!-- The whole job: which edges to cut. -->
    <div v-if="cycleCuts.length" class="flex flex-col gap-1">
      <span class="ui-label">Cheapest way out</span>
      <p class="text-xs leading-4 text-neutral-500">{{ cutSentence }}</p>
      <ul class="flex flex-col">
        <li v-for="c in shownCuts" :key="c.from + '>' + c.to">
          <button type="button" class="flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left hover:bg-neutral-50" :title="`${c.from} → ${c.to} · inspect this edge`" @click="emit('select-pair', c.from, c.to)">
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-mono text-sm text-neutral-800">{{ labelOf(c.from) }}</span>
              <span class="flex min-w-0 items-center gap-1 truncate font-mono text-xs text-neutral-500">
                <Icon icon="arrow-right" :size="10" class="shrink-0 text-red-600"/>
                <span class="truncate">{{ labelOf(c.to) }}</span>
              </span>
            </span>
            <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(c.references, 0) }}</span>
          </button>
        </li>
      </ul>
      <button v-if="cycleCuts.length > SHORT_LIST" type="button" class="self-start text-xs text-neutral-500 hover:text-neutral-900" @click="cutsExpanded = !cutsExpanded">
        {{ cutsExpanded ? 'Show fewer' : `Show all ${cycleCuts.length}` }}
      </button>
    </div>

    <!-- Who is most tangled: the members worth looking at first. -->
    <div class="flex flex-col gap-1">
      <span class="ui-label">Members <span class="font-mono text-neutral-400">{{ cycleMembers.length }}</span></span>
      <p class="text-xs leading-4 text-neutral-400">Most entangled first, counting only the edges inside the loop.</p>
      <ul class="flex flex-col">
        <li v-for="m in shownMembers" :key="m.id">
          <button type="button" class="flex h-7 w-full items-center gap-2 rounded-sm px-1 text-left hover:bg-neutral-50" :title="`${m.id} · show it in the view`" @click="emit('select', m.id)">
            <KindMark :kind="m.kind" :color="m.color"/>
            <span class="min-w-0 truncate font-mono text-sm text-neutral-800">{{ m.label }}</span>
            <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-400" :title="`${m.inn} in, ${m.out} out, inside the loop`">{{ m.inn }} in · {{ m.out }} out</span>
          </button>
        </li>
      </ul>
      <button v-if="cycleRanked.length > MEMBER_LIST" type="button" class="self-start text-xs text-neutral-500 hover:text-neutral-900" @click="membersExpanded = !membersExpanded">
        {{ membersExpanded ? 'Show fewer' : `Show all ${cycleRanked.length}` }}
      </button>
    </div>

    <router-link v-if="cycleMembers.every(id => byId.get(id)?.kind === 'component')" :to="`/views/components/cycles?component=${encodeURIComponent(cycleMembers[0])}`" class="ui-btn ui-btn-sm self-start">
      <Icon icon="external-link" :size="13"/>
      <span>Open in Cycles</span>
    </router-link>
  </div>

  <!-- A pair: both ends and the numbers between them. -->
  <div v-else-if="selection.type === 'pair'" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <template v-for="(end, i) in pairEnds" :key="end.id">
        <div class="flex min-w-0 items-center gap-2">
          <KindMark :kind="end.kind" :color="end.color"/>
          <button type="button" class="truncate font-mono text-sm text-neutral-900 hover:text-accent-700" :title="end.label" @click="emit('select', end.id)">{{ end.label }}</button>
        </div>
        <div v-if="i === 0" class="flex items-center gap-1.5 pl-1 text-xs text-neutral-400">
          <Icon :icon="directed ? 'arrow-up-right' : 'link'" :size="12"/>
          <span>{{ directed ? `depends on · ${formatNumber(pairForward, 0)} ${pairForward === 1 ? 'reference' : 'references'}` : 'coupled with' }}</span>
        </div>
      </template>
      <div v-if="directed && pairBack > 0" class="flex items-center gap-1.5 pl-1 text-xs text-red-700">
        <Icon icon="arrow-up-right" :size="12" class="rotate-180"/>
        <span>and back · {{ formatNumber(pairBack, 0) }} {{ pairBack === 1 ? 'reference' : 'references' }}</span>
      </div>
    </div>
    <p v-if="directed && pairBack > 0 && pairForward > 0" class="-mt-2 text-xs leading-4 text-neutral-500">These two point at each other, which is a cycle of its own. The lighter direction is the cheaper one to break.</p>
    <StatStrip :cells="pairCells"/>
    <p v-if="pairInCycle" class="flex items-center gap-1.5 text-sm text-red-700">
      <Icon icon="refresh" :size="13"/>
      <span>This edge is part of a cycle.</span>
    </p>
    <SharedCommitList v-if="source !== 'static' && pairFileSql" :a-files="pairFileSql[0]" :b-files="pairFileSql[1]"/>
  </div>

  <!-- A node, answering three questions in order: what is this, what is
       inside it, and how does it sit in the system. -->
  <div v-else-if="node" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <KindMark :kind="node.kind" :color="node.color"/>
        <button type="button" class="min-w-0 truncate text-left font-mono text-sm font-medium text-neutral-900 hover:text-accent-700" :title="`${node.label} · centre it in the view`" @click="emit('select', node.id)">{{ node.label }}</button>
        <span class="ui-tag shrink-0">{{ node.kind }}</span>
        <router-link v-if="nodeRoute" :to="nodeRoute" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :title="`Open the ${node.kind} page`" :aria-label="`Open the ${node.kind} page`">
          <Icon icon="external-link" :size="12"/>
        </router-link>
      </div>
      <div v-if="node.kind === 'file' && node.group" class="flex items-center gap-1.5 text-sm text-neutral-500">
        <Icon icon="component" :size="12"/>
        <span class="truncate">{{ node.group }}</span>
      </div>
      <!-- One chip per dimension: a component is a Controller and belongs to Audits. -->
      <div v-if="membershipChips.length" class="flex flex-wrap items-center gap-1.5">
        <span v-for="m in membershipChips" :key="m.id" class="ui-chip" :title="m.part ? `${m.dimension}: ${m.name}, ${m.part}` : `${m.dimension}: ${m.name}`">
          <span class="h-2 w-2 shrink-0 rounded-full" :style="m.part ? { background: `linear-gradient(90deg, ${m.color} 50%, transparent 50%)`, boxShadow: `inset 0 0 0 1px ${m.color}` } : { backgroundColor: m.color }"></span>
          <span class="text-neutral-500">{{ m.dimension }}</span>
          <span class="truncate">{{ m.name }}</span>
          <span v-if="m.part" class="font-mono text-xs text-neutral-400">{{ m.part }}</span>
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <StatStrip :cells="nodeCells"/>
      <p v-if="vitalsCaption" class="text-xs leading-4 text-neutral-400">{{ vitalsCaption }}</p>
    </div>

    <!-- Inside: what this node actually holds, worst first. -->
    <div v-if="node.kind !== 'file'" class="flex flex-col gap-1">
      <div class="flex items-baseline gap-2">
        <span class="ui-label">Inside</span>
        <span class="font-mono text-xs text-neutral-400">{{ insideTotal }}</span>
        <button v-if="canOpen" type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="emit('toggle-open', node.id)">
          {{ openIds.has(node.id) ? 'Close' : node.kind === 'group' ? 'Open into components' : 'Open into files' }}
        </button>
      </div>
      <LoadingState v-if="insideLoading" text="Reading contents"/>
      <template v-else-if="insideRows.length">
        <p class="text-xs leading-4 text-neutral-400">{{ insideHint }}</p>
        <ul class="flex flex-col">
          <li v-for="r in insideRows" :key="r.id" class="flex h-6 items-center gap-2">
            <KindMark :kind="node.kind === 'group' ? 'component' : 'file'" :color="node.color"/>
            <button type="button" class="min-w-0 truncate text-left font-mono text-sm text-neutral-800 hover:text-accent-700" :title="`${r.id} · show it in the view`" @click="emit('select', r.id)">{{ r.label }}</button>
            <span class="ml-auto h-1 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100" :title="`${formatNumber(r.lines ?? 0, 0)} lines`">
              <span class="block h-full rounded-full bg-neutral-400" :style="{ width: Math.max(4, ((r.lines ?? 0) / insideMaxLines) * 100) + '%' }"></span>
            </span>
            <span v-if="r.level && r.level !== 'none'" class="h-2 w-2 shrink-0 rounded-full" :class="levelDotClass(r.level)" :title="`Code health ${formatHealth(r.health)}`"></span>
            <span v-else class="w-2 shrink-0"></span>
          </li>
        </ul>
        <p v-if="insideTotal > insideRows.length" class="text-xs text-neutral-400">and {{ insideTotal - insideRows.length }} more</p>
      </template>
      <p v-else class="text-sm text-neutral-500">Nothing to show.</p>
    </div>

    <div v-if="node.kind === 'group'" class="flex flex-wrap gap-2">
      <button type="button" class="ui-btn ui-btn-sm" @click="emit('scope', node.id)">
        <Icon icon="scale" :size="13"/>
        <span>Scope views</span>
      </button>
      <router-link :to="groupPath(node.id)" class="ui-btn ui-btn-sm">
        <Icon icon="arrow-up-right" :size="13"/>
        <span>Open group</span>
      </router-link>
    </div>

    <!-- Cycles: not only that it is in one, but how much of it is. -->
    <div v-if="nodeCycle" class="flex flex-col gap-1">
      <span class="ui-label flex items-center gap-1.5 text-red-700"><Icon icon="refresh" :size="12"/> In a cycle with {{ nodeCycle.length - 1 }} other{{ nodeCycle.length === 2 ? '' : 's' }}</span>
      <p class="text-xs leading-4 text-neutral-500">
        {{ cyclicPartners }} of its {{ partners.length }} connection{{ partners.length === 1 ? '' : 's' }} stay inside the loop, marked in red below.
      </p>
      <button type="button" class="ui-btn ui-btn-sm self-start" @click="emit('select-cycle', node.id)">Show the cycle and how to break it</button>
    </div>

    <!-- Who it touches, split by direction, strongest first. The bar is the
         same story in one line: how much of it points out against in. -->
    <div v-if="directed && partners.length" class="flex flex-col gap-1.5">
      <span class="flex h-1.5 overflow-hidden rounded-full bg-neutral-100" :title="`${outRows.length} out, ${inRows.length} in`">
        <span class="bg-blue-500" :style="{ width: outShare + '%' }"></span>
        <span class="bg-violet-500" :style="{ width: 100 - outShare + '%' }"></span>
      </span>
      <p class="text-xs leading-4 text-neutral-500">{{ shapeSentence }}</p>
    </div>
    <template v-if="directed">
      <PartnerList title="Depends on" icon="arrow-right" :rows="outRows" :unit="unit" @select="emit('select', $event)"/>
      <PartnerList title="Used by" icon="arrow-left" :rows="inRows" :unit="unit" @select="emit('select', $event)"/>
    </template>
    <PartnerList v-else title="Coupled with" icon="link" :rows="outRows" :unit="unit" @select="emit('select', $event)"/>
    <p v-if="!partners.length" class="text-sm text-neutral-500">No connections with the current source and scope.</p>
  </div>

  <div v-else class="text-sm text-neutral-500">The selected item is not in view. Clear the search or scope, or close the group it is in.</div>
</template>

<script setup lang="ts">
import SharedCommitList from "~/components/git/SharedCommitList.vue";
import { groupPath } from "~/utils/routes";
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import StatStrip from "~/components/detail/StatStrip.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import KindMark from "~/components/connections/KindMark.vue";
import PartnerList, { type PartnerRow } from "~/components/connections/PartnerList.vue";
import { useGroupsStore, type SavedGroup } from "~/stores/groups";
import { useDataStore } from "~/stores/data";
import { formatNumber } from "~/utils/format";
import { sqlLiteral } from "~/utils/sql";
import { formatHealth, formatHotspot, healthLevel, hotspotLevel, levelDotClass, type HealthLevel } from "~/composables/useHealth";
import { type CEdge, type CNode, type Selection, type Source, detailRoute, feedbackEdges, neighboursOf } from "~/utils/connections";

const props = defineProps<{
  selection: Selection | null
  nodes: CNode[]
  edges: CEdge[]
  source: Source
  directed: boolean
  openIds: Set<string>
  memberships: (componentId: string) => SavedGroup[]
  cycleSetOf: Map<string, string[]>
  cycleSets: string[][]
}>();

const emit = defineEmits<{
  (e: "select", id: string): void
  (e: "select-pair", from: string, to: string): void
  (e: "select-cycle", id: string): void
  (e: "toggle-open", id: string): void
  (e: "scope", groupId: string): void
}>();

const groups = useGroupsStore();
const store = useDataStore();
const byId = computed(() => new Map(props.nodes.map(n => [n.id, n])));

const node = computed(() => (props.selection?.type === "node" ? byId.value.get(props.selection.id) ?? null : null));
const group = computed(() => (node.value?.kind === "group" ? groups.groups.find(g => g.id === node.value!.id) ?? null : null));
const groupComponents = computed(() => (group.value ? Array.from(groups.componentsOf(group.value).entries()) : []));
const nodeRoute = computed(() => (node.value ? detailRoute(node.value.kind, node.value.id) : null));
const nodeCycle = computed(() => (node.value ? props.cycleSetOf.get(node.value.id) ?? null : null));
const cycleMembers = computed(() => (props.selection?.type === "cycle" ? props.cycleSetOf.get(props.selection.id) ?? [] : []));
const canOpen = computed(() => !!node.value && (node.value.kind === "group" || (node.value.kind === "component" && (node.value.files ?? 0) > 0)));

const membershipChips = computed(() => {
  const n = node.value;
  if (!n) return [];
  const componentId = n.kind === "component" ? n.id : n.kind === "file" ? n.group ?? "" : "";
  if (!componentId) return [];
  return props.memberships(componentId).map(g => {
    const cov = groups.coverage(g, componentId);
    const part = cov && !cov.full ? `${cov.files} of ${cov.total || "?"} files` : null;
    return { id: g.id, name: g.name, color: g.color, dimension: g.dimension, part };
  });
});

// ── Vitals ───────────────────────────────────────────────────────────────
const nodeCells = computed(() => {
  const n = node.value;
  if (!n) return [];
  if (n.kind === "group") {
    return [
      { label: "Components", value: formatNumber(groupComponents.value.length, 0) },
      { label: "Files", value: formatNumber(n.files ?? 0, 0) },
      { label: "Lines", value: formatNumber(n.lines ?? 0, 0) },
    ];
  }
  const cells: any[] = [{ label: "Lines", value: formatNumber(n.lines ?? 0, 0) }];
  if (n.kind === "component") cells.push({ label: "Files", value: formatNumber(n.files ?? 0, 0) });
  cells.push(
    { label: "Code health", value: formatHealth(n.health), level: healthLevel(n.health) },
    { label: "Hotspot", value: formatHotspot(n.hotspot), level: hotspotLevel(n.hotspot) },
  );
  return cells;
});

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A number means little alone; say what share of what is on screen it is. */
const vitalsCaption = computed(() => {
  const n = node.value;
  if (!n) return "";
  const totalLines = props.nodes.reduce((s, x) => s + (x.lines ?? 0), 0);
  const parts: string[] = [];
  if (n.lines && totalLines > 0) {
    const share = (n.lines / totalLines) * 100;
    parts.push(`${share < 0.5 ? "<1" : Math.round(share)}% of the ${formatNumber(totalLines, 0)} lines in view`);
  }
  const sameKind = props.nodes.filter(x => x.kind === n.kind && (x.lines ?? 0) > 0).sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0));
  const rank = sameKind.findIndex(x => x.id === n.id);
  if (rank >= 0 && sameKind.length > 1) parts.push(`${ordinal(rank + 1)} largest of ${sameKind.length} ${n.kind}s`);
  return parts.join(" · ");
});

// ── Shape: which way the dependencies point ──────────────────────────────
const partners = computed(() => (node.value ? neighboursOf(node.value.id, props.edges) : []));
const cycleSet = computed(() => new Set(nodeCycle.value ?? []));
const cyclicPartners = computed(() => partners.value.filter(p => cycleSet.value.has(p.id)).length);
const unit = computed(() => (props.source === "git" ? "shared commits" : "references"));

function toRows(list: Array<{ id: string; references: number; sharedCommits: number }>): PartnerRow[] {
  return list
    .map(p => {
      const other = byId.value.get(p.id);
      return {
        id: p.id,
        label: other?.label ?? p.id,
        kind: other?.kind ?? "component",
        color: other?.color,
        value: props.source === "git" ? p.sharedCommits : p.references,
        inCycle: cycleSet.value.has(p.id),
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

const outRows = computed(() => toRows(props.directed ? partners.value.filter(p => p.direction !== "in") : partners.value));
const inRows = computed(() => toRows(partners.value.filter(p => p.direction !== "out")));
const outShare = computed(() => {
  const total = outRows.value.length + inRows.value.length;
  return total === 0 ? 50 : Math.round((outRows.value.length / total) * 100);
});
const shapeSentence = computed(() => {
  const out = outRows.value.length, inn = inRows.value.length;
  if (out + inn === 0) return "";
  const instability = out / (out + inn);
  if (instability >= 0.7) return "Mostly points outward. It leans on the rest of the codebase, so changes here stay cheap for everyone else.";
  if (instability <= 0.3) return "Mostly depended on. Changes here ripple outward, so it pays to keep this one stable.";
  return "It uses and is used in much the same measure, which makes it hard to change in isolation.";
});

// ── Inside: what the node holds, worst first ─────────────────────────────
interface InsideRow { id: string; label: string; to?: string; lines?: number | null; health?: number | null; level?: HealthLevel }
const insideRows = ref<InsideRow[]>([]);
const insideLoading = ref(false);
const INSIDE_LIMIT = 8;

const insideTotal = computed(() => {
  const n = node.value;
  if (!n) return 0;
  return n.kind === "group" ? groupComponents.value.length : n.files ?? 0;
});
const insideHint = computed(() => (node.value?.kind === "group" ? "Largest first." : "Hottest first: the files that change most and read worst."));
const insideMaxLines = computed(() => Math.max(1, ...insideRows.value.map(r => r.lines ?? 0)));

let insideSeq = 0;
watch(
  () => [node.value?.id, node.value?.kind, store.datasetKey] as const,
  async ([id, kind]) => {
    const seq = ++insideSeq;
    insideRows.value = [];
    if (!id || kind === "file" || !store.hasData) return;
    insideLoading.value = true;
    try {
      let rows: InsideRow[] = [];
      if (kind === "component" && store.hasView("files")) {
        const raw = await store.query<{ name: string; lines: number | null; health: number | null }>(
          `select name, complexity__lines as lines, codesmells__code_health as health from files where component = ${sqlLiteral(id)} order by coalesce(codesmells__hotspot_score, 0) desc, coalesce(complexity__lines, 0) desc limit ${INSIDE_LIMIT}`,
        );
        rows = raw.map(r => ({ id: r.name, label: r.name.split("/").pop() ?? r.name, to: detailRoute("file", r.name) ?? undefined, lines: r.lines, health: r.health, level: healthLevel(r.health) }));
      } else if (kind === "group" && store.hasView("components")) {
        const names = groupComponents.value.map(([c]) => c);
        if (names.length) {
          const raw = await store.query<{ name: string; lines: number | null; health: number | null }>(
            `select name, complexity__lines as lines, codesmells__code_health as health from components where name in (${names.map(sqlLiteral).join(", ")}) order by coalesce(complexity__lines, 0) desc limit ${INSIDE_LIMIT}`,
          );
          rows = raw.map(r => ({ id: r.name, label: r.name, to: detailRoute("component", r.name) ?? undefined, lines: r.lines, health: r.health, level: healthLevel(r.health) }));
        }
      }
      if (seq === insideSeq) insideRows.value = rows;
    } catch {
      if (seq === insideSeq) insideRows.value = [];
    } finally {
      if (seq === insideSeq) insideLoading.value = false;
    }
  },
  { immediate: true },
);

// ── A cycle ──────────────────────────────────────────────────────────────
function labelOf(id: string): string {
  return byId.value.get(id)?.label ?? id;
}

/** Only the edges with both ends inside the loop hold it shut. */
const cycleInner = computed(() => {
  const inside = new Set(cycleMembers.value);
  return props.edges.filter(e => inside.has(e.from) && inside.has(e.to) && e.from !== e.to);
});
const cycleCuts = computed(() => (cycleMembers.value.length ? feedbackEdges(cycleMembers.value, props.edges) : []));
const cutReferences = computed(() => cycleCuts.value.reduce((s, e) => s + e.references, 0));

// A tangle this size is not cut in one sitting, so the panel offers the
// cheapest handful and says plainly what the whole job would be.
const SHORT_LIST = 8;
const MEMBER_LIST = 12;
const cutsExpanded = ref(false);
const membersExpanded = ref(false);
watch(() => props.selection, () => { cutsExpanded.value = false; membersExpanded.value = false; });
const shownCuts = computed(() => (cutsExpanded.value ? cycleCuts.value : cycleCuts.value.slice(0, SHORT_LIST)));
const shownMembers = computed(() => (membersExpanded.value ? cycleRanked.value : cycleRanked.value.slice(0, MEMBER_LIST)));
const cutSentence = computed(() => {
  const n = cycleCuts.value.length;
  const refs = formatNumber(cutReferences.value, 0);
  if (n === 0) return "";
  if (n === 1) return `One edge holds this loop shut, ${refs} ${cutReferences.value === 1 ? "reference" : "references"}. Reverse or remove it and the loop is gone.`;
  if (n <= SHORT_LIST) return `Reversing or removing these ${n} edges (${refs} references in all) leaves nothing here circular. Lightest first.`;
  return `${n} edges hold this loop shut, ${refs} references in all. The lightest are below: each one is a cheap place to start.`;
});

const cycleCells = computed(() => {
  const members = cycleMembers.value;
  if (!members.length) return [];
  const lines = members.reduce((s, id) => s + (byId.value.get(id)?.lines ?? 0), 0);
  return [
    { label: "Members", value: formatNumber(members.length, 0) },
    { label: "Edges inside", value: formatNumber(cycleInner.value.length, 0) },
    { label: "Lines caught", value: formatNumber(lines, 0) },
    { label: "Cuts", value: formatNumber(cycleCuts.value.length, 0), title: "Edges whose removal would leave nothing here circular" },
  ];
});

/** Members ranked by how tangled they are, counting only inner edges. */
const cycleRanked = computed(() => {
  const degree = new Map<string, { inn: number; out: number }>();
  for (const id of cycleMembers.value) degree.set(id, { inn: 0, out: 0 });
  for (const e of cycleInner.value) {
    const from = degree.get(e.from), to = degree.get(e.to);
    if (from) from.out++;
    if (to) to.inn++;
  }
  return cycleMembers.value
    .map(id => {
      const n = byId.value.get(id);
      const d = degree.get(id) ?? { inn: 0, out: 0 };
      return { id, label: n?.label ?? id, kind: n?.kind ?? "component", color: n?.color, inn: d.inn, out: d.out };
    })
    .sort((a, b) => (b.inn + b.out) - (a.inn + a.out) || a.label.localeCompare(b.label));
});

// ── A pair ───────────────────────────────────────────────────────────────
const pairEnds = computed(() => {
  if (props.selection?.type !== "pair") return [];
  return [props.selection.from, props.selection.to].map(id => { const n = byId.value.get(id); return { id, label: n?.label ?? id, color: n?.color, kind: n?.kind ?? "component" }; });
});
const pairInCycle = computed(() => {
  if (props.selection?.type !== "pair") return false;
  const a = props.cycleSetOf.get(props.selection.from), b = props.cycleSetOf.get(props.selection.to);
  return !!a && a === b;
});
const pairForward = computed(() => {
  if (props.selection?.type !== "pair") return 0;
  const { from, to } = props.selection;
  return props.edges.filter(e => e.from === from && e.to === to).reduce((s, e) => s + e.references, 0);
});
const pairBack = computed(() => {
  if (props.selection?.type !== "pair") return 0;
  const { from, to } = props.selection;
  return props.edges.filter(e => e.from === to && e.to === from).reduce((s, e) => s + e.references, 0);
});
// Each end of a pair as an SQL predicate on git_commits, for its evidence.
const pairFileSql = computed<[string, string] | null>(() => {
  if (props.selection?.type !== "pair") return null;
  const sel = props.selection;
  const side = (id: string): string | null => {
    const n = props.nodes.find(x => x.id === id);
    if (!n) return null;
    if (n.kind === "component") return `component = ${sqlLiteral(id)}`;
    if (n.kind === "file") return `file = ${sqlLiteral(id)}`;
    const g = groups.groups.find(x => x.id === id);
    const files = g ? [...groups.filesOf(g)] : [];
    return files.length ? `file IN (${files.map(sqlLiteral).join(", ")})` : null;
  };
  const a = side(sel.from), b = side(sel.to);
  return a && b ? [a, b] : null;
});

const pairCells = computed(() => {
  if (props.selection?.type !== "pair") return [];
  const { from, to } = props.selection;
  const hits = props.edges.filter(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  const refs = hits.reduce((s, e) => s + e.references, 0);
  const dynamic = hits.reduce((s, e) => s + (e.dynamicRefs ?? 0), 0);
  const shared = hits.reduce((s, e) => s + e.sharedCommits, 0);
  const cells: any[] = [];
  if (props.source !== "git") cells.push({ label: "References", value: dynamic ? `${formatNumber(refs, 0)} (${formatNumber(dynamic, 0)} dynamic)` : formatNumber(refs, 0) });
  if (props.source !== "static") cells.push({ label: "Shared commits", value: formatNumber(shared, 0) });
  cells.push({ label: "Weight", value: formatNumber(Math.max(0, ...hits.map(e => e.weight)) * 100, 0) + "%" });
  return cells;
});
</script>
