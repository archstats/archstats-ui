<template>
  <LoadingState text="Redirecting…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/components/ui/common/LoadingState.vue"
// OOP counts are Metrics columns and Overview tiles now. Old links and thumbnails keep working.
const router = useRouter()
onMounted(() => { router.replace("/views/metrics") })
</script>
