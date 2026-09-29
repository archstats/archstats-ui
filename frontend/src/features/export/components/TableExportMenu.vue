<template>
  <ExhibitButton :exhibit="table"/>
</template>

<script setup lang="ts">
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import type { ExportColumn, ExportRow } from "~/features/export/export";
import type { TableExportable } from "~/features/export/useExportables";

// A list in the inspector, where no view frame reaches, as an exhibit of its
// own: the same button and menu as every other table, over every row the
// list holds, not the ones scrolled into view. Not registered, so it is not
// what a report slot takes from the view.

const props = defineProps<{ title: string; columns: ExportColumn[]; rows: ExportRow[] }>();

const table: TableExportable = {
  kind: "table",
  get title() { return props.title; },
  columns: () => props.columns,
  rows: () => props.rows,
};
</script>
