<template>
  <!-- While a report's slots are being filled: which one, what it asks of
       the view, and the way on. It follows the writer from view to view
       until the slots are filled or let go. In a run it is the one control
       over the view: what will be taken, and Take, Skip or Stop. -->
  <div
    v-if="visible && fill"
    class="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-ground px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Loader2 v-if="waiting" :size="13" class="shrink-0 animate-spin text-accent-700"/>
    <img v-else-if="ready && preview" :src="preview" alt="" class="h-8 max-w-[96px] shrink-0 rounded-sm bg-white object-contain hairline" :title="reports.importing?.title">
    <Icon v-else :icon="fill.kind === 'figure' ? 'image' : 'table'" :size="13" class="shrink-0" :class="failed ? 'text-amber-700' : 'text-accent-700'"/>
    <p class="min-w-0 max-w-[36%] shrink truncate text-neutral-900" :title="t('reports.slotFillBar.of', { number: fill.number, reportTitle: fill.reportTitle })">
      <span class="font-medium">{{ fill.number }}</span><template v-if="fill.title">, {{ fill.title }}</template><template v-if="queue && queue.ids.length > 1"><span class="text-neutral-500">{{ ' ' + t('reports.slotFillBar.of2', { value: queue.at + 1, idsLength: queue.ids.length }) }}</span></template>
    </p>
    <!-- The ask, as the view's own settings; a setting the take does not match is marked. -->
    <ul class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" :aria-label="t('reports.slotFillBar.asked')">
      <li v-for="r in chips" :key="r.label" class="flex shrink-0 items-baseline gap-1 rounded px-1.5 py-[1px] text-[11.5px] hairline" :class="r.ok ? 'bg-surface' : 'bg-amber-50 shadow-[inset_0_0_0_1px_rgb(var(--c-amber-300))]'" :title="r.ok ? '' : t('reports.slotFillBar.askedViewShows', { asked: r.asked, value: r.got ?? t('reports.slotFillBar.somethingElse') })">
        <span class="text-neutral-500">{{ r.label }}</span><span class="text-neutral-900">{{ r.asked }}</span>
      </li>
    </ul>
    <span v-if="note" class="min-w-0 max-w-[40%] shrink truncate text-[12.5px]" :class="failed ? 'text-amber-800' : 'text-neutral-600'" :title="note">{{ note }}</span>

    <template v-if="queue">
      <template v-if="ready">
        <button v-if="mismatch" type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.slotFillBar.openAgainSetTemplate', { view: fill.view })" @click="taking.retake()">{{ t('reports.slotFillBar.setAsked') }}</button>
        <button type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.slotFillBar.trimWriteAroundChoose')" @click="reports.adjusting = true">{{ t('reports.slotFillBar.adjust') }}</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :title="t('reports.slotFillBar.reportThenNextOne')" @click="taking.take()">{{ t('reports.slotFillBar.take') }}</button>
      </template>
      <template v-else-if="failed || paused">
        <button v-if="paused" type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.slotFillBar.openAgainSetTemplate', { view: fill.view })" @click="taking.retake()">{{ t('reports.slotFillBar.resume') }}</button>
        <button v-if="canAdd" type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.slotFillBar.whatShowsNow', { view: fill.view, number: fill.number })" @click="add">{{ t('reports.slotFillBar.takeWhatShown') }}</button>
      </template>
      <button type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('reports.slotFillBar.leaveOneLaterGo')" @click="taking.skip()">{{ t('reports.slotFillBar.skip') }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" :title="t('reports.slotFillBar.endRunGoBack')" @click="taking.stop()">{{ t('reports.slotFillBar.stop') }}</button>
    </template>
    <template v-else>
      <button v-if="!onView" type="button" class="ui-btn ui-btn-sm shrink-0" @click="goToView">{{ t('reports.slotFillBar.open', { view: fill.view }) }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="!canAdd" :title="canAdd ? t('reports.slotFillBar.whatShows', { view: fill.view, number: fill.number }) : t('reports.slotFillBar.setViewSoDraws')" @click="add">{{ t('reports.slotFillBar.addView') }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="back">{{ t('reports.slotFillBar.backReport') }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('reports.slotFillBar.stopFilling')" :title="t('reports.slotFillBar.stopFillingSlotStays')" @click="taking.stop()">
        <Icon icon="x" :size="13"/>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Loader2 } from "lucide-vue-next";
import Icon from "~/shared/ui/Icon.vue";
import { exportables, usable } from "~/features/export/useExportables";
import { useSlotTaking } from "~/features/reports/useSlotTaking";
import { useReportsStore } from "~/features/reports/reports.store";
import { runCommand } from "~/platform/commands";
import { askedSettings, compareSettings } from "~/features/reports/slotSettings";
import { t } from "~/shared/i18n";

const reports = useReportsStore();
const route = useRoute();
const router = useRouter();
const taking = useSlotTaking();
const fill = computed(() => reports.filling);
const queue = computed(() => reports.takeQueue);
const visible = computed(() => !route.path.startsWith("/views/evidence"));
const onView = computed(() => !!fill.value && route.path === fill.value.route.split("?")[0]);
const waiting = computed(() => !!queue.value && reports.taking === "waiting");
const failed = computed(() => !!queue.value && reports.taking === "failed");
const paused = computed(() => !!queue.value && reports.taking === "paused");
/** The view handed something over and it waits here to be taken. */
const ready = computed(() => !!queue.value && !!reports.importing && !reports.adjusting && reports.taking === "idle");
const preview = computed(() => (reports.importing?.figure ? `data:image/png;base64,${reports.importing.figure}` : ""));
// The view is named in the lead and its settings as chips; the view row itself would repeat it.
const chips = computed(() => {
  const f = fill.value;
  if (!f) return [];
  const draft = ready.value ? reports.importing : null;
  if (draft) return compareSettings(f.route, draft.route).filter(r => r.label !== t("reports.slotSettings.view2"));
  return askedSettings(f.route).filter(r => r.label !== t("reports.slotSettings.view2")).map(r => ({ ...r, ok: true }));
});
const mismatch = computed(() => ready.value && chips.value.some(r => !r.ok));
const note = computed(() => {
  const f = fill.value;
  if (!f || !queue.value) return !canAdd.value && onView.value ? t("reports.slotFillBar.nothingDrawnHereAdd") : "";
  if (reports.taking === "waiting") return t("reports.slotFillBar.openingSetReportAsks", { view: f.view });
  if (reports.taking === "failed") return reports.takeWhy || t("reports.slotFillBar.drewNothingTake", { view: f.view });
  if (reports.taking === "paused") return t("reports.slotFillBar.paused");
  if (ready.value) {
    const table2 = reports.importing?.table;
    const what = table2 ? t("reports.slotFillBar.takesRowsColumns", { value: table2.rows.length <= 25 ? table2.rows.length : 10, value2: table2.total > 0 ? table2.total : table2.rows.length, columnsLength: table2.columns.length }) : t("reports.slotFillBar.takes", { value: reports.importing?.title ?? f.view });
    return mismatch.value ? t("reports.slotFillBar.notQuiteAsked", { what }) : what;
  }
  return "";
});

function goToView() { if (fill.value) void router.push(fill.value.route); }
function back() { void router.push("/views/evidence"); }
// A figure is ready once drawn; that lives in the DOM, so it is looked at twice a second while filling.
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
function onKey(e: KeyboardEvent) {
  if (!queue.value || reports.adjusting || !visible.value) return;
  const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable='true']");
  if (e.key === "Escape") { e.preventDefault(); taking.pause(); }
  else if (e.key === "Enter" && !typing && ready.value) { e.preventDefault(); void taking.take(); }
}
onMounted(() => { timer = setInterval(() => { if (reports.filling) tick.value++; }, 500); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); window.removeEventListener("keydown", onKey); });
const canAdd = computed(() => {
  void tick.value;
  return exportables.value.some(usable);
});
function add() { void runCommand("add-to-report"); }
</script>
