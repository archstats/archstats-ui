<template>
  <LoadingState :text="t('pages.filesTable.openingMetrics')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { t } from "~/shared/i18n";
// The files table moved into Metrics at file grain; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { grain: "files", view: "table" } });
});
</script>
