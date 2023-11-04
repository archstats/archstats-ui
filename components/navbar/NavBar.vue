<template>
  <div class="bg-archstats-900 h-full py-8 relative" :style="{'width': expanded ? 'fit-content' : '0'}">
    <div v-if="expanded" class="px-6 flex flex-col h-full justify-between">
      <main>
        <router-link to="/" class="mb-12 flex gap-4 h-12 items-center">
          <img src="/img/archstats/archstats-logo-white.png" alt="Archstats Icon" class="h-full">
          <h3 class="text-archstats-50 text-xl">Archstats</h3>
        </router-link>

        <section>
          <h3 class="uppercase text-sm text-archstats-200 mb-1">Views</h3>
          <ul>
            <li v-for="(link, name) in componentViews" class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap">
              <router-link :to="link" active-class="text-secondary-400">{{ name }}</router-link>
            </li>
          </ul>
        </section>
      </main>


      <footer>
        <section>
          <ModalTrigger>
            <template #trigger>
              <ArchstatsButton class="secondary" icon="pencil" icon-size="16">
                <span class="text-archstats-100 text-sm">{{
                    store.currentComponentScope.length
                  }} of {{ store.allComponents.length }} components</span>
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

import ModalTrigger from "~/components/ui/modals/ModalTrigger.vue";
import ComponentScopeModal from "~/components/components/modals/ComponentScopeModal.vue";
import ArchstatsButton from "~/components/ui/buttons/ArchstatsButton.vue";
import {useDataStore} from "~/stores/data";

const componentViews = {
  "Component Walker": "/views/components/walker",
  "Component Comparison": "/views/components/comparison",
  "Component Matrix": "/views/components/matrix",
  "Component Plotter": "/views/components/plotter",
  "Component Chord": "/views/components/chord",
}

const props = defineProps<{
  expanded: boolean
}>()
const store = useDataStore();
</script>
