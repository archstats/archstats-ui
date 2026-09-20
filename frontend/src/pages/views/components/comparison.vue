<template>
  <LoadingState text="Opening Hotspots…"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/components/ui/common/LoadingState.vue"
// Comparison became the flat layout of Hotspots; old links and thumbnails land there.
const router = useRouter()
onMounted(() => { router.replace({ path: "/views/components/hotspots", query: { layout: "flat" } }) })
</script>
