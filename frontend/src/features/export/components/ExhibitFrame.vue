<template>
  <!-- An exhibit (a figure or a table) and the row that names it. The export
       button sits at the end of that row, where the eye already is when it
       reads the title, never floating in a band of its own. Three headers:
       `row` draws the title, controls that act on the exhibit (#controls,
       beside the title), context in words (#aside, to the right), then the
       button; `custom` draws none and the page puts <ExhibitButton/> at the
       end of the strip it already has (a tangle's header, a control row);
       `overlay` is for a figure with no row of its own (a canvas that fills
       its pane, a small figure in a card), where the button is a control chip
       in the figure's top-right corner that shows only while the pointer is
       over the figure, keyboard focus is in it, or its menu is open: floating
       on the drawing, it must not sit on it the rest of the time. A figure's legend closes the frame, and stays with its chart
       when a host frame takes the header: under the drawing, not under
       whatever else the host holds. -->
  <div v-if="bare" class="contents"><slot/></div>
  <section v-else class="group/exhibit relative flex min-w-0 flex-col" :class="fill ? 'h-full min-h-0' : ''" :aria-label="passThrough ? undefined : heading || undefined">
    <header v-if="header === 'row' && !passThrough" class="flex min-h-7 min-w-0 shrink-0 items-center gap-3" :class="headerClass ?? 'pb-2'">
      <slot name="title"><h3 class="ui-section-title min-w-0 shrink truncate" :title="heading">{{ heading }}</h3></slot>
      <div v-if="$slots.controls" class="flex shrink-0 items-center gap-2"><slot name="controls"/></div>
      <div class="ml-auto flex min-w-0 items-center justify-end gap-3 text-sm text-neutral-500"><slot name="aside"/></div>
      <ExhibitButton/>
    </header>
    <slot name="intro"/>
    <!-- Filling, the content is a column too, so a page's strips keep their shrink and grow inside it. -->
    <div class="relative min-w-0" :class="fill ? 'flex min-h-0 flex-1 flex-col' : ''">
      <slot/>
      <!-- The wrapper places the chip, so its corner never depends on a class reaching the button. -->
      <div v-if="header === 'overlay' && !passThrough"
           class="pointer-events-none absolute right-3 top-3 z-30 opacity-0 transition-opacity duration-150 group-hover/exhibit:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 motion-reduce:transition-none">
        <ExhibitButton variant="chip" class="pointer-events-auto"/>
      </div>
    </div>
    <FigureLegend v-if="showLegend" :legend="legend" class="shrink-0 pt-2" :class="legendClass"/>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import FigureLegend from "~/features/export/components/FigureLegend.vue";
import { isEmptyLegend, type FigureLegend as Legend } from "~/features/export/figure";
import { useFrameContext, type Exhibit } from "~/features/export/exhibitFrame";
import { legendHereFor } from "~/features/export/figurePrefs";

const props = withDefaults(defineProps<{
  /**
   * The exhibit a component frames itself with (null when it exports nothing
   * in this state). Left out, the frame is a host: it takes the exhibit of the
   * component inside it, whose own frame steps aside.
   */
  exhibit?: Exhibit | null
  /** The row's title; the exhibit's own title by default. */
  title?: string
  header?: "row" | "custom" | "overlay"
  /** The exhibit fills the height it is given (a tool window) rather than setting its own. */
  fill?: boolean
  /** Classes for the header row (its bottom space, a hairline, side padding in a pane). */
  headerClass?: string
  /** Classes for the legend (side padding where the exhibit runs edge to edge). */
  legendClass?: string
}>(), { exhibit: undefined, title: undefined, header: "row", fill: false, headerClass: undefined, legendClass: undefined });

const { exhibit, passThrough } = useFrameContext(() => props.exhibit);
// A host frame draws the header only; the legend belongs to the frame that owns the figure.
const ownsExhibit = props.exhibit !== undefined;
// A component frame whose exhibit is null in this state draws only its content.
const bare = props.exhibit === null;

const heading = computed(() => props.title ?? exhibit.value?.title ?? "");
const legend = computed<Legend>(() => (exhibit.value?.kind === "figure" ? exhibit.value.legend() : {}));
const showLegend = computed(() => {
  const e = exhibit.value;
  return ownsExhibit && e?.kind === "figure" && !isEmptyLegend(legend.value) && legendHereFor(e.title, e.legendInUi());
});
</script>
