<template>
  <button
    type="button"
    class="group flex w-full flex-col gap-1 px-3 py-1.5 text-left"
    :class="selected ? 'bg-accent-50' : 'hover:bg-neutral-100'"
    :aria-current="selected ? 'true' : undefined"
    @click="emit('pick')"
  >
    <span class="flex w-full min-w-0 items-center gap-2">
      <SystemMark :system="row.pipeline.system"/>
      <span class="min-w-0 flex-1 truncate text-[13px] text-neutral-900" :title="row.pipeline.file">{{ row.pipeline.name }}</span>
      <span v-if="row.pipeline.read !== 'full'" class="shrink-0" :title="row.pipeline.read === 'partial' ? t('cicd.list.readInPart') : t('cicd.list.notRead')">
        <Icon icon="circle-dashed" :size="13" class="text-amber-600"/>
      </span>
      <span v-if="row.flags" class="shrink-0 font-mono text-[11px] text-amber-700" :title="t('cicd.list.flagCount', { count: row.flags })">{{ row.flags }}</span>
    </span>
    <span class="flex w-full min-w-0 items-center gap-1.5 pl-[22px]">
      <span class="flex min-w-0 flex-1 gap-1 overflow-hidden">
        <span v-for="c in chips" :key="c.event" class="ui-tag !px-1 !py-0 !text-[10.5px]" :title="c.filter">{{ t(`cicd.events.${c.event}`) }}</span>
      </span>
      <VerbStrip :verbs="row.silhouette" class="shrink-0"/>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import SystemMark from "./SystemMark.vue"
import VerbStrip from "./VerbStrip.vue"
import { triggerChips, type ListRow } from "../cicd"
import { t } from "~/shared/i18n"

const props = defineProps<{ row: ListRow; selected: boolean }>()
const emit = defineEmits<{ pick: [] }>()
const chips = computed(() => triggerChips(props.row.triggers).slice(0, 3))
</script>
