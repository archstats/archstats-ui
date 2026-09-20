<template>
  <LoadingState text="Opening Metrics…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
// The components table moved into Metrics; the route stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/metrics" });
});
</script>
