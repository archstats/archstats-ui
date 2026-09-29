<template>
  <!-- The middle of the descent: the same folder map the landing draws, with
       the region lit and everything else faded. It opens on the smallest
       folder holding the whole region, so a folder or a module arrives
       zoomed in and a lane spread over the codebase arrives whole. A folder
       zooms further; a file is picked for the inspector beside it. -->
  <section class="flex min-w-0 flex-1 flex-col" :aria-label="`${label} on the folder map`">
    <ExhibitFrame header="custom" fill>
      <div class="flex h-9 shrink-0 items-center gap-3 px-3 hairline-b">
        <div class="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden text-xs text-neutral-600">
          <span v-for="k in legend" :key="k.label" class="flex shrink-0 items-center gap-1.5">
            <span class="h-2 w-2 rounded-sm" :style="{ background: k.color }"/>{{ k.label }}<span v-if="k.count != null" class="font-mono text-neutral-500">{{ k.count.toLocaleString() }}</span>
          </span>
        </div>
        <span v-if="zoom" class="flex min-w-0 shrink items-center gap-1 text-xs text-neutral-600">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Up to ${parentLabel}`" :title="`Up to ${parentLabel}`" @click="zoomOut">
            <Icon icon="chevron-up" :size="12"/>
          </button>
          <span class="min-w-0 truncate font-mono" :title="zoom">{{ zoom }}/</span>
        </span>
        <button type="button" class="ui-btn ui-btn-sm shrink-0" :disabled="!focus.length"
                :title="`Collect the ${focus.length.toLocaleString()} lit modules into the group tray`"
                @click="$emit('collect', focus)">
          <Icon icon="plus" :size="12"/>
          <span>Collect {{ focus.length.toLocaleString() }}</span>
        </button>
        <ExhibitButton/>
      </div>
      <div class="min-h-0 flex-1 p-2">
        <FolderMap
          :files="shown" :lines="lines" :paint="paint" :highlight="lit" :selected="selectedPath"
          :describe="describe" :links-of="linksOf" :bad-link="badLink"
          :figure="label" :legend="{ items: legend }" :legend-in-ui="false"
          :aria-label="`Modules by folder, with ${label} lit`"
          @select="onSelect" @open="(f) => $emit('open', f)"
        />
      </div>
    </ExhibitFrame>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ExhibitButton from "~/features/export/components/ExhibitButton.vue"
import Icon from "~/shared/ui/Icon.vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import { filesUnder } from "~/features/checks/folderTree"

const props = defineProps<{
  /** What the region is called, for the figure and its label. */
  label: string
  /** Every module, by path. */
  files: string[]
  lines: ReadonlyMap<string, number>
  /** The region: the modules lit on the map. */
  focus: string[]
  selectedPath: string | null
  /** A module the list beside the map is pointing at. */
  pointed?: string | null
  paint: (file: string) => string
  describe: (file: string) => string
  linksOf: (file: string) => { uses: string[]; usedBy: string[] }
  badLink: (from: string, to: string) => boolean
  legend: Array<{ label: string; color: string; count?: number }>
}>()
const emit = defineEmits<{
  (e: "select", path: string | null, additive: boolean): void
  (e: "open", path: string): void
  (e: "collect", paths: string[]): void
}>()

const dirOf = (f: string) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "")

/** The deepest folder that holds every lit module. */
const home = computed(() => {
  if (!props.focus.length) return ""
  let common = dirOf(props.focus[0]).split("/")
  for (const f of props.focus) {
    const parts = dirOf(f).split("/")
    let i = 0
    while (i < common.length && common[i] === parts[i]) i++
    common = common.slice(0, i)
    if (!common.length) break
  }
  return common.join("/")
})

const zoom = ref(home.value)
// A new region opens on its own home, not on wherever the last one was left.
watch(home, (h) => { zoom.value = h })

const shown = computed(() => (zoom.value ? filesUnder(zoom.value, props.files) : props.files))
const lit = computed(() => (props.pointed ? new Set([props.pointed]) : new Set(props.focus)))
const parentLabel = computed(() => dirOf(zoom.value) ? dirOf(zoom.value) + "/" : "the whole codebase")

function zoomOut() { zoom.value = dirOf(zoom.value) }

function onSelect(path: string | null, kind: "file" | "folder", ev?: MouseEvent) {
  if (!path) { emit("select", null, false); return }
  if (kind === "folder") { zoom.value = path === zoom.value ? dirOf(path) : path; return }
  emit("select", path, !!ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey))
}
</script>
