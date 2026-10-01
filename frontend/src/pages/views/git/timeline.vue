<template>
  <LoadingState :text="t('pages.gitTimeline.openingActivity')"/>
</template>

<script setup lang="ts">
// Timeline was absorbed by Activity; old links and thumbnails land there.
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"

const router = useRouter()
onMounted(() => { router.replace("/views/git/activity?tab=commits") })
</script>
