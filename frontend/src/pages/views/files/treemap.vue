<template>
  <LoadingState text="Opening Hotspots…"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/components/ui/common/LoadingState.vue"
// The directory treemap became the directory grain of Hotspots; old links land there.
const router = useRouter()
onMounted(() => { router.replace({ path: "/views/components/hotspots", query: { grain: "directories" } }) })
</script>
