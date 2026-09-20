<template>
  <span v-if="scope.isActive" class="flex min-w-0 items-center gap-1" :title="summary">
    <template v-for="(bucket, i) in scope.byDimension" :key="bucket.dimension">
      <span v-if="i > 0" class="px-0.5 text-xs font-medium text-neutral-400">and</span>
      <template v-for="(g, j) in bucket.groups" :key="g.id">
        <span v-if="j > 0" class="px-0.5 text-xs text-neutral-400">or</span>
        <span class="ui-chip is-active max-w-[180px]">
          <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: g.color }"></span>
          <span class="truncate">{{ g.name }}</span>
          <button type="button" class="-mr-1 flex h-4 w-4 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="`Remove ${g.name} from scope`" :title="`Remove ${g.name} from scope`" @click.stop="scope.removeGroup(g.id)">
            <Icon icon="x" :size="11"/>
          </button>
        </span>
      </template>
    </template>
  </span>
</template>
<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useScopeStore } from "~/stores/scope";
// The one place a view announces its scope. Groups in the same dimension read
// "or", different dimensions read "and": "Audits or Shipments and Controllers".
// Renders nothing when no scope is set, so toolbars stay quiet by default.
const scope = useScopeStore()
const summary = computed(() => scope.byDimension.map(b => b.groups.map(g => g.name).join(" or ")).join(" and "))
</script>
