<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-[1000] flex items-center justify-center p-6" @keydown.esc="emit('close')">
        <div class="absolute inset-0 bg-neutral-950/40" @click="emit('close')"></div>
        <div
          ref="sheet"
          tabindex="-1"
          class="ui-popover animate-modal-in relative flex max-h-[min(760px,88vh)] w-full max-w-[720px] flex-col overflow-hidden outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Propose a lens cut"
        >
          <header class="flex shrink-0 items-baseline gap-3 px-5 py-3 hairline-b">
            <h2 class="text-base font-semibold text-neutral-900">Propose a lens cut</h2>
            <p class="min-w-0 text-sm text-neutral-500">
              Pick what to read this codebase by. Each is measured before you take it.
            </p>
            <!-- Said where the decision is made, not after it: nothing here
                 touches a saved lens, and a proposal is an opening position. -->
            <span class="ml-auto shrink-0 text-xs text-neutral-550">Fills a draft · nothing is saved yet</span>
          </header>

          <div class="min-h-0 grow overflow-y-auto px-2 py-1.5">
            <template v-for="section in sections" :key="section.reads">
              <!-- What the reading goes on, said before the readings. Nine
                   options in one flat list is a menu; under these headings it
                   is a question about what to trust about this codebase. -->
              <p class="ui-label px-3 pb-1 pt-3 first:pt-1">{{ section.label }}</p>

              <!-- One line each until you are considering it.
                   Nine readings each carrying five numbers, a bar and six
                   group names is fifty-four names and forty-five figures
                   competing over a single decision, and four of the nine fall
                   below the fold. What you need to CHOOSE is the name, what
                   it goes on, and the shape it comes to; what you need to
                   INSPECT belongs to the one you are looking at. -->
              <button
                v-for="c in section.cuts"
                :key="c.way.id"
                type="button"
                class="flex w-full flex-col gap-1 rounded-md px-3 text-left transition-colors"
                :class="[
                  picked === c.way.id ? 'bg-accent-50 py-2.5' : 'py-1.5 hover:bg-neutral-50',
                  c.fitness.ok ? '' : 'opacity-60',
                ]"
                :disabled="!c.fitness.ok"
                :aria-pressed="picked === c.way.id"
                @click="picked = c.way.id"
              >
                <span class="flex w-full items-baseline gap-2">
                  <Icon :icon="ICON[c.way.id]" :size="13" class="shrink-0 translate-y-px" :class="picked === c.way.id ? 'text-accent-600' : 'text-neutral-400'"/>
                  <span class="shrink-0 text-sm font-medium text-neutral-900">{{ c.way.label }}</span>
                  <!-- Nine equal options and no default is an interrogation.
                       Detection still knows which name reading this codebase
                       suits; it says so here instead of only deciding. -->
                  <span v-if="suggested === c.way.id" class="shrink-0 rounded-sm bg-neutral-100 px-1.5 text-xs font-medium leading-4 text-neutral-600">Suggested</span>
                  <span class="min-w-0 truncate text-xs" :class="c.fitness.ok ? 'text-neutral-500' : 'text-amber-700'">{{ c.fitness.ok ? c.way.hint : c.fitness.why }}</span>
                  <span v-if="c.fitness.ok && c.preview && picked !== c.way.id" class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-550">{{ c.preview.groups }} groups</span>
                  <Icon v-if="picked === c.way.id" icon="check" :size="12" class="ml-auto shrink-0 translate-y-px text-accent-600"/>
                </span>

                <!-- The cut drawn to scale: every group as a slice of the
                     codebase, in the colour it would be given, with what it
                     leaves behind at the end. A hairline of it is still the
                     fastest read of a shape a group count cannot say, so it
                     survives the collapse at a third of the height. -->
                <span
                  v-if="c.fitness.ok && c.preview"
                  class="ml-[21px] flex gap-px overflow-hidden rounded-sm transition-[height]"
                  :class="picked === c.way.id ? 'h-2' : 'h-[3px]'"
                  :title="shapeOf(c.preview)"
                >
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
                <span v-else-if="c.fitness.ok" class="ml-[21px] text-xs leading-4 text-neutral-400">measuring…</span>

                <!-- Everything below belongs to the reading being considered. -->
                <template v-if="picked === c.way.id && c.fitness.ok && c.preview">
                  <span class="ml-[21px] flex flex-wrap items-baseline gap-x-3 font-mono text-xs tabular-nums text-neutral-600">
                    <span>{{ c.preview.groups }} groups</span>
                    <span>{{ c.preview.placed }} of {{ total }} placed</span>
                    <template v-if="c.way.cut !== 'horizontal'">
                      <span :class="TONE[c.preview.tone]">{{ Math.round(c.preview.kept * 100) }}% kept inside</span>
                    </template>
                    <span :class="c.preview.biggest > 0.5 ? 'text-amber-700' : 'text-neutral-600'">biggest group {{ Math.round(c.preview.biggest * 100) }}%</span>
                    <span v-if="unnamed(c.preview)" class="text-neutral-550" title="The engine grouped these but could not find a word for them. A group nobody can name is usually a group nobody would recognise.">{{ unnamed(c.preview) }} unnamed</span>
                  </span>

                  <span class="ml-[21px] text-xs leading-5 text-neutral-500">
                    <template v-for="(g, i) in c.preview.sizes.slice(0, NAMES_SHOWN)" :key="g.name + i">
                      <span v-if="i" class="text-neutral-550"> · </span><component
                        :is="g.word ? 'button' : 'span'"
                        :type="g.word ? 'button' : undefined"
                        :class="[
                          g.named ? 'text-neutral-600' : 'text-neutral-550 italic',
                          g.word
                            ? 'rounded px-0.5 underline decoration-dotted decoration-neutral-400 underline-offset-[3px] hover:bg-neutral-100 hover:text-neutral-900 hover:decoration-transparent hover:line-through'
                            : '',
                        ]"
                        :title="g.word ? `Not a domain? Take ${g.name} out and measure the cut again` : undefined"
                        @click.stop="g.word && emit('strike', g.word)"
                      >{{ g.name }}</component><span class="ml-1 font-mono text-neutral-550">{{ g.size }}</span>
                    </template>
                    <template v-if="c.preview.sizes.length > NAMES_SHOWN"><span class="text-neutral-550"> · … {{ c.preview.sizes.length - NAMES_SHOWN }} more</span></template>
                  </span>

                  <!-- Said once, at rest: an affordance that only appears
                       under the pointer is one you have to already know
                       about. No rule separates a subject from a role in every
                       codebase -- where a project repeats its layers inside
                       every plugin, "controllers" moves through the names
                       exactly as freely as "catalog" does -- so one look at
                       the list settles what no statistic could. -->
                  <span v-if="c.preview.sizes.some(g => g.word)" class="ml-[21px] flex flex-wrap items-baseline gap-x-2 text-xs leading-4 text-neutral-550">
                    <span>A word it got wrong? Click it to take it out and measure again.</span>
                    <template v-if="struck.length">
                      <span class="text-neutral-400">·</span>
                      <span>Taken out:</span>
                      <button
                        v-for="w in struck"
                        :key="w"
                        type="button"
                        class="rounded px-1 text-neutral-500 line-through hover:bg-neutral-100 hover:text-neutral-900 hover:no-underline"
                        :title="`Put ${w} back`"
                        @click.stop="emit('restore', w)"
                      >{{ w }}</button>
                    </template>
                  </span>
                </template>
              </button>
            </template>

            <!-- What the repository itself declares: no measuring of the
                 code, just its own files read back as groups. -->
            <template v-if="repoReadings?.length">
              <p class="ui-label px-3 pb-1 pt-3">From the repository</p>
              <button
                v-for="r in repoReadings"
                :key="r.id"
                type="button"
                class="flex w-full flex-col gap-1 rounded-md px-3 text-left transition-colors"
                :class="[picked === r.id ? 'bg-accent-50 py-2.5' : 'py-1.5 hover:bg-neutral-50', r.ok ? '' : 'opacity-60']"
                :disabled="!r.ok"
                :aria-pressed="picked === r.id"
                @click="picked = r.id"
              >
                <span class="flex w-full items-baseline gap-2">
                  <Icon :icon="r.icon" :size="13" class="shrink-0 translate-y-px" :class="picked === r.id ? 'text-accent-600' : 'text-neutral-400'"/>
                  <span class="shrink-0 text-sm font-medium text-neutral-900">{{ r.label }}</span>
                  <span class="min-w-0 truncate text-xs" :class="r.ok ? 'text-neutral-500' : 'text-amber-700'">{{ r.ok ? r.hint : r.why }}</span>
                  <span v-if="r.ok && r.preview && picked !== r.id" class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-550">{{ r.preview.groups }} groups</span>
                  <Icon v-if="picked === r.id" icon="check" :size="12" class="ml-auto shrink-0 translate-y-px text-accent-600"/>
                </span>
                <span v-if="r.ok && r.preview" class="ml-[21px] flex gap-px overflow-hidden rounded-sm" :class="picked === r.id ? 'h-2' : 'h-[3px]'" :title="shapeOf(r.preview)">
                  <span v-for="(g, i) in r.preview.sizes" :key="g.name + i" class="h-full first:rounded-l-sm" :style="{ width: (g.size / Math.max(total, r.preview.placed, 1)) * 100 + '%', backgroundColor: PALETTE[i % PALETTE.length] }"></span>
                  <span v-if="total > r.preview.placed" class="h-full rounded-r-sm bg-neutral-200" :style="{ width: ((total - r.preview.placed) / total) * 100 + '%' }"></span>
                </span>
                <template v-if="picked === r.id && r.ok && r.preview">
                  <span class="ml-[21px] flex flex-wrap items-baseline gap-x-3 font-mono text-xs tabular-nums text-neutral-600">
                    <span>{{ r.preview.groups }} groups</span>
                    <span v-if="total">{{ r.preview.placed }} of {{ total }} components mostly placed</span>
                    <span :class="r.preview.biggest > 0.5 ? 'text-amber-700' : 'text-neutral-600'">biggest group {{ Math.round(r.preview.biggest * 100) }}%</span>
                  </span>
                  <span class="ml-[21px] text-xs leading-5 text-neutral-500">
                    <template v-for="(g, i) in r.preview.sizes.slice(0, NAMES_SHOWN)" :key="g.name + i"><span v-if="i" class="text-neutral-550"> · </span><span class="text-neutral-600">{{ g.name }}</span><span class="ml-1 font-mono text-neutral-550">{{ g.size }}</span></template>
                    <template v-if="r.preview.sizes.length > NAMES_SHOWN"><span class="text-neutral-550"> · … {{ r.preview.sizes.length - NAMES_SHOWN }} more</span></template>
                  </span>
                  <span v-if="r.note" class="ml-[21px] text-xs leading-4 text-amber-700">{{ r.note }}</span>
                  <label v-if="r.option" class="ml-[21px] flex items-center gap-2 text-xs text-neutral-600" @click.stop>
                    <input type="checkbox" :checked="r.option.on" @change="emit('repoOption', r.id)"> {{ r.option.label }}
                  </label>
                </template>
              </button>
            </template>
          </div>

          <!-- The second half of the same decision, and downstream of it:
               a layer is the one question a package answers two ways at once,
               so only there does dividing a component pay. Measured: every
               other way scored worse split than whole. -->
          <div v-if="chosen?.fitness.ok && !chosenRepo" class="flex shrink-0 items-center gap-2 px-5 py-2.5 hairline-t">
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
              :disabled="chosenRepo ? !chosenRepo.ok || busy : !chosen || !chosen.fitness.ok || busy"
              @click="apply"
            >{{ busy ? "Proposing…" : "Propose this cut" }}</button>
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
import { GRAIN, READS, WAYS, type Fitness, type Grain, type Reads, type Way, type WayId } from "~/utils/studio";

// Choosing how to cut, with each answer measured first.
//
// This replaces a "Cutting by" picker in the toolbar and a "Propose a first
// pass" button beside it — two controls for one decision, neither of which
// said what the decision would produce. The way is part of the proposal, so
// it is chosen here, against evidence, and applied in one action.

// One icon per reading, all of them real. `folder-tree` is not in the set,
// so Package tree drew nothing at all; `layers` and `network` each stood for
// two different readings.
const ICON: Record<WayId, string> = {
  tree: "list-tree", subject: "boxes", role: "layers",
  references: "network", depth: "route", commits: "git-commit",
  authors: "users", lanes: "component", blend: "waypoints",
};

const TONE: Record<"good" | "fair" | "poor", string> = {
  good: "text-green-700", fair: "text-amber-700", poor: "text-red-700",
};

/** A reading of what the repository declares (its CODEOWNERS), proposed as it stands. */
export interface RepoReading {
  id: string
  label: string
  hint: string
  icon: string
  ok: boolean
  why?: string
  preview: CutPreview | null
  /** Said under the reading when it is picked: a caveat about what it will make. */
  note?: string
  /** A switch the reading offers, e.g. "Show 18 test fixtures". */
  option?: { label: string; on: boolean }
}

export interface CutPreview {
  groups: number
  placed: number
  kept: number
  modularity: number
  /** Every group it would make, largest first. The shape of a cut is not in
   *  its group count: nine even groups and one giant plus eight scraps read
   *  identically as "9 groups", and are not the same cut at all. */
  sizes: Array<{ name: string; size: number; named: boolean; word?: string }>
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
  /** Words taken out of the domain vocabulary by hand. */
  struck: string[]
  /** The reading this codebase suits, for the one marked default. */
  suggested?: WayId
  busy?: boolean
  repoReadings?: RepoReading[]
}>();

const emit = defineEmits<{
  (e: "close"): void
  (e: "propose", id: WayId, grain: Grain): void
  (e: "proposeRepo", id: string): void
  (e: "repoOption", id: string): void
  (e: "strike", word: string): void
  (e: "restore", word: string): void
}>();

const GRAINS: Grain[] = ["component", "file"];

/**
 * How many group names the chosen reading spells out. Enough to judge the
 * shape and to catch a word the reading got wrong -- a role word spans a lot
 * of the codebase, so it sorts near the top -- and a count for the tail. A
 * cut with fifty-seven groups printed forty-five of them and rebuilt the wall
 * this collapse exists to remove.
 */
const NAMES_SHOWN = 12;

const sheet = ref<HTMLElement | null>(null);
const picked = ref<string>(props.current);
const grain = ref<Grain>("component");

const cuts = computed(() => WAYS.map(way => ({
  way,
  fitness: props.fitnessOf(way),
  preview: props.previews.get(way.id) ?? null,
})));

/**
 * Grouped by the evidence each reading goes on, because that is the question
 * being asked. Nine readings in one flat list is a menu; the same nine under
 * "From the names", "From what references what", "From the commit history"
 * is a choice about what to trust about this codebase.
 */
const sections = computed(() => {
  const order = Object.keys(READS) as Reads[];
  return order
    .map(reads => ({ reads, label: READS[reads], cuts: cuts.value.filter(c => c.way.reads === reads) }))
    .filter(section => section.cuts.length > 0);
});

const chosen = computed(() => cuts.value.find(c => c.way.id === picked.value) ?? null);
const chosenRepo = computed(() => props.repoReadings?.find(r => r.id === picked.value) ?? null);

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
  if (chosenRepo.value) { if (chosenRepo.value.ok) emit("proposeRepo", chosenRepo.value.id); return; }
  if (!chosen.value?.fitness.ok) return;
  emit("propose", picked.value as WayId, grain.value);
}
</script>
