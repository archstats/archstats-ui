<template>
  <LoadingState :text="t('pages.componentsComparison.openingHotspots')"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// Comparison became the flat layout of Hotspots; old links and thumbnails land there.
const router = useRouter()
onMounted(() => { router.replace({ path: "/views/components/hotspots", query: { layout: "flat" } }) })
</script>
