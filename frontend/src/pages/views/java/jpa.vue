<template>
  <LoadingState :text="t('pages.javaJpa.redirecting')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// JPA Persistence lives in Metrics at file grain and in the component and file Java tabs now. Old links and thumbnails keep working.
const router = useRouter()
onMounted(() => { router.replace("/views/metrics?grain=files&q=jpa") })
</script>
