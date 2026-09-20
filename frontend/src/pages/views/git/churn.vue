<template>
  <LoadingState text="Opening Metrics…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
// Churn is now the "Churn against health" plot preset in Metrics; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { view: "plot", preset: "churn-health" } });
});
</script>
