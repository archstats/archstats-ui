<template>
  <router-link :to="path" class="bg-gray-50 transition-all duration-200 rounded-xl grid grid-cols-2 overflow-clip shadow-md cursor hover:scale-[1.02] hover:shadow-xl"
  >
    <div class="p-8">
      <CardHeadline>{{ name }}</CardHeadline>
      <p class="text-archstats-300">{{ description }}</p>
    </div>
    <div class="bg-archstats-800 relative h-60">
      <div class="h-full w-full absolute bg-archstats-500 opacity-30"></div>
      <img v-if="image" :src="image" alt="" class=" h-full w-full object-cover"/>
    </div>
  </router-link>
</template>
<script setup lang="ts">
import Headline from "~/components/ui/common/Headline.vue";
import CardHeadline from "~/components/ui/card/CardHeadline.vue";

defineProps({
  name: String,
  description: String,
  path: String ,
  image: String
})

</script>
