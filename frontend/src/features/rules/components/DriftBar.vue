<template>
  <div
    v-if="visible"
    class="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-amber-50 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="alert" :size="13" class="shrink-0 text-amber-700"/>
    <p class="min-w-0 flex-1 truncate" :title="added.map(e => `${e.file}${e.line ? ':' + e.line : ''}: ${groupName(e.fromGroup)} → ${groupName(e.toGroup)}`).join('\n')">
      <span class="font-medium text-neutral-900">{{ t('rules.driftBar.newCrossSDeclared', { value: added.length.toLocaleString(intlLocale), imports: t('common.noun.import', { count: added.length }), item: t('common.noun.es', { count: added.length }), active: lens.active }) }}</span>
      <span class="text-neutral-600">{{ ' ' + t('rules.driftBar.since', { since }) }}</span>
    </p>
    <router-link :to="`/views/changes?base=${prevId}&head=${openId}`" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0">{{ t('rules.driftBar.whatChanged') }}</router-link>
    <router-link to="/views/rules#lens" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0">{{ t('rules.driftBar.rules') }}</router-link>
    <PinButton icon kind="rule" :entity-key="`drift|${lens.active}|${prevId}|${openId}`" :title="t('rules.driftBar.newCrossingsSince', { addedLength: added.length, active: lens.active, since })" :values="{ findings: added.length }"/>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('rules.driftBar.dismissScan')" :title="t('rules.driftBar.dismissScan')" @click="dismiss">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { QueryIn } from "wailsjs/go/app/QueryService";
import Icon from "~/shared/ui/Icon.vue";
import PinButton from "~/features/reports/components/PinButton.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { newestFirst } from "~/features/workspace/scanOrder";
import { comparability } from "~/features/trends/comparability";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { lensGroups } from "~/features/groups/lensEdges";
import type { GroupEdge } from "~/features/groups/groupEdges";
import { formatScanTime } from "~/shared/time";
import { checkLens } from "../useLensFindings";
import { newCrossings, previousOf } from "../drift";
import { t, intlLocale } from "~/shared/i18n";

// Drift, said when it happens: a rescan that brings new imports across the
// active lens's declared order says so above every view, against the scan
// before it. A lens with no declaration, or no earlier comparable scan,
// says nothing.

const data = useDataStore();
const workspaces = useWorkspacesStore();
const groups = useGroupsStore();
const lens = useLensStore();
const groupName = (id: string) => groups.getGroupById(id)?.name ?? id;

const openId = computed(() => workspaces.openScanId ?? "");
const prev = computed(() => {
  const scans = newestFirst(workspaces.scans.filter((s: any) => s.status === "complete") as any[]) as any[];
  return openId.value ? previousOf(scans, openId.value, (a, b) => !comparability(a, b).reasons.some(r => r.level === "block")) : null;
});
const prevId = computed(() => prev.value?.id ?? "");
const since = computed(() => (prev.value ? formatScanTime(prev.value.headTime ?? prev.value.startedAt) : ""));
const declared = computed(() => (lens.active ? groups.dimensionRecords.find(d => d.name === lens.active)?.declared ?? null : null));

const added = ref<GroupEdge[]>([]);
watch([openId, prevId, () => lens.active, declared, () => groups.groups], async () => {
  added.value = [];
  const d = declared.value, dim = lens.active, a = prevId.value, b = openId.value;
  if (!d || !dim || !a || !b) return;
  try {
    const gs = lensGroups(dim);
    const [before, after] = await Promise.all([
      checkLens(sql => QueryIn(a, sql) as Promise<any[]>, gs, d),
      checkLens(sql => data.query(sql) as Promise<any[]>, gs, d),
    ]);
    if (openId.value === b) added.value = newCrossings(before.crossings, after.crossings);
  } catch { /* an older scan that cannot be read says nothing */ }
}, { immediate: true });

const dismissKey = computed(() => `drift:${lens.active}|${prevId.value}|${openId.value}`);
const dismissed = ref(new Set<string>());
const visible = computed(() => added.value.length > 0 && !dismissed.value.has(dismissKey.value));
function dismiss() { dismissed.value = new Set([...dismissed.value, dismissKey.value]); }
</script>
