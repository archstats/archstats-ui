<template>
  <p class="truncate font-mono text-xs text-neutral-400" :title="full">{{ short }}</p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { buildProvenance, provenanceLines, provenanceShort } from "~/utils/provenance";

// The short provenance line under a figure or table: what an exported copy
// of it will carry, shown where it is read.
const route = useRoute();
const p = computed(() => { void route.fullPath; return buildProvenance(); });
const short = computed(() => provenanceShort(p.value));
const full = computed(() => provenanceLines(p.value).map(([k, v]) => `${k}: ${v}`).join("\n"));
</script>
