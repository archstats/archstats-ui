<template>
  <!-- While a report's slots are being filled: which one, what it asks of
       the view, and the way on. It follows the writer from view to view
       until the slots are filled or let go. -->
  <div
    v-if="visible && fill"
    class="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-ground px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Loader2 v-if="waiting" :size="13" class="shrink-0 animate-spin text-accent-700"/>
    <Icon v-else :icon="fill.kind === 'figure' ? 'image' : 'table'" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 truncate text-neutral-900" :title="`${fill.number} of “${fill.reportTitle}”`">
      <span class="font-medium">{{ lead }} {{ fill.number }}</span><template v-if="fill.title">, {{ fill.title }}</template><template v-if="queue && queue.ids.length > 1"><span class="text-neutral-500"> · {{ queue.at + 1 }} of {{ queue.ids.length }}</span></template>
    </p>
    <!-- The ask, as the view's own settings. -->
    <ul class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-label="Asked for">
      <li v-for="r in asked" :key="r.label" class="flex shrink-0 items-baseline gap-1 rounded bg-surface px-1.5 py-[1px] text-[11.5px] hairline">
        <span class="text-neutral-500">{{ r.label }}</span><span class="text-neutral-900">{{ r.asked }}</span>
      </li>
    </ul>
    <span v-if="note" class="shrink-0 text-[12.5px] text-neutral-600">{{ note }}</span>

    <template v-if="queue && reports.taking !== 'waiting'">
      <button v-if="reports.taking === 'paused'" type="button" class="ui-btn ui-btn-sm shrink-0" :title="`${fill.view} again, set as the template asks`" @click="taking.retake()">Take as asked</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="!canAdd" :title="`What ${fill.view} shows now, into ${fill.number}`" @click="add">Add this view</button>
      <button type="button" class="ui-btn ui-btn-sm shrink-0" @click="taking.skip()">Skip</button>
    </template>
    <template v-else-if="!queue">
      <button v-if="!onView" type="button" class="ui-btn ui-btn-sm shrink-0" @click="goToView">Open {{ fill.view }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="!canAdd" :title="canAdd ? `What ${fill.view} shows, into ${fill.number}` : 'Set the view so it draws something, then add it'" @click="add">Add this view</button>
    </template>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="back">Back to report</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="queue ? 'Stop taking' : 'Stop filling'" :title="queue ? 'Stop taking; the slots left stay in the report' : 'Stop filling; the slot stays in the report'" @click="taking.stop()">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Loader2 } from "lucide-vue-next";
import Icon from "~/components/ui/common/Icon.vue";
import { exportables, usable } from "~/composables/useExportables";
import { useSlotTaking } from "~/composables/useSlotTaking";
import { useReportsStore } from "~/stores/reports";
import { runCommand } from "~/utils/commands";
import { askedSettings } from "~/utils/slotSettings";

const reports = useReportsStore();
const route = useRoute();
const router = useRouter();
const taking = useSlotTaking();
const fill = computed(() => reports.filling);
const queue = computed(() => reports.takeQueue);
const visible = computed(() => !route.path.startsWith("/views/evidence"));
const onView = computed(() => !!fill.value && route.path === fill.value.route.split("?")[0]);
const waiting = computed(() => !!queue.value && reports.taking === "waiting");
// The view is named in the lead and its settings as chips; the view row itself would repeat it.
const asked = computed(() => (fill.value ? askedSettings(fill.value.route).filter(r => r.label !== "View") : []));
const lead = computed(() => (queue.value ? "Taking" : "Filling"));
const note = computed(() => {
  const f = fill.value;
  if (!f || !queue.value) return !canAdd.value && onView.value ? "Nothing drawn here to add yet" : "";
  if (reports.taking === "waiting") return `Waiting for ${f.view} to draw…`;
  if (reports.taking === "failed") return `${f.view} drew nothing to take; set it, then add it`;
  if (reports.taking === "paused") return "Paused";
  return "";
});

function goToView() { if (fill.value) void router.push(fill.value.route); }
function back() { if (queue.value) taking.pause(); void router.push("/views/evidence"); }
// A figure is ready once drawn; that lives in the DOM, so it is looked at twice a second while filling.
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { timer = setInterval(() => { if (reports.filling) tick.value++; }, 500); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
const canAdd = computed(() => {
  void tick.value;
  return exportables.value.some(usable);
});
function add() { void runCommand("add-to-report"); }
</script>
