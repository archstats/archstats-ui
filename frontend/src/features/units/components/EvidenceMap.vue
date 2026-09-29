<template>
  <!-- Where a finding lives: the folder map painted by it, and beside it the
       files it names. Reach paints every production file by whether an entry
       point gets to it; repeated names paint the files that declare one and
       tie a picked name's files together. A click on a file or a row puts it
       in the tray; a folder narrows the list to what sits under it. -->
  <div class="flex min-h-0 min-w-0 flex-1">
    <section class="flex min-w-0 flex-1 flex-col" :aria-label="mode === 'reach' ? 'What the entry points reach' : 'Names written twice'">
      <div class="flex h-9 shrink-0 items-center gap-1 px-3 hairline-b">
        <template v-if="mode === 'reach'">
          <button
            v-for="st in STATES" :key="st.id" type="button"
            class="flex h-6 items-center gap-1.5 rounded px-2 text-xs"
            :class="only === st.id ? 'bg-accent-50 text-neutral-900 ring-1 ring-inset ring-accent-300' : 'text-neutral-600 hover:bg-neutral-100'"
            :aria-pressed="only === st.id" :title="st.title"
            @click="only = only === st.id ? null : st.id"
          >
            <span class="h-2 w-2 rounded-sm" :style="{ background: st.color }"/>{{ st.label }}
            <span class="font-mono text-neutral-500">{{ fmt(counts[st.id]) }}</span>
          </button>
        </template>
        <template v-else>
          <span class="flex items-center gap-1.5 px-2 text-xs text-neutral-600"><span class="h-2 w-2 rounded-sm" :style="{ background: DUP_NAME }"/>Declares a name another file declares</span>
          <span class="flex items-center gap-1.5 px-2 text-xs text-neutral-600"><span class="h-2 w-2 rounded-sm" :style="{ background: DUP_FILE }"/>Shares its file name</span>
        </template>
        <span v-if="folder" class="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-neutral-600">
          <span class="min-w-0 truncate font-mono" :title="folder">{{ folder }}</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Show every folder" @click="folder = null"><Icon icon="x" :size="12"/></button>
        </span>
      </div>
      <div class="min-h-0 flex-1 p-2">
        <FolderMap
          :files="files" :lines="lines" :paint="paint" :highlight="highlight" :selected="folder" :echo="mode === 'dupes' ? picked?.files ?? null : null"
          :describe="describe"
          :aria-label="mode === 'reach' ? 'Production files by folder, coloured by whether an entry point reaches them' : 'Production files by folder, marking names declared in more than one file'"
          @select="onMapSelect" @open="f => emit('open', f)"
        />
      </div>
    </section>

    <aside class="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto bg-ground p-4 hairline-l min-[1500px]:w-[420px]" aria-label="The files it names">
      <template v-if="mode === 'reach'">
        <FileGroups title="Reached by nothing" :files="under(reach.unreachable)" :lines="lines" :tray="traySet" @toggle="f => emit('toggle', f)" @take="fs => emit('tray', fs)" @open="f => emit('open', f)" @hover="hover = $event"/>
        <FileGroups title="Reached only by tests" :files="under(reach.testOnly)" :lines="lines" :tray="traySet" @toggle="f => emit('toggle', f)" @take="fs => emit('tray', fs)" @open="f => emit('open', f)" @hover="hover = $event"/>
        <details class="group">
          <summary class="flex h-7 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900">
            <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform group-open:rotate-90"/>
            Entry points <span class="font-mono text-xs text-neutral-500">{{ fmt(reach.roots.size) }}</span>
          </summary>
          <ul class="mt-1 flex flex-col gap-1 text-sm text-neutral-700">
            <li v-for="r in reach.byRule" :key="r.rule.id" class="flex gap-3"><span class="w-10 shrink-0 text-right font-mono text-xs text-neutral-500">{{ fmt(r.files) }}</span><span>{{ r.rule.label }}</span></li>
            <li v-if="!reach.byRule.length" class="text-neutral-500">None found. Add the files your framework calls below.</li>
          </ul>
          <label class="ui-label mt-3 block" for="extra-roots">More entry points, one glob per line</label>
          <textarea id="extra-roots" v-model="rootsDraft" rows="3" class="ui-input mt-1 h-auto min-h-[64px] w-full py-1.5 font-mono text-xs" placeholder="src/workers/**&#10;**/*.stories.ts" spellcheck="false" @blur="emit('roots', rootsDraft.trim())"/>
        </details>
      </template>
      <template v-else>
        <DupList title="Declared in several files" :items="scope(dupNames)" :picked="picked" @pick="pick" @take="fs => emit('tray', fs)" @open="f => emit('open', f)"/>
        <DupList title="Same file name, several folders" :items="scope(dupFiles)" :picked="picked" @pick="pick" @take="fs => emit('tray', fs)" @open="f => emit('open', f)"/>
      </template>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, type PropType } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import { filesUnder } from "~/features/checks/folderTree"
import type { Duplicate, Reachability } from "~/features/checks/checks"

const props = defineProps<{
  mode: "reach" | "dupes"
  /** Production code files, the ones the map draws. */
  files: string[]
  lines: ReadonlyMap<string, number>
  reach: Reachability
  dupNames: Duplicate[]
  dupFiles: Duplicate[]
  tray: string[]
  /** The extra entry-point globs, one per line. */
  roots: string
  /** A folder to open on, when the map was entered from one. */
  initialFolder?: string | null
}>()
const emit = defineEmits<{
  (e: "toggle", file: string): void
  (e: "tray", files: string[]): void
  (e: "open", file: string): void
  (e: "roots", globs: string): void
}>()

const fmt = (n: number) => n.toLocaleString("en-US")
const dirOf = (f: string) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".")
const baseOf = (f: string) => f.slice(f.lastIndexOf("/") + 1)
const traySet = computed(() => new Set(props.tray))

const folder = ref<string | null>(props.initialFolder ?? null)
function onMapSelect(path: string | null, kind: "file" | "folder") {
  if (!path) { folder.value = null; return }
  if (kind === "file") { emit("toggle", path); return }
  folder.value = folder.value === path ? null : path
}
const under = (fs: string[]) => (folder.value ? filesUnder(folder.value, fs) : fs)
const hover = ref<string | null>(null)
const rootsDraft = ref(props.roots)
watch(() => props.roots, r => { rootsDraft.value = r })

// ── Reach ──
type State = "root" | "reached" | "tests" | "none"
const STATES: Array<{ id: State; label: string; title: string; color: string }> = [
  { id: "root", label: "Entry point", title: "Called by a framework or a program's main, without an import", color: "rgb(var(--c-blue-500))" },
  { id: "reached", label: "Reached", title: "Imported, directly or not, from an entry point", color: "rgb(var(--c-neutral-300))" },
  { id: "tests", label: "Only tests", title: "Only tests import it: kept alive by its tests", color: "rgb(var(--c-amber-400))" },
  { id: "none", label: "Reached by nothing", title: "No entry point and no test reaches it", color: "rgb(var(--c-red-500))" },
]
const COLOR = Object.fromEntries(STATES.map(x => [x.id, x.color])) as Record<State, string>
const WORDS: Record<State, string> = { root: "an entry point", reached: "reached from an entry point", tests: "reached only by tests", none: "reached by nothing" }
const unreached = computed(() => new Set(props.reach.unreachable))
const testOnly = computed(() => new Set(props.reach.testOnly))
const stateOf = (f: string): State => (props.reach.roots.has(f) ? "root" : unreached.value.has(f) ? "none" : testOnly.value.has(f) ? "tests" : "reached")
const counts = computed(() => {
  const c: Record<State, number> = { root: 0, reached: 0, tests: 0, none: 0 }
  for (const f of under(props.files)) c[stateOf(f)]++
  return c
})
const only = ref<State | null>(null)

// ── Repeated names ──
const DUP_NAME = "rgb(var(--c-violet-500))"
const DUP_FILE = "rgb(var(--c-violet-200))"
const nameFiles = computed(() => new Set(props.dupNames.flatMap(d => d.files)))
const fileFiles = computed(() => new Set(props.dupFiles.flatMap(d => d.files)))
const namesByFile = computed(() => {
  const m = new Map<string, string[]>()
  for (const d of props.dupNames) for (const f of d.files) m.set(f, [...(m.get(f) ?? []), d.name])
  return m
})
const picked = ref<Duplicate | null>(null)
const same = (a: Duplicate | null, b: Duplicate) => !!a && a.name === b.name && a.files.join() === b.files.join()
function pick(d: Duplicate) { picked.value = same(picked.value, d) ? null : d }
const scope = (ds: Duplicate[]) => (folder.value ? ds.filter(d => under(d.files).length > 0) : ds)

// ── The map ──
const paint = (f: string) => (props.mode === "reach"
  ? COLOR[stateOf(f)]
  : nameFiles.value.has(f) ? DUP_NAME : fileFiles.value.has(f) ? DUP_FILE : "rgb(var(--c-neutral-200))")
const describe = (f: string) => {
  if (props.mode === "reach") return WORDS[stateOf(f)]
  const ns = namesByFile.value.get(f)
  if (ns?.length) return `declares ${ns.slice(0, 3).join(", ")}${ns.length > 3 ? ` +${ns.length - 3}` : ""} elsewhere too`
  return fileFiles.value.has(f) ? "its file name is used in another folder" : "nothing repeated"
}
const highlight = computed<Set<string> | null>(() => {
  if (hover.value) return new Set([hover.value])
  if (props.mode === "dupes") return picked.value ? new Set(picked.value.files) : null
  if (only.value) return new Set(props.files.filter(f => stateOf(f) === only.value))
  return props.tray.length ? new Set(props.tray) : null
})

// Files grouped by folder: a click puts one in the tray, a double-click opens it.
const FileGroups = defineComponent({
  props: {
    title: { type: String, required: true },
    files: { type: Array as PropType<string[]>, required: true },
    lines: { type: Map as unknown as PropType<ReadonlyMap<string, number>>, required: true },
    tray: { type: Set as unknown as PropType<ReadonlySet<string>>, required: true },
  },
  emits: ["toggle", "take", "open", "hover"],
  setup(p, { emit: out }) {
    const limit = ref(8)
    const byDir = computed(() => {
      const m = new Map<string, string[]>()
      for (const f of p.files) m.set(dirOf(f), [...(m.get(dirOf(f)) ?? []), f])
      return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    })
    return () => h("section", { class: "flex flex-col" }, [
      h("div", { class: "flex h-7 items-center gap-2" }, [
        h("h3", { class: "ui-section-title" }, p.title),
        h("span", { class: "font-mono text-xs text-neutral-500" }, fmt(p.files.length)),
        p.files.length ? h("button", { type: "button", class: "ml-auto text-xs text-neutral-500 hover:text-neutral-900", onClick: () => out("take", p.files) }, "Select all") : null,
      ]),
      !p.files.length ? h("p", { class: "text-sm text-neutral-500" }, "None.") : null,
      ...byDir.value.slice(0, limit.value).map(([d, fs]) => h("div", { key: d, class: "mt-1.5" }, [
        h("div", { class: "truncate px-2 font-mono text-[11px] text-neutral-500", title: d }, `${d}/`),
        h("ul", {}, fs.map(f => h("li", {
          key: f,
          class: ["flex h-7 cursor-default items-center gap-2 rounded px-2", p.tray.has(f) ? "bg-accent-50" : "hover:bg-neutral-200/60"],
          title: `${f} · double-click to open`,
          onClick: () => out("toggle", f), onDblclick: () => out("open", f),
          onMouseenter: () => out("hover", f), onMouseleave: () => out("hover", null),
        }, [
          h("span", { class: "min-w-0 truncate font-mono text-xs text-neutral-900" }, baseOf(f)),
          h("span", { class: "ml-auto shrink-0 font-mono text-[11px] text-neutral-500" }, fmt(p.lines.get(f) ?? 0)),
        ]))),
      ])),
      byDir.value.length > limit.value ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1 self-start", onClick: () => { limit.value += 20 } }, `Show more folders · ${fmt(byDir.value.length - limit.value)} left`) : null,
    ])
  },
})

// Repeated names: a click ties the files together on the map.
const DupList = defineComponent({
  props: {
    title: { type: String, required: true },
    items: { type: Array as PropType<Duplicate[]>, required: true },
    picked: { type: Object as PropType<Duplicate | null>, default: null },
  },
  emits: ["pick", "take", "open"],
  setup(p, { emit: out }) {
    const limit = ref(40)
    return () => h("section", { class: "flex flex-col" }, [
      h("div", { class: "flex h-7 items-center gap-2" }, [h("h3", { class: "ui-section-title" }, p.title), h("span", { class: "font-mono text-xs text-neutral-500" }, fmt(p.items.length))]),
      !p.items.length ? h("p", { class: "text-sm text-neutral-500" }, "None.") : null,
      h("ul", { class: "flex flex-col" }, p.items.slice(0, limit.value).map(d => {
        const on = same(p.picked, d)
        return h("li", { key: d.name + d.files[0] }, [
          h("button", { type: "button", class: ["flex h-7 w-full items-center gap-2 rounded px-2 text-left", on ? "bg-accent-50" : "hover:bg-neutral-200/60"], "aria-expanded": on, onClick: () => out("pick", d) }, [
            h("span", { class: "min-w-0 truncate font-mono text-xs text-neutral-900" }, d.name),
            h("span", { class: "ml-auto shrink-0 font-mono text-[11px] text-neutral-500" }, `${d.files.length} files`),
          ]),
          on ? h("div", { class: "mb-2 ml-2 flex flex-col border-l border-violet-300 pl-2" }, [
            ...d.files.map(f => h("button", { type: "button", key: f, class: "truncate py-0.5 text-left font-mono text-[11px] text-neutral-700 hover:text-neutral-900 hover:underline", title: `${f} · double-click to open`, onDblclick: () => out("open", f) }, f)),
            h("button", { type: "button", class: "ui-btn ui-btn-sm mt-1 self-start", onClick: () => out("take", d.files) }, "Select these files"),
          ]) : null,
        ])
      })),
      p.items.length > limit.value ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1 self-start", onClick: () => { limit.value += 50 } }, `Show more · ${fmt(p.items.length - limit.value)} left`) : null,
    ])
  },
})
</script>
