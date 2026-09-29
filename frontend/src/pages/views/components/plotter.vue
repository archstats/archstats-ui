<template>
  <LoadingState text="Opening Metrics…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
// The plotter moved into Metrics as the Plot view; the route stays so old links keep working.
// A preset or pair the old link carried goes along.
const router = useRouter();
const route = useRoute();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { ...route.query, view: "plot" } });
});
</script>
