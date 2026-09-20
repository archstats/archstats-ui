<template>
  <LoadingState text="Redirecting…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/components/ui/common/LoadingState.vue"
// Class Connections is the Classes view now. Old links and thumbnails keep working.
const router = useRouter()
onMounted(() => { router.replace("/views/java/classes") })
</script>
