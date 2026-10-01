<template>
  <!-- The figures and tables a template asked for, at the top of the report:
       what each is and which view it comes from, taken one at a time or all
       in a row. After a run, what it added and what it left, and why. -->
  <section v-if="slots.length || summary" class="mt-6 rounded-lg bg-ground px-4 py-3 hairline" :aria-label="heading">
    <div class="flex items-center gap-3">
      <h2 class="flex-1 text-[13px] font-semibold text-neutral-900">{{ heading }}</h2>
      <button v-if="slots.length" type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :title="paused ? t('reports.figuresToAdd.pickUpRunWhere') : t('reports.figuresToAdd.openEachViewTurn')" @click="emit('take-all')">{{ paused ? t('reports.figuresToAdd.resume') : slots.length === 1 ? t('reports.figuresToAdd.take') : t('reports.figuresToAdd.takeAll') }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('reports.figuresToAdd.hide')" :title="slots.length ? t('reports.figuresToAdd.hideListSlotsStay') : t('reports.figuresToAdd.hide')" @click="emit('hide')"><Icon icon="x" :size="13"/></button>
    </div>
    <p v-if="summary" class="mt-1 text-[12.5px] leading-5 text-neutral-700" role="status">
      {{ summary.lead }}<template v-for="(s, i) in summary.skipped" :key="s.id"><template v-if="i"> · </template><button type="button" class="text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-700" @click="emit('jump', s.id)">{{ s.label }}</button><span class="text-neutral-600">: {{ s.why }}</span></template>
    </p>
    <p v-else class="mt-1 text-[12.5px] leading-5 text-neutral-600">
      {{ t('reports.figuresToAdd.templateAsksAppS', { these: t('common.noun.this', { count: slots.length }) }) }}
    </p>
    <ul v-if="slots.length" class="mt-2 flex flex-col">
      <li v-for="s in rows" :key="s.id" class="group flex items-center gap-2.5 rounded px-1 py-1 hover:bg-neutral-100/70">
        <Icon :icon="s.kind === 'figure' ? 'image' : 'table'" :size="13" class="shrink-0 text-neutral-400"/>
        <button type="button" class="min-w-0 flex-1 truncate text-left text-[13px] text-neutral-900" :title="t('reports.figuresToAdd.goReport', { number: s.number })" @click="emit('jump', s.id)">
          <span class="font-medium">{{ s.number }}</span><template v-if="s.title"> · {{ s.title }}</template><span class="text-neutral-500">{{ t('reports.figuresToAdd.from', { view: s.view }) }}</span>
        </button>
        <span v-if="s.skippedWhy" class="max-w-[40%] shrink truncate text-[12px] text-amber-800" :title="s.skippedWhy">{{ s.skippedWhy }}</span>
        <button type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.figuresToAdd.openSetReportAsks', { view: s.view })" @click="emit('take', s.id)">{{ t('reports.figuresToAdd.take2') }}</button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import type { CellBlock } from "~/features/reports/reportDoc";
import type { TakeLog } from "~/features/reports/reports.store";
import { t } from "~/shared/i18n";

const props = defineProps<{ slots: CellBlock[]; numbers: Map<string, string>; log: TakeLog | null; paused: boolean }>();
const emit = defineEmits<{ take: [id: string]; "take-all": []; jump: [id: string]; hide: [] }>();

const kinds = computed(() => new Set(props.slots.map(s => (s.cell.spec.type === "slot" ? s.cell.spec.kind : "figure"))));
const heading = computed(() => (!props.slots.length ? t("reports.figuresToAdd.figuresAdded") : kinds.value.size > 1 ? t("reports.figuresToAdd.figuresTablesAdd") : kinds.value.has("table") ? (props.slots.length === 1 ? t("reports.figuresToAdd.tableAdd") : t("reports.figuresToAdd.tablesAdd")) : props.slots.length === 1 ? t("reports.figuresToAdd.figureAdd") : t("reports.figuresToAdd.figuresAdd")));
const skippedWhy = computed(() => new Map((props.log?.done ? props.log.skipped : []).map(s => [s.id, s.why === "skipped" ? "Skipped" : s.why])));
const rows = computed(() => props.slots.map(b => {
  const spec = b.cell.spec.type === "slot" ? b.cell.spec : null;
  return { id: b.id, kind: spec?.kind ?? "figure", number: props.numbers.get(b.id) ?? "", title: b.cell.title ?? "", view: spec?.view ?? "", skippedWhy: skippedWhy.value.get(b.id) ?? "" };
}));
/** After a run: how many went in, and each one left with its reason. */
const summary = computed(() => {
  const l = props.log;
  if (!l?.done) return null;
  const n = l.asked.length, added = l.filled.length;
  const untried = l.stopped ? n - added - l.skipped.length : 0;
  const lead = t("reports.figuresToAdd.added", { added, n, value: untried > 0 ? t("reports.figuresToAdd.stoppedNotTried", { untried }) : "", value2: l.skipped.length ? t("reports.figuresToAdd.left") : "" });
  const still = new Set(props.slots.map(s => s.id));
  const skipped = l.skipped.filter(s => still.has(s.id)).map(s => ({ id: s.id, label: props.numbers.get(s.id) ?? t("reports.figuresToAdd.slot"), why: s.why === "skipped" ? t("reports.figuresToAdd.skipped") : s.why }));
  return { lead, skipped };
});
</script>
