<template>
  <div class="container">
    <div class="my-40 text-center ">
      <div class="flex flex-col justify-center items-center ">
        <div class="max-w-[550px]">
          <h3 class="text-gray-500 ">Welcome to</h3>
          <div class=" mt-8 flex gap-4 items-center justify-center align-middle h-8 mb-16">
            <img src="/img/archstats/archstats-text.png" alt="Archstats Logo" class="object-contain h-full">

            <h1 class="text-4xl font-bold text-archstats-900">UI</h1>
          </div>
          <p class="mb-4">Archstats UI is a tool for visualizing architectural views and gathering insights for your
            software. It's based on
            the
            <Anchor class="font-bold" href="http://github.com/archstats/archstats">Archstats</Anchor>
            project. <br><br>To generate a DB, run the following command in your repository:
          </p>

        </div>

        <code
            class="bg-archstats-50 mt-4 sm:text-xs text-archstats-800 text-sm font-mono py-6 px-6 rounded self-center leading-6   text-center inline">
          <span class="text-archstats-900 font-bold">archstats</span> export sqlite <span class="font-semibold">your_output.db</span>
          -e lines -e indentations -e git -e <select
            @focus="selectHasBeenInteractedWith=true" :value="availableLanguages[currentLanguageIndex]" ref="language"
            class="bg-archstats-50 outline-0 inline font-bold">
          <option
              v-for="language in availableLanguages">{{ language }}
          </option>
        </select>
        </code>
      </div>


      <PrimaryButton @click="handleInput" class="mr-2 mt-12 text-xl py-4">Import DB file</PrimaryButton>
    </div>

  </div>
</template>
<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {mapActions, mapState} from "pinia";
import PrimaryButton from "~/components/ui/buttons/PrimaryButton.vue";
import Anchor from "~/components/ui/common/Anchor.vue";

const store = useDataStore();
const currentLanguageIndex = ref(0);
const selectHasBeenInteractedWith = ref(false);

const availableLanguages = ["java", "kotlin", "scala", "php", "csharp"]

useSeoMeta({
  title: "Archstats - Insights for your software architecture",
  description: "Archstats is a tool for visualizing architectural views and gathering insights for your software.",
  ogDescription: "Archstats is a tool for visualizing architectural views and gathering insights for your software.",

  ogImage: "/img/archstats/Archstats-updated-.jpg"
})

function handleInput() {
  const input = document.createElement('input');
  input.type = 'file';

  input.onchange = e => {
    // @ts-ignore
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      // @ts-ignore
      const Uints = new Uint8Array(reader.result);
      repoChanged(Uints)
      input.remove();
    };
    reader.readAsArrayBuffer(file);
  }
  input.click();
}

async function repoChanged(data: any) {
  await store.setViews(data)
  await navigateTo("/")
}

onMounted(() => {
  setInterval(() => {
    if (selectHasBeenInteractedWith.value) return
    currentLanguageIndex.value = (currentLanguageIndex.value + 1) % availableLanguages.length
  }, 2000)
})


</script>

<style>

body {
  color: var(--color-text);
  background: var(--color-background);
  transition: color 0.5s, background-color 0.5s;
  line-height: 1.6;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
  Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  font-size: 15px;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

</style>

