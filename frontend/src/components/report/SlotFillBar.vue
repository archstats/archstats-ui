<template>
  <!-- While a report's slot is being filled: which one, how the view should be
       set, and the one step that fills it. It follows the writer from view to
       view until the slot is filled or let go. -->
  <div
    v-if="visible && fill"
    class="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-ground px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon :icon="fill.kind === 'figure' ? 'image' : 'table'" :size="13" class="shrink-0 text-accent-700"/>
    <p class="min-w-0 flex-1 truncate" :title="`${fill.number} of “${fill.reportTitle}”: ${fill.hint}`">
      <span class="font-medium text-neutral-900">Filling {{ fill.number }}{{ fill.title ? `, ${fill.title}` : "" }}</span>
      <span class="text-neutral-600"> in “{{ fill.reportTitle }}”. <template v-if="onView">Set it as {{ fill.hint.charAt(0).toLowerCase() + fill.hint.slice(1) }}, then add it.</template><template v-else>It comes from {{ fill.view }}: {{ fill.hint.charAt(0).toLowerCase() + fill.hint.slice(1) }}.</template></span>
    </p>
    <button v-if="!onView" type="button" class="ui-btn ui-btn-sm shrink-0" @click="goToView">Open {{ fill.view }}</button>
    <span v-if="!canAdd" class="shrink-0 text-[12.5px] text-neutral-500">Nothing drawn here to add yet</span>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-primary shrink-0" :disabled="!canAdd" :title="canAdd ? `What ${fill.view} shows, into ${fill.number}` : 'Set the view so it draws something, then add it'" @click="add">Add this view</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="back">Back to report</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" aria-label="Stop filling" title="Stop filling; the slot stays in the report" @click="reports.filling = null">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { exportables } from "~/composables/useExportables";
import { useRoute, useRouter } from "vue-router";
import Icon from "~/components/ui/common/Icon.vue";
import { useReportsStore } from "~/stores/reports";
import { runCommand } from "~/utils/commands";

const reports = useReportsStore();
const route = useRoute();
const router = useRouter();
const fill = computed(() => reports.filling);
const visible = computed(() => !route.path.startsWith("/views/evidence"));
const onView = computed(() => !!fill.value && route.path === fill.value.route.split("?")[0]);

function goToView() { if (fill.value) void router.push(fill.value.route); }
function back() { void router.push("/views/evidence"); }
// A figure is ready once drawn; that lives in the DOM, so it is looked at twice a second while filling.
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { timer = setInterval(() => { if (reports.filling) tick.value++; }, 500); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
const canAdd = computed(() => {
  void tick.value;
  return exportables.value.some(i => i.kind !== "figure" || i.ready());
});
function add() { void runCommand("add-to-report"); }
</script>
