<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: git coupling is now the Chord representation of the consolidated
// Connections view with source=git. Kept as a redirect stub so old links and
// bookmarks still land somewhere useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections?rep=chord&source=git")
</script>
