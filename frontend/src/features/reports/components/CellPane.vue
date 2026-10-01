<template>
  <!-- The selected cell: what it is made of, what it ran on, what moved. -->
  <div v-if="block" class="flex flex-col gap-4">
    <div>
      <p class="text-[13px] font-semibold text-neutral-900">{{ spec.type === 'reading' ? reading?.label ?? t('reports.cellPane.computedParagraph') : `${number}${title ? ` · ${title}` : ""}` }}</p>
      <p class="mt-0.5 text-xs text-neutral-500">{{ what }}</p>
    </div>

    <!-- A table cell: its source, columns, order and length. -->
    <section v-if="spec.type === 'table'" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.table') }}</h3>
      <div class="ui-segmented" role="group" :aria-label="t('reports.cellPane.rows')">
        <button type="button" :aria-pressed="spec.source === 'components'" @click="setSpec({ source: 'components' })">{{ t('reports.cellPane.components') }}</button>
        <button type="button" :aria-pressed="spec.source === 'files'" @click="setSpec({ source: 'files' })">{{ t('reports.cellPane.files') }}</button>
      </div>
      <StatSelectMulti :key="`${block.id}:${spec.source}`" :model-value="spec.columns" :options="columnOptions" @update:model-value="setSpec({ columns: $event })"/>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        {{ t('reports.cellPane.sorted') }}
        <select class="ui-input ui-input-sm w-40" :value="spec.sort" @change="setSpec({ sort: ($event.target as HTMLSelectElement).value })">
          <option v-for="c in spec.columns" :key="c" :value="c">{{ label(c) }}</option>
        </select>
      </label>
      <div class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        {{ t('reports.cellPane.order') }}
        <div class="ui-segmented" role="group" :aria-label="t('reports.cellPane.order')">
          <button type="button" :aria-pressed="spec.desc" @click="setSpec({ desc: true })">{{ t('reports.cellPane.highestFirst') }}</button>
          <button type="button" :aria-pressed="!spec.desc" @click="setSpec({ desc: false })">{{ t('reports.cellPane.lowestFirst') }}</button>
        </div>
      </div>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        {{ t('reports.cellPane.rows2') }}
        <input type="number" min="1" max="500" class="ui-input ui-input-sm w-20 font-mono" :value="spec.limit" @change="setSpec({ limit: Math.max(1, Math.min(500, Number(($event.target as HTMLInputElement).value) || 10)) })">
      </label>
    </section>

    <!-- A pin: its note belongs to the pin, shared by every report. -->
    <section v-else-if="spec.type === 'pin' && pin" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.pinNote') }}</h3>
      <textarea
        :value="pin.note"
        rows="4"
        class="ui-input w-full resize-y text-[13px] leading-5"
        :placeholder="t('reports.cellPane.whatShowsYourWords')"
        :aria-label="t('reports.cellPane.pinNote')"
        @change="$emit('pinNote', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="text-[11px] leading-4 text-neutral-500">{{ t('reports.cellPane.sharedRunCellBring', { value: usage.length > 1 ? t('reports.cellPane.reportsUsePin', { usageLength: usage.length }) : t('reports.cellPane.everyReportUsesPin') }) }}</p>
    </section>

    <section v-else-if="spec.type === 'sql'" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.query') }}</h3>
      <p class="text-xs leading-5 text-neutral-600">{{ t('reports.cellPane.editSqlCellRuns') }}</p>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        {{ t('reports.cellPane.rowsKept') }}
        <input type="number" min="1" max="500" class="ui-input ui-input-sm w-20 font-mono" :value="spec.limit" @change="setSpec({ limit: Math.max(1, Math.min(500, Number(($event.target as HTMLInputElement).value) || 50)) })">
      </label>
    </section>

    <!-- A computed paragraph: what it counts, how it is set, and the way out. -->
    <section v-else-if="spec.type === 'reading'" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.counted') }}</h3>
      <p class="text-xs leading-5 text-neutral-600">{{ reading?.describe }}</p>
      <template v-for="p in reading?.params ?? []" :key="p.id">
        <div v-if="p.choices" class="flex items-center justify-between gap-2 text-xs text-neutral-600">
          {{ p.label }}
          <div class="ui-segmented" role="group" :aria-label="p.label">
            <button v-for="c in p.choices" :key="c.value" type="button" :aria-pressed="(spec.params?.[p.id] ?? p.choices[0].value) === c.value" @click="setParam(p.id, c.value)">{{ c.label }}</button>
          </div>
        </div>
        <label v-else class="flex items-center justify-between gap-2 text-xs text-neutral-600">
          {{ p.label }}
          <input :value="spec.params?.[p.id] ?? ''" class="ui-input ui-input-sm w-44 font-mono" list="cellpane-components" :placeholder="t('reports.cellPane.component')" @change="setParam(p.id, ($event.target as HTMLInputElement).value.trim())">
          <datalist id="cellpane-components"><option v-for="c in componentNames" :key="c" :value="c"/></datalist>
        </label>
      </template>
      <p class="text-[11px] leading-4 text-neutral-500">{{ t('reports.cellPane.factsOnlyReRuns') }}</p>
      <button type="button" class="ui-btn ui-btn-sm self-start" :disabled="!cell.output?.reading" @click="$emit('adopt')">{{ t('reports.cellPane.writeMyOwn') }}</button>
    </section>

    <section v-else-if="spec.type === 'slot'" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.add') }}</h3>
      <dl class="ui-kv">
        <template v-for="r in asked" :key="r.label"><dt>{{ r.label }}</dt><dd>{{ r.asked }}</dd></template>
      </dl>
      <p class="text-[11px] leading-4 text-neutral-500">{{ t('reports.cellPane.takeViewOpensSet') }}</p>
      <div class="flex items-center gap-2">
        <button type="button" class="ui-btn ui-btn-sm" @click="$emit('take')">{{ t('reports.cellPane.take', { view: spec.view }) }}</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="$emit('fill')">{{ t('reports.cellPane.setYourself') }}</button>
      </div>
    </section>

    <section v-else-if="spec.type === 'capture'" class="flex flex-col gap-2">
      <h3 class="ui-label">{{ t('reports.cellPane.captured') }}</h3>
      <p class="text-xs leading-5 text-neutral-600">{{ t('reports.cellPane.keptShowedBringUp', { view: spec.view }) }}</p>
      <router-link :to="spec.route" class="ui-btn ui-btn-sm self-start">{{ t('reports.cellPane.open', { view: spec.view }) }}</router-link>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="ui-label">{{ spec.type === 'slot' ? t('reports.cellPane.runs') : t('reports.cellPane.ran') }}</h3>
      <dl v-if="cell.ranOn" class="ui-kv">
        <dt>{{ t('reports.cellPane.snapshot') }}</dt><dd>{{ cell.ranOn.label }}</dd>
        <template v-if="cell.ranOn.commit"><dt>{{ t('reports.cellPane.commit') }}</dt><dd>{{ cell.ranOn.commit.slice(0, 12) }}</dd></template>
        <dt>{{ t('reports.cellPane.analysis') }}</dt><dd>r{{ cell.ranOn.revision }}</dd>
        <template v-if="cell.ranOn.lens"><dt>{{ t('reports.cellPane.lens') }}</dt><dd>{{ cell.ranOn.lens }}</dd></template>
        <template v-if="cell.ranOn.scope"><dt>{{ t('reports.cellPane.scope') }}</dt><dd class="!whitespace-normal">{{ cell.ranOn.scope }}</dd></template>
        <template v-if="cell.ranOn.role"><dt>{{ t('reports.cellPane.files') }}</dt><dd>{{ cell.ranOn.role }}</dd></template>
        <dt>{{ t('reports.cellPane.at') }}</dt><dd>{{ new Date(cell.ranOn.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }}</dd>
      </dl>
      <p v-else class="text-xs text-neutral-500">{{ spec.type === 'slot' ? t('reports.cellPane.whatYouAddKeeps') : t('reports.cellPane.notRunYet') }}</p>
      <p v-if="change" class="text-xs leading-5 text-neutral-800">{{ change }}</p>
      <div class="flex gap-2">
        <button v-if="spec.type !== 'capture' && spec.type !== 'slot'" type="button" class="ui-btn ui-btn-sm" :class="stale ? 'ui-btn-primary' : ''" :disabled="running" @click="$emit('run')">
          {{ running ? t('reports.cellPane.running') : t('reports.cellPane.run', { kernelLabel }) }}
        </button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto text-red-700" @click="$emit('remove')">{{ t('reports.cellPane.remove') }}</button>
      </div>
    </section>
  </div>
  <p v-else class="text-sm leading-5 text-neutral-500">{{ t('reports.cellPane.selectCellSeeWhat') }}</p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StatSelectMulti from "~/features/metrics/components/StatSelectMulti.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { readingDef } from "~/features/reports/readings";
import { askedSettings } from "~/features/reports/slotSettings";
import { describeChange } from "~/features/reports/reportCells";
import type { CellBlock, CellSpec } from "~/features/reports/reportDoc";
import { t, dateLocale } from "~/shared/i18n";

const props = defineProps<{
  block: CellBlock | null
  number: string
  pin: { note: string } | null
  usage: string[]
  running: boolean
  stale: boolean
  kernelLabel: string
  columns: Record<"components" | "files", string[]>
  label: (id: string) => string
}>();
const emit = defineEmits<{ (e: "spec", spec: CellSpec): void; (e: "run"): void; (e: "remove"): void; (e: "pinNote", note: string): void; (e: "adopt"): void; (e: "fill"): void; (e: "take"): void }>();
const asked = computed(() => (spec.value.type === "slot" ? askedSettings(spec.value.route) : []));
const data = useDataStore();
const reading = computed(() => (spec.value.type === "reading" ? readingDef(spec.value.reading) : undefined));
const componentNames = computed(() => (reading.value?.params?.some(p => p.kind === "component") ? (data.allComponents ?? []).map((c: any) => String(c.name)).filter((n: string) => n !== ".").sort() : []));
function setParam(id: string, value: string) {
  emit("spec", { ...spec.value, params: { ...(spec.value.params ?? {}), [id]: value } });
}

const cell = computed(() => props.block!.cell);
const spec = computed(() => cell.value.spec as any);
const title = computed(() => cell.value.title || cell.value.output?.pin?.title || "");
const columnOptions = computed(() => (spec.value.type === "table" ? props.columns[spec.value.source as "components" | "files"] ?? [] : []));
const what = computed(() => {
  const s = spec.value;
  if (s.type === "table") return t("reports.cellPane.theWithThe", { limit: s.limit, source: s.source, value: s.desc ? t("reports.cellPane.highest") : t("reports.cellPane.lowest"), sort: props.label(s.sort).toLowerCase() });
  if (s.type === "sql") return t("reports.cellPane.readOnlyQuerySnapshot");
  if (s.type === "pin") return t("reports.cellPane.pinPoolValuesPinned");
  if (s.type === "reading") return t("reports.cellPane.paragraphCountedSnapshot");
  if (s.type === "slot") return t("reports.cellPane.templateAsksNotAdded", { kind: s.kind });
  return t("reports.cellPane.captured2", { view: s.view });
});
const change = computed(() => describeChange(cell.value.previous, cell.value.output, props.label));
function setSpec(patch: Record<string, unknown>) {
  const next = { ...spec.value, ...patch };
  if (patch.columns && !(next.columns as string[]).includes(next.sort)) next.sort = (next.columns as string[])[0] ?? next.sort;
  emit("spec", next);
}
</script>
