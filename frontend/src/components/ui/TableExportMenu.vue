<template>
  <div class="relative shrink-0">
    <button
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
      :disabled="count === 0"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="`Export ${title}`"
      :title="status || (count ? `Export ${title}` : 'No rows to export')"
      @click.stop="open = !open"
    >
      <Icon :icon="status ? 'check' : 'more-horizontal'" :size="13" :class="status ? 'text-green-600' : ''"/>
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40 cursor-default" @click.stop="close"></div>
      <div class="ui-menu absolute right-0 z-50 mt-1 flex w-56 flex-col animate-in" role="menu" @keydown.esc.stop="close">
        <button type="button" class="ui-menu-item" role="menuitem" @click.stop="run(copyTableMarkdown)">
          <Icon icon="copy" :size="12" class="text-neutral-500"/><span class="min-w-0 flex-1 truncate">{{ confirming ? `Copy ${count.toLocaleString("en-US")} rows? Click again` : "Copy as Markdown" }}</span>
        </button>
        <button type="button" class="ui-menu-item" role="menuitem" @click.stop="run(copyTableCsv)">
          <Icon icon="copy" :size="12" class="text-neutral-500"/><span>Copy as CSV</span>
        </button>
        <button type="button" class="ui-menu-item" role="menuitem" @click.stop="run(saveTableCsv)">
          <Icon icon="table" :size="12" class="text-neutral-500"/><span class="flex-1">Save CSV…</span>
          <span class="font-mono text-xs text-neutral-400">{{ count.toLocaleString("en-US") }}</span>
        </button>
      </div>
    </template>
    <p v-if="error" class="ui-popover absolute right-0 z-50 mt-1 w-64 p-2.5 text-sm text-red-700" role="alert" @click.stop="error = ''">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import type { ExportColumn, ExportRow } from "~/utils/export";
import { MARKDOWN_ROW_WARNING } from "~/utils/export";
import { copyTableCsv, copyTableMarkdown, saveTableCsv, type TableSource } from "~/utils/exportActions";

// The Export menu's table items for a list in the inspector, where the
// toolbar's menu would be out of reach: every row the list holds, not the
// ones scrolled into view.

const props = defineProps<{ title: string; columns: ExportColumn[]; rows: ExportRow[] }>();

const open = ref(false);
const status = ref("");
const error = ref("");
const confirming = ref(false);
const count = computed(() => props.rows.length);
const source: TableSource = { get title() { return props.title; }, columns: () => props.columns, rows: () => props.rows };

function close() { open.value = false; confirming.value = false; }

async function run(action: (t: TableSource) => Promise<string | null>) {
  if (action === copyTableMarkdown && count.value > MARKDOWN_ROW_WARNING && !confirming.value) { confirming.value = true; return; }
  close();
  try {
    const word = await action(source);
    if (!word) return;
    error.value = "";
    status.value = word;
    setTimeout(() => { status.value = ""; }, 1600);
  } catch (e) {
    error.value = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
</script>
