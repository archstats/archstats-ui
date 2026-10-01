<template>
  <!-- What ships the code, from the build files: one bar of every production
       line by the deployable that ships it, then, when there is more than
       one thing to tell apart, the folder map painted the same way. Code in
       several deployables is shared at deploy time (hatched); code in none
       is code nothing here packages. A click on a slice or a file picks its
       deployable. -->
  <div class="flex flex-col gap-2">
    <p class="text-sm text-neutral-700">{{ sentence }}</p>

    <div v-if="share.lines && slices.length" class="flex h-2.5 w-full gap-px overflow-hidden rounded-sm" role="group" :aria-label="t('deployables.codeBand.productionLinesWhatShips')">
      <button
        v-for="s in slices" :key="s.id" type="button"
        class="h-full min-w-[2px] transition-opacity"
        :class="[s.kind === 'deployable' ? 'cursor-pointer' : 'cursor-default', dimSlice(s) ? 'opacity-30' : '']"
        :style="{ flexGrow: s.lines, flexBasis: 0, background: s.kind === 'several' ? HATCH_CSS : s.color }"
        :title="t('deployables.codeBand.linesFiles', { label: s.label, lines: fmt(s.lines), files: fmt(s.files), lines2: pct(s.lines) })"
        :aria-label="t('deployables.codeBand.lines', { label: s.label, lines: pct(s.lines) })"
        @click="s.kind === 'deployable' && s.id !== OTHER && emit('pick', s.id)"
        @mouseenter="hovered = s" @mouseleave="hovered = null"
      />
    </div>

    <ul v-if="share.lines && slices.length" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
      <li v-for="s in slices" :key="s.id">
        <button
          type="button" class="flex items-center gap-1.5 rounded px-0.5 hover:text-neutral-900"
          :class="{ 'opacity-40': dimSlice(s), 'font-medium text-neutral-900': selected === s.id }"
          :disabled="s.kind !== 'deployable' || s.id === OTHER"
          :title="s.id === OTHER ? otherIds.join(', ') : undefined"
          @click="emit('pick', s.id)" @mouseenter="hovered = s" @mouseleave="hovered = null"
        >
          <span class="h-2 w-2 shrink-0 rounded-sm" :style="{ background: s.kind === 'several' ? HATCH_CSS : s.color }"/>
          <span :class="s.kind === 'deployable' && s.id !== OTHER ? 'font-mono text-[11px]' : ''">{{ s.label }}</span>
          <span class="font-mono text-[11px] text-neutral-500">{{ pct(s.lines) }}</span>
        </button>
      </li>
    </ul>

    <div v-if="showMap" class="mt-1 h-[380px] rounded-md ring-1 ring-neutral-200">
      <FolderMap
        :files="files" :lines="lines" :paint="paintFile" :highlight="litFiles"
        :describe="describe" :aria-label="t('deployables.codeBand.everyProductionFileFolder')"
        :figure="t('deployables.codeBand.whatShipsCode')" :legend="{ items: legendItems }" :legend-in-ui="false"
        @select="(path, kind) => kind === 'file' && path && pickFile(path)" @open="emit('open-file', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import type { LegendItem } from "~/features/export/figure"
import { KIND_LABEL, type CodeShare, type DeployableModel } from "../deployables"
import { t, intlLocale } from "~/shared/i18n"

const props = defineProps<{
  model: DeployableModel
  share: CodeShare
  /** Deployables to keep lit; the rest of the code fades. */
  lit: ReadonlySet<string> | null
  selected: string | null
}>()
const emit = defineEmits<{ (e: "pick", id: string): void; (e: "open-file", file: string): void }>()

// Eight deployables get a colour of their own, biggest first; the rest share one.
const PALETTE = ["blue-500", "green-500", "violet-500", "amber-500", "blue-300", "green-300", "violet-300", "amber-300"].map(t => `rgb(var(--c-${t}))`)
const OTHER = "\u0000other"
const NONE_CSS = "rgb(var(--c-neutral-200))"
const OTHER_CSS = "rgb(var(--c-neutral-500))"
const HATCH_CSS = "repeating-linear-gradient(135deg, rgb(var(--c-neutral-400)) 0 2px, rgb(var(--c-neutral-100)) 2px 4px)"

const fmt = (n: number) => n.toLocaleString(intlLocale)
const pct = (n: number) => { const p = (n / Math.max(1, props.share.lines)) * 100; return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%` }

const own = computed(() => props.share.slices.filter(s => s.kind === "deployable"))
// One deployable alone takes a quiet shade, so what it leaves out is what the eye finds.
const colourOf = computed(() => new Map(own.value.slice(0, PALETTE.length).map((s, i) => [s.id, own.value.length === 1 ? "rgb(var(--c-blue-200))" : PALETTE[i]])))
const otherIds = computed(() => own.value.slice(PALETTE.length).map(s => s.id))

type Slice = { id: string; kind: "deployable" | "several" | "none"; label: string; color: string; lines: number; files: number; members: string[] }
const slices = computed<Slice[]>(() => {
  const out: Slice[] = own.value.slice(0, PALETTE.length).map(s => ({ id: s.id, kind: "deployable", label: s.id, color: colourOf.value.get(s.id)!, lines: s.lines, files: s.files, members: [s.id] }))
  const rest = own.value.slice(PALETTE.length)
  if (rest.length) out.push({ id: OTHER, kind: "deployable", label: t("deployables.codeBand.moreDeployables", { restLength: rest.length }), color: OTHER_CSS, lines: rest.reduce((a, s) => a + s.lines, 0), files: rest.reduce((a, s) => a + s.files, 0), members: rest.map(s => s.id) })
  for (const s of props.share.slices) {
    if (s.kind === "several") out.push({ ...s, label: t("deployables.codeBand.several"), color: "", members: [] })
    if (s.kind === "none") out.push({ ...s, label: t("deployables.codeBand.shipsNothing"), color: NONE_CSS, members: [] })
  }
  return out.filter(s => s.lines > 0 || s.files > 0)
})

const hovered = ref<Slice | null>(null)
const dimSlice = (s: Slice) => (props.lit ? !s.members.some(id => props.lit!.has(id)) : false)

const files = computed(() => props.model.files.map(f => f.file))
const lines = computed(() => new Map(props.model.files.map(f => [f.file, Math.max(1, Number(f.lines) || 0)])))
// A map is worth drawing when there is more than one thing to tell apart.
const showMap = computed(() => files.value.length > 0 && slices.value.length > 1)

function paintFile(file: string): string {
  const ids = props.share.ownerOf.get(file) ?? []
  if (!ids.length) return NONE_CSS
  if (ids.length > 1) return "hatch"
  return colourOf.value.get(ids[0]) ?? OTHER_CSS
}
const litFiles = computed<Set<string> | null>(() => {
  const ids = hovered.value ? new Set(hovered.value.kind === "deployable" ? hovered.value.members : []) : props.lit
  if (hovered.value && hovered.value.kind !== "deployable") {
    const want = hovered.value.kind
    return new Set(files.value.filter(f => { const n = (props.share.ownerOf.get(f) ?? []).length; return want === "none" ? n === 0 : n > 1 }))
  }
  if (!ids) return null
  return new Set(files.value.filter(f => (props.share.ownerOf.get(f) ?? []).some(id => ids.has(id))))
})
function describe(file: string): string {
  const ids = props.share.ownerOf.get(file) ?? []
  return ids.length ? t("deployables.codeBand.ships", { value: ids.join(", ") }) : t("deployables.codeBand.noDeployableHereShips")
}
function pickFile(file: string) {
  const ids = props.share.ownerOf.get(file) ?? []
  if (ids.length === 1) emit("pick", ids[0])
}

const legendItems = computed<LegendItem[]>(() => slices.value.map(s => ({
  label: s.label, color: s.kind === "several" ? "rgb(var(--c-neutral-400))" : s.color, mark: s.kind === "several" ? "hatch" : "swatch", count: s.files,
  title: s.kind === "several" ? t("deployables.codeBand.componentsMoreThanOne") : s.kind === "none" ? t("deployables.codeBand.productionFilesNoDeployable") : undefined,
})))

const sentence = computed(() => {
  const d = props.model.deployables
  const total = props.model.files.length
  if (!d.length) return total
    ? t("deployables.codeBand.noBuildFileHere", { total: fmt(total) })
    : t("deployables.codeBand.noProductionFilesWere")
  const kinds = [...new Set(d.map(x => (KIND_LABEL[x.kind] ?? x.kind).toLowerCase()))]
  const none = props.share.slices.find(s => s.kind === "none")
  const several = props.share.slices.find(s => s.kind === "several")
  if (d.length === 1 && !none && !several) return t("deployables.codeBand.allProductionFilesShip", { total: fmt(total), id: d[0].id, value: aOr(kinds[0]), value2: kinds[0] })
  const parts = [t("deployables.codeBand.shipProductionLines", { length: fmt(d.length), value: d.length === 1 ? kinds[0] : t("deployables.codeBand.deployables"), item: t("common.noun.s", { count: d.length }), value2: pct(props.share.lines - (none?.lines ?? 0)) })]
  if (several) parts.push(t("deployables.codeBand.shipMoreThanOne", { lines: pct(several.lines) }))
  if (none) parts.push(t("deployables.codeBand.filesShipNothingHere", { lines: pct(none.lines), files: fmt(none.files) }))
  return parts.join("; ") + "."
})
const aOr = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a")
</script>
