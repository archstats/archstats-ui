
<template>
  <dl class="ui-kv">
    <template v-for="info in elementNormalized" :key="info.key">
      <dt>
        <LongHover v-if="definition.has(info.key)" :time="700">
          <template #default>
            <span class="cursor-help underline decoration-dotted decoration-neutral-300 underline-offset-2">{{ definition.get(info.key).name }}</span>
          </template>
          <template #hovered-content>
            <div class="ui-popover absolute z-20 w-80 p-3 text-base leading-5 text-neutral-800">
              <Definition :definition="info.key" mode="long"/>
            </div>
          </template>
        </LongHover>
        <span v-else>{{ info.key }}</span>
      </dt>
      <dd>{{ round(info.value, 3) }}</dd>
    </template>
  </dl>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ComputedRef } from "vue";
import type { RawComponent } from "~/utils/components";
import {round} from "~/utils/text";
import {useDataStore} from "~/stores/data";
import LongHover from "~/components/ui/common/LongHover.vue";
import Definition from "~/components/ui/common/Definition.vue";

const store = useDataStore()
const props = defineProps<{ component: RawComponent, onlyShow?: string[] }>()

const definition = computed(() => {
  return store.definitions
})

const elementNormalized: ComputedRef<{ key: string, value: any }[]> = computed(() => {
  const component = props.component
  if (component) {
    let toReturn: { key: string, value: any }[] = []
    let columns = props.onlyShow || Object.keys(component);
    columns.forEach(key => {
      if (typeof component[key] === 'number') {
        toReturn.push({key, value: component[key]})
      }
    })
    return toReturn
  }
  return []
})


</script>
