<template>
  <div class="ui-popover mt-20 flex w-[720px] max-w-full flex-col overflow-hidden animate-in" role="dialog" aria-label="Choose a component">
    <div class="flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
      <Icon icon="search" :size="14" class="text-neutral-400"/>
      <input ref="inputRef" v-model="searchText" type="search" class="ui-input ui-input-sm grow" placeholder="Find a component" @keyup.esc="closeModal"/>
      <span class="font-mono text-xs text-neutral-400">{{ filteredComponents.length }}</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Close" @click="closeModal"><Icon icon="x" :size="13"/></button>
    </div>
    <div class="max-h-[60vh] overflow-y-auto">
      <ElementTable
        :elements="filteredComponents"
        :selectable-elements="false"
        :clickable-elements="true"
        :max-page-size="12"
        :only-show-columns="columns"
        empty-text="No component matches."
        @clicked-element="select"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed, inject, onMounted, ref } from "vue";
import { useDataStore } from "~/stores/data";
import { RawComponent } from "~/utils/components";
import { closeModalKey } from "~/utils/modal";
import ElementTable from "~/components/ui/tables/ElementTable.vue";
import Icon from "~/components/ui/common/Icon.vue";

const store = useDataStore()
const props = defineProps<{ components?: RawComponent[] }>()
const emit = defineEmits(['component-selected'])
const closeModal = inject(closeModalKey)

const inputRef = ref<HTMLInputElement | null>(null)
onMounted(() => inputRef.value?.focus())

const loadedComponents = computed(() => props.components ?? store.allComponents ?? [])
const columns = computed(() => ["complexity__files", "complexity__lines", "modularity__coupling__afferent", "modularity__coupling__efferent"].filter(c => store.getDistinctComponentColumns.includes(c)))

const searchText = ref("")
const filteredComponents = computed(() => {
  const q = searchText.value.trim()
  if (!q) return loadedComponents.value
  try {
    const regex = new RegExp(q, "i")
    return loadedComponents.value.filter(c => regex.test(c.name))
  } catch {
    const lower = q.toLowerCase()
    return loadedComponents.value.filter(c => c.name.toLowerCase().includes(lower))
  }
})

function select(component: RawComponent) {
  emit('component-selected', component)
  closeModal?.()
}
</script>
