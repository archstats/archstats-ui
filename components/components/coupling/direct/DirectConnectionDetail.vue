<template>
  <div class="font-normal">
    <div class="flex gap-2">
      <div class="">
        <h5 class="font-mono z-1 whitespace-nowrap"><span
            class="select-none text-archstats-200">{{ reference_count }}x </span>{{ file }}</h5>
      </div>
    </div>

  </div>


</template>

<script setup lang="ts">

import {computed} from "vue";
import {useDataStore} from "~/stores/data";
import LongHover from "~/components/ui/common/LongHover.vue";

const store = useDataStore();

const props = defineProps<{
  from: string,
  to: string,
  reference_count: number
  file: string,
  expandedByDefault: boolean
}>()

const lines = computed(() => {
  console.log("lines", snippets.value)
  return toRanges(snippets.value.map(snippet => {
    console.log("snippet", snippets.value)
    return parseInt(snippet.begin_position.split(":")[0]);
  })).join(", ")
})
const snippets = computed(() =>
    (store.query(`
      SELECT *
      FROM snippets
      WHERE file = '${props.file}'
        AND snippet_type = '${store.statName('modularity:component:imports')}'
        AND content = '${props.to}'
    `) as {
      begin_position: string,
      end_position: string,
      content: string
    }[]))

const expanded = ref(props.expandedByDefault)

function iconClicked() {
  expanded.value = !expanded.value
}

function toRanges(numbers: number[]): string[] {
  console.log(numbers)
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

