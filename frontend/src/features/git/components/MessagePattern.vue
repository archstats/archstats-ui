<template>
  <div class="relative">
    <button
      type="button"
      class="ui-btn ui-btn-sm"
      :class="active ? 'ui-btn-primary' : 'ui-btn-quiet'"
      :aria-expanded="open"
      :title="t('git.messagePattern.commitsWhoseSubjectMatches')"
      @click="open = !open"
    >
      <Icon icon="filter" :size="13" :class="active ? '' : 'text-neutral-500'"/>
      <span>{{ active ? t('git.messagePattern.matchingFixPattern') : t('git.messagePattern.fixPattern') }}</span>
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false"></div>
      <div class="ui-popover absolute left-0 top-full z-50 mt-1 flex w-[420px] flex-col gap-3 p-3 animate-in" role="dialog" :aria-label="t('git.messagePattern.fixPattern')">
        <label class="flex flex-col gap-1">
          <span class="ui-label">{{ t('git.messagePattern.subjectLinesMatching') }}</span>
          <input
            v-model="draft"
            type="text"
            spellcheck="false"
            class="ui-input ui-input-sm w-full font-mono"
            :class="compiled.error ? '!border-red-400' : ''"
            :aria-invalid="!!compiled.error"
            @keydown.esc="open = false"
          >
        </label>
        <p v-if="compiled.error" class="font-mono text-xs text-red-700" role="alert">{{ t('git.messagePattern.lastValidPatternStays', { error: compiled.error }) }}</p>
        <p v-else class="text-sm text-neutral-700"><I18nT k="git.messagePattern.commitsPeriodMatchCase"><template #matchedLength><span class="font-mono text-neutral-900">{{ formatNumber(matched.length) }}</span></template><template #messagesLength><span class="font-mono">{{ formatNumber(messages.length) }}</span></template></I18nT></p>
        <div v-if="!compiled.error" class="grid grid-cols-2 gap-3">
          <section>
            <h4 class="ui-label mb-1">{{ t('git.messagePattern.matches') }}</h4>
            <ul class="flex flex-col gap-0.5 text-xs text-neutral-700">
              <li v-for="m in samples" :key="m" class="truncate font-mono" :title="m">{{ m }}</li>
              <li v-if="!matched.length" class="text-neutral-400">{{ t('git.messagePattern.none') }}</li>
            </ul>
          </section>
          <section>
            <h4 class="ui-label mb-1" :title="t('git.messagePattern.subjectsFixBugRevert')">{{ t('git.messagePattern.nearMisses') }}</h4>
            <ul class="flex flex-col gap-0.5 text-xs text-neutral-500">
              <li v-for="m in misses" :key="m" class="truncate font-mono" :title="m">{{ m }}</li>
              <li v-if="!misses.length" class="text-neutral-400">{{ t('git.messagePattern.none') }}</li>
            </ul>
          </section>
        </div>
        <div class="flex items-center gap-2 hairline-t pt-3">
          <label class="flex items-center gap-2 text-sm text-neutral-800">
            <Checkbox :model-value="active" @update:model-value="active = !!$event"/>
            {{ t('git.messagePattern.showOnlyMatchingCommits') }}
          </label>
          <button v-if="draft !== DEFAULT_FIX_PATTERN" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="draft = DEFAULT_FIX_PATTERN">{{ t('git.messagePattern.default') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import Icon from "~/shared/ui/Icon.vue";
import { useStateStore } from "~/platform/state.store";
import { compileFixPattern, DEFAULT_FIX_PATTERN, fixPatternSource, nearMisses, setFixPattern, subjectOf } from "~/features/git/commitPattern";
import { formatNumber } from "~/shared/format";
import { t } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT";

// The pattern behind "fix commits", editable and checkable: how many match,
// five that do, five that nearly did. Kept per workspace.

const props = defineProps<{ messages: Array<string | null | undefined> }>();
const active = defineModel<boolean>("active", { default: false });

const state = useStateStore();
const open = ref(false);
const draft = ref(fixPatternSource());
watch(() => state.get<string>("git.fixPattern", ""), () => { if (!open.value) draft.value = fixPatternSource(); });
const compiled = computed(() => compileFixPattern(draft.value));
// Only a valid pattern is kept; an invalid one is shown and waits.
watch(draft, () => { if (compiled.value.re) setFixPattern(draft.value); });

const matched = computed(() => {
  const re = compiled.value.re;
  if (!re) return [];
  return props.messages.map(subjectOf).filter(s => re.test(s));
});
const samples = computed(() => [...new Set(matched.value)].slice(0, 5));
const misses = computed(() => (compiled.value.re ? nearMisses(compiled.value.re, props.messages) : []));
</script>
