<template>
  <div class="bg-archstats-900  py-8 relative" :style="{'width': expanded ? 'fit-content' : '0'}">
    <div v-if="expanded" class="px-12">
      <section class="mb-12">
        <router-link to="/" class="text-white text-xl">Archstats</router-link>
      </section>

      <section>
        <h3 class="uppercase text-sm text-white mb-1">Views</h3>
        <ul>
          <li v-for="(link, name) in views" class="hover:text-secondary-50 text-white whitespace-nowrap">
            <router-link :to="link" active-class="text-secondary-400">{{name}}</router-link>
          </li>
        </ul>
      </section>
    </div>
<!--    <ComponentScopeButton class="absolute"/>-->

  </div>
</template>
<script setup lang="ts">

import ComponentScopeButton from "~/components/ComponentScopeButton.vue";

const views = {
  "Component Walker": "/views/component-walker",
  "Component Comparison": "/views/component-comparison",
  "Distance to Main Sequence": "/views/distance-main-sequence",
  "Chord": "/views/chord"
}

const props = defineProps<{
  expanded: boolean
}>()
</script>
