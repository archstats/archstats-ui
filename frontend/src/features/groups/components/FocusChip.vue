<template>
  <span v-if="scope.focus || canBack" class="relative flex shrink-0 items-center gap-0.5">
    <button
      v-if="canBack"
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
      :title="`Back to ${backLabel} (⌥←)`"
      :aria-label="`Back to ${backLabel}`"
      @click="scope.back()"
    >
      <Icon icon="arrow-left" :size="13"/>
    </button>
    <span v-if="scope.focus" class="ui-chip is-active max-w-[300px] pr-1">
      <Icon icon="focus" :size="12" class="shrink-0 text-accent-600"/>
      <button type="button" class="min-w-0 truncate text-left" :title="`${label}\n\n${scope.focus}\n\nEvery view shows only these ${count.toLocaleString('en-US')} components.`" :aria-expanded="open" @click.stop="open = !open">{{ label }}</button>
      <span class="shrink-0 font-mono text-xs text-neutral-500">{{ count.toLocaleString("en-US") }}</span>
      <template v-if="spec && hasDepth(spec)">
        <button type="button" class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30" :disabled="!narrower" title="One hop less (−)" aria-label="One hop less" @click.stop="step(-1)"><Icon icon="minus" :size="11"/></button>
        <button type="button" class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30" :disabled="!wider" title="One hop more (+)" aria-label="One hop more" @click.stop="step(1)"><Icon icon="plus" :size="11"/></button>
      </template>
      <button type="button" class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900" title="Clear the focus" aria-label="Clear the focus" @click.stop="scope.clearFocus()">
        <Icon icon="x" :size="11"/>
      </button>
    </span>
    <button
      v-if="scope.focusAhead.length"
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet"
      :title="`Forward (⌥→)`"
      aria-label="Forward"
      @click="scope.forward()"
    >
      <Icon icon="arrow-right" :size="13"/>
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false"></div>
      <div class="ui-popover absolute left-0 top-full z-50 mt-1 flex w-80 flex-col gap-3 p-3 animate-in">
        <div class="flex flex-col gap-1">
          <span class="ui-label">Focus</span>
          <p class="text-sm text-neutral-800">{{ label }}</p>
          <code class="whitespace-pre-wrap break-all rounded bg-neutral-100 px-1.5 py-1 font-mono text-xs text-neutral-700">{{ scope.focus }}</code>
          <p class="text-xs leading-4 text-neutral-500">Every view shows only these {{ count.toLocaleString("en-US") }} components, measured on runtime imports.</p>
        </div>
        <div v-if="spec && directional" class="flex flex-col gap-1">
          <span class="ui-label">Follow</span>
          <div class="ui-segmented w-full" role="group" aria-label="Follow">
            <button type="button" class="flex-1" :aria-pressed="spec.op === 'around'" @click="retarget('around')">Both ways</button>
            <button type="button" class="flex-1" :aria-pressed="spec.op === 'dependencies'" @click="retarget('dependencies')">What it uses</button>
            <button type="button" class="flex-1" :aria-pressed="spec.op === 'dependents'" @click="retarget('dependents')">What uses it</button>
          </div>
          <div class="ui-segmented w-full" role="group" aria-label="How far">
            <button v-for="d in [1, 2, 3]" :key="d" type="button" class="flex-1" :aria-pressed="spec.depth === d" @click="setDepth(d)">{{ d }} hop{{ d === 1 ? "" : "s" }}</button>
            <button type="button" class="flex-1" :aria-pressed="spec.depth === null" @click="setDepth(null)">All</button>
          </div>
        </div>
        <div v-if="trail.length" class="flex flex-col gap-0.5">
          <span class="ui-label">Earlier</span>
          <button v-for="t in trail" :key="t.index" type="button" class="ui-menu-item" @click="scope.jumpBack(t.index); open = false">
            <Icon icon="history" :size="12" class="text-neutral-400"/>
            <span class="min-w-0 flex-1 truncate">{{ t.label }}</span>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" title="Keep this focus as a group whose members follow the imports" @click="saveAsGroup">
            <Icon icon="users" :size="13"/><span>Save as group</span>
          </button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="scope.clearFocus(); open = false">Clear</button>
        </div>
      </div>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useScopeStore } from "~/features/groups/scope.store";
import { DEFAULT_DIMENSION, units, useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { componentLabel } from "~/features/navigation/routes";
import { describeFocus, focusText, hasDepth, shortName, stepDepth, type FocusOp } from "~/features/navigation/focusSpec";
import { parseFocus } from "~/features/groups/query";

// The focus, said once in every view's toolbar: what it holds, one hop
// wider or narrower, back along the trail, and kept as a group when it turns
// out to be a slice worth having.

const scope = useScopeStore();
const groups = useGroupsStore();
const lens = useLensStore();
const workspaces = useWorkspacesStore();
const open = ref(false);

// The tail of the name: `org.broadleafcommerce.` filled the chip before the name began.
const nameOf = (id: string) => (id === "." ? componentLabel(id, workspaces.active?.name) : shortName(id));
const describe = (text: string) => (text ? describeFocus(parseFocus(text), text, nameOf) : "Everything");

const spec = computed(() => parseFocus(scope.focus));
const label = computed(() => describe(scope.focus));
const count = computed(() => scope.focusMatches?.size ?? 0);
const wider = computed(() => (spec.value ? stepDepth(spec.value, 1) : null));
const narrower = computed(() => (spec.value ? stepDepth(spec.value, -1) : null));
const directional = computed(() => !!spec.value && ["around", "dependencies", "dependents"].includes(spec.value.op));
const canBack = computed(() => scope.focusBack.length > 0);
const backLabel = computed(() => describe(scope.focusBack[scope.focusBack.length - 1] ?? ""));
const trail = computed(() => scope.focusBack.map((text, index) => ({ index, label: describe(text) })).reverse().slice(0, 8));

function step(delta: 1 | -1) {
  const next = delta > 0 ? wider.value : narrower.value;
  if (next) scope.setFocus(focusText(next));
}
function retarget(op: FocusOp) {
  if (spec.value) scope.setFocus(focusText({ ...spec.value, op }));
}
function setDepth(depth: number | null) {
  if (spec.value) scope.setFocus(focusText({ ...spec.value, depth }));
}

function saveAsGroup() {
  const members = Array.from(scope.focusMatches ?? []);
  if (!members.length) return;
  const g = groups.createGroup(label.value, units("component", members), lens.active ?? DEFAULT_DIMENSION);
  groups.setQuery(g.id, scope.focus, "live");
  open.value = false;
}

// ⌥← and ⌥→ walk the trail; + and − widen and narrow, wherever the chip is.
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
  if (event.altKey && !event.metaKey && !event.ctrlKey && event.key === "ArrowLeft" && canBack.value) { event.preventDefault(); scope.back(); return; }
  if (event.altKey && !event.metaKey && !event.ctrlKey && event.key === "ArrowRight" && scope.focusAhead.length) { event.preventDefault(); scope.forward(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey || !scope.focus) return;
  if (event.key === "+" || event.key === "=") { event.preventDefault(); step(1); }
  else if (event.key === "-" || event.key === "_") { event.preventDefault(); step(-1); }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>
