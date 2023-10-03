<template>
  <div class="grid grid-cols-[175px_1fr]  h-screen w-screen relative">
    <NavBar class="h-full "></NavBar>
    <div class="h-full overflow-y-scroll">
        <slot/>
    </div>
    <ComponentScopeButton class="fixed bottom-4 left-4"/>
  </div>

</template>
<script setup lang="ts">
import NavBar from "~/components/navbar/NavBar.vue";
import ComponentScopeButton from "~/components/ComponentScopeButton.vue";
</script>