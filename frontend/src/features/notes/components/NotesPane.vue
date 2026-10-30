<template>
  <!-- What was learned about parts of the code, kept for later conversations. Ask reads them back. -->
  <div class="flex flex-col gap-3">
    <form class="flex flex-col gap-2" @submit.prevent="add">
      <input v-model="subject" class="ui-input ui-input-sm w-full" :placeholder="t('notes.pane.subjectPlaceholder')" :aria-label="t('notes.pane.subject')">
      <textarea v-model="text" rows="3" class="ui-input h-auto min-h-[72px] w-full resize-y py-1.5 text-sm" :placeholder="t('notes.pane.textPlaceholder')" :aria-label="t('notes.pane.text')"/>
      <div class="flex justify-end">
        <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!text.trim()">{{ t('notes.pane.add') }}</button>
      </div>
    </form>

    <ul v-if="store.notes.length" class="-mx-1 flex flex-col">
      <li v-for="n in store.notes" :key="n.id" class="group/note relative rounded-md py-2 pl-2 pr-8 transition-colors hover:bg-neutral-200/60">
        <span class="flex items-center gap-1.5 text-[11px] leading-4 text-neutral-500">
          <span class="min-w-0 truncate font-mono text-neutral-700" :title="n.subject">{{ n.subject || t('notes.pane.codebase') }}</span>
          <span class="shrink-0 text-neutral-400" aria-hidden="true">·</span>
          <span class="shrink-0 whitespace-nowrap">{{ n.author === 'model' ? t('notes.pane.byAsk') : t('notes.pane.byPerson') }}</span>
          <template v-if="older(n)"><span class="shrink-0 text-neutral-400" aria-hidden="true">·</span><span class="shrink-0 whitespace-nowrap" :title="t('notes.pane.olderTitle', { commit: n.headCommit.slice(0, 7) })">{{ t('notes.pane.older') }}</span></template>
        </span>
        <p class="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-neutral-900">{{ n.text }}</p>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-1 top-1 opacity-0 transition-opacity focus:opacity-100 group-hover/note:opacity-100" :aria-label="t('notes.pane.remove')" :title="t('notes.pane.remove')" @click="store.remove(n.id)">
          <Icon icon="trash" :size="12"/>
        </button>
      </li>
    </ul>
    <div v-else-if="!store.loading" class="rounded-md px-3 py-4 text-center hairline">
      <p class="text-sm text-neutral-700">{{ t('notes.pane.none') }}</p>
      <p class="mt-1 text-xs leading-5 text-neutral-500">{{ t('notes.pane.noneHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { t } from "~/shared/i18n";
import type { WorkspaceNote } from "~/features/snapshot/snapshot";
import { useNotesStore } from "../notes.store";

const props = defineProps<{ headCommit: string }>();
const store = useNotesStore();
const subject = ref("");
const text = ref("");

const older = (n: WorkspaceNote) => !!props.headCommit && !!n.headCommit && n.headCommit !== props.headCommit;

async function add() {
  await store.add(subject.value, text.value, props.headCommit);
  subject.value = "";
  text.value = "";
}
</script>
