<template>
  <router-link :to="path" class="bg-gray-100 transition-all duration-200 rounded-xl grid grid-cols-2 overflow-clip shadow-xl cursor"
  >
    <div class="p-8">
      <Headline class="text-xl text-archstats-500 font-medium mb-8">{{ name }}</Headline>
      <p class="text-archstats-800">{{ description }}</p>
    </div>
    <div class="bg-archstats-500 relative">
      <div class="h-full w-full absolute bg-archstats-500 opacity-30"></div>
      <img :src="image || '~/assets/img/distance-main-sequence.png'" alt="" class=" h-full w-full object-cover">
    </div>
  </router-link>
</template>
<script setup lang="ts">
import Headline from "~/components/ui/Headline.vue";

defineProps({
  name: String,
  description: String,
  path: String ,
  image: String
})

</script>