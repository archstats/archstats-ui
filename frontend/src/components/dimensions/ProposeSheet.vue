<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-[1000] flex items-center justify-center p-6" @keydown.esc="emit('close')">
        <div class="absolute inset-0 bg-neutral-950/40" @click="emit('close')"></div>
        <div
          ref="sheet"
          tabindex="-1"
          class="ui-popover animate-modal-in relative flex max-h-[min(640px,84vh)] w-full max-w-[720px] flex-col overflow-hidden outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Propose a lens cut"
        >
          <header class="flex shrink-0 items-baseline gap-3 px-5 py-3 hairline-b">
            <h2 class="text-base font-semibold text-neutral-900">Propose a lens cut</h2>
            <p class="min-w-0 text-sm text-neutral-500">
              The same codebase cuts more than one way. Each is measured here before you take it.
            </p>
            <!-- Said where the decision is made, not after it: nothing here
                 touches a saved lens, and a proposal is an opening position. -->
            <span class="ml-auto shrink-0 text-xs text-neutral-550">Fills a draft · nothing is saved yet</span>
          </header>

          <div class="min-h-0 grow overflow-y-auto p-2">
            <button
              v-for="c in cuts"
              :key="c.way.id"
              type="button"
              class="flex w-full flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-colors"
              :class="[
                picked === c.way.id ? 'bg-accent-50' : 'hover:bg-neutral-50',
                c.fitness.ok ? '' : 'opacity-60',
              ]"
              :disabled="!c.fitness.ok"
              :aria-pressed="picked === c.way.id"
              @click="picked = c.way.id"
            >
              <span class="flex items-baseline gap-2">
                <Icon :icon="ICON[c.way.id]" :size="13" :class="picked === c.way.id ? 'text-accent-600' : 'text-neutral-400'"/>
                <span class="text-sm font-medium text-neutral-900">{{ c.way.label }}</span>
                <span class="min-w-0 truncate text-xs text-neutral-500">{{ c.way.hint }}</span>
                <Icon v-if="picked === c.way.id" icon="check" :size="12" class="ml-auto shrink-0 text-accent-600"/>
              </span>

              <!-- What it would actually produce. A choice between five ways
                   of cutting is a guess until each one says what it comes to,
                   and the numbers are cheap: the engine has already run. -->
              <span v-if="!c.fitness.ok" class="pl-[21px] text-xs leading-4 text-amber-700">{{ c.fitness.why }}</span>
              <template v-else-if="c.preview">
                <span class="flex flex-wrap items-baseline gap-x-3 pl-[21px] font-mono text-xs tabular-nums text-neutral-600">
                  <span>{{ c.preview.groups }} groups</span>
                  <span class="text-neutral-550">·</span>
                  <span>{{ c.preview.placed }}/{{ total }} placed</span>
                  <template v-if="c.way.cut !== 'horizontal'">
                    <span class="text-neutral-550">·</span>
                    <span :class="TONE[c.preview.tone]">{{ Math.round(c.preview.kept * 100) }}% kept inside</span>
                  </template>
                  <span class="text-neutral-550">·</span>
                  <span :class="c.preview.biggest > 0.5 ? 'text-amber-700' : 'text-neutral-600'">biggest {{ Math.round(c.preview.biggest * 100) }}%</span>
                  <span v-if="unnamed(c.preview)" class="text-neutral-550" :title="`The engine grouped these but could not find a word for them. A group nobody can name is usually a group nobody would recognise.`">
                    · {{ unnamed(c.preview) }} unnamed
                  </span>
                </span>

                <!-- The cut itself, drawn to scale: every group as a slice of
                     the codebase, in the colour it would be given, with what
                     it leaves behind at the end. This is the part a row of
                     numbers cannot say. -->
                <span class="flex h-2 gap-px overflow-hidden rounded-sm pl-[21px]" :title="shapeOf(c.preview)">
                  <span
                    v-for="(g, i) in c.preview.sizes"
                    :key="g.name + i"
                    class="h-full first:rounded-l-sm"
                    :style="{ width: (g.size / total) * 100 + '%', backgroundColor: PALETTE[i % PALETTE.length] }"
                  ></span>
                  <span
                    v-if="total > c.preview.placed"
                    class="h-full rounded-r-sm bg-neutral-200"
                    :style="{ width: ((total - c.preview.placed) / total) * 100 + '%' }"
                    :title="`${total - c.preview.placed} left for you`"
                  ></span>
                </span>

                <!-- Names with their sizes, because "Group A" and "Group A, 86
                     components" are different amounts of information. The
                     chosen row shows all of them. -->
                <span class="pl-[21px] text-xs leading-5 text-neutral-500" :class="picked === c.way.id ? '' : 'truncate'">
                  <template v-for="(g, i) in (picked === c.way.id ? c.preview.sizes : c.preview.sizes.slice(0, 6))" :key="g.name + i">
                    <span v-if="i" class="text-neutral-550"> · </span><span :class="g.named ? 'text-neutral-600' : 'text-neutral-550 italic'">{{ g.name }}</span><span class="ml-1 font-mono text-neutral-550">{{ g.size }}</span>
                  </template>
                  <template v-if="picked !== c.way.id && c.preview.sizes.length > 6"><span class="text-neutral-550"> · … {{ c.preview.sizes.length - 6 }} more</span></template>
                </span>
              </template>
              <span v-else class="pl-[21px] text-xs leading-4 text-neutral-400">measuring…</span>
            </button>
          </div>

          <!-- The second half of the same decision, and downstream of it:
               a layer is the one question a package answers two ways at once,
               so only there does dividing a component pay. Measured: every
               other way scored worse split than whole. -->
          <div v-if="chosen?.fitness.ok" class="flex shrink-0 items-center gap-2 px-5 py-2.5 hairline-t">
            <span class="ui-label shrink-0">Made of</span>
            <div class="ui-segmented" role="group" aria-label="What this lens is made of">
              <button
                v-for="g in GRAINS"
                :key="g"
                type="button"
                :aria-pressed="grain === g"
                :class="{ 'is-active': grain === g }"
                :title="GRAIN[g].consequence"
                @click="grain = g"
              >{{ GRAIN[g].label }}</button>
            </div>
            <span class="min-w-0 truncate text-xs text-neutral-500">{{ GRAIN[grain].hint }}</span>
          </div>

          <footer class="flex shrink-0 items-center gap-2 px-5 py-3 hairline-t">
            <!-- Proposing replaces the draft, so the cost is stated before
                 the button rather than discovered after it. -->
            <span class="text-xs leading-4" :class="existing ? 'text-amber-700' : 'text-neutral-500'">
              <template v-if="existing">
                Replaces the {{ existing }} {{ existing === 1 ? "group" : "groups" }} in your draft. Undo brings {{ existing === 1 ? "it" : "them" }} back.
              </template>
              <template v-else>
                You can rename, merge, split and drop anything it proposes before saving.
              </template>
            </span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="emit('close')">Cancel</button>
            <button
              type="button"
              class="ui-btn ui-btn-sm ui-btn-primary"
              :disabled="!chosen || !chosen.fitness.ok || busy"
              @click="apply"
            >{{ busy ? "Proposing…" : chosen ? `Propose ${chosen.way.label}` : "Propose" }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { GROUP_COLOR_PALETTE as PALETTE } from "~/stores/groups";
import { GRAIN, WAYS, type Fitness, type Grain, type Way, type WayId } from "~/utils/studio";

// Choosing how to cut, with each answer measured first.
//
// This replaces a "Cutting by" picker in the toolbar and a "Propose a first
// pass" button beside it — two controls for one decision, neither of which
// said what the decision would produce. The way is part of the proposal, so
// it is chosen here, against evidence, and applied in one action.

const ICON: Record<WayId, string> = {
  domain: "boxes", layer: "layers", owner: "users", change: "git-commit", free: "network",
};

const TONE: Record<"good" | "fair" | "poor", string> = {
  good: "text-green-700", fair: "text-amber-700", poor: "text-red-700",
};

export interface CutPreview {
  groups: number
  placed: number
  kept: number
  modularity: number
  /** Every group it would make, largest first. The shape of a cut is not in
   *  its group count: nine even groups and one giant plus eight scraps read
   *  identically as "9 groups", and are not the same cut at all. */
  sizes: Array<{ name: string; size: number; named: boolean }>
  /** The largest group's share of what it placed. */
  biggest: number
  tone: "good" | "fair" | "poor"
}

const props = defineProps<{
  open: boolean
  total: number
  /** Groups already in the draft, which proposing would replace. */
  existing: number
  current: WayId
  fitnessOf: (way: Way) => Fitness
  /** Measured per way, filled in as each finishes. */
  previews: Map<WayId, CutPreview>
  busy?: boolean
}>();

const emit = defineEmits<{
  (e: "close"): void
  (e: "propose", id: WayId, grain: Grain): void
}>();

const GRAINS: Grain[] = ["component", "file"];

const sheet = ref<HTMLElement | null>(null);
const picked = ref<WayId>(props.current);
const grain = ref<Grain>("component");

const cuts = computed(() => WAYS.map(way => ({
  way,
  fitness: props.fitnessOf(way),
  preview: props.previews.get(way.id) ?? null,
})));

const chosen = computed(() => cuts.value.find(c => c.way.id === picked.value) ?? null);

watch(() => props.open, isOpen => {
  if (!isOpen) return;
  picked.value = props.current;
  nextTick(() => sheet.value?.focus());
});

// Each way arrives made of what it is normally made of; changing the way
// changes the default, because the way is what decides it.
watch(picked, id => { grain.value = WAYS.find(w => w.id === id)?.grain ?? "component"; }, { immediate: true });

/** Groups the engine grouped but could not find a word for. */
const unnamed = (p: CutPreview) => p.sizes.filter(g => !g.named).length;

/** The shape in words, for anyone who cannot read the bar. */
function shapeOf(p: CutPreview): string {
  const head = p.sizes.slice(0, 12).map(g => `${g.name} ${g.size}`).join(", ");
  const rest = p.sizes.length > 12 ? `, and ${p.sizes.length - 12} more` : "";
  const left = props.total - p.placed;
  return `${head}${rest}${left > 0 ? `. ${left} left for you.` : "."}`;
}

function apply() {
  if (!chosen.value?.fitness.ok) return;
  emit("propose", picked.value, grain.value);
}
</script>
