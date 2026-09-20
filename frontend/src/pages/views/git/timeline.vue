<template>
  <LoadingState text="Opening Activity…"/>
</template>

<script setup lang="ts">
// Timeline was absorbed by Activity; old links and thumbnails land there.
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const router = useRouter()
onMounted(() => { router.replace("/views/git/activity") })
</script>
