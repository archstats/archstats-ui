<template>
  <div class="flex h-screen w-screen relative">
    <div class="relative h-full flex-shrink-0">
      <button class="rounded-full absolute bg-gray-900 text-white  p-4 left-full top-4 -translate-x-1/2 z-10 transition-all"
              :class="{'hover:-translate-x-1/4': !navExpanded}"
              @click="navExpanded =!navExpanded">
        <Icon :icon="navExpanded? 'chevron-left' : 'chevron-right'"></Icon>
      </button>
      <NavBar class="h-full" :expanded="navExpanded" />
    </div>
    <div class="h-full overflow-y-scroll flex-grow">
      <slot/>
    </div>
  </div>

</template>
<script setup lang="ts">
import {Splitpanes, Pane} from 'splitpanes'
import NavBar from "~/components/navbar/NavBar.vue";
import ComponentScopeButton from "~/components/ComponentScopeModal.vue";

const navExpanded = ref(true)
</script>