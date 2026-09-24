<template>
  <CommitHistory v-if="group" :where="fileSql" empty-text="No commits touch this group's files."/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import { useGroupDetail } from "~/features/groups/useGroupDetail"

const route = useRoute()
const { group, fileSql } = useGroupDetail(computed(() => String(route.params.id ?? "")))
</script>
