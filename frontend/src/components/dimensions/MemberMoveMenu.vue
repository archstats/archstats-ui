<template>
  <div class="relative shrink-0">
    <button
      type="button"
      class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
      :class="{ 'bg-neutral-200 text-neutral-900': open }"
      :aria-expanded="open"
      :aria-label="`Move ${what} to another group`"
      title="Move it to another group"
      @click.stop="set(!open)"
    ><Icon icon="arrow-right" :size="11"/></button>

    <div v-if="open" class="fixed inset-0 z-40" @click.stop="set(false)"></div>
    <div v-if="open" class="ui-menu animate-in absolute right-0 top-6 z-50 flex w-56 flex-col" role="menu">
      <div class="ui-menu-title">Move to</div>
      <div class="max-h-64 overflow-y-auto">
        <!-- Named, not just coloured. This was a row of unlabelled swatches,
             one per group, which could not say which colour was Openadmin —
             and which, laid out even while invisible, took the whole width of
             the row and left every member name truncated to nothing. -->
        <button
          v-for="g in targets"
          :key="g.key"
          type="button"
          class="ui-menu-item"
          role="menuitem"
          @click.stop="pick(g.key)"
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: g.color }"></span>
          <span class="min-w-0 flex-1 truncate">{{ g.name }}</span>
          <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-400">{{ g.size }}</span>
        </button>
      </div>
      <p v-if="!targets.length" class="px-2 py-1.5 text-sm text-neutral-500">There is no other group to move it to yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";

// Where else a member could go, named.

const props = defineProps<{
  targets: Array<{ key: string; name: string; color: string; size: number }>
  /** What is being moved, for the label a screen reader reads. */
  what: string
  /** Shut from outside when the row it belongs to goes away. */
  keepOpen?: boolean
}>();
const emit = defineEmits<{
  (e: "move", to: string): void
  /** The row holds itself open while this is true: a click does not reliably
   *  focus a button in WebKit, so `focus-within` cannot be trusted to do it. */
  (e: "toggle", open: boolean): void
}>();

const open = ref(false);
function set(next: boolean) { open.value = next; emit("toggle", next); }
function pick(to: string) { set(false); emit("move", to); }
watch(() => props.keepOpen, v => { if (v === false && open.value) set(false); });
</script>
