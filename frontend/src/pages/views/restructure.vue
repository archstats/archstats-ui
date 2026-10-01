<template>
  <LoadingState :text="t('pages.restructure.openingUnits')"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// The restructure planner is gone; its folder map lives on in Units. Old links land there.
const router = useRouter()
onMounted(() => { router.replace("/views/units") })
</script>
