<template>
  <div class="font-normal">
    <div class="flex gap-2">
<!--      <Icon class="text-gray-400 hover:text-tertiary-500 cursor-pointer" :icon="expanded ? 'chevron-down':'chevron-right'"-->
<!--            @click="iconClicked"/>-->
      <div class="">
        <LongHover>
          <template #default>
            <h5 class="font-mono hover:text-archstats-200 cursor-pointer z-1 whitespace-nowrap"><span class="select-none text-archstats-200">{{reference_count}}x </span>{{ file }}</h5>
          </template>
          <template #hovered-content>
            <div class="mt-1 mb-3 absolute bg-gray-100 p-4 shadow-2xl z-10 rounded text-archstats-500">
              <p class="whitespace-nowrap" >Referenced <span>{{ reference_count }}</span> time(s) on line number(s): <span class="font-bold">{{ lines }}</span></p>
            </div>
          </template>
        </LongHover>

      </div>
    </div>

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
  return toRanges(snippets.value.map(snippet => parseInt(snippet.begin_position.split(":")[0]))).join(", ")
})
const snippets = computed(() =>
    (store.query(`
      SELECT *
      FROM snippets
      WHERE file = '${props.file}'
        AND snippet_type = 'component_import'
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

