<template>
  <!-- The earlier name, kept so code written against it still frames its figure. Use ExhibitFrame. -->
  <ExhibitFrame :exhibit="figure" :fill="fill" :header="header"><slot/></ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import type { FigureExportable } from "~/features/export/useExportables";

withDefaults(defineProps<{ figure: FigureExportable | null; fill?: boolean; header?: "row" | "custom" | "overlay" }>(), { fill: false, header: "row" });
</script>
