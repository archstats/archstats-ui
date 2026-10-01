<template>
  <LoadingState :text="t('pages.componentsTable.openingMetrics')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { t } from "~/shared/i18n";
// The components table moved into Metrics; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { view: "table" } });
});
</script>
