<template>
  <div class="container">
    <div class="my-40 text-center ">
      <div class="flex flex-col justify-center items-center ">
        <div class="max-w-[550px]">
          <h3 class="text-gray-500">Welcome to</h3>
          <h1 class="text-5xl mb-16 font-bold text-archstats-900">Archstats UI</h1>
          <p class="mb-4">Archstats UI is a tool for visualizing architectural views and gathering insights for your
            software. It's based on
            the
            <Anchor class="font-bold" href="http://github.com/archstats/archstats">Archstats</Anchor>
            project. <br><br>To generate a DB, run the following command in your repository:
          </p>

        </div>

        <code class="bg-archstats-50 mt-4 sm:text-xs text-archstats-800 text-sm font-mono py-6 px-6 rounded self-center leading-6   text-center inline">
          <span class="text-archstats-900 font-bold">archstats</span> export sqlite <span class="font-semibold">your_output.db</span> -e lines -e indentations -e git -e <select
            @focus="selectHasBeenInteractedWith=true" :value="availableLanguages[currentLanguageIndex]" ref="language"
            class="bg-archstats-50 outline-0 inline font-bold">
          <option
              v-for="language in availableLanguages">{{ language }}
          </option>
        </select>
        </code>
      </div>



      <PrimaryButton @click="handleInput" class="mr-2 mt-12 text-xl py-4">Import DB file</PrimaryButton>
      <!--      <SelectGitRepository @onRepoSelected="repoChanged"/>-->
    </div>

  </div>
</template>
<script>
import {useDataStore} from "~/stores/data";
import {mapActions, mapState} from "pinia";
import PrimaryButton from "~/components/ui/PrimaryButton.vue";
import SecondaryButton from "~/components/ui/SecondaryButton.vue";
import SelectGitRepository from "~/components/SelectGitRepository.vue";
import Anchor from "~/components/ui/Anchor.vue";

export default {
  components: {
    Anchor,
    SelectGitRepository, PrimaryButton
  },
  computed: {
    ...mapState(useDataStore, ['components', 'hasData', 'test', 'componentConnections', "componentGraph"]),
    availableLanguages() {
      return ["java", "kotlin", "scala", "php", "csharp"]
    }
  },
  data() {
    return {
      componentScope: null,
      currentLanguageIndex: 0,
      selectHasBeenInteractedWith: false
    }
  },
  mounted() {
    setInterval(() => {
      if (this.selectHasBeenInteractedWith) return
      this.currentLanguageIndex = (this.currentLanguageIndex + 1) % this.availableLanguages.length
    }, 2000)

  },
  methods: {

    ...mapActions(useDataStore, ['setViews']),
    async repoChanged(data) {
      await this.setViews(data)
      await navigateTo("/")
    },
    clearData() {
      this.repoChanged(null)
    },
    handleInput() {
      const input = document.createElement('input');
      input.type = 'file';

      input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
          const Uints = new Uint8Array(reader.result);
          this.repoChanged(Uints)
          input.remove();
        };
        reader.readAsArrayBuffer(file);
      }
      input.click();
    },

  }
}
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

