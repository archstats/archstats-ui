<template>
  <div class="flex flex-col gap-4">
    <!-- Code Editor Card -->
    <div class="border border-slate-200/80 rounded-3xl overflow-hidden bg-[#282c34] shadow-md flex flex-col">
      <!-- Editor Header -->
      <div class="flex items-center justify-between px-5 py-3 bg-[#21252b] border-b border-[#181a1f] select-none">
        <!-- File identity details -->
        <div class="flex items-center gap-2 text-left">
          <span class="font-mono text-xs text-[#abb2bf] font-bold select-all">{{ fileBasename }}</span>
          <span 
            v-if="detectedLanguageLabel" 
            class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#282c34] text-slate-400 border border-slate-700/50 font-mono"
          >
            {{ detectedLanguageLabel }}
          </span>
          <!-- Line highlight indicator -->
          <span 
            v-if="highlightStart > 0"
            class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono"
          >
            L{{ highlightStart === highlightEnd ? highlightStart : `${highlightStart}-${highlightEnd}` }}
          </span>
        </div>

        <!-- Copy Action Button -->
        <button 
          @click="copyToClipboard"
          class="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer bg-[#282c34] hover:bg-[#2c313c] border border-slate-700/50 px-2.5 py-1 rounded-lg"
        >
          <!-- Clipboard Icon -->
          <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0A2.25 2.25 0 0 1 13.5 5.25h-3a2.25 2.25 0 0 1-2.166-1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.046.166.07.34.07.518v14.5a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25V5.25c0-.178.024-.352.07-.518M9 10.5h6m-6 3h6m-6 4h6" />
          </svg>
          <!-- Checked / Success Icon -->
          <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-emerald-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <span>{{ copied ? 'Copied!' : 'Copy Code' }}</span>
        </button>
      </div>

      <!-- Editor Content -->
      <div ref="scrollContainerRef" class="overflow-y-auto max-h-[600px] flex items-start relative bg-[#282c34] rounded-b-3xl scroll-container-y">
        <!-- Gutter Line Numbers -->
        <div class="sticky left-0 bg-[#21252b] select-none text-[#5c6370] pl-5 pr-4 py-4 border-r border-[#181a1f] font-mono text-[11px] leading-[1.6] min-w-[3.5rem] shrink-0 font-bold z-10 m-0 overflow-hidden flex flex-col">
          <span 
            v-for="line in codeLines" 
            :key="'num-' + line.number"
            :ref="line.isHighlighted ? 'highlightedLineRef' : undefined"
            class="text-right block"
            :class="line.isHighlighted ? 'text-amber-400' : ''"
          >{{ line.number }}</span>
        </div>

        <!-- Highlighted Code Body -->
        <div class="grow overflow-x-auto min-w-0">
          <pre class="p-4 m-0 bg-[#282c34] font-mono text-[11px] leading-[1.6] scroll-container-x"><code class="hljs block whitespace-pre text-left"><div 
  v-for="line in codeLines" 
  :key="'code-' + line.number"
  class="w-full"
  :class="line.isHighlighted ? 'bg-amber-500/15 border-l-2 border-amber-500 pl-2 -ml-2 font-semibold' : ''"
  v-html="line.html || ' '"
></div></code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import hljs from "highlight.js"
import "highlight.js/styles/atom-one-dark.css"

const props = defineProps({
  filePath: {
    type: String,
    required: true,
  },
})

const route = useRoute()
const store = useDataStore()
const copied = ref(false)
const scrollContainerRef = ref<HTMLElement | null>(null)
const highlightedLineRef = ref<HTMLElement[] | null>(null)

const escapedPath = computed(() => props.filePath.replace(/'/g, "''"))

const fileBasename = computed(() => {
  const parts = props.filePath.split('/')
  return parts[parts.length - 1] || props.filePath
})

// ── Parse hash for line highlighting ────────────────────────────
const highlightStart = computed(() => {
  const hash = route.hash || ''
  // Matches #L23 or #L23-L25 or #L23-25
  const match = hash.match(/^#L(\d+)/)
  return match ? parseInt(match[1]) : 0
})

const highlightEnd = computed(() => {
  const hash = route.hash || ''
  const rangeMatch = hash.match(/^#L\d+[-–]L?(\d+)/)
  if (rangeMatch) return parseInt(rangeMatch[1])
  return highlightStart.value
})

// ── File Content Query ──────────────────────────────────────────
const fileContents = ref("")
watch(
  () => [store.hasData, props.filePath] as const,
  async ([hasData, filePath]) => {
    if (!hasData || !filePath) {
      fileContents.value = ""
      return
    }
    try {
      const rows = await store.query<any>(
        `SELECT content FROM file_contents WHERE file = '${escapedPath.value}' LIMIT 1`
      )
      fileContents.value = rows.length > 0 ? rows[0].content : ""
    } catch {
      fileContents.value = ""
    }
  },
  { immediate: true }
)

// ── Language Detection ──────────────────────────────────────────
function detectLanguage(filename: string): string {
  const lowercaseFilename = filename.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  
  if (lowercaseFilename === 'makefile' || ext === 'mk') return 'makefile'
  if (lowercaseFilename === 'dockerfile' || ext === 'dockerfile') return 'dockerfile'
  
  if (ext === 'java') return 'java'
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'javascript'
  if (['ts', 'mts', 'cts', 'tsx'].includes(ext)) return 'typescript'
  if (ext === 'vue') return 'xml'
  if (ext === 'xml') return 'xml'
  if (ext === 'json') return 'json'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm', 'xhtml'].includes(ext)) return 'xml'
  if (ext === 'py') return 'python'
  if (ext === 'go') return 'go'
  if (ext === 'sql') return 'sql'
  if (['yaml', 'yml'].includes(ext)) return 'yaml'
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'bash'
  if (['cpp', 'cc', 'cxx', 'hpp', 'h'].includes(ext)) return 'cpp'
  if (ext === 'c') return 'c'
  if (ext === 'cs') return 'csharp'
  if (ext === 'rs') return 'rust'
  if (ext === 'rb') return 'ruby'
  if (ext === 'php') return 'php'
  if (ext === 'swift') return 'swift'
  if (['kt', 'kts'].includes(ext)) return 'kotlin'
  if (ext === 'scala') return 'scala'
  if (ext === 'css') return 'css'
  if (ext === 'scss') return 'scss'
  if (ext === 'less') return 'less'
  if (['diff', 'patch'].includes(ext)) return 'diff'
  if (['toml', 'ini'].includes(ext)) return 'ini'
  if (ext === 'proto') return 'protobuf'
  if (['graphql', 'gql'].includes(ext)) return 'graphql'
  if (ext === 'pl' || ext === 'pm') return 'perl'
  if (ext === 'r') return 'r'
  
  return ''
}

const detectedLang = computed(() => detectLanguage(fileBasename.value))

const detectedLanguageLabel = computed(() => {
  const lang = detectedLang.value
  if (!lang) return 'text'
  const labels: Record<string, string> = {
    'xml': 'vue / html / xml',
    'javascript': 'javascript',
    'typescript': 'typescript',
    'java': 'java',
    'python': 'python',
    'go': 'go',
    'sql': 'sql',
    'yaml': 'yaml',
    'bash': 'bash / shell',
    'cpp': 'c++',
    'c': 'c',
    'csharp': 'c#',
    'rust': 'rust',
    'ruby': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kotlin': 'kotlin',
    'scala': 'scala',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'diff': 'diff / patch',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'ini': 'ini / toml',
    'protobuf': 'protobuf',
    'graphql': 'graphql',
    'perl': 'perl',
    'r': 'r'
  }
  return labels[lang] || lang
})

// ── Per-line syntax highlighted code with highlight flags ────────
const codeLines = computed(() => {
  if (!fileContents.value) return []
  
  const rawLines = fileContents.value.split('\n')
  const lang = detectedLang.value
  let highlightedHtml = ""
  
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlightedHtml = hljs.highlight(fileContents.value, { language: lang }).value
    } else {
      highlightedHtml = hljs.highlightAuto(fileContents.value).value
    }
  } catch {
    highlightedHtml = fileContents.value
  }
  
  const htmlLines = highlightedHtml.split('\n')
  const hStart = highlightStart.value
  const hEnd = highlightEnd.value
  
  return rawLines.map((_, idx) => ({
    number: idx + 1,
    html: htmlLines[idx] ?? '',
    isHighlighted: hStart > 0 && (idx + 1) >= hStart && (idx + 1) <= hEnd
  }))
})

// ── Scroll to highlighted line ──────────────────────────────────
function scrollToHighlighted() {
  nextTick(() => {
    if (highlightedLineRef.value && highlightedLineRef.value.length > 0 && scrollContainerRef.value) {
      const el = highlightedLineRef.value[0]
      const container = scrollContainerRef.value
      const elTop = el.offsetTop
      const containerHeight = container.clientHeight
      container.scrollTop = Math.max(0, elTop - containerHeight / 3)
    }
  })
}

onMounted(() => {
  if (highlightStart.value > 0) {
    scrollToHighlighted()
  }
})

watch(() => route.hash, () => {
  if (highlightStart.value > 0) {
    scrollToHighlighted()
  }
})

// ── Copy to Clipboard Helper ────────────────────────────────────
function copyToClipboard() {
  if (!fileContents.value) return
  navigator.clipboard.writeText(fileContents.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}
</script>

<style scoped>
/* Code Container scrollbars */
.scroll-container-y::-webkit-scrollbar,
.scroll-container-x::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.scroll-container-y::-webkit-scrollbar-track,
.scroll-container-x::-webkit-scrollbar-track {
  background: #21252b;
}
.scroll-container-y::-webkit-scrollbar-thumb,
.scroll-container-x::-webkit-scrollbar-thumb {
  background: #3e4452;
  border-radius: 4px;
}
.scroll-container-y::-webkit-scrollbar-thumb:hover,
.scroll-container-x::-webkit-scrollbar-thumb:hover {
  background: #4b5263;
}

:deep(code.hljs) {
  padding: 0 !important;
}

:deep(.hljs-addition) {
  background-color: rgba(34, 197, 94, 0.15) !important;
  color: #a3e635 !important;
  display: inline-block;
  width: 100%;
  padding-right: 4px;
}
:deep(.hljs-deletion) {
  background-color: rgba(239, 68, 68, 0.15) !important;
  color: #f87171 !important;
  display: inline-block;
  width: 100%;
  padding-right: 4px;
}
</style>
