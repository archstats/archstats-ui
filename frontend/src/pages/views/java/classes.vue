<template>
  <LoadingState :text="t('pages.javaClasses.openingUnits')"/>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { t } from "~/shared/i18n";
// The Classes view reads units now, which every language declares rather
// than only Java, so it moved out from under the Java section. The route
// stays so old links keep working.
const router = useRouter();
onMounted(() => {
  router.replace({ path: "/views/units" });
});
</script>
