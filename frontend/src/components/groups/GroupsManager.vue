<template>
  <div class="flex flex-col gap-3">
    <button type="button" class="ui-btn w-full justify-between font-normal" @click="open">
      <span class="flex items-center gap-2">
        <Icon icon="layers" :size="14" class="text-neutral-500"/>
        <span>Groups</span>
      </span>
      <span v-if="groupsStore.groups.length > 0" class="ui-tag">{{ groupsStore.groups.length }}</span>
    </button>

    <!-- The manager: one list of groups on the left, the selected group on the right.
         A group is a set of components and files; a Java class is its file. -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="isOpen" class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6" @keydown.escape="close">
          <div class="absolute inset-0 bg-neutral-950/40" @click="close"/>
          <div class="ui-popover animate-modal-in relative flex h-[min(720px,85vh)] w-full max-w-[980px] flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Groups" @click.stop>
            <header class="flex shrink-0 items-center gap-3 px-5 py-3 hairline-b">
              <Icon icon="layers" :size="16" class="text-neutral-500"/>
              <h2 class="text-base font-semibold text-neutral-900">Groups</h2>
              <span class="text-sm text-neutral-500">{{ groupsStore.groups.length }} group{{ groupsStore.groups.length === 1 ? '' : 's' }} · {{ groupsStore.dimensions.length }} {{ groupsStore.dimensions.length === 1 ? 'lens' : 'lenses' }}</span>
              <div class="ml-auto flex items-center gap-1.5">
                <button type="button" class="ui-btn ui-btn-sm" title="Import a workspace config or groups export" @click="fileInputRef?.click()">
                  <Icon icon="folder" :size="13" class="text-neutral-500"/><span>Import…</span>
                </button>
                <button type="button" class="ui-btn ui-btn-sm" :disabled="groupsStore.groups.length === 0" title="Groups, lenses, author merges and arrangements, as one file" @click="handleExport">
                  <Icon :icon="exportStatus ? 'check' : 'download'" :size="13" :class="exportStatus ? 'text-green-600' : 'text-neutral-500'"/><span>{{ exportStatus || "Export config…" }}</span>
                </button>
                <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden" @change="handleImport"/>
                <span class="ui-toolbar-sep"></span>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Close" @click="close"><Icon icon="x" :size="14"/></button>
              </div>
            </header>
            <!-- What an import holds, and whether it adds to this workspace or replaces it. -->
            <div v-if="pendingImport" class="flex flex-col gap-3 bg-accent-50 px-5 py-3 hairline-b" role="dialog" aria-label="Import workspace config">
              <p class="text-base text-neutral-900">
                <span class="font-medium">{{ pendingImport.name }}</span> holds
                {{ importSummary }}.
              </p>
              <div class="flex items-center gap-2">
                <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" title="Add what is new; keep everything here" @click="applyImport('merge')">Merge</button>
                <button type="button" class="ui-btn ui-btn-sm" title="Replace this workspace's groups, lenses, merges and arrangements with the file's" @click="applyImport('replace')">Replace</button>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="pendingImport = null">Cancel</button>
                <span class="ml-auto text-sm text-neutral-500">Replace removes {{ groupsStore.groups.length }} group{{ groupsStore.groups.length === 1 ? "" : "s" }} here.</span>
              </div>
            </div>

            <p v-if="importError" class="flex items-center gap-2 px-5 py-2 text-sm text-red-700 hairline-b" role="alert">
              <Icon icon="alert" :size="13"/><span>{{ importError }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="importError = null">Dismiss</button>
            </p>
            <!-- What the selected group's lens is worth right now. Every
                 number here is drift that would otherwise surface months
                 later as a map quietly missing components. -->
            <div v-if="selected" class="flex items-center gap-2 px-5 py-2 hairline-b">
              <span class="ui-label shrink-0">{{ selected.dimension }}</span>
              <LensHealth :lens="selected.dimension" @open-group="select($event.id)" @review="select($event.id)"/>
            </div>

            <div class="flex min-h-0 grow">
              <!-- ── Group list ─────────────────────────── -->
              <aside class="flex w-[300px] shrink-0 flex-col bg-ground hairline-r">
                <div class="flex items-center gap-2 p-3 hairline-b">
                  <label class="relative flex min-w-0 grow items-center">
                    <Icon icon="search" :size="13" class="pointer-events-none absolute left-2 text-neutral-400"/>
                    <input v-model="groupSearch" type="search" class="ui-input ui-input-sm w-full pl-7" placeholder="Find a group" aria-label="Find a group"/>
                  </label>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" @click="startCreate">
                    <Icon icon="plus" :size="13"/><span>New</span>
                  </button>
                </div>

                <div class="min-h-0 grow overflow-y-auto py-2">
                  <div v-if="groupsStore.groups.length === 0" class="flex flex-col gap-1 px-4 py-8 text-center">
                    <span class="text-sm font-medium text-neutral-800">No groups yet</span>
                    <span class="text-sm text-neutral-500">Select components, files or classes in any view and press ⌘G, or create one here.</span>
                  </div>
                  <div v-else-if="filteredBuckets.length === 0" class="px-4 py-8 text-center text-sm text-neutral-500">No group matches “{{ groupSearch }}”.</div>
                  <template v-for="bucket in filteredBuckets" :key="bucket.dimension">
                    <div class="ui-section-title px-4 pb-1 pt-2">{{ bucket.dimension }}</div>
                    <button
                      v-for="g in bucket.groups"
                      :key="g.id"
                      type="button"
                      class="group flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors hover:bg-neutral-100"
                      :class="{ 'bg-neutral-100 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]': selectedId === g.id }"
                      @click="select(g.id)"
                    >
                      <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
                      <span class="min-w-0 grow truncate text-sm font-medium text-neutral-900">{{ g.name }}</span>
                      <span class="shrink-0 font-mono text-xs text-neutral-400">{{ summary(g) }}</span>
                    </button>
                  </template>
                </div>
              </aside>

              <!-- ── Detail ───────────────────────────────── -->
              <section class="flex min-w-0 grow flex-col overflow-hidden">
                <!-- New group form -->
                <form v-if="creating" class="flex flex-col gap-4 p-6" @submit.prevent="confirmCreate">
                  <h3 class="text-base font-semibold text-neutral-900">New group</h3>
                  <div class="flex flex-wrap items-end gap-3">
                    <label class="flex flex-col gap-1">
                      <span class="ui-label">Name</span>
                      <input ref="createNameRef" v-model="newName" type="text" class="ui-input w-64" placeholder="Audits, Controllers, Billing…" required/>
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="ui-label">Lens</span>
                      <input v-model="newDimension" type="text" class="ui-input w-44" list="groups-dimensions" placeholder="Domain, Layer…"/>
                    </label>
                    <datalist id="groups-dimensions"><option v-for="d in groupsStore.dimensions" :key="d" :value="d"/></datalist>
                  </div>
                  <div class="flex items-center gap-2">
                    <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!newName.trim()">Create</button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="creating = false">Cancel</button>
                    <span class="text-sm text-neutral-500">Members are added next, or from any view's selection.</span>
                  </div>
                </form>

                <!-- Nothing selected -->
                <div v-else-if="!selected" class="flex grow flex-col items-center justify-center gap-2 p-8 text-center">
                  <Icon icon="layers" :size="28" class="text-neutral-300"/>
                  <span class="text-sm font-medium text-neutral-800">Pick a group to edit it</span>
                  <span class="max-w-sm text-sm text-neutral-500">A group is any set of components and files. Whole components follow the code; single files pin exactly what you chose.</span>
                </div>

                <!-- Selected group -->
                <template v-else>
                  <div class="flex shrink-0 flex-col gap-3 px-6 pb-4 pt-5 hairline-b">
                    <div class="flex items-center gap-3">
                      <span class="h-3.5 w-3.5 shrink-0 rounded-full" :style="{ backgroundColor: selected.color }"></span>
                      <input
                        v-model="editName"
                        type="text"
                        class="ui-input min-w-0 grow text-base font-semibold"
                        aria-label="Group name"
                        @blur="saveName"
                        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                      />
                      <button type="button" class="ui-btn ui-btn-sm" :title="`Edit the ${selected.dimension} lens in the builder`" @click="editInBuilder(selected.dimension)">
                        <Icon icon="pencil" :size="13" class="text-neutral-500"/><span>Edit in builder</span>
                      </button>
                      <button type="button" class="ui-btn ui-btn-sm" :class="{ 'is-active': scope.groupIds.includes(selected.id) }" :aria-pressed="scope.groupIds.includes(selected.id)" title="Filter every view to this group" @click="scope.toggleGroup(selected.id)">
                        <Icon icon="scale" :size="13" class="text-neutral-500"/><span>{{ scope.groupIds.includes(selected.id) ? 'Scoped' : 'Scope' }}</span>
                      </button>
                      <button v-if="!deleteConfirming" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Delete this group" @click="deleteConfirming = true">
                        <Icon icon="trash" :size="13"/>
                      </button>
                      <template v-else>
                        <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirmDelete">Delete {{ selected.name }}</button>
                        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="deleteConfirming = false">Keep</button>
                      </template>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label class="flex items-center gap-2">
                        <span class="ui-label">Lens</span>
                        <input :value="selected.dimension" type="text" class="ui-input ui-input-sm w-40" list="groups-dimensions" aria-label="Lens" @change="saveDimension(($event.target as HTMLInputElement).value)"/>
                        <datalist id="groups-dimensions"><option v-for="d in groupsStore.dimensions" :key="d" :value="d"/></datalist>
                      </label>
                      <div class="flex items-center gap-2">
                        <span class="ui-label">Colour</span>
                        <div class="flex items-center gap-1" role="radiogroup" aria-label="Colour">
                          <button
                            v-for="c in GROUP_COLOR_PALETTE"
                            :key="c"
                            type="button"
                            role="radio"
                            :aria-checked="selected.color === c"
                            :aria-label="c"
                            class="h-4 w-4 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1"
                            :class="selected.color === c ? 'ring-2 ring-neutral-900 ring-offset-1 ring-offset-surface' : ''"
                            :style="{ backgroundColor: c }"
                            @click="groupsStore.updateGroup(selected.id, { color: c })"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="flex shrink-0 flex-col gap-2 px-6 py-3 hairline-b">
                    <GroupDefinition
                      :query="selected.query"
                      :mode="selected.mode ?? 'fixed'"
                      :size="selected.members.length"
                      :candidates="watchlist?.extra ?? null"
                      :describe="describe"
                      @query="saveQuery"
                      @mode="setMode"
                      @accept="acceptCandidates"
                      @unwatch="groupsStore.clearProvenance(selected.id)"
                    />
                  </div>

                  <div class="flex min-h-0 grow">
                    <!-- Members as a tree: component, then the files that put it there -->
                    <div class="flex min-w-0 grow flex-col">
                      <div class="flex shrink-0 items-center gap-2 px-6 pb-2 pt-3">
                        <h3 class="ui-section-title">Members</h3>
                        <span class="font-mono text-xs text-neutral-400">{{ summary(selected) }}</span>
                        <label v-if="tree.length > 6" class="relative ml-auto flex items-center">
                          <Icon icon="search" :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
                          <input v-model="memberSearch" type="search" class="ui-input ui-input-sm w-44 pl-6" placeholder="Filter members" aria-label="Filter members"/>
                        </label>
                      </div>
                      <div class="min-h-0 grow overflow-y-auto px-4 pb-4">
                        <div v-if="tree.length === 0" class="flex flex-col gap-1 px-2 py-8 text-center">
                          <span class="text-sm font-medium text-neutral-800">Empty group</span>
                          <span class="text-sm text-neutral-500">Edit it in the builder, or select things in any view and choose “Add to”.</span>
                        </div>
                        <ul v-else class="flex flex-col">
                          <li v-for="row in visibleTree" :key="row.key" class="flex flex-col">
                            <div class="group flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-neutral-50">
                              <Icon :icon="row.kind === 'component' ? 'component' : 'file-code'" :size="13" class="shrink-0 text-neutral-400"/>
                              <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="row.name">{{ row.label }}</span>
                              <span class="shrink-0 font-mono text-xs text-neutral-400">{{ row.note }}</span>
                            </div>
                            <ul v-if="row.files.length" class="ml-4 flex flex-col hairline-l">
                              <li v-for="f in row.files" :key="f" class="group flex items-center gap-2 rounded-sm py-0.5 pl-3 pr-2 hover:bg-neutral-50">
                                <Icon icon="file-code" :size="12" class="shrink-0 text-neutral-400"/>
                                <span class="min-w-0 truncate font-mono text-sm text-neutral-700" :title="f">{{ fileLabel(f) }}</span>
                              </li>
                            </ul>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </template>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { FILTERS, saveText } from '~/utils/files'
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '~/components/ui/common/Icon.vue'
import LensHealth from '~/components/groups/LensHealth.vue'
import GroupDefinition from '~/components/groups/GroupDefinition.vue'
import { DEFAULT_DIMENSION, GROUP_COLOR_PALETTE, componentMembers, fileMembers, hasMember, units, useGroupsStore, type GroupMode, type SavedGroup, type UnitKind } from '~/stores/groups'
import { generalise, parseQuery, runQuery } from '~/utils/query'
import { detectSeparator } from '~/utils/studio'
import { useDataStore } from '~/stores/data'
import { useScopeStore } from '~/stores/scope'
import { useAuthorsStore } from '~/stores/authors'
import { useStateStore } from '~/stores/state'
import { useWorkspacesStore } from '~/stores/workspaces'
import { buildConfig, countsOf, isLayoutKey, parseConfig, type WorkspaceConfig } from '~/utils/workspaceConfig'

const groupsStore = useGroupsStore()
const dataStore = useDataStore()
const scope = useScopeStore()

const isOpen = ref(false)
const selectedId = ref<string | null>(null)
const selected = computed<SavedGroup | null>(() => (selectedId.value ? groupsStore.getGroupById(selectedId.value) ?? null : null))
const groupSearch = ref('')
const memberSearch = ref('')
const editName = ref('')
const deleteConfirming = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)
const authorsStore = useAuthorsStore()
const stateStore = useStateStore()
const workspaces = useWorkspacesStore()

// ── Open / close ───────────────────────────────────────
function open() {
  isOpen.value = true
  // A `where` clause asks the snapshot for numbers. Loading them here means
  // the preview under the editor is right on the first keystroke rather than
  // silently matching nothing until they arrive.
  void groupsStore.ensureMetrics()
  if (!selectedId.value && groupsStore.groups.length) select(groupsStore.groups[0].id)
}
function close() {
  isOpen.value = false
  creating.value = false
  deleteConfirming.value = false
  groupSearch.value = ''
  memberSearch.value = ''
}
// ── Defining a group by a query ─────────────────────────────────────────

const universe = computed(() => Array.from(dataStore.componentFilesIndex.keys()))

/** What a fixed group's own query would catch now, if it still has one. */
const watchlist = computed(() => {
  const g = selected.value
  if (!g || g.mode !== 'fixed' || !g.foundBy) return null
  const held = new Set(componentMembers(g))
  const r = runQuery(parseQuery(g.foundBy.query), {
    components: universe.value,
    files: Array.from(dataStore.fileComponentIndex.keys()),
    componentSep: detectSeparator(universe.value),
  })
  const extra = r.components.filter(id => !held.has(id))
  return extra.length ? { extra: extra.length, ids: extra } : null
})

/** The shortest patterns that say exactly what it already holds. */
function describe(): string | null {
  const g = selected.value
  if (!g) return null
  const members = componentMembers(g)
  if (!members.length) return null
  const out = generalise(members, universe.value, detectSeparator(universe.value))
  // Falling back to the names themselves is still a query, and still reports
  // when one of them stops matching.
  return out.text || members.join('\n')
}

function saveQuery(text: string) {
  const g = selected.value
  if (!g) return
  groupsStore.setQuery(g.id, text, g.mode === 'fixed' ? 'fixed' : 'live')
}

function setMode(mode: GroupMode) {
  const g = selected.value
  if (!g?.query) return
  groupsStore.setQuery(g.id, g.query, mode)
}

/** Take what the watchlist found. Offered, never applied on its own. */
function acceptCandidates() {
  const g = selected.value
  if (!g || !watchlist.value) return
  groupsStore.addMembersToGroup(g.id, units('component', watchlist.value.ids))
}

function select(id: string) {
  selectedId.value = id
  creating.value = false
  deleteConfirming.value = false
  memberSearch.value = ''
  editName.value = groupsStore.getGroupById(id)?.name ?? ''
}
watch(() => selected.value?.name, (name) => { if (name !== undefined) editName.value = name })
watch(() => groupsStore.groups.length, () => { if (selectedId.value && !groupsStore.getGroupById(selectedId.value)) selectedId.value = null })

// ── List ───────────────────────────────────────────────
const filteredBuckets = computed(() => {
  const q = groupSearch.value.trim().toLowerCase()
  if (!q) return groupsStore.groupsByDimension
  return groupsStore.groupsByDimension
    .map(b => ({ dimension: b.dimension, groups: b.groups.filter(g => g.name.toLowerCase().includes(q) || b.dimension.toLowerCase().includes(q)) }))
    .filter(b => b.groups.length > 0)
})

/** "3 components · 12 files": whole components, then files listed on their own. */
function summary(g: SavedGroup): string {
  const c = componentMembers(g).length
  const f = fileMembers(g).length
  const parts: string[] = []
  if (c) parts.push(`${c} component${c === 1 ? '' : 's'}`)
  if (f) parts.push(`${f} file${f === 1 ? '' : 's'}`)
  return parts.join(' · ') || 'empty'
}

// ── Detail edits ──────────────────────────────────────
function saveName() {
  if (!selected.value) return
  const name = editName.value.trim()
  if (name && name !== selected.value.name) groupsStore.updateGroup(selected.value.id, { name })
  else editName.value = selected.value.name
}
function saveDimension(value: string) {
  if (!selected.value) return
  const dimension = value.trim() || DEFAULT_DIMENSION
  if (dimension !== selected.value.dimension) groupsStore.updateGroup(selected.value.id, { dimension })
}
function confirmDelete() {
  if (!selected.value) return
  const id = selected.value.id
  scope.removeGroup(id)
  groupsStore.deleteGroup(id)
  selectedId.value = null
  deleteConfirming.value = false
}

// ── Members tree ──────────────────────────────────────
interface TreeRow { key: string; kind: UnitKind; name: string; label: string; note: string; files: string[] }

function fileLabel(path: string): string {
  return path.split('/').pop() ?? path
}

const tree = computed<TreeRow[]>(() => {
  const g = selected.value
  if (!g) return []
  const rows: TreeRow[] = []
  const whole = new Set(componentMembers(g))
  const byComponent = new Map<string, string[]>()
  const loose: string[] = []
  for (const f of fileMembers(g)) {
    const c = dataStore.fileComponentIndex.get(f)
    if (!c) { loose.push(f); continue }
    byComponent.set(c, [...(byComponent.get(c) ?? []), f])
  }
  const names = new Set<string>([...whole, ...byComponent.keys()])
  for (const c of Array.from(names).sort()) {
    const total = (dataStore.componentFilesIndex.get(c) ?? []).length
    if (whole.has(c)) {
      rows.push({ key: 'c:' + c, kind: 'component', name: c, label: c, note: total ? `all ${total} files` : 'whole component', files: [] })
    } else {
      const files = (byComponent.get(c) ?? []).sort()
      rows.push({ key: 'p:' + c, kind: 'component', name: c, label: c, note: `${files.length} of ${total || '?'} files`, files })
    }
  }
  for (const f of loose.sort()) rows.push({ key: 'f:' + f, kind: 'file', name: f, label: fileLabel(f), note: 'no component', files: [] })
  return rows
})

const visibleTree = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return tree.value
  return tree.value
    .map(r => ({ ...r, files: r.files.filter(f => f.toLowerCase().includes(q)) }))
    .filter(r => r.name.toLowerCase().includes(q) || r.files.length > 0)
})

const router = useRouter()
function editInBuilder(dimension: string) {
  close()
  router.push({ path: "/views/dimensions", query: { build: dimension } })
}


// ── Create ────────────────────────────────────────────
const creating = ref(false)
const newName = ref('')
const newDimension = ref(DEFAULT_DIMENSION)
const createNameRef = ref<HTMLInputElement | null>(null)

function startCreate() {
  creating.value = true
  deleteConfirming.value = false
  newName.value = ''
  newDimension.value = selected.value?.dimension ?? DEFAULT_DIMENSION
  nextTick(() => createNameRef.value?.focus())
}
function confirmCreate() {
  const name = newName.value.trim()
  if (!name) return
  const created = groupsStore.createGroup(name, [], newDimension.value)
  creating.value = false
  select(created.id)
}

// ── Import / Export ───────────────────────────────────
const pendingImport = ref<{ name: string; config: WorkspaceConfig } | null>(null)
const importSummary = computed(() => {
  if (!pendingImport.value) return ""
  const c = countsOf(pendingImport.value.config)
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`
  return [n(c.groups, "group", "groups"), n(c.lenses, "lens", "lenses"), n(c.aliases, "author merge", "author merges"), n(c.layouts, "arrangement", "arrangements"), ...(c.queries ? [n(c.queries, "saved query", "saved queries")] : [])].join(", ")
})

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      pendingImport.value = { name: file.name, config: parseConfig(reader.result as string) }
      importError.value = null
    } catch (e) {
      importError.value = `${e instanceof Error ? e.message : String(e)} Nothing was imported.`
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function applyImport(mode: 'merge' | 'replace') {
  const p = pendingImport.value
  if (!p) return
  const c = p.config
  groupsStore.importGroups(JSON.stringify({ version: 4, groups: c.groups, dimensions: c.dimensions }), mode)
  authorsStore.setAliases(mode === 'replace' ? c.authorAliases : { ...authorsStore.aliases, ...c.authorAliases })
  if (mode === 'replace') for (const k of Object.keys(stateStore.values)) if (isLayoutKey(k)) stateStore.set(k, null)
  for (const [k, v] of Object.entries(c.layouts)) stateStore.set(k, v)
  if (c.savedQueries.length) stateStore.set('queries.saved', mode === 'replace' ? c.savedQueries : [...(stateStore.get<unknown[]>('queries.saved', []) ?? []), ...c.savedQueries])
  pendingImport.value = null
}

// A Blob-and-anchor download does nothing in the desktop build; the native
// save dialog does.
const exportStatus = ref("")
async function handleExport() {
  try {
    const cfg = buildConfig(groupsStore.groups, groupsStore.dimensionRecords, authorsStore.aliases, stateStore.values)
    const slug = (workspaces.active?.name ?? 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const path = await saveText(`${slug}.archstats.json`, JSON.stringify(cfg, null, 2), [FILTERS.json], 'Export workspace config')
    if (path) { exportStatus.value = "Saved"; setTimeout(() => { exportStatus.value = "" }, 1600) }
  } catch (e) {
    importError.value = `Could not save the config: ${e instanceof Error ? e.message : String(e)}`
  }
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.98) translateY(4px); }
  to { opacity: 1; transform: none; }
}
.animate-modal-in {
  animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
