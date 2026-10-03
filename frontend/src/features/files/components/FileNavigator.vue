<template>
  <nav class="flex w-[300px] shrink-0 flex-col bg-ground hairline-r" :aria-label="t('files.fileNavigator.files')">
    <div class="shrink-0 px-2 pb-1 pt-2">
      <label class="relative flex items-center">
        <Icon icon="search" :size="13" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input
          ref="searchRef"
          v-model="query"
          type="search"
          class="ui-input ui-input-sm w-full pl-7 pr-7"
          :placeholder="t('files.fileNavigator.goToFile')"
          :aria-label="t('files.fileNavigator.goToFile')"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="selected && emit('open', selected)"
          @keydown.esc="query = ''"
        />
        <kbd v-if="!query" class="key pointer-events-none absolute right-1.5" :title="t('files.fileNavigator.pressT')">t</kbd>
      </label>
    </div>

    <!-- Files: the heading says how they are arranged; one menu changes it. -->
    <div class="flex h-8 shrink-0 items-center gap-1.5 pl-3 pr-1.5">
      <span class="overline">{{ t('files.fileNavigator.files') }}</span>
      <span class="font-mono text-xs text-neutral-400">{{ query ? t('files.fileNavigator.nOfM', { n: formatNumber(rows.length), m: formatNumber(files.length) }) : formatNumber(files.length) }}</span>
      <span class="min-w-0 truncate text-xs text-neutral-400">{{ arrangement }}</span>
      <button ref="optionsRef" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto shrink-0 gap-0.5 px-1.5" :aria-expanded="menuOpen" :title="t('files.fileNavigator.arrange')" :aria-label="t('files.fileNavigator.arrange')" @click.stop="menuOpen = !menuOpen">
        <Icon :icon="mode === 'tree' ? 'list-tree' : 'list-ordered'" :size="13" class="text-neutral-600"/>
        <Icon icon="chevron-down" :size="11" class="text-neutral-400"/>
      </button>
    </div>
    <Teleport to="body">
      <div v-if="menuOpen" ref="menuRef" class="ui-menu animate-in w-[220px]" :style="menuStyle" @click.stop>
        <div class="menu-title">{{ t('files.fileNavigator.arrange') }}</div>
        <button type="button" class="ui-menu-item" :class="{ 'is-active': mode === 'tree' }" @click="choose('tree')">
          <Icon icon="list-tree" :size="13" class="text-neutral-500"/><span class="grow">{{ t('files.fileNavigator.tree') }}</span><Icon v-if="mode === 'tree'" icon="check" :size="13"/>
        </button>
        <button v-for="r in rankings" :key="r.id" type="button" class="ui-menu-item" :class="{ 'is-active': mode === 'ranked' && rank.id === r.id }" @click="choose('ranked', r.id)">
          <Icon icon="list-ordered" :size="13" class="text-neutral-500"/><span class="grow">{{ t('files.fileNavigator.rankedBy', { metric: r.label }) }}</span><Icon v-if="mode === 'ranked' && rank.id === r.id" icon="check" :size="13"/>
        </button>
        <template v-if="roles.length">
          <div class="menu-title mt-1">{{ t('files.fileNavigator.show') }}</div>
          <button type="button" class="ui-menu-item" :class="{ 'is-active': !role }" @click="emit('update:role', null); menuOpen = false">
            <span class="grow">{{ t('files.fileNavigator.allRoles') }}</span><Icon v-if="!role" icon="check" :size="13"/>
          </button>
          <button v-for="r in roles" :key="r" type="button" class="ui-menu-item" :class="{ 'is-active': role === r }" @click="emit('update:role', r); menuOpen = false">
            <span class="grow">{{ r }}</span><Icon v-if="role === r" icon="check" :size="13"/>
          </button>
        </template>
      </div>
    </Teleport>

    <div v-if="tree.root && mode === 'tree' && !query" class="flex h-6 shrink-0 items-center gap-1.5 pl-3 pr-2" :title="tree.root">
      <Icon icon="folder" :size="13" class="shrink-0 text-neutral-400"/>
      <span class="root-path min-w-0 grow truncate font-mono text-xs text-neutral-500"><bdi>{{ tree.root }}/</bdi></span>
      <slot name="root-actions"/>
    </div>

    <div ref="listRef" class="min-h-0 grow overflow-y-auto pb-2" role="listbox" :aria-label="t('files.fileNavigator.files')" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)">
      <EmptyState v-if="!rows.length" icon="search" :title="t('files.fileNavigator.noMatch')" :text="t('files.fileNavigator.noMatchText', { query, files: formatNumber(files.length) })"/>
      <template v-for="row in rows" :key="row.key">
        <button
          v-if="row.kind === 'folder'"
          type="button"
          class="nav-row"
          :style="{ paddingLeft: `${10 + row.depth * 12}px` }"
          :aria-expanded="row.open"
          @click="toggle(row.key)"
        >
          <Icon :icon="row.open ? 'chevron-down' : 'chevron-right'" :size="12" class="shrink-0 text-neutral-400"/>
          <span class="min-w-0 grow truncate font-mono text-sm text-neutral-700">{{ row.label }}</span>
          <span v-if="!row.open" class="shrink-0 font-mono text-xs text-neutral-400">{{ row.fileCount }}</span>
        </button>
        <button
          v-else
          type="button"
          role="option"
          class="nav-row"
          :class="{ 'is-active': row.key === selected }"
          :aria-selected="row.key === selected"
          :data-file="row.key"
          :style="{ paddingLeft: `${10 + row.depth * 12 + (mode === 'tree' && !query ? 4 : 0)}px` }"
          :title="row.key"
          @click="emit('update:selected', row.key)"
          @dblclick="emit('open', row.key)"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="row.file?.health === null || row.file?.health === undefined ? 'bg-neutral-300' : levelDotClass(healthLevel(row.file.health))" :title="row.file?.health === null || row.file?.health === undefined ? undefined : t('files.fileNavigator.health', { health: formatHealth(row.file.health) })"></span>
          <span class="min-w-0 grow truncate font-mono text-sm" :class="row.file?.test ? 'text-neutral-500' : 'text-neutral-900'">
            <template v-for="(part, i) in nameParts(row)" :key="i"><span :class="part.hit ? 'match' : ''">{{ part.text }}</span></template>
          </span>
          <span v-if="row.dir" class="max-w-[96px] shrink-0 truncate font-mono text-xs text-neutral-400">{{ row.dir }}</span>
          <span v-if="mode === 'ranked' && !query && row.file" class="w-8 shrink-0 text-right font-mono text-xs tabular-nums" :class="rank.id === 'health' ? levelTextClass(healthLevel(row.file.health)) : 'text-neutral-500'">{{ rank.format(row.file) }}</span>
        </button>
      </template>
    </div>

    <slot name="below"/>
  </nav>
</template>

<script setup lang="ts">
// The files of a component the way GitHub shows a repository: a tree under
// the folder they share, folders first, single-child chains collapsed, and a
// Go to file search that ranks by the file name. Ranked turns the same files
// into one list, worst first by the reading chosen. Click selects;
// double-click or Enter opens the file. What sits below (the selected file's
// neighbours) comes in through the slot.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { buildFileTree, foldersHolding, folderKeys, fuzzyMatch, visibleRows, type TreeRow } from "~/features/files/fileTree"
import { healthLevel, levelDotClass, levelTextClass, formatHealth } from "~/features/metrics/useHealth"
import { useAnchoredPanel } from "~/shared/ui/useAnchoredPanel"
import { formatNumber } from "~/shared/format"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

export interface NavFile {
  name: string
  health: number | null
  test?: boolean
}

export interface NavRanking<F extends NavFile = NavFile> {
  id: string
  label: string
  /** The value a ranked row shows. */
  format: (file: F) => string
  /** Worst or most first. */
  compare: (a: F, b: F) => number
}

const props = withDefaults(defineProps<{
  files: NavFile[]
  selected: string | null
  rankings: NavRanking<any>[]
  roles?: string[]
  role?: string | null
}>(), { roles: () => [], role: null })
const emit = defineEmits<{ "update:selected": [name: string]; open: [name: string]; "update:role": [role: string | null] }>()

const MODE_KEY = "archstats.fileNavigator.mode"
const RANK_KEY = "archstats.fileNavigator.rank"
function recall(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* a remembered preference, nothing more */ }
}

const mode = ref<"tree" | "ranked">(recall(MODE_KEY, "tree") === "ranked" ? "ranked" : "tree")
watch(mode, m => remember(MODE_KEY, m))
const rankId = ref(recall(RANK_KEY, "health"))
const rank = computed(() => props.rankings.find(r => r.id === rankId.value) ?? props.rankings[0])

const arrangement = computed(() => [
  mode.value === "ranked" && rank.value ? t("files.fileNavigator.byMetric", { metric: rank.value.label.toLocaleLowerCase() }) : "",
  props.role ?? "",
].filter(Boolean).join(" · "))

// ── The arrange menu ────────────────────────────────────────────
const menuOpen = ref(false)
const optionsRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const { style: menuStyle } = useAnchoredPanel(optionsRef, menuOpen, "right")
function choose(m: "tree" | "ranked", id?: string) {
  mode.value = m
  if (id) { rankId.value = id; remember(RANK_KEY, id) }
  menuOpen.value = false
}
function closeMenu(e: MouseEvent) {
  if (menuOpen.value && !menuRef.value?.contains(e.target as Node)) menuOpen.value = false
}

const query = ref("")
const searchRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const tree = computed(() => buildFileTree(props.files))
// Small components open fully; large ones open only the way to the selection.
const openFolders = ref(new Set<string>())
watch(tree, tr => {
  openFolders.value = new Set(props.files.length <= 200 ? folderKeys(tr.nodes) : (props.selected ? foldersHolding(tr.nodes, props.selected) ?? [] : []))
}, { immediate: true })
watch(() => props.selected, name => {
  if (!name) return
  const trail = foldersHolding(tree.value.nodes, name) ?? []
  if (trail.some(k => !openFolders.value.has(k))) openFolders.value = new Set([...openFolders.value, ...trail])
  nextTick(() => listRef.value?.querySelector<HTMLElement>(`[data-file="${CSS.escape(name)}"]`)?.scrollIntoView({ block: "nearest" }))
})
function toggle(key: string) {
  const next = new Set(openFolders.value)
  if (next.has(key)) next.delete(key); else next.add(key)
  openFolders.value = next
}

type Row = TreeRow<NavFile> & { dir?: string; hits?: number[] }

const rows = computed<Row[]>(() => {
  const root = tree.value.root
  const relative = (name: string) => (root ? name.slice(root.length + 1) : name)
  const fileRow = (f: NavFile, hits?: number[]): Row => {
    const rel = relative(f.name)
    const cut = rel.lastIndexOf("/") + 1
    const dir = rel.slice(0, Math.max(0, cut - 1))
    return { kind: "file", key: f.name, label: rel.slice(cut), depth: 0, open: false, fileCount: 1, file: f, dir: dir.split("/").slice(-1)[0], hits: hits?.filter(i => i >= cut).map(i => i - cut) }
  }
  const q = query.value.trim()
  if (q) {
    return props.files
      .map(f => ({ f, m: fuzzyMatch(q, relative(f.name)) }))
      .filter(x => x.m)
      .sort((a, b) => b.m!.score - a.m!.score)
      .slice(0, 200)
      .map(({ f, m }) => fileRow(f, m!.indices))
  }
  if (mode.value === "ranked" && rank.value) {
    const r = rank.value
    return [...props.files].sort((a, b) => r.compare(a, b) || a.name.localeCompare(b.name)).map(f => fileRow(f))
  }
  return visibleRows<NavFile>(tree.value.nodes, k => openFolders.value.has(k))
})

function nameParts(row: Row): Array<{ text: string; hit: boolean }> {
  if (!row.hits?.length) return [{ text: row.label, hit: false }]
  const hits = new Set(row.hits)
  const parts: Array<{ text: string; hit: boolean }> = []
  for (let i = 0; i < row.label.length; i++) {
    const hit = hits.has(i)
    if (parts.length && parts[parts.length - 1].hit === hit) parts[parts.length - 1].text += row.label[i]
    else parts.push({ text: row.label[i], hit })
  }
  return parts
}

// Arrow keys walk the files on screen, from the search box or the list.
function move(step: number) {
  const files = rows.value.filter(r => r.kind === "file")
  if (!files.length) return
  const at = files.findIndex(r => r.key === props.selected)
  const next = files[Math.min(files.length - 1, Math.max(0, at === -1 ? 0 : at + step))]
  emit("update:selected", next.key)
}

// The first match is selected as the query narrows, as in a finder.
watch(query, q => {
  const first = rows.value.find(r => r.kind === "file")
  if (q.trim() && first && !rows.value.some(r => r.key === props.selected)) emit("update:selected", first.key)
})

// t goes to the file search, as on GitHub.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && menuOpen.value) { menuOpen.value = false; return }
  if (e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return
  const el = e.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  e.preventDefault()
  searchRef.value?.focus()
  searchRef.value?.select()
}
onMounted(() => {
  window.addEventListener("keydown", onKey)
  document.addEventListener("click", closeMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey)
  document.removeEventListener("click", closeMenu)
})
</script>

<style scoped>
.overline { flex: none; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(var(--c-neutral-600)); }
.key { display: inline-flex; height: 1rem; min-width: 1rem; align-items: center; justify-content: center; padding: 0 0.25rem; border-radius: 0.1875rem; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.6875rem; line-height: 1; color: rgb(var(--c-neutral-500)); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-300)); }
.nav-row { display: flex; width: 100%; align-items: center; gap: 0.5rem; height: 1.5rem; padding-right: 0.75rem; text-align: left; }
.nav-row:hover { background: rgb(var(--c-neutral-100)); }
.nav-row:focus-visible { outline: 2px solid rgb(var(--c-accent-500)); outline-offset: -2px; }
.nav-row.is-active { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.match { color: rgb(var(--c-neutral-900)); font-weight: 600; text-decoration: underline; text-decoration-color: rgb(var(--c-accent-500)); text-underline-offset: 2px; }
.menu-title { padding: 0.25rem 0.5rem; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(var(--c-neutral-500)); }
/* A long shared root keeps its end, the part that tells folders apart. */
.root-path { direction: rtl; text-align: left; }
</style>
