<template>
  <div>
    <div v-for="node in nodes" :key="node.unit + '#' + node.fn" class="call-node">
      <div class="call-row" :style="{ paddingLeft: `${depth * 14 + 6}px` }">
        <button type="button" class="call-toggle" :class="{ 'is-leaf': depth >= MAX_DEPTH || path.includes(keyOf(node)) }" :aria-expanded="!!open[keyOf(node)]" :aria-label="t('files.callTree.expand')" @click="toggle(node)">
          <Icon :icon="open[keyOf(node)] ? 'chevron-down' : 'chevron-right'" :size="12"/>
        </button>
        <button type="button" class="min-w-0 grow truncate text-left" :title="`${node.unit}\n${node.file ?? ''}:${node.line ?? ''}`" @click="emit('open', node)">
          <span class="font-mono text-sm text-neutral-900">{{ short(node.fn) }}</span>
          <span class="ml-1.5 font-mono text-xs text-neutral-400">{{ owner(node.fn) }}</span>
        </button>
        <span v-if="node.via === 'implementation'" class="via-tag" :title="t('files.callTree.implementationTitle')">{{ t('files.callTree.impl') }}</span>
        <span v-if="node.component && node.component !== home" class="cross-dot" :title="t('files.callTree.otherComponent', { component: node.component })"></span>
        <span v-if="node.sites > 1" class="shrink-0 font-mono text-xs tabular-nums text-neutral-400">×{{ node.sites }}</span>
      </div>
      <div v-if="loading[keyOf(node)]" class="py-0.5 text-xs text-neutral-400" :style="{ paddingLeft: `${(depth + 1) * 14 + 24}px` }">{{ t('files.callTree.loading') }}</div>
      <div v-else-if="open[keyOf(node)] && !children[keyOf(node)]?.length" class="py-0.5 text-xs text-neutral-400" :style="{ paddingLeft: `${(depth + 1) * 14 + 24}px` }">{{ direction === 'in' ? t('files.callTree.noCallers') : t('files.callTree.noCallees') }}</div>
      <CallTree
        v-else-if="open[keyOf(node)]"
        :nodes="children[keyOf(node)]!"
        :direction="direction"
        :depth="depth + 1"
        :path="[...path, keyOf(node)]"
        :home="home"
        :load="load"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// A call hierarchy, one level at a time: who calls a function (in) or what
// it calls (out), each row opening the next level when asked. A function
// already on the path is not opened again, so a recursion ends.
import { reactive, type PropType } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { simpleName } from "~/features/files/codeIntel"
import type { CallNode } from "~/features/files/codeInquiry"

defineOptions({ name: "CallTree" })

const props = defineProps({
  nodes: { type: Array as PropType<CallNode[]>, required: true },
  direction: { type: String as PropType<"in" | "out">, required: true },
  depth: { type: Number, default: 0 },
  path: { type: Array as PropType<string[]>, default: () => [] },
  home: { type: String as PropType<string | null>, default: null },
  load: { type: Function as PropType<(node: CallNode) => Promise<CallNode[]>>, required: true },
})
const emit = defineEmits<{ open: [node: CallNode] }>()

const MAX_DEPTH = 12
const open = reactive<Record<string, boolean>>({})
const loading = reactive<Record<string, boolean>>({})
const children = reactive<Record<string, CallNode[]>>({})

const keyOf = (n: CallNode) => `${n.unit}#${n.fn}`
const short = (fn: string) => `${simpleName(fn)}()`
const owner = (fn: string) => (fn.includes(".") ? fn.slice(0, fn.lastIndexOf(".")) : "")

async function toggle(node: CallNode) {
  const k = keyOf(node)
  if (props.depth >= MAX_DEPTH || props.path.includes(k)) return
  if (open[k]) { open[k] = false; return }
  open[k] = true
  if (children[k]) return
  loading[k] = true
  try {
    children[k] = await props.load(node)
  } catch {
    children[k] = []
  } finally {
    loading[k] = false
  }
}
</script>

<style scoped>
.call-row { display: flex; align-items: center; gap: 0.25rem; height: 1.625rem; padding-right: 0.5rem; border-radius: 0.25rem; }
.call-row:hover { background: rgb(var(--c-neutral-100)); }
.call-toggle { display: grid; place-items: center; width: 1rem; height: 1rem; flex: none; color: rgb(var(--c-neutral-500)); border-radius: 0.1875rem; }
.call-toggle:hover { color: rgb(var(--c-neutral-900)); }
.call-toggle.is-leaf { visibility: hidden; }
.via-tag { flex: none; padding: 0 0.25rem; border-radius: 0.1875rem; font-size: 0.625rem; line-height: 0.875rem; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-100)); }
.cross-dot { flex: none; width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: rgb(var(--c-blue-500)); }
</style>
