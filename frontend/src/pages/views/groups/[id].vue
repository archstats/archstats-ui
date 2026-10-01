<template>
  <DetailFrame
    :title="group?.name ?? t('pages.groups.group')"
    kind="Group"
    :crumbs="[{ label: group?.dimension ?? t('pages.groups.lens'), to: '/views/connections?level=groups' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/connections"
  >
    <template #actions>
      <PinButton v-if="group" kind="view" :entity-key="route.fullPath" :title="t('pages.groups.group2', { groupName: group.name })"/>
      <button v-if="group" type="button" class="ui-btn ui-btn-sm" :aria-pressed="scope.groupIds.includes(group.id)" :title="t('pages.groups.scopeEveryView', { groupName: group.name })" @click="scope.toggleGroup(group.id)">
        <Icon icon="focus" :size="13" class="text-neutral-500"/><span>{{ scope.groupIds.includes(group.id) ? t('pages.groups.scope') : t('pages.groups.scope2') }}</span>
      </button>
    </template>
    <EmptyState v-if="!group" :title="t('pages.groups.groupNoLongerExists')" :text="t('pages.groups.wasDeletedRenamedAway')" icon="layers">
      <router-link to="/views/connections?level=groups" class="ui-btn ui-btn-sm">{{ t('pages.groups.connectionsGroup') }}</router-link>
    </EmptyState>
    <EmptyState v-else-if="files.size === 0" :title="t('pages.groups.groupHoldsNothingSnapshot')" :text="t('pages.groups.membersMatchNoFile')" icon="layers"/>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import PinButton from "~/features/reports/components/PinButton.vue"
import { computed } from "vue"
import { useRoute } from "vue-router"
import DetailFrame, { type DetailTab } from "~/features/shell/components/DetailFrame.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { useGroupDetail } from "~/features/groups/useGroupDetail"
import { useScopeStore } from "~/features/groups/scope.store"
import { groupPath } from "~/features/navigation/routes"
import { t, intlLocale } from "~/shared/i18n"

const route = useRoute()
const scope = useScopeStore()
const id = computed(() => String(route.params.id ?? ""))
const { group, files, components, lines } = useGroupDetail(id)

const stats = computed(() => group.value ? [
  { label: t("pages.groups.components"), value: components.value.length.toLocaleString(intlLocale) },
  { label: t("pages.groups.files"), value: files.value.size.toLocaleString(intlLocale) },
  { label: t("pages.groups.lines"), value: lines.value.toLocaleString(intlLocale) },
] : [])
const tabs = computed<DetailTab[]>(() => [
  { id: "overview", label: t("pages.groups.overview"), to: groupPath(id.value), exact: true },
  { id: "history", label: t("pages.groups.history"), to: groupPath(id.value, "history") },
  { id: "rules", label: t("pages.groups.rules"), to: groupPath(id.value, "rules") },
])
</script>
