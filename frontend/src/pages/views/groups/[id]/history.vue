<template>
  <CommitHistory v-if="group" :where="fileSql" empty-text="No commits touch this group's files."/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import CommitHistory from "~/components/git/CommitHistory.vue"
import { useGroupDetail } from "~/composables/useGroupDetail"

const route = useRoute()
const { group, fileSql } = useGroupDetail(computed(() => String(route.params.id ?? "")))
</script>
