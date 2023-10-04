<template>
  <LongHover :time="1300">
    <template #main-content>
      <button class="border-archstats-tertiary-500 border bg-archstats-tertiary-50 px-4 py-2 rounded-full cursor-pointer" @click.prevent="open = true">
        {{ store.currentComponentScope.length }} / {{ store.allComponents.length }}


        <Teleport v-if="open" to="body">
          <div v-if="open" class="fixed z-100 h-screen bg-gray-700 bg-opacity-50 w-screen top-0 left-0 flex items-center justify-center" >


            <div class="w-2/3 p-8 bg-white rounded-md mt-12 shadow-xl h-fit" v-click-outside = "toggleOff">
              <h1 class="text-xl text-archstats-tertiary-500  font-bold">Editing current scope</h1>
              <div class="my-4 h-0.5 bg-gray-200"></div>
              <ComponentTable :components = "store.allComponents" v-model:selected-components="selectedComponents" max-page-size="15"></ComponentTable>


              <div class="border-t-2 mt-4 pt-4 flex justify-end gap-2 ">

                <SecondaryButton @click="toggleOff">Cancel</SecondaryButton>
                <SecondaryButton @click="reset">Reset</SecondaryButton>
                <PrimaryButton @click="saveScope">Save changes</PrimaryButton>
              </div>
            </div>
          </div>
        </Teleport>

      </button>
    </template>
    <template #hovered-content>
      <div class="absolute p-2 w-fit  bottom-full">
        <div class="bg-gray-100 w-fit rounded p-2 whitespace-nowrap ">
          {{ store.currentComponentScope.length }} of {{ store.allComponents.length }}<br>components currently in scope
        </div>
      </div>
    </template>
  </LongHover>





</template>

<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {computed} from "vue";
import PrimaryButton from "~/components/ui/PrimaryButton.vue";
import SecondaryButton from "~/components/ui/SecondaryButton.vue";
import Headline from "~/components/ui/Headline.vue";
import Card from "~/components/ui/Card.vue";

const store = useDataStore();
const selectedComponents = ref(store.currentComponentScope.map(c => c.name))

const open = ref(false);

const toggleOff = () => {
  if(open.value)
    open.value = false;
}

function reset(){
  selectedComponents.value = store.currentComponentScope.map(c => c.name)
}

function saveScope(){
  store.setCurrentScope(selectedComponents.value);
  if(open.value)
  open.value = false;
}
</script>
