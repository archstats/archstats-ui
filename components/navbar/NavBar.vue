<template>
  <div class="bg-archstats-900 h-full py-8 relative" :style="{'width': expanded ? 'fit-content' : '0'}">
    <div v-if="expanded" class="px-12 flex flex-col h-full justify-between">
      <main>
        <section class="mb-12">
          <router-link to="/" class="text-archstats-50 text-xl">Archstats</router-link>
        </section>

        <section>
          <h3 class="uppercase text-sm text-archstats-200 mb-1">Views</h3>
          <ul>
            <li v-for="(link, name) in views" class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap">
              <router-link :to="link" active-class="text-secondary-400">{{ name }}</router-link>
            </li>
          </ul>
        </section>
      </main>


      <footer>
        <section>
          <ModalTrigger>
            <template #trigger>
              <ArchstatsButton class="secondary" icon="pencil">
                <span class="text-archstats-100">{{ store.currentComponentScope.length }} of {{ store.allComponents.length }} components in scope</span>
              </ArchstatsButton>
            </template>

            <template #modal>
              <ComponentScopeModal class="absolute"/>
            </template>
          </ModalTrigger>
        </section>
      </footer>

    </div>
  </div>
</template>
<script setup lang="ts">

import ComponentScopeModal from "~/components/ComponentScopeModal.vue";
import ArchstatsButton from "~/components/ui/ArchstatsButton.vue";
import {useDataStore} from "~/stores/data";

const views = {
  "Component Walker": "/views/component-walker",
  "Component Comparison": "/views/component-comparison",
  "Distance to Main Sequence": "/views/distance-main-sequence",
  "Chord": "/views/chord"
}

const props = defineProps<{
  expanded: boolean
}>()
const store = useDataStore();
</script>
