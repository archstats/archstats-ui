<template>
  <!-- Off-screen: exhibits drawn for a PNG (a report cell, an export). Empty unless one is being drawn. -->
  <div v-if="renderJobs.size" class="ex-host" aria-hidden="true">
    <ExhibitRenderJob v-for="job in [...renderJobs.values()]" :key="job.key" :job="job"/>
  </div>
</template>

<script setup lang="ts">
import { renderJobs } from "../render"
import ExhibitRenderJob from "./ExhibitRenderJob.vue"
</script>

<style scoped>
/* On the page (a figure off-screen measures nothing in some engines) but out of sight and out of reach. */
.ex-host { position: fixed; left: -12000px; top: 0; width: 960px; pointer-events: none; opacity: 0; z-index: -1; }
</style>
