<template>
  <DetailFrame
    :title="group?.name ?? 'Group'"
    kind="Group"
    :crumbs="[{ label: group?.dimension ?? 'Lens', to: '/views/connections?level=groups' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/connections"
  >
    <template #actions>
      <button v-if="group" type="button" class="ui-btn ui-btn-sm" :aria-pressed="scope.groupIds.includes(group.id)" :title="`Scope every view to ${group.name}`" @click="scope.toggleGroup(group.id)">
        <Icon icon="focus" :size="13" class="text-neutral-500"/><span>{{ scope.groupIds.includes(group.id) ? "In scope" : "Scope to it" }}</span>
      </button>
    </template>
    <EmptyState v-if="!group" title="This group no longer exists" text="It was deleted or renamed away. Its lens still holds the others." icon="layers">
      <router-link to="/views/connections?level=groups" class="ui-btn ui-btn-sm">Connections by group</router-link>
    </EmptyState>
    <EmptyState v-else-if="files.size === 0" title="This group holds nothing in this snapshot" text="Its members match no file or component of the open scan." icon="layers"/>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import DetailFrame, { type DetailTab } from "~/components/detail/DetailFrame.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"
import { useGroupDetail } from "~/composables/useGroupDetail"
import { useScopeStore } from "~/stores/scope"
import { groupPath } from "~/utils/routes"

const route = useRoute()
const scope = useScopeStore()
const id = computed(() => String(route.params.id ?? ""))
const { group, files, components, lines } = useGroupDetail(id)

const stats = computed(() => group.value ? [
  { label: "Components", value: components.value.length.toLocaleString("en-US") },
  { label: "Files", value: files.value.size.toLocaleString("en-US") },
  { label: "Lines", value: lines.value.toLocaleString("en-US") },
] : [])
const tabs = computed<DetailTab[]>(() => [
  { id: "overview", label: "Overview", to: groupPath(id.value), exact: true },
  { id: "history", label: "History", to: groupPath(id.value, "history") },
  { id: "rules", label: "Rules", to: groupPath(id.value, "rules") },
])
</script>
