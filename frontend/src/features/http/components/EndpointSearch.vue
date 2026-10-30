<template>
  <!-- The catalogue's one place to narrow it: words, a pasted URL, and picked
       facts as chips. Focused and empty, it offers the checks (No timeout,
       Changes data…) and the methods with their counts; while a word is typed,
       what it could mean (a method, a check, a table, a system, a class, an
       access rule). Enter or a click makes it a chip. / focuses it from
       anywhere on the page. -->
  <div class="relative" @keydown="onKey">
    <div class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 transition-colors"
         :class="focused ? 'border-[rgb(var(--c-accent-500))] ring-2 ring-[rgb(var(--c-accent-500)/0.18)]' : 'border-neutral-300 hover:border-neutral-400'"
         @click="input?.focus()">
      <Icon icon="search" :size="15" class="shrink-0 text-neutral-500"/>
      <span v-for="(tk, i) in tokens" :key="tk.kind + tk.value" class="flex h-6 items-center gap-1 rounded-md bg-neutral-100 pl-2 pr-1 text-xs text-neutral-800">
        <span v-if="tk.kind !== 'filter'" class="text-neutral-500">{{ t(`http.search.kind.${tk.kind}`) }}</span>
        <span class="max-w-[220px] truncate" :class="{ 'font-mono': tk.kind !== 'filter' }">{{ tokenLabel(tk) }}</span>
        <button type="button" class="rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800" :aria-label="t('http.search.removeToken')" @click.stop="removeToken(i)"><Icon icon="x" :size="11"/></button>
      </span>
      <input ref="input" :value="text" type="search" class="min-w-[180px] flex-1 border-0 bg-transparent p-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-0"
             :placeholder="tokens.length ? t('http.search.more') : t('http.search.placeholder')" :aria-label="t('http.search.placeholder')"
             role="combobox" :aria-expanded="open" aria-controls="endpoint-suggestions" :aria-activedescendant="open && active >= 0 ? `sugg-${active}` : undefined"
             @input="onInput" @focus="focused = true" @blur="onBlur"/>
      <span v-if="text || tokens.length" class="shrink-0 font-mono text-[11px] text-neutral-500">{{ count }}</span>
      <button v-if="text || tokens.length" type="button" class="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" :aria-label="t('http.search.clear')" @click.stop="clear"><Icon icon="x" :size="13"/></button>
      <kbd v-else class="shrink-0 rounded border border-neutral-200 px-1.5 font-mono text-[10px] text-neutral-500">/</kbd>
    </div>
    <ul v-if="open" id="endpoint-suggestions" role="listbox" class="ui-popover absolute left-0 right-0 top-full z-40 mt-1 flex max-h-[min(70vh,520px)] flex-col overflow-y-auto py-1">
      <template v-for="(s, i) in suggestions" :key="s.token.kind + s.token.value">
        <li v-if="s.group && s.group !== suggestions[i - 1]?.group" role="presentation" class="px-3 pb-1 pt-2 text-[11px] font-medium text-neutral-500">{{ s.group }}</li>
        <li :id="`sugg-${i}`" role="option" :aria-selected="i === active">
          <button type="button" class="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-sm" :class="i === active ? 'bg-neutral-100' : 'hover:bg-neutral-50'" :title="s.title"
                  @mousedown.prevent="pick(s)" @mouseenter="active = i">
            <span v-if="s.token.kind !== 'filter' && s.token.kind !== 'method'" class="w-14 shrink-0 text-xs text-neutral-500">{{ t(`http.search.kind.${s.token.kind}`) }}</span>
            <span class="min-w-0 flex-1 truncate text-[13px] text-neutral-900" :class="{ 'font-mono': s.token.kind !== 'filter' }">
              <template v-for="(m, k) in marks(s.label, [word.toLowerCase()])" :key="k"><span :class="m.hit ? 'rounded-sm bg-[rgb(var(--c-amber-300)/0.55)]' : ''">{{ m.text }}</span></template>
            </span>
            <span class="shrink-0 font-mono text-[11px] text-neutral-500">{{ t('http.search.endpoints', { count: s.count }) }}</span>
          </button>
        </li>
      </template>
      <li v-if="!word && examples.length" role="presentation" class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-neutral-200 px-3 pb-1 pt-2 text-[11px] text-neutral-500">
        <span>{{ t('http.search.try') }}</span>
        <button v-for="ex in examples" :key="ex" type="button" class="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 hover:bg-neutral-200" @mousedown.prevent="tryExample(ex)">{{ ex }}</button>
      </li>
      <li role="presentation" class="px-3 pb-1 pt-1.5 text-[11px] text-neutral-500">{{ word ? t('http.search.suggestHint') : t('http.search.facetHint') }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import { marks, type Suggestion, type Token } from "../search"

const props = defineProps<{
  text: string
  tokens: Token[]
  /** What the word being typed could mean, from the parent. */
  suggestFor: (word: string) => Suggestion[]
  count: string
  examples: string[]
  /** How a chip names its token. */
  tokenLabel: (tk: Token) => string
}>()
const emit = defineEmits<{
  (e: "update:text", v: string): void
  (e: "update:tokens", v: Token[]): void
  /** Down or Enter without a suggestion: on to the results. */
  (e: "results"): void
}>()

const input = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const active = ref(0)
// Esc closes the list until the next keystroke.
const dismissed = ref(false)
// The word under the caret: the last one typed.
const word = computed(() => props.text.split(/\s+/).pop() ?? "")
const suggestions = computed(() => (focused.value && !dismissed.value && !word.value.includes("/") ? props.suggestFor(word.value) : []))
const open = computed(() => suggestions.value.length > 0)
// A typed word offers its best guess; an empty search waits for a choice, so Enter still goes to the results.
watch(suggestions, () => { active.value = word.value ? 0 : -1 })

function onInput(e: Event) { dismissed.value = false; emit("update:text", (e.target as HTMLInputElement).value) }
function onBlur() { focused.value = false; dismissed.value = false }
function pick(s: Suggestion) {
  if (!props.tokens.some(x => x.kind === s.token.kind && x.value === s.token.value)) emit("update:tokens", [...props.tokens, s.token])
  const rest = props.text.split(/\s+/)
  rest.pop()
  emit("update:text", rest.join(" ") + (rest.length ? " " : ""))
  input.value?.focus()
}
function removeToken(i: number) { emit("update:tokens", props.tokens.filter((_, k) => k !== i)) }
function clear() { emit("update:text", ""); emit("update:tokens", []); input.value?.focus() }
function tryExample(ex: string) { dismissed.value = false; emit("update:text", ex); input.value?.focus() }

function onKey(e: KeyboardEvent) {
  if (e.target !== input.value) return
  const n = suggestions.value.length
  if (open.value && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault()
    active.value = e.key === "ArrowDown" ? (active.value + 1) % n : active.value <= 0 ? n - 1 : active.value - 1
    return
  }
  const chosen = open.value && active.value >= 0 ? suggestions.value[active.value] : null
  if (e.key === "Tab" && chosen) { e.preventDefault(); pick(chosen); return }
  if (e.key === "Enter") {
    e.preventDefault()
    if (chosen) pick(chosen)
    else emit("results")
    return
  }
  if (e.key === "ArrowDown") { e.preventDefault(); emit("results"); return }
  if (e.key === "Backspace" && !props.text && props.tokens.length) { removeToken(props.tokens.length - 1); return }
  if (e.key === "Escape") {
    if (open.value) dismissed.value = true
    else if (props.text || props.tokens.length) clear()
    else input.value?.blur()
  }
}

// "/" anywhere outside a field focuses the search, as in most tools.
function onSlash(e: KeyboardEvent) {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
  const el = e.target as HTMLElement | null
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
  e.preventDefault()
  input.value?.focus()
}
onMounted(() => window.addEventListener("keydown", onSlash))
onBeforeUnmount(() => window.removeEventListener("keydown", onSlash))

defineExpose({ focus: () => input.value?.focus() })
</script>
