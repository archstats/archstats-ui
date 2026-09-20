<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: the force-layout clustering view is now the Graph representation
// of the consolidated Connections view (community colouring included). Kept
// as a redirect stub so old links and bookmarks still land somewhere useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections?rep=graph")
</script>
