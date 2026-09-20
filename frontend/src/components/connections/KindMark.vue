<template>
  <span class="shrink-0" :class="shapeClass" :style="style" :title="title ?? WORD[kind]" :aria-label="WORD[kind]"></span>
</template>

<script setup lang="ts">
import { computed } from "vue";

// The Kind Rule in HTML, matching the marks the graph draws: a group is a
// filled box, a component a solid disc, a file a hollow ring. Colour still
// belongs to the dimension, so only the silhouette says what a thing is.

const props = withDefaults(defineProps<{
  kind: string
  color?: string | null
  title?: string
}>(), { color: null, title: undefined });

const WORD: Record<string, string> = { group: "Group", component: "Component", file: "File" };
const FALLBACK = "rgb(var(--c-neutral-300))";

const shapeClass = computed(() => (props.kind === "group" ? "h-2.5 w-2.5 rounded-[3px]" : "h-2 w-2 rounded-full"));

/** Group fills need a tint of their own colour; palette colours are HSL. */
function tint(color: string): string {
  return color.startsWith("hsl(") ? color.replace("hsl(", "hsla(").replace(")", ", 0.3)") : color;
}

const style = computed(() => {
  const c = props.color || FALLBACK;
  if (props.kind === "group") return { backgroundColor: tint(c), boxShadow: `inset 0 0 0 1.5px ${c}` };
  if (props.kind === "file") return { backgroundColor: "rgb(var(--c-surface))", boxShadow: `inset 0 0 0 1.5px ${c}` };
  return { backgroundColor: c };
});
</script>
