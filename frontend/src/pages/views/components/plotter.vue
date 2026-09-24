<template>
  <LoadingState text="Opening Metrics…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
// The plotter moved into Metrics as the Plot view; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { view: "plot" } });
});
</script>
