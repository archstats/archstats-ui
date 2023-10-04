<template>

  <div>

    <h1 class="mb-4 text-gray-500 whitespace-nowrap"><span class="font-mono text-gray-800">{{ connections.length }}</span>
      {{ singularPlural }} <span class="font-mono text-gray-800">{{ to }}</span> from <span
          class="font-mono  text-gray-800">{{ from }}</span></h1>
    <div class="flex" v-for="connection in connections">
      <DirectConnectionDetail class="font-mono text-gray-700 font-normal" v-bind="connection"
                              :expanded-by-default="connections.length < 3">{{ connection.file }}
      </DirectConnectionDetail>
    </div>

  </div>

</template>

<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {computed} from "vue";

const props = defineProps<{
  from: string,
  to: string
}>()

const store = useDataStore();
const singularPlural = computed(() => {
  if (connections.value.length === 1) {
    return "file references"
  }
  return "files reference"
})

const connections = computed(() => {
  return store.query(`
    SELECT *
    FROM component_connections_direct
    WHERE "from" = '${props.from}'
      AND "to" = '${props.to}'
  `) as {
    from: string,
    to: string,
    reference_count: number
    file: string
  }[]
})
</script>