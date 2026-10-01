<template>
  <LoadingState :text="t('pages.javaOop.redirecting')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// OOP counts are Metrics columns and Overview tiles now. Old links and thumbnails keep working.
const router = useRouter()
onMounted(() => { router.replace("/views/metrics") })
</script>
