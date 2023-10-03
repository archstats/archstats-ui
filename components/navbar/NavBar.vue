<template>
  <div class="bg-black px-12 py-8">
    <div class="">
      <ul>
        <li v-for="n in 10" class="text-white">nav</li>
      </ul>
    </div>
  </div>
</template>
<script setup lang="ts">
import Headline from "~/components/ui/Headline.vue";
</script>