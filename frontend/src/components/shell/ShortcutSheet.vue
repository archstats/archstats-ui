<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center bg-neutral-900/20 pt-[12vh]" @click.self="close">
      <div class="ui-popover w-[680px] max-w-[92vw] p-5 animate-in" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
        <div class="mb-4 flex items-center justify-between">
          <h2 id="shortcut-title" class="text-base font-semibold text-neutral-900">Keyboard shortcuts</h2>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Close" @click="close"><Icon icon="x" :size="13"/></button>
        </div>
        <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <section v-for="area in areas" :key="area.name">
            <h3 class="ui-label mb-2">{{ area.name }}</h3>
            <dl class="ui-kv">
              <template v-for="s in area.items" :key="s.label">
                <dt class="!whitespace-normal !text-neutral-700">{{ s.label }}</dt>
                <dd class="flex shrink-0 items-start justify-end gap-1">
                  <kbd v-for="k in s.keys" :key="k" class="rounded border border-neutral-200 bg-neutral-50 px-1.5 font-mono text-xs text-neutral-800">{{ keyLabel(k, isMac) }}</kbd>
                </dd>
              </template>
            </dl>
          </section>
        </div>
        <div class="mt-5 flex items-center justify-between hairline-t pt-3 text-sm text-neutral-500">
          <span>What every number means lives in the metric reference.</span>
          <button type="button" class="ui-btn ui-btn-sm" @click="openReference">Metric reference</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { SHORTCUTS, keyLabel } from "~/utils/shortcuts";
import { usePlatform } from "~/composables/usePlatform";
import { runCommand } from "~/utils/commands";

const open = defineModel<boolean>({ default: false });
const { isMac } = usePlatform();

const areas = computed(() => {
  const order = ["App", "Views", "Selection", "Lens builder"] as const;
  return order.map(name => ({ name, items: SHORTCUTS.filter(s => s.area === name) }));
});

function close() { open.value = false; }
function openReference() { close(); void runCommand("help:metrics"); }
</script>
