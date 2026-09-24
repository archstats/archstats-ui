<template>
  <nav class="shell-rail flex h-full shrink-0 flex-col bg-ground hairline-r" :style="{ width: panes.sidebarWidth + 'px' }" aria-label="Workspace">
    <!-- Brand row with the collapse control. On macOS it also hosts the traffic lights and drags the window. -->
    <div class="drag-region flex shrink-0 items-center justify-between pr-2" :class="isMac ? 'h-[52px] pl-[80px]' : 'h-11 pl-3.5'">
      <router-link to="/" class="flex h-5 items-center gap-2" aria-label="Archstats home">
        <img src="/img/archstats/Archstats-icon.png" alt="" class="h-5 w-5">
        <img src="/img/archstats/archstats-text.png" alt="Archstats" class="h-3 object-contain object-left dark:hidden">
        <img src="/img/archstats/archstats-text-white.png" alt="Archstats" class="hidden h-3 object-contain object-left dark:block">
      </router-link>
      <button
          type="button"
          class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet text-neutral-500"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          @click="emit('collapse')"
      >
        <PanelLeftClose :size="15" :stroke-width="1.75"/>
      </button>
    </div>

    <WorkspaceSwitcher/>

    <div v-if="hasWorkspace" class="mt-2">
      <ScanPanel/>
    </div>

    <!-- View navigation. Inert until a snapshot is open; the shape stays visible. -->
    <div
        class="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pt-3 hairline-t transition-opacity"
        :class="{ 'pointer-events-none opacity-40 select-none': !hasData }"
        :aria-disabled="!hasData"
    >
      <div class="flex flex-col gap-4 pb-3">
        <router-link
            to="/"
            :tabindex="hasData ? undefined : -1"
            class="flex h-[26px] items-center gap-2 rounded px-2 text-base text-neutral-800 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            active-class=""
            exact-active-class="is-active bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]"
        >
          <LayoutDashboard :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
          <span class="truncate">Overview</span>
        </router-link>
        <section v-for="group in groups" :key="group.title">
          <h3 class="ui-section-title mb-1 px-2">{{ group.title }}</h3>
          <ul class="flex flex-col">
            <li v-for="item in group.items" :key="item.to">
              <router-link
                  :to="item.to"
                  :tabindex="hasData ? undefined : -1"
                  class="flex h-[26px] items-center gap-2 rounded px-2 text-base transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  :class="group.muted ? 'text-neutral-400' : 'text-neutral-800'"
                  :title="group.muted ? group.mutedWhy : undefined"
                  active-class="is-active bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]"
              >
                <component :is="item.icon" :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
                <span class="truncate">{{ item.label }}</span>
              </router-link>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- Dimensions: each is a way of slicing the codebase. The lens row is the
         one every view looks through; a group under it scopes the views. -->
    <section class="shrink-0 px-2 pb-2 pt-3 hairline-t" :class="{ 'pointer-events-none opacity-40': !hasData }">
      <div class="mb-1 flex items-center justify-between px-2">
        <h3 class="ui-section-title">Lenses</h3>
        <span v-if="savedNote" class="ml-2 min-w-0 truncate text-xs text-green-700" role="status">{{ savedNote }}</span>
        <div class="flex items-center gap-2">
          <button v-if="scope.isActive" type="button" class="text-xs text-neutral-500 hover:text-neutral-900" @click="scope.clear()">Clear scope</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" title="Build a new lens" aria-label="New lens" @click="buildDimension('new')"><Icon icon="plus" :size="13"/></button>
        </div>
      </div>
      <div v-if="buckets.length" class="flex max-h-64 flex-col overflow-y-auto">
        <template v-for="bucket in buckets" :key="bucket.dimension">
          <div v-if="renaming === bucket.dimension" class="mt-1 flex h-7 items-center gap-1.5 px-2">
            <input ref="renameEl" :value="bucket.dimension" type="text" class="ui-input ui-input-sm min-w-0 grow" aria-label="Lens name" @keydown.enter.prevent="finishRename(bucket.dimension, ($event.target as HTMLInputElement).value)" @keydown.esc.prevent="renaming = null" @blur="finishRename(bucket.dimension, ($event.target as HTMLInputElement).value)"/>
          </div>
          <div v-else-if="confirming === bucket.dimension" class="mt-1 flex h-7 items-center gap-1.5 px-2">
            <span class="min-w-0 truncate text-sm text-neutral-800">Delete {{ bucket.dimension }} and its {{ bucket.groups.length }} group{{ bucket.groups.length === 1 ? '' : 's' }}?</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-danger ml-auto" @click="confirming = null; groupsStore.deleteDimension(bucket.dimension)">Delete</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="confirming = null">Keep</button>
          </div>
          <div v-else class="group mt-1 flex h-7 items-center gap-1.5 rounded px-2" :class="[lens.active === bucket.dimension ? 'bg-neutral-100' : 'hover:bg-neutral-50', { 'ring-1 ring-green-500': savedNote && groupsStore.lastSaved?.dimension === bucket.dimension }]" :data-dimension="bucket.dimension">
            <button type="button" class="flex min-w-0 grow items-center gap-1.5 text-left" :title="lens.active === bucket.dimension ? `Every view looks through ${bucket.dimension}` : `Look through ${bucket.dimension}`" @click="lens.set(bucket.dimension)">
              <Icon icon="eye" :size="12" :class="lens.active === bucket.dimension ? 'text-accent-600' : 'text-neutral-300 group-hover:text-neutral-500'"/>
              <span class="truncate text-sm font-medium" :class="lens.active === bucket.dimension ? 'text-neutral-900' : 'text-neutral-700'">{{ bucket.dimension }}</span>
              <span class="shrink-0 font-mono text-xs text-neutral-400" :title="`${coverage(bucket.dimension).components} of ${componentTotal} components in a group`">{{ coverage(bucket.dimension).components }}/{{ componentTotal }}</span>
              <!-- Drift, reported rather than absorbed: a query that stopped
                   matching after a rename, a component two groups both claim,
                   or a frozen group whose own query has moved on. -->
              <LensHealth :lens="bucket.dimension" compact/>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet opacity-0 group-hover:opacity-100 focus:opacity-100" :title="`Edit ${bucket.dimension} in the builder`" :aria-label="`Edit ${bucket.dimension}`" @click="buildDimension(bucket.dimension)"><Icon icon="pencil" :size="12"/></button>
            <div class="relative">
              <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet opacity-0 group-hover:opacity-100 focus:opacity-100" :aria-label="`More for ${bucket.dimension}`" :aria-expanded="dimMenu === bucket.dimension" @click.stop="dimMenu = dimMenu === bucket.dimension ? null : bucket.dimension"><Icon icon="more-vertical" :size="12"/></button>
              <div v-if="dimMenu === bucket.dimension" class="fixed inset-0 z-40" @click="dimMenu = null"></div>
              <div v-if="dimMenu === bucket.dimension" class="ui-menu absolute left-0 z-50 mt-1 flex w-48 flex-col animate-in" role="menu">
                <button type="button" class="ui-menu-item" role="menuitem" @click="dimMenu = null; buildDimension(bucket.dimension)"><Icon icon="pencil" :size="12" class="text-neutral-500"/><span>Edit in builder</span></button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="dimMenu = null; startRename(bucket.dimension)"><Icon icon="pencil" :size="12" class="text-neutral-500"/><span>Rename</span></button>
                <button type="button" class="ui-menu-item" role="menuitem" @click="dimMenu = null; confirming = bucket.dimension"><Icon icon="trash" :size="12" class="text-neutral-500"/><span>Delete lens</span></button>
              </div>
            </div>
          </div>
          <ul class="ml-3 flex flex-col">
            <li v-for="g in bucket.groups" :key="g.id">
              <button
                  type="button"
                  class="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  :class="{ 'bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': scope.groupIds.includes(g.id) }"
                  :aria-pressed="scope.groupIds.includes(g.id)"
                  :title="scope.groupIds.includes(g.id) ? `Remove ${g.name} from the scope` : `Scope views to ${g.name}`"
                  @click="scope.toggleGroup(g.id)"
              >
                <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
                <span class="min-w-0 flex-1 truncate">{{ g.name }}</span>
                <span class="font-mono text-xs text-neutral-400">{{ g.members.length }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-else class="flex flex-col gap-2 px-2 pb-1">
        <p class="text-sm leading-4 text-neutral-500">No lenses yet. A lens is one way of slicing the code: domains, layers, teams.</p>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary self-start" @click="buildDimension('new')">
          <Icon icon="plus" :size="13"/><span>Build a lens</span>
        </button>
      </div>
      <div class="mt-1">
        <GroupsManager />
      </div>
    </section>
  </nav>
</template>

<script setup lang="ts">
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { computed, nextTick, ref, watch } from "vue";
import {
  PanelLeftClose, Flame, Table2, RefreshCw, Network,
  Activity, Users, Braces, LayoutDashboard, Scale,
} from "lucide-vue-next";
import LensHealth from "~/components/groups/LensHealth.vue";
import GroupsManager from "~/components/groups/GroupsManager.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { DEFAULT_DIMENSION, useGroupsStore } from "~/stores/groups";
import { useScopeStore } from "~/stores/scope";
import { useLensStore } from "~/stores/lens";
import WorkspaceSwitcher from "~/components/shell/WorkspaceSwitcher.vue";
import ScanPanel from "~/components/shell/ScanPanel.vue";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { useJavaMetrics } from "~/composables/useJavaMetrics";
import { usePlatform } from "~/composables/usePlatform";
import { usePanesStore } from "~/stores/panes";

const emit = defineEmits<{ (e: "collapse"): void }>();
const panes = usePanesStore();
const { isMac } = usePlatform();

const { isJavaProject } = useJavaMetrics();
const dataStore = useDataStore();
const workspaces = useWorkspacesStore();
const hasData = computed(() => dataStore.hasData);
const hasWorkspace = computed(() => workspaces.active !== null);

const componentViews = [
  { label: "Metrics", to: "/views/metrics", icon: Table2 },
  { label: "Hotspots", to: "/views/components/hotspots", icon: Flame },
  { label: "Connections", to: "/views/connections", icon: Network },
  { label: "Cycles", to: "/views/components/cycles", icon: RefreshCw },
];
const gitViews = [
  { label: "Authors", to: "/views/git/authors", icon: Users },
  { label: "Activity", to: "/views/git/activity", icon: Activity },
];
// Units, not classes: gin is 1,327 functions to 204 types and LibreChat
// 3,241 to 294, so a section called Classes shows a fraction of either.
const codeViews = [
  { label: "Units", to: "/views/units", icon: Braces },
];
const architectureViews = [
  { label: "Rules", to: "/views/rules", icon: Scale },
];
// Rules arrived after most snapshots were taken, so the section hides itself
// rather than showing an empty screen — the same way the Java section does.
const hasRules = computed(() => dataStore.hasView("rules"));
// Every language declares units now. The Java-only check stays as the
// fallback for snapshots taken before they existed.
const hasUnits = computed(() => dataStore.hasView("units") || isJavaProject.value);

const groupsStore = useGroupsStore();
const health = computed(() => {
  const out = new Map<string, ReturnType<ReturnType<typeof useGroupsStore>["lensHealth"]>>();
  for (const d of groupsStore.dimensions) out.set(d, groupsStore.lensHealth(d));
  return out;
});
function reviewNote(dimension: string): string {
  const h = health.value.get(dimension);
  if (!h) return "";
  const parts: string[] = [];
  for (const s of h.silent) parts.push(`${s.group.name}: ${s.lines.length === 1 ? "a line" : `${s.lines.length} lines`} match nothing in this scan`);
  if (h.overlaps.length) parts.push(`${h.overlaps.length} component${h.overlaps.length === 1 ? "" : "s"} in two groups`);
  for (const c of h.candidates) parts.push(`${c.group.name}: its query now matches ${c.extra} more`);
  return parts.join("\n");
}
const scope = useScopeStore();
const buckets = computed(() => groupsStore.groupsByDimension);
const lens = useLensStore();
const router = useRouter();
const dimMenu = ref<string | null>(null);
const componentTotal = computed(() => dataStore.componentFilesIndex.size);
const coverage = (d: string) => groupsStore.dimensionCoverage(d);
function buildDimension(name: string) {
  router.push({ path: "/views/dimensions", query: name === "new" ? {} : { build: name } });
}
// Rename and delete happen in the row itself, in the app's own language.
const renaming = ref<string | null>(null);
const confirming = ref<string | null>(null);
const renameEl = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
async function startRename(name: string) {
  renaming.value = name;
  await nextTick();
  const el = Array.isArray(renameEl.value) ? renameEl.value[0] : renameEl.value;
  el?.focus(); el?.select();
}
function finishRename(from: string, value: string) {
  if (renaming.value !== from) return;
  renaming.value = null;
  const to = value.trim();
  if (!to || to === from) return;
  const wasLens = lens.active === from;
  groupsStore.renameDimension(from, to);
  if (wasLens) lens.set(to);
}
// A saved dimension announces itself for a moment and scrolls into view.
const savedNote = ref<string | null>(null);
let savedTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => groupsStore.lastSaved, (saved) => {
  if (!saved) return;
  savedNote.value = `Saved ${saved.dimension} · ${saved.groups} group${saved.groups === 1 ? "" : "s"}`;
  nextTick(() => document.querySelector(`[data-dimension="${CSS.escape(saved.dimension)}"]`)?.scrollIntoView({ block: "nearest" }));
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { savedNote.value = null; }, 4000);
});

// A snapshot of a folder that is not a git checkout has no commits. The git
// views say so when opened; the sidebar says so before anyone has to.
const { data: hasGitHistory } = useAsyncQuery<boolean>(
  async () => {
    if (!dataStore.hasData || !dataStore.hasView("git_commits")) return false
    const rows = await dataStore.query<{ one: number }>("select 1 as one from git_commits limit 1")
    return rows.length > 0
  },
  [() => dataStore.datasetKey],
  { initial: true },
)

const groups = computed(() => {
  const list = [
    { title: "Components", items: componentViews },
    { title: "Git", items: gitViews, muted: !hasGitHistory.value, mutedWhy: "No git history in this snapshot: scan a git checkout to see authors and activity" },
  ] as Array<{ title: string; items: typeof componentViews; muted?: boolean; mutedWhy?: string }>;
  if (hasUnits.value) list.push({ title: "Code", items: codeViews });
  if (hasRules.value) list.push({ title: "Architecture", items: architectureViews });
  return list;
});
</script>
