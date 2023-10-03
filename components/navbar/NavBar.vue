<template>
  <div class="bg-gray-900  py-8 relative" :style="{'width': expanded ? 'fit-content' : '0'}">
    <div v-if="expanded" class="px-12">
      <section class="text-gray-100 mb-12">
        <router-link to="/" class="text-sky-500 text-xl">Archstats</router-link>
      </section>

      <section class="text-gray-100">
        <h3 class="uppercase text-sm text-gray-500 mb-1">Views</h3>
        <ul>
          <li v-for="(link, name) in views" class="hover:text-gray-200 text-gray-400 whitespace-nowrap">
            <router-link :to="link" active-class="text-sky-700">{{name}}</router-link>
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