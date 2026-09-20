<template>
  <div
    v-if="!inline"
    ref="triggerRef"
    class="inline-block relative cursor-pointer select-none"
    @mouseenter="showPopover"
    @mouseleave="scheduleHide"
  >
    <slot />
  </div>
  <p v-if="inline && !fileContents" class="text-sm text-neutral-500">Source not available for this file.</p>

  <!-- `inline` renders the same snippet in flow instead of as a hover popover. -->
  <Teleport to="body" :disabled="inline">
    <div
      v-if="(inline || isOpen) && fileContents"
      ref="popoverRef"
      :style="inline ? undefined : popoverStyle"
      class="bg-[#282c34] border border-slate-700/50 overflow-hidden font-mono text-[10px] leading-relaxed text-slate-300 select-none"
      :class="inline ? 'w-full rounded' : 'rounded-2xl shadow-xl z-[9999] animate-fade-in'"
      @mouseenter="inline ? undefined : cancelHide()"
      @mouseleave="inline ? undefined : scheduleHide()"
    >
      <!-- Popover Header -->
      <div class="px-3.5 py-1.5 bg-[#21252b] border-b border-[#181a1f] flex items-center justify-between text-[8.5px] text-slate-400 font-bold gap-2">
        <span class="truncate max-w-[200px]" :title="file">{{ filename }}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[8px] font-mono text-[#abb2bf] uppercase tracking-wider bg-[#282c34] border border-slate-700/30 px-1.5 py-0.2 rounded">
            L{{ targetStart === targetEnd ? targetStart : `${targetStart}-${targetEnd}` }}
          </span>
          <router-link
            :to="goToFileUrl"
            class="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-extrabold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded transition-colors cursor-pointer"
            title="View file at this line"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-2.5 h-2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            <span>Go to file</span>
          </router-link>
        </div>
      </div>

      <!-- Popover Body (Code snippet with highlighted lines) -->
      <div class="flex max-h-[260px] overflow-y-auto">
        <!-- Line Numbers Column -->
        <div class="text-right select-none text-[#5c6370] pl-3.5 pr-2.5 py-2.5 bg-[#21252b] border-r border-[#181a1f] flex flex-col font-mono text-[10px] leading-[1.6] shrink-0 font-bold min-w-[2.5rem]">
          <span 
            v-for="line in highlightedSnippetLines" 
            :key="'num-' + line.number"
            :class="line.isTarget ? 'text-amber-400' : ''"
          >
            {{ line.number }}
          </span>
        </div>

        <!-- Highlighted Code lines -->
        <div class="grow p-2.5 overflow-x-auto min-w-0 bg-[#282c34]">
          <pre class="m-0 font-mono text-[10px] leading-[1.6]"><code class="hljs block whitespace-pre"><div 
  v-for="line in highlightedSnippetLines" 
  :key="'code-' + line.number"
  class="px-2 w-full transition-colors duration-150"
  :class="line.isTarget ? 'bg-amber-500/15 border-l-2 border-amber-500 -ml-2 font-semibold' : ''"
  v-html="line.html || ' '"
></div></code></pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { useDataStore } from "~/stores/data"
import hljs from "highlight.js"
import "highlight.js/styles/atom-one-dark.css"

const props = withDefaults(defineProps<{
  file: string
  lines: string | number
  margin?: number
  inline?: boolean
}>(), {
  margin: 3,
  inline: false
})

const store = useDataStore()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverStyle = ref<Record<string, string>>({})

const filename = computed(() => {
  return props.file.split('/').pop() || props.file
})

// ── Parse Lines Prop ───────────────────────────────────────────
const parsedRange = computed(() => {
  const lineVal = String(props.lines).trim()
  if (!lineVal) return { start: 1, end: 1 }
  
  // Try to match "start-end" (range)
  const rangeMatch = lineVal.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    return {
      start: parseInt(rangeMatch[1]),
      end: parseInt(rangeMatch[2])
    }
  }
  
  // Try to match first number in list
  const firstNum = parseInt(lineVal.split(/[\s,]+/)[0])
  if (!isNaN(firstNum)) {
    return { start: firstNum, end: firstNum }
  }
  
  return { start: 1, end: 1 }
})

const targetStart = computed(() => parsedRange.value.start)
const targetEnd = computed(() => parsedRange.value.end)

// ── File Content Query ──────────────────────────────────────────
const fileContents = ref("")
watch(
  () => [store.hasData, props.file] as const,
  async ([hasData, file]) => {
    if (!hasData || !file) {
      fileContents.value = ""
      return
    }
    try {
      const escaped = file.replace(/'/g, "''")
      const rows = await store.query<any>(
        `SELECT content FROM file_contents WHERE file = '${escaped}' LIMIT 1`
      )
      fileContents.value = rows.length > 0 ? rows[0].content : ""
    } catch {
      fileContents.value = ""
    }
  },
  { immediate: true }
)

const linesArray = computed(() => {
  if (!fileContents.value) return []
  return fileContents.value.split('\n')
})

const startLine = computed(() => Math.max(1, targetStart.value - props.margin))
const endLine = computed(() => Math.min(linesArray.value.length, targetEnd.value + props.margin))

const slicedLines = computed(() => {
  if (linesArray.value.length === 0) return []
  const result = []
  for (let i = startLine.value; i <= endLine.value; i++) {
    result.push({
      number: i,
      content: linesArray.value[i - 1] ?? "",
      isTarget: i >= targetStart.value && i <= targetEnd.value
    })
  }
  return result
})

// ── Language Detection ──────────────────────────────────────────
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'java') return 'java'
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'javascript'
  if (['ts', 'mts', 'cts', 'tsx'].includes(ext)) return 'typescript'
  if (ext === 'vue') return 'xml'
  if (ext === 'xml') return 'xml'
  if (ext === 'json') return 'json'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm'].includes(ext)) return 'xml'
  if (ext === 'py') return 'python'
  if (ext === 'go') return 'go'
  if (ext === 'sql') return 'sql'
  if (['yaml', 'yml'].includes(ext)) return 'yaml'
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'bash'
  if (['cpp', 'cc', 'cxx'].includes(ext)) return 'cpp'
  if (ext === 'cs') return 'csharp'
  if (ext === 'rs') return 'rust'
  if (ext === 'diff') return 'diff'
  return ''
}

const highlightedSnippetLines = computed(() => {
  if (slicedLines.value.length === 0) return []
  const rawSnippet = slicedLines.value.map(l => l.content).join('\n')
  const lang = detectLanguage(filename.value)
  
  let highlightedHtml = ""
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlightedHtml = hljs.highlight(rawSnippet, { language: lang }).value
    } else {
      highlightedHtml = hljs.highlightAuto(rawSnippet).value
    }
  } catch {
    highlightedHtml = rawSnippet
  }
  
  // Split highlight tags per line
  const htmlList = highlightedHtml.split('\n')
  return slicedLines.value.map((line, idx) => ({
    ...line,
    html: htmlList[idx] ?? line.content
  }))
})

// ── Popover Positioning ─────────────────────────────────────────
function showPopover() {
  if (!triggerRef.value || !fileContents.value) return
  
  const rect = triggerRef.value.getBoundingClientRect()
  const popoverWidth = 460
  const viewportWidth = window.innerWidth
  
  // Boundary check vertical
  const placeBelow = rect.top < 240
  let top = 0
  let transform = ""
  
  if (placeBelow) {
    top = rect.bottom + window.scrollY + 8
    transform = 'translate(-50%, 0)'
  } else {
    top = rect.top + window.scrollY - 8
    transform = 'translate(-50%, -100%)'
  }
  
  // Boundary check horizontal
  let left = rect.left + window.scrollX + rect.width / 2
  const leftPageOffset = rect.left + rect.width / 2 - popoverWidth / 2
  
  if (leftPageOffset < 16) {
    left = popoverWidth / 2 + 16 + window.scrollX
  } else if (leftPageOffset + popoverWidth > viewportWidth - 16) {
    left = viewportWidth - popoverWidth / 2 - 16 + window.scrollX
  }
  
  popoverStyle.value = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    width: `${popoverWidth}px`,
    transform,
    zIndex: '9999'
  }
  
  isOpen.value = true
}

let hideTimeout: ReturnType<typeof setTimeout> | null = null

function scheduleHide() {
  hideTimeout = setTimeout(() => {
    isOpen.value = false
  }, 120)
}

function cancelHide() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function hidePopover() {
  isOpen.value = false
}

const goToFileUrl = computed(() => {
  return `/views/files/${props.file}/source#L${targetStart.value}`
})
</script>

<style scoped>
/* Override default highlight.js padding to align with line-numbers gutter */
:deep(code.hljs) {
  padding: 0 !important;
}

.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: v-bind('popoverStyle.transform') scale(0.95);
  }
  to {
    opacity: 1;
    transform: v-bind('popoverStyle.transform') scale(1);
  }
}
</style>
