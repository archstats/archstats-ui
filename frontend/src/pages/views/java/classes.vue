<template>
  <LoadingState text="Opening Units…"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
// The Classes view reads units now, which every language declares rather
// than only Java, so it moved out from under the Java section. The route
// stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/units" });
});
</script>
