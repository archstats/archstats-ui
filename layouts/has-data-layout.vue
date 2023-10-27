<template>
  <div class="flex h-screen w-screen relative">
    <div class="relative h-full flex-shrink-0">
      <button
          class="rounded-full absolute bg-archstats-900 hover:text-secondary-50 text-secondary-500 p-4 left-full top-4 z-[100] transition-all"
          :class="{'hover:-translate-x-1/4': !navExpanded, 'text-white': !navExpanded, '-translate-x-1/2': navExpanded, '-translate-x-1/3': !navExpanded}"
          @click="navExpanded =!navExpanded">
        <Icon :icon="navExpanded? 'chevron-left' : 'chevron-right'"></Icon>
      </button>
      <NavBar class="h-full" :expanded="navExpanded"/>
    </div>
    <div class="h-full overflow-y-scroll flex-grow">
      <slot/>
    </div>
  </div>

</template>
<script setup lang="ts">
import NavBar from "~/components/navbar/NavBar.vue";
import Icon from "~/components/ui/common/Icon.vue";

const navExpanded = ref(true)
</script>
