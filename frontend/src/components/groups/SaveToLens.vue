<template>
  <div
    ref="sheet"
    class="ui-popover flex w-80 flex-col gap-2 p-2.5"
    tabindex="-1"
    role="dialog"
    aria-label="Save to lens"
    @keydown.esc.stop.prevent="emit('cancel')"
  >
    <div class="flex items-center gap-1.5">
      <input
        ref="nameEl"
        v-model="name"
        type="text"
        class="ui-input ui-input-sm min-w-0 flex-1"
        placeholder="Name this group"
        aria-label="Group name"
        @keydown.enter.prevent="save()"
      />
      <span class="shrink-0 text-xs text-neutral-400">in</span>
      <select v-if="lens !== '__new'" class="ui-input ui-input-sm w-28 shrink-0" aria-label="Lens" :value="lens" @change="lens = ($event.target as HTMLSelectElement).value">
        <option v-for="d in lenses" :key="d" :value="d">{{ d }}</option>
        <option value="__new">New lens…</option>
      </select>
      <input
        v-else
        v-model="newLens"
        type="text"
        class="ui-input ui-input-sm w-28 shrink-0"
        placeholder="Teams…"
        aria-label="New lens name"
        @keydown.esc.stop.prevent="lens = lenses[0] ?? 'Domain'"
      />
    </div>

    <!-- The choice exists only when the answer genuinely cannot be inferred.
         A query about names means the same thing tomorrow, so it saves as
         itself with nothing asked: freezing it there would be strictly worse,
         because a rename would drop members in silence while a live query
         says "matches nothing". -->
    <template v-if="asks">
      <p class="text-sm leading-4 text-neutral-600">
        This query asks about measurements, so its answer changes as the code changes.
      </p>

      <div class="flex flex-col gap-1">
        <label
          v-for="choice in CHOICES"
          :key="choice.mode"
          class="flex cursor-pointer gap-2 rounded p-1.5 transition-colors"
          :class="mode === choice.mode ? 'bg-accent-50' : 'hover:bg-neutral-100'"
        >
          <input v-model="mode" type="radio" :value="choice.mode" class="ui-check mt-0.5 shrink-0" :aria-label="choice.title(found)"/>
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="text-base font-medium text-neutral-800">{{ choice.title(found) }}</span>
            <span class="text-sm leading-4 text-neutral-500">{{ choice.hint }}</span>
          </span>
        </label>
      </div>
    </template>

    <div class="flex items-center gap-1.5">
      <span class="text-xs text-neutral-400">{{ summary }}</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="emit('cancel')">Cancel</button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!canSave" @click="save()">Save</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useGroupsStore, type GroupMode } from "~/stores/groups";
import { isLive, parseQuery } from "~/utils/query";

// Turning something you found into something you keep.
//
// The only interesting decision is whether the group IS the query or IS the
// members it found, and it is asked rather than defaulted — a domain map that
// redraws itself because a file grew by 200 lines is worse than no map. It is
// asked ONCE; the group panel changes it later.

const props = defineProps<{
  query: string;
  /** How many units it matches right now. The consequence is stated in this
   *  group's own numbers, because "matches 9 components today" lands where an
   *  explanation of live-versus-fixed does not. */
  found: number;
  suggestedName?: string;
  lens?: string;
}>();

const emit = defineEmits<{
  (e: "save", value: { name: string; lens: string; mode: GroupMode }): void;
  (e: "cancel"): void;
}>();

const CHOICES: Array<{ mode: GroupMode; title: (n: number) => string; hint: string }> = [
  {
    mode: "fixed",
    title: n => `Keep these ${n} ${n === 1 ? "component" : "components"}`,
    // Said plainly, because without it people choose live out of loss
    // aversion: they assume fixed throws the query away.
    hint: "The query is kept and re-checked. You'll be shown new matches to accept, never added silently.",
  },
  {
    mode: "live",
    title: () => "Keep the query",
    hint: "Re-run against every scan. Membership changes on its own.",
  },
];

const groups = useGroupsStore();
const sheet = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLInputElement | null>(null);

const name = ref(props.suggestedName ?? "");
const lens = ref(props.lens ?? groups.dimensions[0] ?? "Domain");
const newLens = ref("");
// A found set is a finding until someone decides otherwise, so the safe
// reading is the default: keep what you actually looked at.
const mode = ref<GroupMode>("fixed");

const lenses = computed(() => (groups.dimensions.length ? groups.dimensions : ["Domain"]));
const asks = computed(() => isLive(parseQuery(props.query)));
const summary = computed(() => `${props.found} ${props.found === 1 ? "match" : "matches"}`);
const resolvedLens = computed(() => (lens.value === "__new" ? newLens.value.trim() : lens.value));
const canSave = computed(() => !!name.value.trim() && !!resolvedLens.value);

onMounted(() => nextTick(() => (nameEl.value ?? sheet.value)?.focus()));

function save() {
  if (!canSave.value) return;
  emit("save", {
    name: name.value.trim(),
    lens: resolvedLens.value,
    // A name-only query has nothing to decide: it is the definition.
    mode: asks.value ? mode.value : "live",
  });
}
</script>
