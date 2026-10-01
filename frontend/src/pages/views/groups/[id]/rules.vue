<template>
  <div class="min-h-0 grow overflow-y-auto">
    <div class="mx-auto w-full max-w-[900px] px-6 pb-12 pt-5">
      <section>
        <h2 class="ui-section-title">{{ t('pages.groupsRules.moduleRules') }}</h2>
        <p v-if="!moduleFindings.length" class="mt-2 text-sm text-neutral-500">{{ t('pages.groupsRules.noModuleRuleBroken') }}</p>
        <ul v-else class="mt-2 flex flex-col gap-1">
          <li v-for="(f, i) in moduleFindings" :key="i" class="flex items-center gap-3 text-sm">
            <span class="text-neutral-900">{{ f.rule }}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-neutral-600">{{ f.from }} → {{ f.to }}</span>
            <router-link :to="`${filePath(f.file, 'source')}${f.line ? `#L${f.line}` : ''}`" class="font-mono text-neutral-700 hover:underline">{{ f.file.split("/").pop() }}{{ f.line ? `:${f.line}` : "" }}</router-link>
          </li>
        </ul>
      </section>
      <section class="mt-8">
        <h2 class="ui-section-title">{{ t('pages.groupsRules.lensRules', { dimension: group?.dimension }) }}</h2>
        <p v-if="!declared" class="mt-2 text-sm text-neutral-500">{{ t('pages.groupsRules.hasNoDeclaredDependencies', { dimension: group?.dimension }) }} <router-link to="/views/rules#lens" class="underline-offset-2 hover:underline">{{ t('pages.groupsRules.declareThem') }}</router-link>{{ ' ' + t('pages.groupsRules.checkGroupSImports') }}</p>
        <p v-else-if="!mine.length" class="mt-2 text-sm text-neutral-500">{{ t('pages.groupsRules.noImportGroupCrosses') }}</p>
        <ul v-else class="mt-2 flex flex-col gap-1">
          <li v-for="e in mine" :key="e.file + e.toComponent" class="flex items-center gap-3 text-sm">
            <span class="w-40 shrink-0 truncate text-neutral-700">{{ groupName(e.fromGroup) }} → {{ groupName(e.toGroup) }}</span>
            <span class="min-w-0 flex-1 truncate font-mono text-neutral-600">{{ e.fromComponent }} → {{ e.toComponent }}</span>
            <router-link :to="`${filePath(e.file, 'source')}${e.line ? `#L${e.line}` : ''}`" class="font-mono text-neutral-700 hover:underline">{{ e.file.split("/").pop() }}{{ e.line ? `:${e.line}` : "" }}</router-link>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useGroupDetail } from "~/features/groups/useGroupDetail"
import { useLensFindings } from "~/features/rules/useLensFindings"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { filePath } from "~/features/navigation/routes"
import { t } from "~/shared/i18n"

const route = useRoute()
const data = useDataStore()
const groupsStore = useGroupsStore()
const id = computed(() => String(route.params.id ?? ""))
const { group, fileSql } = useGroupDetail(id)
const { check, declared } = useLensFindings(computed(() => group.value?.dimension ?? null))
const mine = computed(() => check.value.crossings.flatMap(c => c.edges).filter(e => e.fromGroup === id.value || e.toGroup === id.value))
const groupName = (g: string) => groupsStore.getGroupById(g)?.name ?? g
const { data: moduleFindings } = useAsyncQuery<Array<{ rule: string; from: string; to: string; file: string; line: number }>>(
  () => (data.hasView("rules") ? data.query(`SELECT rule, "from", "to", file, line FROM rules WHERE status = 'violation' AND ${fileSql.value} ORDER BY rule, file, line`) : Promise.resolve([])),
  [fileSql],
  { initial: [] },
)
</script>
