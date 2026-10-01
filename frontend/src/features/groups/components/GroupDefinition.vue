<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2">
      <span class="ui-label">{{ t('groups.groupDefinition.defined') }}</span>

      <!-- Only shown once there is a query, because until then there is
           nothing to choose between. -->
      <div v-if="query" class="ui-segmented" role="group" :aria-label="t('groups.groupDefinition.howGroupDefined')">
        <button
          v-for="m in MODES"
          :key="m.mode"
          type="button"
          :aria-pressed="mode === m.mode"
          :class="{ 'is-active': mode === m.mode }"
          :title="m.hint"
          @click="emit('mode', m.mode)"
        >{{ m.label }}</button>
      </div>

      <!-- A button, at rest. This was bare text with a hover colour, so the
           only way to find the one action on a brand-new group was to sweep
           the pointer across the words and watch for a change. An empty
           group makes the offer below instead, where there is room to say
           what it does. -->
      <button
        v-if="!editing && !(empty && !query)"
        type="button"
        class="ui-btn ui-btn-sm ml-auto"
        :title="query ? t('groups.groupDefinition.editWhatGroupSays') : t('groups.groupDefinition.sayWhatGroupHolds')"
        @click="start"
      >
        <Icon :icon="query ? 'pencil' : 'braces'" :size="12" class="text-neutral-500"/>
        <span>{{ query ? t('groups.groupDefinition.edit') : t('groups.groupDefinition.describe') }}</span>
      </button>
    </div>

    <template v-if="editing">
      <QueryComposer ref="composer" v-model="draft" :world="world" :assist-world="assistWorld" inline/>
      <div class="flex items-center gap-1.5">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="commit">{{ t('groups.groupDefinition.save') }}</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="editing = false">{{ t('groups.groupDefinition.cancel') }}</button>
        <button v-if="query" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" :title="t('groups.groupDefinition.goBackPlainList')" @click="emit('query', '')">{{ t('groups.groupDefinition.remove') }}</button>
      </div>
    </template>

    <pre v-else-if="query" class="hairline whitespace-pre-wrap break-all rounded bg-surface px-2 py-1.5 font-mono text-sm leading-5 text-neutral-700">{{ query }}</pre>

    <!-- A group with nothing in it and nothing said about it has one thing
         to offer, so it offers it properly: three paragraphs each explaining
         that it was empty said nothing the count had not already said. -->
    <div v-else-if="empty" class="hairline flex flex-col items-start gap-2 rounded-lg bg-surface px-3 py-2.5">
      <p class="text-sm leading-4 text-neutral-500">
        {{ t('groups.groupDefinition.sayWhatGroupHolds2') }}
      </p>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="start">
        <Icon icon="braces" :size="12"/><span>{{ t('groups.groupDefinition.describePattern') }}</span>
      </button>
      <!-- The ways to fill it by hand belong to whoever is hosting this, so
           they are said by the host or not at all: the groups manager has no
           map to draw a box on. -->
      <p v-if="byHand" class="text-2xs leading-4 text-neutral-550">{{ byHand }}</p>
    </div>

    <p v-else class="text-sm leading-4 text-neutral-500">
      {{ t('groups.groupDefinition.listCannotTellYou', { names: t('common.count.name', { count: size }) }) }}
    </p>

    <!-- A cut gives each component one home, so two overlapping queries
         cannot both be satisfied and the later one wins. That is the right
         answer and it was arrived at in silence: a group could go on showing
         "**.controller" while another group held every controller. -->
    <p v-if="claims" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-700">
      <span>{{ t('groups.groupDefinition.anotherGroup', { componentsItNamesAre: t('common.count.componentItNamesIs', { count: claims }) }) }}</span>
      <button type="button" class="ui-btn ui-btn-sm" :title="reclaimHint" @click="emit('reclaim')">{{ t('groups.groupDefinition.takeBack', { them: t('common.noun.it', { count: claims }) }) }}</button>
    </p>

    <!-- A fixed group's query is a watchlist: it offers what it would catch
         now, and never adds anything itself. -->
    <p v-if="candidates" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span>{{ t('groups.groupDefinition.queryNowMatchesMore', { candidates }) }}</span>
      <button type="button" class="ui-btn ui-btn-sm" @click="emit('accept')">{{ t('groups.groupDefinition.reviewAdd') }}</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('groups.groupDefinition.stopReCheckingQuery')" @click="emit('unwatch')">{{ t('groups.groupDefinition.stopWatching') }}</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import QueryComposer from "./QueryComposer.vue";
import { useQueryWorld } from "~/features/groups/useQueryWorld";
import { isBlankQuery, SEARCH_SEED, SEARCH_SEED_CARET } from "~/features/groups/query";
import type { GroupMode } from "~/features/groups/groups.store";
import { t } from "~/shared/i18n";

// What a group says it holds, wherever a group is being looked at.
//
// This was written twice — once in the groups manager, once in the builder's
// group panel — with the same three states and two different editors, so the
// same job felt like two features depending on where you started. One
// component, one editor, one set of words.

const MODES: Array<{ mode: GroupMode; label: string; hint: string }> = [
  { mode: "live", label: t("groups.groupDefinition.query"), hint: t("groups.groupDefinition.groupQueryReRun") },
  { mode: "fixed", label: t("groups.groupDefinition.members"), hint: t("groups.groupDefinition.groupWhatListedQuery") },
];

const props = defineProps<{
  query?: string;
  mode?: GroupMode;
  /** How many names it holds, for the sentence shown before there is a query. */
  size: number;
  /** What its watchlist would catch now, if anything. */
  candidates?: number | null;
  /** The shortest patterns describing what it already holds, asked for on "Describe". */
  describe?: () => string | null;
  /** How this surface fills a group by hand, for the empty offer. */
  byHand?: string;
  /** What its query names that another group is holding. */
  claims?: number | null;
}>();

const emit = defineEmits<{
  (e: "query", query: string): void;
  (e: "mode", mode: GroupMode): void;
  (e: "accept"): void;
  (e: "unwatch"): void;
  (e: "reclaim"): void;
}>();

const { world, assistWorld, ready } = useQueryWorld();
const editing = ref(false);
const draft = ref("");
const empty = computed(() => props.size === 0);

const reclaimHint = computed(() => {
  const it = t("common.noun.it", { count: props.claims });
  return t("groups.groupDefinition.takeOutWhateverHolding", { it, it2: it, it3: it });
});

const composer = ref<InstanceType<typeof QueryComposer> | null>(null);

function start() {
  ready();
  // Same opening as the toolbar's search: a substring match waiting for its
  // word, rather than an empty box that answers nothing until you know the
  // syntax.
  const seeded = !props.query && !props.describe?.();
  draft.value = props.query || props.describe?.() || SEARCH_SEED;
  editing.value = true;
  nextTick(() => composer.value?.focusRow(0, seeded ? SEARCH_SEED_CARET : undefined));
}

function commit() {
  // Saving an untouched seed would define the group as everything.
  emit("query", isBlankQuery(draft.value) ? "" : draft.value);
  editing.value = false;
}

watch(() => props.query, () => { editing.value = false; });
</script>
