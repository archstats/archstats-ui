<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface" :class="fill ? 'h-full' : 'rounded-lg hairline'">
    <!-- Header: identity left, copy right. -->
    <div class="flex h-8 shrink-0 items-center gap-2 px-3 hairline-b">
      <Icon icon="file-code" :size="14" class="text-neutral-400"/>
      <span class="truncate font-mono text-sm text-neutral-900" :title="filePath">{{ fileBasename }}</span>
      <span v-if="detectedLanguageLabel" class="ui-tag">{{ detectedLanguageLabel }}</span>
      <span v-if="highlightStart > 0" class="ui-tag">L{{ highlightStart === highlightEnd ? highlightStart : `${highlightStart}–${highlightEnd}` }}</span>
      <span class="ml-auto font-mono text-xs text-neutral-400">{{ codeLines.length }} lines</span>
      <OpenInEditor :file="filePath" :line="highlightStart > 0 ? highlightStart : undefined"/>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!fileContents" @click="copyToClipboard">
        <Icon :icon="copied ? 'check' : 'copy'" :size="13" class="text-neutral-500"/>
        <span>{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>

    <EmptyState v-if="!fileContents" title="No source stored" text="This snapshot does not include the file contents." icon="file-text" class="grow"/>
    <div v-else ref="scrollContainerRef" class="code-scroll relative flex min-h-0 grow items-start overflow-auto" :class="fill ? '' : 'max-h-[600px]'">
      <div class="sticky left-0 z-10 flex min-w-[3.5rem] shrink-0 select-none flex-col bg-ground py-3 pl-3 pr-2 font-mono text-xs leading-5 text-neutral-400 hairline-r">
        <span v-for="line in codeLines" :key="'num-' + line.number" :ref="line.isHighlighted ? 'highlightedLineRef' : undefined" class="block text-right" :class="line.isHighlighted ? 'text-neutral-900' : ''">{{ line.number }}</span>
      </div>
      <pre class="m-0 min-w-0 grow py-3 pl-4 pr-6 font-mono text-xs leading-5 text-neutral-800"><code class="code-body block whitespace-pre text-left"><div v-for="line in codeLines" :key="'code-' + line.number" class="code-line" :class="{ 'is-highlighted': line.isHighlighted }" v-html="line.html || ' '"></div></code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import OpenInEditor from "~/components/ui/OpenInEditor.vue"
import { copyText } from '~/utils/files'
import { ref, computed, watch, onMounted, nextTick } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import Icon from "~/components/ui/common/Icon.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import hljs from "highlight.js"

const props = defineProps({
  filePath: {
    type: String,
    required: true,
  },
  // Fill the parent (detail tab) instead of capping at a fixed height.
  fill: {
    type: Boolean,
    default: true,
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
  copyText(fileContents.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}
</script>

<style scoped>
.code-line { min-height: 1.25rem; margin: 0 -1.5rem 0 -1rem; padding: 0 1.5rem 0 1rem; }
.code-line.is-highlighted { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }

/* Syntax colours from the data ramps; the accent stays out of the code. */
.code-body :deep(.hljs-comment), .code-body :deep(.hljs-quote) { color: rgb(var(--c-neutral-500)); font-style: italic; }
.code-body :deep(.hljs-keyword), .code-body :deep(.hljs-selector-tag), .code-body :deep(.hljs-literal), .code-body :deep(.hljs-doctag), .code-body :deep(.hljs-formula) { color: rgb(var(--c-violet-700)); }
.code-body :deep(.hljs-string), .code-body :deep(.hljs-regexp), .code-body :deep(.hljs-addition), .code-body :deep(.hljs-meta .hljs-string) { color: rgb(var(--c-green-700)); }
.code-body :deep(.hljs-number), .code-body :deep(.hljs-symbol), .code-body :deep(.hljs-bullet), .code-body :deep(.hljs-link), .code-body :deep(.hljs-selector-attr), .code-body :deep(.hljs-selector-pseudo) { color: rgb(var(--c-amber-700)); }
.code-body :deep(.hljs-title), .code-body :deep(.hljs-title.function_), .code-body :deep(.hljs-section), .code-body :deep(.hljs-name) { color: rgb(var(--c-blue-700)); }
.code-body :deep(.hljs-title.class_), .code-body :deep(.hljs-type), .code-body :deep(.hljs-built_in), .code-body :deep(.hljs-class .hljs-title) { color: rgb(var(--c-blue-800)); }
.code-body :deep(.hljs-attr), .code-body :deep(.hljs-attribute), .code-body :deep(.hljs-variable), .code-body :deep(.hljs-template-variable), .code-body :deep(.hljs-params) { color: rgb(var(--c-neutral-800)); }
.code-body :deep(.hljs-meta), .code-body :deep(.hljs-selector-id), .code-body :deep(.hljs-selector-class) { color: rgb(var(--c-amber-800)); }
.code-body :deep(.hljs-deletion) { color: rgb(var(--c-red-700)); }
.code-body :deep(.hljs-emphasis) { font-style: italic; }
.code-body :deep(.hljs-strong) { font-weight: 600; }
</style>
