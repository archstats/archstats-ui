<template>
    <NuxtLayout>
      <NuxtPage :keepalive="keepalive"/>
    </NuxtLayout>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import { useDataStore } from "~/features/snapshot/data.store";

// The Overview stays alive while another view is open: rebuilding it on the
// way back ran some fifty queries and every reading again, a second each time.
// It is kept only for the snapshot it showed. Another snapshot opened
// elsewhere drops it, rather than leaving it to reload unseen against the
// queries of the view being used.
const route = useRoute();
const data = useDataStore();
const shownFor = ref<string | null>(null);
watchEffect(() => { if (route.path === "/") shownFor.value = data.datasetKey ?? null; });
const keepalive = computed(() => ({
  include: shownFor.value !== null && shownFor.value === data.datasetKey ? ["OverviewPage"] : [],
  max: 1,
}));
</script>
