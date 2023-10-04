<template>
  <div class="container">
    <div class="my-36 ">
      <h1 class="text-5xl mb-12 font-bold text-archstats-primary-900">Archstat Views</h1>
      <p class="mb-4">Archstat Views is a tool for presenting architectural views for your software. It's based on
        the
        <Anchor class="font-bold" href="http://github.com/RyanSusana/archstats">Archstats</Anchor>
        project. Archstat Views supports:
      </p>
      <ul class="mb-12 pl-8">
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Tree View</span> - A recursive view that<span
            class="font-semibold">&mdash;per directory&mdash;</span>shows where your stats are.
        </li>
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Connections View</span> - An interactive diagram that
          shows the amount of coupling between allComponents, along with a allComponents relative size.
        </li>
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Table View</span> - All stats presented in an
          indexed,
          user-friendly manner.
        </li>
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Summary View</span> - All stats presented in a
          summarized<span
              class="font-semibold">&mdash;at glance&mdash;</span>manner.
        </li>
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Root View</span> - Shows a list of allComponents that
          are extended by other allComponents and their orphaned classes.
        </li>
        <li class="mb-2"><span class="font-bold text-archstats-primary-700 ">Similarity View</span> - A UI that shows the
          similarity between allComponents.
        </li>
      </ul>
      <p class="mb-12">Archstat Views depends on the the output of <code
          class="bg-archstats-primary-50 text-archstats-primary-800 text-sm  py-2 px-2 rounded"><span
          class="text-archstats-primary-900 font-bold">archstats</span>
        &lt;source-directory&gt;
        --all-views > <span class="font-bold">youroutputfile.json</span></code>.<br></p>
      <PrimaryButton @click="handleInput" class="mr-2">Import Archstats Data</PrimaryButton>
      <SelectGitRepository @onRepoSelected="repoChanged"/>
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
  },
  data() {
    return {
      componentScope: null
    }
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

