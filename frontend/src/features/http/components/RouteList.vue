<template>
  <!-- Routes as an inspector lists them: method and path, a click picks one.
       A long list shows its first forty and says how many more. -->
  <div>
    <h4 class="ui-label">{{ title }}</h4>
    <ul class="flex flex-col">
      <li v-for="r in shown" :key="r.id">
        <button type="button" class="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" :title="r.path" @click="emit('pick', r.id)">
          <span class="w-[52px] shrink-0 font-mono text-[11px] font-medium" :class="methodClass(r.method)">{{ r.method }}</span>
          <span class="min-w-0 truncate font-mono text-xs text-neutral-800">{{ r.path }}</span>
        </button>
      </li>
    </ul>
    <button v-if="routes.length > shown.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="all = true">{{ t('http.routeList.showAll', { count: routes.length }) }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { t } from "~/shared/i18n"
import type { Route } from "../http"

const props = defineProps<{ title: string; routes: Route[]; methodClass: (m: string) => string }>()
const emit = defineEmits<{ (e: "pick", id: number): void }>()
const all = ref(false)
watch(() => props.routes, () => { all.value = false })
const shown = computed(() => (all.value ? props.routes : props.routes.slice(0, 40)))
</script>
