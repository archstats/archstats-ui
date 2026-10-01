<template>
  <LoadingState :text="t('pages.gitChurn.openingMetrics')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { t } from "~/shared/i18n";
// Churn is now the "Churn against health" plot preset in Metrics; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { view: "plot", preset: "churn-health" } });
});
</script>
