<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: the matrix is now one representation of the consolidated
// Connections view. Kept as a redirect stub so old links and bookmarks still
// land somewhere useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections")
</script>
