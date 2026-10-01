<template>
  <!-- Compact: a sidebar row has room for a number, not a sentence. Quiet
       until there is something, because a badge that is always lit is a
       decoration. -->
  <span
    v-if="compact"
    v-show="count"
    class="shrink-0 rounded bg-amber-100 px-1 font-mono text-2xs leading-4 text-amber-800"
    :title="note"
  >{{ count }}</span>

  <div v-else class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    <span class="font-mono text-neutral-600" :title="t('groups.lensHealth.componentsGroup', { placed: health.placed, healthTotal: health.total })">
      {{ t('groups.lensHealth.matched', { placed: health.placed, healthTotal: health.total }) }}
    </span>

    <!-- Overlap is legal here and loud. Blocking it would stop a group being
         saved the moment it is thought of, which is the point; absorbing it
         silently would hand back a partition that is not one. -->
    <button
      v-if="health.overlaps.length"
      type="button"
      class="rounded px-1.5 py-0.5 text-amber-800 transition-colors hover:bg-amber-50"
      :title="overlapTitle"
      @click="emit('show-overlaps', health.overlaps)"
    >
      {{ t('groups.lensHealth.twoGroups', { overlapsLength: health.overlaps.length }) }}
    </button>

    <!-- What a rename looks like, said out loud on the scan it happens. -->
    <button
      v-for="s in health.silent"
      :key="'s' + s.group.id"
      type="button"
      class="rounded px-1.5 py-0.5 text-red-700 transition-colors hover:bg-red-50"
      :title="t('groups.lensHealth.matchNothingScan', { groupName: s.group.name, lines: t('common.noun.line', { count: s.lines.length }), value: s.lines.join(', ') })"
      @click="emit('open-group', s.group)"
    >
      {{ t('groups.lensHealth.nothing', { groupName: s.group.name, linesMatch: t('common.count.lineMatches', { count: s.lines.length }) }) }}
    </button>

    <!-- A frozen group whose own query has moved on: offered, never applied. -->
    <button
      v-for="c in health.candidates"
      :key="'c' + c.group.id"
      type="button"
      class="rounded px-1.5 py-0.5 text-accent-700 transition-colors hover:bg-accent-50"
      :title="t('groups.lensHealth.wasFoundQueryNow', { groupName: c.group.name, extra: c.extra })"
      @click="emit('review', c.group)"
    >
      {{ t('groups.lensHealth.review', { groupName: c.group.name, extra: c.extra }) }}
    </button>

    <span v-if="quiet" class="text-neutral-400">{{ t('groups.lensHealth.nothingReview') }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useGroupsStore, type SavedGroup } from "~/features/groups/groups.store";
import { t } from "~/shared/i18n";

// What a lens is worth, at a glance.
//
// Every number here is drift that would otherwise surface months later as a
// map quietly missing 26 components. Reported, never absorbed: nothing on
// this bar changes a group, it only offers.

const props = withDefaults(defineProps<{ lens: string; compact?: boolean }>(), { compact: false });

const emit = defineEmits<{
  (e: "show-overlaps", overlaps: Array<{ id: string; groups: string[] }>): void;
  (e: "open-group", group: SavedGroup): void;
  (e: "review", group: SavedGroup): void;
}>();

const groups = useGroupsStore();
const health = computed(() => groups.lensHealth(props.lens));
const quiet = computed(() =>
  health.value.overlaps.length === 0 && health.value.silent.length === 0 && health.value.candidates.length === 0);

/** How many things want reviewing, for the places with room for one number. */
const count = computed(() =>
  health.value.silent.length + health.value.overlaps.length + health.value.candidates.length);

/** The same findings as a sentence per line, for a tooltip. */
const note = computed(() => {
  const parts: string[] = [];
  for (const s of health.value.silent) {
    parts.push(t("groups.lensHealth.matchNothingScan2", { groupName: s.group.name, value: s.lines.length === 1 ? t("groups.lensHealth.line") : t("groups.lensHealth.lines", { linesLength: s.lines.length }) }));
  }
  if (health.value.overlaps.length) {
    parts.push(t("groups.lensHealth.twoGroups2", { components: t("common.count.component", { count: health.value.overlaps.length }) }));
  }
  for (const c of health.value.candidates) parts.push(t("groups.lensHealth.queryNowMatchesMore", { groupName: c.group.name, extra: c.extra }));
  return parts.join("\n");
});

const overlapTitle = computed(() =>
  health.value.overlaps.slice(0, 6).map(o => `${o.id} — ${o.groups.join(", ")}`).join("\n")
  + (health.value.overlaps.length > 6 ? t("groups.lensHealth.more", { value: health.value.overlaps.length - 6 }) : ""));
</script>
