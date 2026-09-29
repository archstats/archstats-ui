<template>
  <LoadingState text="Opening Units…"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
// The restructure planner is gone; its folder map lives on in Units. Old links land there.
const router = useRouter()
onMounted(() => { router.replace("/views/units") })
</script>
