<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: file dependencies are now the file grain of the consolidated
// Connections view. Kept as a redirect stub so old links and bookmarks still
// land somewhere useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections?grain=file")
</script>
