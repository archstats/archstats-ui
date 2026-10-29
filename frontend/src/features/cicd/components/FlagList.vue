<template>
  <!-- Flags by rule: the fact, why people care, and every place it holds. -->
  <div class="flex flex-col">
    <p class="max-w-[760px] px-6 pb-3 pt-4 text-sm text-neutral-600">{{ t('cicd.flags.intro') }}</p>
    <p v-if="!groups.length" class="px-6 text-sm text-neutral-600">{{ search ? t('cicd.flags.noMatch', { q: search }) : t('cicd.flags.none') }}</p>
    <section v-for="g in groups" :key="g.rule" class="hairline-b">
      <button type="button" class="flex w-full items-start gap-3 px-6 py-2.5 text-left hover:bg-neutral-100" :aria-expanded="open.has(g.rule)" @click="toggle(g.rule)">
        <Icon :icon="open.has(g.rule) ? 'chevron-down' : 'chevron-right'" :size="14" class="mt-0.5 shrink-0 text-neutral-500"/>
        <span class="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true"></span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-[13px] font-medium text-neutral-900">{{ t(`cicd.flags.rules.${g.rule}.fact`) }}</span>
          <span class="text-xs text-neutral-600">{{ t(`cicd.flags.rules.${g.rule}.why`) }}</span>
          <span v-if="g.rule === 'ungated_prod_deploy'" class="text-xs text-neutral-500">{{ t('cicd.flags.productionNames', { names: PRODUCTION_NAMES.join(', ') }) }}</span>
        </span>
        <span class="shrink-0 font-mono text-xs text-neutral-600">{{ t('cicd.flags.count', { count: g.flags.length, files: g.files }) }}</span>
      </button>
      <ul v-if="open.has(g.rule)" class="pb-2">
        <li v-for="(f, i) in g.flags" :key="i">
          <button
            type="button" class="flex w-full min-w-0 items-center gap-3 py-1 pl-[60px] pr-6 text-left"
            :class="selected === keyOf(f) ? 'bg-accent-50' : 'hover:bg-neutral-100'"
            @click="emit('pick', f)"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800" :title="f.detail">{{ f.detail || f.subject }}</span>
            <span class="max-w-[45%] shrink-0 truncate font-mono text-xs text-neutral-500" :title="`${f.file}:${f.line}`">{{ shortFile(f.file) }}:{{ f.line }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { PRODUCTION_NAMES, type FlagGroup } from "../flags"
import { shortFile, type Flag } from "../cicd"
import { t } from "~/shared/i18n"

const props = defineProps<{ groups: FlagGroup[]; selected: string | null; search: string }>()
const emit = defineEmits<{ pick: [flag: Flag] }>()
const open = ref(new Set<string>())
watch(() => props.search, q => { if (q) open.value = new Set(props.groups.map(g => g.rule)) })
function toggle(rule: string) {
  const s = new Set(open.value)
  if (s.has(rule)) s.delete(rule)
  else s.add(rule)
  open.value = s
}
const keyOf = (f: Flag) => `flag:${f.rule}:${f.file}:${f.line}:${f.detail}`
</script>
