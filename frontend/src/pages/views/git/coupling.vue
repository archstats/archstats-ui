<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: git coupling is now hidden coupling in Connections: co-change
// pairs with no import between them, as a list. Kept as a redirect stub so
// old links and bookmarks still land somewhere useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections?source=git&rep=list&relation=no-import")
</script>
