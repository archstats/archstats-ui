<template>
  <LoadingState :text="t('cicd.page.reading')"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// Deployables became CI/CD (engine revision 16). Old links land there.
const router = useRouter()
onMounted(() => { router.replace("/views/cicd") })
</script>
