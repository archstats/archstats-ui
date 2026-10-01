<template>
  <LoadingState :text="t('pages.javaSpring.redirecting')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// Spring Beans is the Explore mode of the Classes view now. Old links and thumbnails keep working.
const router = useRouter()
onMounted(() => { router.replace("/views/units?mode=explore") })
</script>
