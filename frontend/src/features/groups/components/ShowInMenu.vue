<template>
  <div v-if="targets.length" class="relative">
    <button type="button" class="ui-btn ui-btn-sm" :class="buttonClass" :aria-expanded="open" title="Look at this in another view" @click.stop="open = !open">
      <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/>
      <span>Show in</span>
      <Icon icon="chevron-right" :size="12" class="text-neutral-400" :class="up ? '-rotate-90' : 'rotate-90'"/>
    </button>
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
    <div v-if="open" class="ui-menu absolute z-50 w-60 animate-in" :class="up ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'right-0 top-full mt-1'" role="menu">
      <button v-for="t in targets" :key="t.id" type="button" class="ui-menu-item" role="menuitem" :title="t.focus ? 'Focuses every view on the selection, then opens this view' : ''" @click="go(t)">
        <Icon :icon="t.icon" :size="13" class="text-neutral-500"/>
        <span class="flex-1">{{ t.label }}</span>
        <Icon v-if="t.focus" icon="focus" :size="12" class="text-neutral-400"/>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { showInTargets, showPairTargets, type ShowInKind, type ShowInTarget } from "~/features/navigation/showIn";
import { useShowIn } from "~/features/groups/useShowIn";

const props = withDefaults(defineProps<{
  kind?: ShowInKind
  ids?: string[]
  /** An edge instead of units. */
  pair?: { from: string; to: string } | null
  /** Open the menu upwards (from the bottom tray). */
  up?: boolean
  /** A view the menu is already on is left out of the list. */
  except?: string[]
  buttonClass?: string
}>(), { kind: "component", ids: () => [], pair: null, up: false, except: () => [], buttonClass: "" });

const open = ref(false);
const show = useShowIn();
const targets = computed(() =>
  (props.pair ? showPairTargets(props.pair.from, props.pair.to) : showInTargets(props.kind, props.ids)).filter(t => !props.except.includes(t.id)));

function go(t: ShowInTarget) {
  open.value = false;
  show(t);
}
</script>
