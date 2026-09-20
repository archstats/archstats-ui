<template>
  <div></div>
</template>

<script setup lang="ts">
// Retired: group-to-group coupling is now the group grain of the
// consolidated Connections view (Expand a group node to see its members).
// Kept as a redirect stub so old links and bookmarks still land somewhere
// useful.
import { useRouter } from "vue-router"

const router = useRouter()
router.replace("/views/connections?grain=group")
</script>
