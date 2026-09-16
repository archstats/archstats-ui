<template>
  <div class="bg-archstats-900 h-full py-8 relative" :style="{'width': expanded ? 'fit-content' : '0'}">
    <div v-if="expanded" class="px-6 flex flex-col h-full justify-between">
      <main>
        <router-link to="/" class="mb-8 flex gap-3 h-12 items-center">
          <img src="/img/archstats/archstats-logo-white.png" alt="Archstats Icon" class="h-full">
          <img src="~/assets/logo/archstats-100-logo.png" alt="Archstats logo" class="h-full w-28 object-contain">
        </router-link>

        <div class="flex flex-col gap-6">
          <section>
            <h3 class="uppercase text-xs font-bold text-archstats-200 mb-2 tracking-wider">Components</h3>
            <ul class="flex flex-col gap-1.5 pl-1">
              <li v-for="(link, name) in componentViews" :key="name" class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link :to="link" active-class="text-secondary-400 font-medium">{{ name }}</router-link>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="uppercase text-xs font-bold text-archstats-200 mb-2 tracking-wider">Git</h3>
            <ul class="flex flex-col gap-1.5 pl-1">
              <li v-for="(link, name) in gitViews" :key="name" class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link :to="link" active-class="text-secondary-400 font-medium">{{ name }}</router-link>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="uppercase text-xs font-bold text-archstats-200 mb-2 tracking-wider">Files</h3>
            <ul class="flex flex-col gap-1.5 pl-1">
              <li v-for="(link, name) in fileViews" :key="name" class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link :to="link" active-class="text-secondary-400 font-medium">{{ name }}</router-link>
              </li>
            </ul>
          </section>

          <section v-if="isJavaProject">
            <h3 class="uppercase text-xs font-bold text-archstats-200 mb-2 tracking-wider">Java</h3>
            <ul class="flex flex-col gap-1.5 pl-1">
              <li class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link to="/views/java/spring" active-class="text-secondary-400 font-medium">Spring Beans</router-link>
              </li>
              <li class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link to="/views/java/jpa" active-class="text-secondary-400 font-medium">JPA Persistence</router-link>
              </li>
              <li class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link to="/views/java/oop" active-class="text-secondary-400 font-medium">OOP Metrics</router-link>
              </li>
              <li class="hover:text-secondary-100 text-archstats-50 whitespace-nowrap text-sm">
                <router-link to="/views/java/class-connections" active-class="text-secondary-400 font-medium">Class Connections</router-link>
              </li>
            </ul>
          </section>
        </div>
      </main>


      <footer class="border-t border-archstats-800 pt-4 mt-2">
        <GroupsManager />
      </footer>

    </div>
  </div>
</template>
<script setup lang="ts">

import GroupsManager from "~/components/groups/GroupsManager.vue";
import {useDataStore} from "~/stores/data";
import {useJavaMetrics} from "~/composables/useJavaMetrics";

const { isJavaProject } = useJavaMetrics();

const componentViews = {
  "Walker": "/views/components/walker",
  "Comparison": "/views/components/comparison",
  "Matrix": "/views/components/matrix",
  "Plotter": "/views/components/plotter",
  "Chord": "/views/components/chord",
  "Hotspots": "/views/components/hotspots",
  "Clustering": "/views/components/clustering",
  "Table": "/views/components/table",
  "Cycles": "/views/components/cycles",
  "Group Coupling": "/views/components/group-coupling",
  // "Arc": "/views/components/arc",
  // "Cousins": "/views/components/cousins"
}

const gitViews = {
  "Coupling": "/views/git/coupling",
  "Churn": "/views/git/churn",
  "Timeline": "/views/git/timeline",
  "Authors": "/views/git/authors",
}

const fileViews = {
  "Table": "/views/files/table",
  "Dependencies": "/views/files/dependencies",
  "Treemap": "/views/files/treemap",
}

const props = defineProps<{
  expanded: boolean
}>()
const store = useDataStore();
</script>
