<template>
  <nav class="shell-rail flex h-full shrink-0 flex-col bg-ground hairline-r" :style="{ width: panes.sidebarWidth + 'px' }" :aria-label="t('shell.navBar.workspace')">
    <!-- Brand row with the collapse control. On macOS it also hosts the traffic lights and drags the window. -->
    <div class="drag-region flex shrink-0 items-center justify-between pr-2" :class="isMac ? 'h-[52px] pl-[80px]' : 'h-11 pl-3.5'">
      <router-link to="/" class="flex h-5 items-center gap-2" :aria-label="t('shell.navBar.archstatsHome')">
        <img src="/img/archstats/Archstats-icon.png" alt="" class="h-5 w-5">
        <img src="/img/archstats/archstats-text.png" :alt="t('shell.navBar.archstats')" class="h-3 object-contain object-left dark:hidden">
        <img src="/img/archstats/archstats-text-white.png" :alt="t('shell.navBar.archstats')" class="hidden h-3 object-contain object-left dark:block">
      </router-link>
      <div class="flex items-center gap-0.5">
        <button
            type="button"
            class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet text-neutral-500"
            :aria-label="t('shell.navBar.settings')"
            :title="t('shell.navBar.settings2', { value: isMac ? '⌘,' : 'Ctrl+,' })"
            @click="runCommand('settings:open')"
        >
          <Settings :size="14" :stroke-width="1.75"/>
        </button>
        <button
            type="button"
            class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet text-neutral-500"
            :aria-label="t('shell.navBar.collapseSidebar')"
            :title="t('shell.navBar.collapseSidebar')"
            @click="emit('collapse')"
        >
          <PanelLeftClose :size="15" :stroke-width="1.75"/>
        </button>
      </div>
    </div>

    <WorkspaceSwitcher/>

    <div v-if="hasWorkspace" class="mt-1">
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
          <span class="truncate">{{ t('shell.navBar.overview') }}</span>
        </router-link>
        <router-link
            to="/views/changes"
            :tabindex="hasData ? undefined : -1"
            class="-mt-3 flex h-[26px] items-center gap-2 rounded px-2 text-base text-neutral-800 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            :class="{ 'is-active bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': isChangesRoute }"
            active-class=""
        >
          <GitCompare :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
          <span class="truncate">{{ t('shell.navBar.changes') }}</span>
          <span v-if="scanCount > 1" class="ml-auto font-mono text-xs text-neutral-400" :title="t('shell.navBar.snapshotsCompare', { scanCount })">{{ scanCount }}</span>
        </router-link>
        <router-link
            v-if="ai.enabled"
            to="/views/ask"
            :tabindex="hasData ? undefined : -1"
            class="-mt-3 flex h-[26px] items-center gap-2 rounded px-2 text-base text-neutral-800 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            active-class="is-active bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]"
            :title="t('shell.navBar.askQuestionsAboutCodebase')"
        >
          <Sparkles :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
          <span class="truncate">{{ t('shell.navBar.ask') }}</span>
          <span class="ml-auto font-mono text-xs text-neutral-400">⌘J</span>
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
                <span v-if="item.count" class="ml-auto font-mono text-xs text-neutral-400">{{ item.count }}</span>
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
        <h3 class="ui-section-title">{{ t('shell.navBar.lenses') }}</h3>
        <span v-if="savedNote" class="ml-2 min-w-0 truncate text-xs text-green-700" role="status">{{ savedNote }}</span>
        <div class="flex items-center gap-2">
          <button v-if="scope.hasSelection" type="button" class="text-xs text-neutral-500 hover:text-neutral-900" @click="scope.clear()">{{ t('shell.navBar.clearScope') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :title="t('shell.navBar.buildNewLens')" :aria-label="t('shell.navBar.newLens')" @click="buildDimension('new')"><Icon icon="plus" :size="13"/></button>
        </div>
      </div>
      <!-- Production or tests: one switch every view obeys. -->
      <div class="mb-2 flex items-center gap-2 px-2" :title="roleSource">
        <span class="text-xs text-neutral-500">{{ t('shell.navBar.files') }}</span>
        <div class="ui-segmented grow" role="group" :aria-label="t('shell.navBar.whichFilesEveryView')">
          <button type="button" class="grow" :aria-pressed="scope.facet === 'all'" @click="scope.setFacet('all')">{{ t('shell.navBar.all') }}</button>
          <button type="button" class="grow" :aria-pressed="scope.facet === 'production'" @click="scope.setFacet('production')">{{ t('shell.navBar.production') }}</button>
          <button type="button" class="grow" :aria-pressed="scope.facet === 'test'" :disabled="testFiles === 0" :title="testFiles === 0 ? t('shell.navBar.noTestFilesSnapshot') : t('shell.navBar.testFiles', { value: testFiles.toLocaleString(intlLocale) })" @click="scope.setFacet('test')">{{ t('shell.navBar.tests') }}</button>
        </div>
      </div>
      <div v-if="buckets.length" class="flex max-h-64 flex-col overflow-y-auto">
        <template v-for="bucket in buckets" :key="bucket.dimension">
          <div v-if="renaming === bucket.dimension" class="mt-1 flex h-7 items-center gap-1.5 px-2">
            <input ref="renameEl" :value="bucket.dimension" type="text" class="ui-input ui-input-sm min-w-0 grow" :aria-label="t('shell.navBar.lensName')" @keydown.enter.prevent="finishRename(bucket.dimension, ($event.target as HTMLInputElement).value)" @keydown.esc.prevent="renaming = null" @blur="finishRename(bucket.dimension, ($event.target as HTMLInputElement).value)"/>
          </div>
          <div v-else-if="confirming === bucket.dimension" class="mt-1 flex h-7 items-center gap-1.5 px-2">
            <span class="min-w-0 truncate text-sm text-neutral-800">{{ t('shell.navBar.delete', { dimension: bucket.dimension, groups: t('common.count.group', { count: bucket.groups.length }) }) }}</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-danger ml-auto" @click="confirming = null; groupsStore.deleteDimension(bucket.dimension)">{{ t('shell.navBar.delete2') }}</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="confirming = null">{{ t('shell.navBar.keep') }}</button>
          </div>
          <div v-else class="group mt-1 flex h-7 items-center gap-1.5 rounded px-2" :class="[lens.active === bucket.dimension ? 'bg-neutral-100' : 'hover:bg-neutral-50', { 'ring-1 ring-green-500': savedNote && groupsStore.lastSaved?.dimension === bucket.dimension }]" :data-dimension="bucket.dimension">
            <button type="button" class="flex min-w-0 grow items-center gap-1.5 text-left" :title="lens.active === bucket.dimension ? t('shell.navBar.everyViewLooksThrough', { dimension: bucket.dimension }) : t('shell.navBar.lookThrough', { dimension: bucket.dimension })" @click="lens.set(bucket.dimension)">
              <Icon icon="eye" :size="12" :class="lens.active === bucket.dimension ? 'text-accent-600' : 'text-neutral-300 group-hover:text-neutral-500'"/>
              <span class="truncate text-sm font-medium" :class="lens.active === bucket.dimension ? 'text-neutral-900' : 'text-neutral-700'">{{ bucket.dimension }}</span>
              <span class="shrink-0 font-mono text-xs text-neutral-400" :title="t('shell.navBar.componentsGroup', { components: coverage(bucket.dimension).components, componentTotal })">{{ coverage(bucket.dimension).components }}/{{ componentTotal }}</span>
              <!-- Drift, reported rather than absorbed: a query that stopped
                   matching after a rename, a component two groups both claim,
                   or a frozen group whose own query has moved on. -->
              <LensHealth :lens="bucket.dimension" compact/>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet opacity-0 group-hover:opacity-100 focus:opacity-100" :title="t('shell.navBar.editBuilder', { dimension: bucket.dimension })" :aria-label="t('shell.navBar.edit', { dimension: bucket.dimension })" @click="buildDimension(bucket.dimension)"><Icon icon="pencil" :size="12"/></button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet group-hover:opacity-100 focus:opacity-100" :class="lens.active === bucket.dimension || dimMenu === bucket.dimension ? 'opacity-100' : 'opacity-0'" :title="t('shell.navBar.moreDeclareDependenciesRename', { dimension: bucket.dimension })" :aria-label="t('shell.navBar.more', { dimension: bucket.dimension })" aria-haspopup="menu" :aria-expanded="dimMenu === bucket.dimension" @click.stop="openDimMenu(bucket.dimension, $event.currentTarget as HTMLElement)"><Icon icon="more-vertical" :size="12"/></button>
          </div>
          <router-link v-if="lens.active === bucket.dimension && activeDeclared" to="/views/rules#lens" class="ml-7 block truncate font-mono text-[11px] leading-5 text-neutral-500 hover:text-neutral-900" :title="lensCheck.count ? t('shell.navBar.everyImportCrossesDeclared') : t('shell.navBar.nothingCrossesDeclaredOrder')">
            {{ lensCheck.count ? t('shell.navBar.crossDeclaredOrder', { imports: t('common.count.import', { count: lensCheck.count }) }) : t('shell.navBar.nothingCrossesDeclaredOrder') }}<template v-if="lensCheck.silent.length">{{ ' ' + t('shell.navBar.notJudged', { cycles: t('common.count.cycle', { count: lensCheck.silent.length }) }) }}</template>
          </router-link>
          <ul class="ml-3 flex flex-col">
            <li v-for="g in bucket.groups" :key="g.id" class="group/grp relative">
              <router-link :to="groupPath(g.id)" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-7 top-1 z-10 h-5 w-5 opacity-0 focus:opacity-100 group-hover/grp:opacity-100" :title="t('shell.navBar.open', { gName: g.name })" :aria-label="t('shell.navBar.open', { gName: g.name })"><Icon icon="arrow-up-right" :size="11"/></router-link>
              <button
                  type="button"
                  class="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  :class="{ 'bg-accent-50 font-medium text-neutral-900 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': scope.groupIds.includes(g.id) }"
                  :aria-pressed="scope.groupIds.includes(g.id)"
                  :title="scope.groupIds.includes(g.id) ? t('shell.navBar.removeScope', { gName: g.name }) : t('shell.navBar.scopeViews', { gName: g.name })"
                  @click="scope.toggleGroup(g.id)"
              >
                <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
                <span class="min-w-0 flex-1 truncate">{{ g.name }}</span>
                <span class="font-mono text-xs text-neutral-400">{{ groupsStore.membersOf(g).length }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div v-else class="flex flex-col gap-2 px-2 pb-1">
        <p class="text-sm leading-4 text-neutral-500">{{ t('shell.navBar.noLensesYetLens') }}</p>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary self-start" @click="buildDimension('new')">
          <Icon icon="plus" :size="13"/><span>{{ t('shell.navBar.buildLens') }}</span>
        </button>
      </div>
      <div class="mt-1">
        <GroupsManager />
        <DeclareSheet v-model="declaring"/>
      </div>
    </section>
    <!-- The lens menu lives on the body: inside the scrolling lens list it was
         clipped, and closed before an item could be reached. -->
    <Teleport to="body">
      <div v-if="dimMenu" class="fixed inset-0 z-[69]" @click="dimMenu = null"></div>
      <div v-if="dimMenu" ref="dimMenuEl" class="ui-menu flex w-52 flex-col animate-in" role="menu" :aria-label="t('shell.navBar.lens', { dimMenu })" :style="dimMenuStyle" @keydown.esc.prevent="closeDimMenu" @keydown.down.prevent="stepDimMenu(1)" @keydown.up.prevent="stepDimMenu(-1)">
        <button type="button" class="ui-menu-item" role="menuitem" @click="dimAction('build')"><Icon icon="pencil" :size="12" class="text-neutral-500"/><span>{{ t('shell.navBar.editBuilder2') }}</span></button>
        <button type="button" class="ui-menu-item" role="menuitem" @click="dimAction('declare')"><Icon icon="scale" :size="12" class="text-neutral-500"/><span>{{ t('shell.navBar.declareDependencies') }}</span></button>
        <button type="button" class="ui-menu-item" role="menuitem" @click="dimAction('rename')"><Icon icon="pencil" :size="12" class="text-neutral-500"/><span>{{ t('shell.navBar.rename') }}</span></button>
        <button type="button" class="ui-menu-item" role="menuitem" @click="dimAction('delete')"><Icon icon="trash" :size="12" class="text-neutral-500"/><span>{{ t('shell.navBar.deleteLens') }}</span></button>
      </div>
    </Teleport>
  </nav>
</template>

<script setup lang="ts">
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { computed, nextTick, ref, watch } from "vue";
import {
  PanelLeftClose, Flame, Table2, RefreshCw, Network, GitCompare, Bookmark, Terminal,
  Activity, Users, Braces, LayoutDashboard, Scale, Package, Container,
  Sparkles, Settings,
} from "lucide-vue-next";
import { useAIStore } from "~/features/ai/ai.store";
import { runCommand } from "~/platform/commands";
import LensHealth from "~/features/groups/components/LensHealth.vue";
import { useAnchoredPanel } from "~/shared/ui/useAnchoredPanel";
import GroupsManager from "~/features/groups/components/GroupsManager.vue";
import DeclareSheet from "~/features/rules/components/DeclareSheet.vue";
import { groupPath } from "~/features/navigation/routes";
import { useLensFindings } from "~/features/rules/useLensFindings";
import { useEvidenceStore } from "~/features/reports/evidence.store";
import Icon from "~/shared/ui/Icon.vue";
import { DEFAULT_DIMENSION, useGroupsStore } from "~/features/groups/groups.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useLensStore } from "~/features/groups/lens.store";
import WorkspaceSwitcher from "~/features/workspace/components/WorkspaceSwitcher.vue";
import ScanPanel from "~/features/workspace/components/ScanPanel.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useJavaMetrics } from "~/features/java/useJavaMetrics";
import { usePlatform } from "~/platform/usePlatform";
import { usePanesStore } from "~/features/shell/panes.store";
import { t, intlLocale } from "~/shared/i18n";

const emit = defineEmits<{ (e: "collapse"): void }>();
const panes = usePanesStore();
const ai = useAIStore();
const { isMac } = usePlatform();

const { isJavaProject } = useJavaMetrics();
const dataStore = useDataStore();
const workspaces = useWorkspacesStore();
const hasData = computed(() => dataStore.hasData);
const hasWorkspace = computed(() => workspaces.active !== null);

const componentViews = [
  { label: t("shell.navBar.metrics"), to: "/views/metrics", icon: Table2 },
  { label: t("shell.navBar.hotspots"), to: "/views/components/hotspots", icon: Flame },
  { label: t("shell.navBar.connections"), to: "/views/connections", icon: Network },
  { label: t("shell.navBar.cycles"), to: "/views/components/cycles", icon: RefreshCw },
];
const gitViews = [
  { label: t("shell.navBar.authors"), to: "/views/git/authors", icon: Users },
  { label: t("shell.navBar.activity"), to: "/views/git/activity", icon: Activity },
];
// Units, not classes: gin is 1,327 functions to 204 types and LibreChat
// 3,241 to 294, so a section called Classes shows a fraction of either.
const codeViews = computed(() => [
  ...(hasUnits.value ? [{ label: t("shell.navBar.units"), to: "/views/units", icon: Braces }] : []),
  ...(dataStore.hasView("snippets") ? [{ label: t("shell.navBar.libraries"), to: "/views/libraries", icon: Package }] : []),
]);
// What the workspace builds and ships (engine revision 5 and later), and the
// Rules that need declared rules. The structure checks are findings in Units.
const architectureViews = computed(() => [
  ...(dataStore.hasView("deployables") ? [{ label: t("shell.navBar.deployables"), to: "/views/deployables", icon: Container }] : []),
  ...(hasRules.value ? [{ label: t("shell.navBar.rules"), to: "/views/rules", icon: Scale }] : []),
]);
// The engagement's own working files: what was pinned, and the tools to look further.
const evidenceStore = useEvidenceStore();
watch(() => workspaces.active?.id, (id) => { if (id) void evidenceStore.load(id); }, { immediate: true });
const toolViews = computed(() => [
  { label: t("shell.navBar.evidence"), to: "/views/evidence", icon: Bookmark, count: evidenceStore.count || undefined },
  { label: t("shell.navBar.sqlConsole"), to: "/views/query", icon: Terminal },
]);
// Rules arrived after most snapshots were taken, so the section hides itself
// rather than showing an empty screen — the same way the Java section does.
const hasRules = computed(() => dataStore.hasView("rules"));
// Every language declares units now. The Java-only check stays as the
// fallback for snapshots taken before they existed.
const hasUnits = computed(() => dataStore.hasView("units") || isJavaProject.value);

const groupsStore = useGroupsStore();
const testFiles = computed(() => { let n = 0; for (const r of dataStore.fileRoleIndex.values()) if (r === "test") n++; return n; });
const roleSource = computed(() => dataStore.rolesRecorded ? t("shell.navBar.rolesScanRecordedThem") : t("shell.navBar.rolesPathConventionTests"));
const health = computed(() => {
  const out = new Map<string, ReturnType<ReturnType<typeof useGroupsStore>["lensHealth"]>>();
  for (const d of groupsStore.dimensions) out.set(d, groupsStore.lensHealth(d));
  return out;
});
function reviewNote(dimension: string): string {
  const h = health.value.get(dimension);
  if (!h) return "";
  const parts: string[] = [];
  for (const s of h.silent) parts.push(t("shell.navBar.matchNothingScan", { groupName: s.group.name, value: s.lines.length === 1 ? t("shell.navBar.line") : t("shell.navBar.lines", { linesLength: s.lines.length }) }));
  if (h.overlaps.length) parts.push(t("shell.navBar.twoGroups", { components: t("common.count.component", { count: h.overlaps.length }) }));
  for (const c of h.candidates) parts.push(t("shell.navBar.queryNowMatchesMore", { groupName: c.group.name, extra: c.extra }));
  return parts.join("\n");
}
const scope = useScopeStore();
const buckets = computed(() => groupsStore.groupsByDimension);
const lens = useLensStore();
// The declared architecture of the lens every view looks through, checked
// against the open snapshot: one neutral line, no colour.
const declaring = ref<string | null>(null);
const activeLens = computed(() => lens.active);
const { check: lensCheck, declared: activeDeclared } = useLensFindings(activeLens);
const router = useRouter();
const currentRoute = useRoute();
const isChangesRoute = computed(() => currentRoute.path.startsWith("/views/changes") || currentRoute.path.startsWith("/views/trends"));
const scanCount = computed(() => workspaces.scans.filter((s: any) => s.status === "complete").length);
const dimMenu = ref<string | null>(null);
const dimMenuTrigger = ref<HTMLElement | null>(null);
const dimMenuEl = ref<HTMLElement | null>(null);
const { style: dimMenuStyle } = useAnchoredPanel(dimMenuTrigger, computed(() => dimMenu.value !== null), "left");
function openDimMenu(dimension: string, trigger: HTMLElement) {
  if (dimMenu.value === dimension) { dimMenu.value = null; return; }
  dimMenuTrigger.value = trigger;
  dimMenu.value = dimension;
  void nextTick(() => dimMenuEl.value?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
}
function closeDimMenu() { dimMenu.value = null; dimMenuTrigger.value?.focus(); }
function stepDimMenu(by: 1 | -1) {
  const items = [...(dimMenuEl.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  items[(i + by + items.length) % items.length]?.focus();
}
function dimAction(action: "build" | "declare" | "rename" | "delete") {
  const d = dimMenu.value;
  dimMenu.value = null;
  if (!d) return;
  if (action === "build") buildDimension(d);
  else if (action === "declare") declaring.value = d;
  else if (action === "rename") startRename(d);
  else confirming.value = d;
}
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
  savedNote.value = t("shell.navBar.saved", { dimension: saved.dimension, groups: t("common.count.group", { count: saved.groups }) });
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
    { title: t("shell.navBar.components"), items: componentViews },
    { title: t("shell.navBar.git"), items: gitViews, muted: !hasGitHistory.value, mutedWhy: t("shell.navBar.noGitHistorySnapshot") },
  ] as Array<{ title: string; items: typeof componentViews; muted?: boolean; mutedWhy?: string }>;
  if (codeViews.value.length) list.push({ title: t("shell.navBar.code"), items: codeViews.value });
  if (architectureViews.value.length) list.push({ title: t("shell.navBar.architecture"), items: architectureViews.value });
  list.push({ title: t("shell.navBar.tools"), items: toolViews.value as any });
  return list;
});
</script>
