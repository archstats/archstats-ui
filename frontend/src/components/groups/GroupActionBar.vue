<template>
  <Teleport to="body">
    <!-- No transform on the tray: the menu's click-away backdrop must span the viewport. -->
    <Transition name="tray">
      <div
        v-if="selectedItems.length > 0"
        ref="trayEl"
        class="tray-host pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center"
      >
      <div
        class="ui-popover pointer-events-auto flex max-w-[calc(100vw-2rem)] select-none items-center gap-2 py-1.5 pl-3 pr-2 text-neutral-900"
        role="toolbar"
        aria-label="Selection"
      >
        <div class="flex items-center gap-2 pr-3 hairline-r">
          <span class="ui-tag">{{ selectedItems.length }}</span>
          <span class="whitespace-nowrap text-base font-medium">{{ noun }} selected</span>
        </div>

        <!-- Create is the primary act: one click, a prefilled name, Enter. -->
        <template v-if="!naming">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" title="Create a group from the selection (⌘G)" @click="startCreate()">
            <Icon icon="users" :size="13"/>
            <span>Create group</span>
          </button>
        </template>
        <form v-else class="flex items-center gap-1.5" @submit.prevent="create">
          <input
            ref="nameEl"
            v-model="name"
            type="text"
            class="ui-input ui-input-sm w-44"
            aria-label="Group name"
            placeholder="Group name"
            @keydown.esc.stop.prevent="cancel"
          />
          <span class="text-xs text-neutral-400">in</span>
          <select v-if="!newDimension" class="ui-input ui-input-sm w-32" aria-label="Lens" :value="dimension" @change="onDimensionPick(($event.target as HTMLSelectElement).value)">
            <option v-for="d in dimensions" :key="d" :value="d">{{ d }}</option>
            <option value="__new__">New lens…</option>
          </select>
          <input
            v-else
            ref="dimensionEl"
            v-model="dimension"
            type="text"
            class="ui-input ui-input-sm w-32"
            aria-label="New lens"
            placeholder="Domain, Layer…"
            @keydown.esc.stop.prevent="newDimension = false; dimension = startDimension()"
          />
          <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!name.trim()">Create</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="cancel">Cancel</button>
        </form>

        <!-- What the selection would be if it were said rather than listed.
             Offered, never assumed: picking twelve of fourteen things by hand
             is not the same as meaning "everything under booking", and only
             the person pointing knows which they meant. Alt+Enter takes it. -->
        <button
          v-if="naming && pattern"
          type="button"
          class="ui-chip min-w-0 max-w-[26rem] gap-1.5"
          :class="{ 'is-active': usePattern }"
          :aria-pressed="usePattern"
          :title="pattern.title"
          @click="usePattern = !usePattern"
        >
          <Icon :icon="usePattern ? 'check' : 'braces'" :size="12" :class="usePattern ? '' : 'text-neutral-400'"/>
          <span class="min-w-0 truncate font-mono text-sm">{{ pattern.lead }}</span>
          <span v-if="pattern.extra" class="shrink-0 text-xs text-neutral-400">+{{ pattern.extra }}</span>
        </button>

        <div v-if="!naming" class="relative">
          <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="addOpen" :disabled="groups.length === 0" :title="groups.length ? 'Add the selection to an existing group' : 'No groups yet'" @click.stop="addOpen = !addOpen">
            <span>Add to</span>
            <Icon icon="chevron-right" :size="12" class="-rotate-90 text-neutral-400"/>
          </button>
          <div v-if="addOpen" class="fixed inset-0 z-40" @click="addOpen = false"></div>
          <div v-if="addOpen" class="ui-menu absolute bottom-full left-1/2 z-50 mb-2 flex w-60 -translate-x-1/2 flex-col animate-in" role="menu">
            <div class="max-h-64 overflow-y-auto">
              <template v-for="bucket in groupsStore.groupsByDimension" :key="bucket.dimension">
                <div v-if="groupsStore.groupsByDimension.length > 1" class="ui-menu-title">{{ bucket.dimension }}</div>
                <button v-for="g in bucket.groups" :key="g.id" type="button" class="ui-menu-item" role="menuitem" @click="addTo(g.id)">
                  <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
                  <span class="min-w-0 flex-1 truncate">{{ g.name }}</span>
                  <span class="font-mono text-xs text-neutral-400">{{ g.members.length }}</span>
                </button>
              </template>
            </div>
          </div>
        </div>

        <button v-if="!naming && inAnyGroup" type="button" class="ui-btn ui-btn-sm ui-btn-quiet whitespace-nowrap" title="Remove the selection from every group" @click="removeFromAll">
          Remove from groups
        </button>

        <span class="ui-toolbar-sep"></span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear selection" title="Clear selection (Esc)" @click="emit('clear')">
          <Icon icon="x" :size="13"/>
        </button>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { usePatternOffer } from "~/composables/usePatternOffer";
import { DEFAULT_DIMENSION, units, useGroupsStore, type SavedGroup, type UnitKind } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";

// Module-level so every tray on every view shares the last used dimension;
// the lens wins while it exists, so a quick group lands where you are looking.
let lastDimension: string | null = null;

// The one selection tray for every view. A selection of components, files
// or classes becomes a group in two keystrokes: ⌘G (or the Create button),
// Enter. The group appears in the sidebar and the selected items recolour
// where they are, so the result is seen where it was made.

const props = withDefaults(defineProps<{
  selectedItems: string[]
  /** What the selected names are. Classes are their files. */
  kind: UnitKind
  /** The word for one selected item; defaults to the kind. */
  noun?: string
}>(), { noun: undefined });

const emit = defineEmits<{
  (e: "clear"): void
  (e: "created", group: SavedGroup): void
}>();

const groupsStore = useGroupsStore();
const lens = useLensStore();
const trayEl = ref<HTMLElement | null>(null);
const startDimension = () => lens.active ?? lastDimension ?? DEFAULT_DIMENSION;
const nameEl = ref<HTMLInputElement | null>(null);
const naming = ref(false);
const name = ref("");
const addOpen = ref(false);

const noun = computed(() => `${props.noun ?? props.kind}${props.selectedItems.length === 1 ? "" : "s"}`);

// Dimension: which axis the new group cuts along. Remembered across
// creations so "Domain, Domain, Domain" is three Enters, not three picks.
const dimensionEl = ref<HTMLInputElement | null>(null);
const dimension = ref(startDimension());
const newDimension = ref(false);
const dimensions = computed(() => {
  const list = [...groupsStore.dimensions];
  if (list.length === 0) list.push(DEFAULT_DIMENSION);
  if (!list.includes(dimension.value) && dimension.value) list.push(dimension.value);
  return list;
});
async function onDimensionPick(value: string) {
  if (value === "__new__") {
    newDimension.value = true;
    dimension.value = "";
    await nextTick();
    dimensionEl.value?.focus();
  } else {
    dimension.value = value;
  }
}
const groups = computed<SavedGroup[]>(() => groupsStore.groups);
const selectedUnits = computed(() => units(props.kind, props.selectedItems));
const inAnyGroup = computed(() => props.selectedItems.some(id => groupsStore.directGroupsOf(props.kind, id).length > 0));

// ── Saying the selection instead of listing it ─────────────────────────
//
// A group written as a list of ids is a snapshot of a decision; written as a
// pattern it is the decision, and it survives the rename that would have
// emptied the list in silence. Measured across both benchmark snapshots, a
// proposed group says itself exactly every time, and on a codebase whose
// packages match its domains it usually takes one line.

const usePattern = ref(false);

const pattern = computed(() => {
  if (!naming.value || props.selectedItems.length < 2) return null;
  const universe = props.kind === "file"
    ? Array.from(dataStore.fileComponentIndex.keys())
    : Array.from(dataStore.componentFilesIndex.keys());
  if (universe.length === 0) return null;
  const sep = props.kind === "file" ? "/" : detectSeparator(universe);
  const g = generalise(props.selectedItems, universe, sep);
  const lines = g.terms.length + g.literals.length + g.exclusions.length;
  // Only worth offering when it actually says something shorter. A "pattern"
  // that is the same twelve ids with extra punctuation is a worse list.
  if (g.terms.length === 0 || lines >= props.selectedItems.length) return null;
  return { ...g, lines };
});

const patternGain = computed(() => {
  if (!pattern.value) return "";
  const extra = pattern.value.lines - 1;
  return extra > 0 ? `+${extra} more ${extra === 1 ? "line" : "lines"}` : "1 line";
});

const patternTitle = computed(() =>
  pattern.value
    ? `Save as a query instead of ${props.selectedItems.length} names:\n\n${pattern.value.text}\n\nIt keeps matching as the code moves, and says so when it stops.`
    : "");

function nextName(): string {
  const taken = new Set(groups.value.map(g => g.name));
  let n = groups.value.length + 1;
  while (taken.has(`Group ${n}`)) n++;
  return `Group ${n}`;
}

async function startCreate(suggested?: string) {
  if (!props.selectedItems.length) return;
  addOpen.value = false;
  name.value = (typeof suggested === "string" && suggested.trim()) || nextName();
  usePattern.value = false;
  dimension.value = startDimension();
  newDimension.value = false;
  naming.value = true;
  await nextTick();
  nameEl.value?.focus();
  nameEl.value?.select();
}

function cancel() {
  naming.value = false;
}

let creating = false;
function create() {
  const label = name.value.trim();
  if (!label || creating) return;
  creating = true;
  try {
    const dim = dimension.value.trim() || DEFAULT_DIMENSION;
    const group = groupsStore.createGroup(label, selectedUnits.value, dim);
    // The members stay as written so nothing reading them sees an empty
    // group; once there is a query, resolution comes from the snapshot.
    if (usePattern.value && pattern.value) groupsStore.setQuery(group.id, pattern.value.text, "live");
    lastDimension = dim;
    newDimension.value = false;
    emit("created", group);
  } catch (err) {
    console.error("Could not create group", err);
  } finally {
    // Whatever happened in the store, the tray leaves naming mode and hands
    // the selection back, so it can never be left half-way.
    naming.value = false;
    creating = false;
    emit("clear");
  }
}

function addTo(groupId: string) {
  groupsStore.addMembersToGroup(groupId, selectedUnits.value);
  addOpen.value = false;
  emit("clear");
}

function removeFromAll() {
  for (const g of groups.value) groupsStore.removeMembersFromGroup(g.id, selectedUnits.value);
  emit("clear");
}

// ⌘G / Ctrl+G creates from the current selection wherever the tray is shown.
function onKey(event: KeyboardEvent) {
  if (!props.selectedItems.length) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
    event.preventDefault();
    if (!naming.value) startCreate();
    return;
  }
  if (event.altKey && event.key === "Enter" && naming.value && pattern.value) {
    event.preventDefault();
    usePattern.value = true;
    create();
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
watch(() => props.selectedItems.length, (n) => { if (n === 0) { naming.value = false; addOpen.value = false; usePattern.value = false; } });

defineExpose({ startCreate });
</script>

<style scoped>
.tray-enter-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease-out;
}
.tray-leave-active {
  transition: transform 140ms ease-in, opacity 120ms ease-in;
}
.tray-enter-from, .tray-leave-to {
  transform: translateY(12px);
  opacity: 0;
}
</style>
