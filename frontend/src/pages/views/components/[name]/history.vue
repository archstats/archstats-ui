<template>
  <CommitHistory :where="`component = ${sqlLiteral(name)}`" :empty-text="t('pages.componentsHistory.noCommitsTouchComponent')"/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { sqlLiteral } from "~/shared/sql"
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import { t } from "~/shared/i18n"

const route = useRoute()
const name = computed(() => String(route.params.name ?? ""))
</script>
