<template>
  <div class="flex flex-col gap-2 rounded-md bg-neutral-50 p-2">
    <div class="flex items-baseline gap-2">
      <span class="ui-label">Split {{ short }}</span>
      <span class="ml-auto font-mono text-xs text-neutral-400">{{ picked.size }} of {{ files.length }}</span>
    </div>
    <p class="text-xs leading-4 text-neutral-500">
      A component only splits when it is really two things. Pick the files that belong elsewhere; the rest stay in
      <span class="text-neutral-700">{{ from }}</span>.
    </p>

    <!-- What the engine found, and what it is worth. It draws the line and
         stops there: what a file imports is what it USES, which is not the
         same as where it belongs, so the destination stays an open question. -->
    <p v-if="proposed" class="rounded bg-blue-50 px-2 py-1.5 text-xs leading-4 text-blue-900">
      <span class="font-medium">{{ proposed.leaving.length }} of these files disagree with the rest.</span>
      They lean towards <span class="font-medium">{{ proposed.rival }}</span><template v-if="proposed.moved > 0">, and
      separating them stops {{ proposed.moved }} {{ proposed.moved === 1 ? 'reference' : 'references' }} crossing a
      boundary</template>. Where they belong is your call — what a file imports is what it uses, not what it is.
    </p>

    <!-- Whole folders first: a split usually follows a directory, not a file. -->
    <div v-if="folders.length > 1" class="flex flex-wrap gap-1">
      <button
        v-for="f in folders"
        :key="f.path"
        type="button"
        class="rounded border px-1.5 py-0.5 text-xs transition-colors"
        :class="f.all ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'"
        :title="`${f.files.length} files under ${f.path}`"
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
        :aria-label="`${f} — ${picked.has(f) ? 'leaving' : 'staying in ' + from}`"
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
      <span class="text-xs text-neutral-500">Send them to</span>
      <button
        v-for="g in targets"
        :key="g.key"
        type="button"
        class="flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-100 disabled:opacity-40"
        :disabled="picked.size === 0"
        :title="`Move ${picked.size} files to ${g.name}`"
        @click="emit('split', Array.from(picked), g.key)"
      >
        <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: g.color }"></span>
        <span class="max-w-[8rem] truncate">{{ g.name }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="picked.size === 0" title="Start a group from these files" @click="emit('split', Array.from(picked), null)">
        <Icon icon="plus" :size="12" class="text-neutral-500"/><span>New group</span>
      </button>
      <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="emit('close')">Cancel</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";

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
    label: path.split(/[/\\]/).pop() || "root",
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
