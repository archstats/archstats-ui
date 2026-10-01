<template>
  <div class="flex flex-col gap-2 rounded-md bg-neutral-50 p-2">
    <div class="flex items-baseline gap-2">
      <span class="ui-label">{{ t('lens-builder.splitSheet.split', { short }) }}</span>
      <span class="ml-auto font-mono text-xs text-neutral-400">{{ t('lens-builder.splitSheet.of', { pickedSize: picked.size, filesLength: files.length }) }}</span>
    </div>
    <p class="text-xs leading-4 text-neutral-500">
{{ t('lens-builder.splitSheet.componentOnlySplitsWhen') }} <span class="text-neutral-700">{{ from }}</span>.
    </p>

    <!-- What the engine found, and what it is worth. It draws the line and
         stops there: what a file imports is what it USES, which is not the
         same as where it belongs, so the destination stays an open question. -->
    <p v-if="proposed" class="rounded bg-blue-50 px-2 py-1.5 text-xs leading-4 text-blue-900">
      <I18nT k="lens-builder.splitSheet.theyLeanTowardsWhere"><template #theseFilesDisagreeRest><span class="font-medium">{{ t('lens-builder.splitSheet.theseFilesDisagreeRest', { leavingLength: proposed.leaving.length }) }}</span></template><template #rival><span class="font-medium">{{ proposed.rival }}</span></template><template #separatingThemStopsCrossing><template v-if="proposed.moved > 0">{{ t('lens-builder.splitSheet.separatingThemStopsCrossing', { references: t('common.count.reference', { count: proposed.moved }) }) }}</template></template></I18nT> </p>

    <!-- Whole folders first: a split usually follows a directory, not a file. -->
    <div v-if="folders.length > 1" class="flex flex-wrap gap-1">
      <button
        v-for="f in folders"
        :key="f.path"
        type="button"
        class="rounded border px-1.5 py-0.5 text-xs transition-colors"
        :class="f.all ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'"
        :title="t('lens-builder.splitSheet.filesUnder', { filesLength: f.files.length, path: f.path })"
        @click="toggleFolder(f)"
      >{{ f.label }} <span class="font-mono text-neutral-400">{{ f.files.length }}</span></button>
    </div>

    <ul class="flex max-h-56 flex-col overflow-y-auto">
      <li
        v-for="f in files"
        :key="f"
        class="flex h-6 cursor-pointer items-center gap-2 rounded px-1 hover:bg-neutral-100"
        role="button"
        tabindex="0"
        :aria-pressed="picked.has(f)"
        :aria-label="`${f} — ${picked.has(f) ? 'leaving' : t('lens-builder.splitSheet.staying', { from })}`"
        @click="toggle(f)"
        @keydown.enter.prevent="toggle(f)"
      >
        <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border" :class="picked.has(f) ? 'border-accent-500 bg-accent-500 text-white' : 'border-neutral-300'">
          <Icon v-if="picked.has(f)" icon="check" :size="9"/>
        </span>
        <span class="min-w-0 truncate font-mono text-xs text-neutral-700" dir="rtl" :title="f">{{ f }}</span>
      </li>
    </ul>

    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs text-neutral-500">{{ t('lens-builder.splitSheet.sendThem') }}</span>
      <button
        v-for="g in targets"
        :key="g.key"
        type="button"
        class="flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-100 disabled:opacity-40"
        :disabled="picked.size === 0"
        :title="t('lens-builder.splitSheet.moveFiles', { pickedSize: picked.size, gName: g.name })"
        @click="emit('split', Array.from(picked), g.key)"
      >
        <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: g.color }"></span>
        <span class="max-w-[8rem] truncate">{{ g.name }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="picked.size === 0" :title="t('lens-builder.splitSheet.startGroupTheseFiles')" @click="emit('split', Array.from(picked), null)">
        <Icon icon="plus" :size="12" class="text-neutral-500"/><span>{{ t('lens-builder.splitSheet.newGroup') }}</span>
      </button>
      <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="emit('close')">{{ t('lens-builder.splitSheet.cancel') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { t } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT"

// Choosing which files leave. Splitting is never automatic and never a side
// effect: it is this sheet, opened deliberately, and it says plainly what
// stays behind and where the rest is going.

const props = defineProps<{
  component: string
  files: string[]
  from: string
  targets: Array<{ key: string; name: string; color: string }>
  /** A line the engine found: these files start picked, and it says why. */
  proposed?: { leaving: string[]; rival: string; moved: number } | null
}>();
const emit = defineEmits<{
  (e: "split", files: string[], toKey: string | null): void
  (e: "close"): void
}>();

// A proposed line starts drawn, because the picking is the work the detector
// did. It stays a proposal: every checkbox is live, no destination is chosen,
// and Cancel leaves nothing behind.
const picked = ref(new Set<string>(props.proposed?.leaving ?? []));
const short = computed(() => props.component.split(/[./\\]/).pop() ?? props.component);

function toggle(f: string) {
  const next = new Set(picked.value);
  if (next.has(f)) next.delete(f); else next.add(f);
  picked.value = next;
}

/** The directories the files fall into: a split usually follows one. */
const folders = computed(() => {
  const by = new Map<string, string[]>();
  for (const f of props.files) {
    const at = Math.max(f.lastIndexOf("/"), f.lastIndexOf("\\"));
    const dir = at > 0 ? f.slice(0, at) : "";
    by.set(dir, [...(by.get(dir) ?? []), f]);
  }
  return Array.from(by, ([path, files]) => ({
    path,
    label: path.split(/[/\\]/).pop() || t("lens-builder.splitSheet.root"),
    files,
    all: files.every(f => picked.value.has(f)),
  })).sort((a, b) => b.files.length - a.files.length);
});

function toggleFolder(f: { files: string[]; all: boolean }) {
  const next = new Set(picked.value);
  for (const file of f.files) { if (f.all) next.delete(file); else next.add(file); }
  picked.value = next;
}
</script>
