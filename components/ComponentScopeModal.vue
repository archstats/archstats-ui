<template>


  <div class="w-2/3 p-8 bg-white rounded-md mt-12 shadow-xl h-fit z-1000">
    <h1 class="text-xl text-archstats-500  font-bold">Editing current scope</h1>
    <div class="my-4 h-0.5 bg-gray-200"></div>
    <div class="flex gap-2 items-center mb-4">
      <div class="flex-shrink-0">{{ selectedComponents.length }} of {{ allComponents.length }} selected</div>
      <input class="w-full px-4 py-2 bg-gray-100  box-border outline-archstats-500 outline-1" v-model="search"
             placeholder="Search...">
      <div class="">
        <div class="flex items-center gap-1">
          <label class="mr-2">Limit:</label>

          <input class=" px-4 py-2 bg-gray-100  box-border outline-archstats-500 outline-1" type="number" v-model="limit"
                 placeholder="Limit">
        </div>
      </div>
    </div>
    <ElementTable :selectable-elements="true" :elements="filteredComponents" :limit="limit" :max-page-size="12"
                  v-model:selected-elements="selectedComponents"></ElementTable>

    <div class="border-t-2 mt-4 pt-4 flex justify-end gap-2 ">

      <SecondaryButton @click="closeModal">Cancel</SecondaryButton>
      <SecondaryButton @click="reset">Reset</SecondaryButton>
      <PrimaryButton @click="saveScope">Save changes</PrimaryButton>
    </div>
  </div>
</template>


<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {computed} from "vue";
import PrimaryButton from "~/components/ui/PrimaryButton.vue";
import SecondaryButton from "~/components/ui/SecondaryButton.vue";
import {defineProps, ref} from "vue";
import {Component} from "~/utils/components";
import useCloseModal from "~/utils/modal";

const props = defineProps({})
const store = useDataStore();

const closeModal = useCloseModal()

const selectedComponents = ref(store.currentComponentScope.map(c => c.name))

function reset() {
  selectedComponents.value = store.currentComponentScope.map(c => c.name)
}

function saveScope() {
  store.setCurrentScope(selectedComponents.value);
  closeModal();
}



const search = ref("")
const allComponents = computed(() => {
  return store.allComponents ?? []
})

const limit = ref(allComponents.value.length)

const filteredComponents = computed(() => {
  return allComponents.value.filter(c => c.name.toLowerCase().includes(search.value.toLowerCase()))
})

</script>