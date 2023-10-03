<template>
  <SecondaryButton @click="open = true">Analyze public Git Repository</SecondaryButton>
  <Teleport to="body">
    <div
        class="fixed top-0 left-0 w-full h-full backdrop-blur-sm backdrop-brightness-50 flex justify-center align-middle"
        v-if="open" @click="close">
      <div class=" p-16 bg-white h-fit box-border w-1/2 mt-36 rounded" @click.stop>
        <h1 class="text-3xl mb-8 font-bold text-archstats-500">Select Git Repository</h1>
        <p class="text-red-600" v-if="error">{{ error }}</p>
        <p class="text-gray-500" v-else>Archstat Views supports the analysis of publicly available Git repositories.</p>
        <div class="mt-12 grid grid-cols-3 gap-8 mb-12">

          <label class="self-center">Repository:</label>
          <input v-model="repo"
                 class="col-span-2 p-2 box-border bg-gray-100 border-archstats-400 rounded border-2 outline-archstats-700"
                 placeholder="e.g. https://github.com/RyanSusana/elepy">

          <label class="self-center">Extensions:</label>
          <div class="flex self-center col-span-2">
            <div v-for="selection in availableSelections" class="mr-6 flex ">
              <input type="checkbox" :value="selection.value"
                     v-model="selections"
                     class="p-2 box-border bg-gray-100 border-archstats-400 rounded border-2 outline-archstats-700 mr-2">
              <div>{{ selection.label }}</div>
            </div>
          </div>

          <label class="self-center">Custom Snippets:</label>
          <div class="col-span-2 text-gray-500">
            Not yet available.

          </div>
        </div>
        <div class="flex justify-end mt-16">
          <PrimaryButton @click="handleSelection" class="w-96">{{
              loading ? "Loading..." : "Select Repository"
            }}
          </PrimaryButton>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import PrimaryButton from './ui/PrimaryButton.vue'
import SecondaryButton from "./ui/SecondaryButton.vue";
import {ref, watchEffect} from "vue";
import axios from 'redaxios';

const emit = defineEmits(['onRepoSelected'])
const selections = ref([])
const availableSelections = [
  {label: "Java", value: "java", selected: true},
  {label: "Kotlin", value: "kotlin", selected: true},
  {label: "PHP", value: "php", selected: false},
]

const error = ref(null)
const open = ref(false)
const loading = ref(false)
const repo = ref('')

function close() {
  open.value = false
}

function handleSelection() {
  grecaptcha.ready(async function () {
    try {
      const token = await grecaptcha.execute('6Lf9W04hAAAAAIw1QI8kKU43R-XqJUx1nt6PkUOf', {action: 'submit'});
      loading.value = true
      const params = new URLSearchParams();
      params.append("repo", repo.value);
      params.append("recaptcha", token);
      selections.value.forEach(selection => {
        params.append("extension", selection)
      });
      const {data} = await axios.get("/stats", {
        params: params
      });
      emit('onRepoSelected', data)
    } catch (e) {
      error.value = e.data?.error
    } finally {
      loading.value = false
    }
  });
}
</script>

<style scoped>

</style>