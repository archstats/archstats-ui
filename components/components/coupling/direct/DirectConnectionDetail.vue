<template>
  <div class="font-normal flex flex-wrap items-center gap-x-2">
    <h5 class="font-mono z-1 whitespace-nowrap">
      <span class="select-none text-slate-300">{{ reference_count }}x </span>
      <router-link :to="`/views/files/${file}`" class="text-indigo-650 hover:underline font-bold">{{ file }}</router-link>
    </h5>
    <span v-if="lines" class="text-[9px] text-slate-450 select-none">
      (lines: 
      <SnippetPopover :file="file" :lines="lines">
        <span class="text-slate-600 font-extrabold underline decoration-dotted hover:text-indigo-900 transition-colors">{{ lines }}</span>
      </SnippetPopover>
      )
    </span>
  </div>
</template>

<script setup lang="ts">

import {computed} from "vue";
import {useDataStore} from "~/stores/data";

const store = useDataStore();

const props = defineProps<{
  from: string,
  to: string,
  reference_count: number
  file: string,
  expandedByDefault: boolean
}>()

const lines = computed(() => {
  return toRanges(snippets.value.map(snippet => {
    return parseInt(snippet.begin_position.split(":")[0]);
  })).join(", ")
})
const snippets = computed(() =>
    (store.query(`
      SELECT *
      FROM snippets
      WHERE file = '${props.file}'
        AND snippet_type = '${store.statName('modularity__component__imports')}'
        AND content = '${props.to}'
    `) as {
      begin_position: string,
      end_position: string,
      content: string
    }[]))
function toRanges(numbers: number[]): string[] {
  const ranges: string[] = [];
  let start = numbers[0];
  let end = numbers[0];
  for (const number of numbers.slice(1)) {
    if (number === end + 1) {
      end = number;
    } else {
      if (start === end) {
        ranges.push(start.toString());
      } else {
        ranges.push(`${start}-${end}`);
      }
      start = number;
      end = number;
    }
  }
  if (start === end) {
    ranges.push(start.toString());
  } else {
    ranges.push(`${start}-${end}`);
  }
  return ranges;
}
</script>

