<template>
  <LoadingState text="Opening Metrics…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
// The files table moved into Metrics at file grain; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics", query: { grain: "files" } });
});
</script>
