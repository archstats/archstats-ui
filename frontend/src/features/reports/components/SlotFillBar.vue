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
    <p class="min-w-0 max-w-[36%] shrink truncate text-neutral-900" :title="`${fill.number} of “${fill.reportTitle}”`">
      <span class="font-medium">{{ fill.number }}</span><template v-if="fill.title">, {{ fill.title }}</template><template v-if="queue && queue.ids.length > 1"><span class="text-neutral-500"> · {{ queue.at + 1 }} of {{ queue.ids.length }}</span></template>
    </p>
    <!-- The ask, as the view's own settings; a setting the take does not match is marked. -->
    <ul class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-label="Asked for">
      <li v-for="r in chips" :key="r.label" class="flex shrink-0 items-baseline gap-1 rounded px-1.5 py-[1px] text-[11.5px] hairline" :class="r.ok ? 'bg-surface' : 'bg-amber-50 shadow-[inset_0_0_0_1px_rgb(var(--c-amber-300))]'" :title="r.ok ? '' : `Asked for ${r.asked}; the view shows ${r.got ?? 'something else'}`">
        <span class="text-neutral-500">{{ r.label }}</span><span class="text-neutral-900">{{ r.asked }}</span>
      </li>
    </ul>
    <span v-if="note" class="min-w-0 max-w-[40%] shrink truncate text-[12.5px]" :class="failed ? 'text-amber-800' : 'text-neutral-600'" :title="note">{{ note }}</span>

    <template v-if="queue">
      <template v-if="ready">
        <button v-if="mismatch" type="button" class="ui-btn ui-btn-sm shrink-0" :title="`Open ${fill.view} again, set as the template asks`" @click="taking.retake()">Set as asked</button>
        <button type="button" class="ui-btn ui-btn-sm shrink-0" title="Trim it, write around it, or choose where it lands" @click="reports.adjusting = true">Adjust…</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" title="Into the report, then the next one (↵)" @click="taking.take()">Take</button>
      </template>
      <template v-else-if="failed || paused">
        <button v-if="paused" type="button" class="ui-btn ui-btn-sm shrink-0" :title="`Open ${fill.view} again, set as the template asks`" @click="taking.retake()">Resume</button>
        <button v-if="canAdd" type="button" class="ui-btn ui-btn-sm shrink-0" :title="`What ${fill.view} shows now, into ${fill.number}`" @click="add">Take what is shown</button>
      </template>
      <button type="button" class="ui-btn ui-btn-sm shrink-0" title="Leave this one for later and go on" @click="taking.skip()">Skip</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" title="End the run and go back to the report; the slots left stay in it" @click="taking.stop()">Stop</button>
    </template>
    <template v-else>
      <button v-if="!onView" type="button" class="ui-btn ui-btn-sm shrink-0" @click="goToView">Open {{ fill.view }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="!canAdd" :title="canAdd ? `What ${fill.view} shows, into ${fill.number}` : 'Set the view so it draws something, then add it'" @click="add">Add this view</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="back">Back to report</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" aria-label="Stop filling" title="Stop filling; the slot stays in the report" @click="taking.stop()">
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
  if (draft) return compareSettings(f.route, draft.route).filter(r => r.label !== "View");
  return askedSettings(f.route).filter(r => r.label !== "View").map(r => ({ ...r, ok: true }));
});
const mismatch = computed(() => ready.value && chips.value.some(r => !r.ok));
const note = computed(() => {
  const f = fill.value;
  if (!f || !queue.value) return !canAdd.value && onView.value ? "Nothing drawn here to add yet" : "";
  if (reports.taking === "waiting") return `Opening ${f.view}, set as the report asks…`;
  if (reports.taking === "failed") return reports.takeWhy || `${f.view} drew nothing to take`;
  if (reports.taking === "paused") return "Paused";
  if (ready.value) {
    const t = reports.importing?.table;
    const what = t ? `Takes ${t.rows.length <= 25 ? t.rows.length : 10} of ${t.total > 0 ? t.total : t.rows.length} rows, ${t.columns.length} columns` : `Takes “${reports.importing?.title ?? f.view}”`;
    return mismatch.value ? `${what} · not quite as asked` : what;
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
// Something of the slot's kind is drawn: a table does not fill a figure's slot.
const canAdd = computed(() => {
  void tick.value;
  const kind = fill.value?.kind;
  return exportables.value.some(i => usable(i) && (!kind || i.kind === kind));
});
function add() { void runCommand("add-to-report"); }
</script>
