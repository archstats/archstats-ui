<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface" :class="fill ? 'h-full' : 'rounded-lg hairline'">
    <!-- One header: where the file is, what it is, what to do with it. -->
    <div class="flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
      <span class="flex min-w-[6rem] shrink items-baseline overflow-hidden font-mono text-sm" :title="filePath">
        <span v-if="crumbDir" class="min-w-0 truncate text-neutral-500">{{ crumbDir }}/</span>
        <span class="min-w-0 truncate font-semibold text-neutral-900">{{ fileBasename }}</span>
      </span>
      <span v-if="detectedLanguageLabel && !fileBasename.includes('.')" class="ui-tag shrink-0">{{ detectedLanguageLabel }}</span>
      <slot name="tags"/>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="meta"><span class="ui-toolbar-meta">{{ t('files.fileCodeViewer.lines', { codeLinesLength: formatNumber(codeLines.length) }) }}</span></slot>
      </span>
      <span class="h-4 w-px shrink-0 bg-neutral-200"></span>
      <button v-if="annotations" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :class="{ 'bg-neutral-100': showComplexity }" :aria-pressed="showComplexity" :aria-label="t('files.fileCodeViewer.complexity')" :title="t('files.fileCodeViewer.complexityTitle')" @click="showComplexity = !showComplexity">
        <Icon icon="braces" :size="13" :class="showComplexity ? 'text-neutral-900' : 'text-neutral-500'"/>
      </button>
      <button v-if="symbols && symbols.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :class="{ 'bg-neutral-100': symbolsOpen }" :aria-pressed="symbolsOpen" :aria-label="t('files.fileCodeViewer.symbols')" :title="t('files.fileCodeViewer.symbolsTitle')" @click="emit('update:symbolsOpen', !symbolsOpen)">
        <Icon icon="layout-list" :size="13" :class="symbolsOpen ? 'text-neutral-900' : 'text-neutral-500'"/>
      </button>
      <OpenInEditor :file="filePath" :line="highlightStart > 0 ? highlightStart : undefined"/>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :disabled="!fileContents" :title="copied ? t('files.fileCodeViewer.copied') : t('files.fileCodeViewer.copy')" :aria-label="t('files.fileCodeViewer.copy')" @click="copyToClipboard">
        <Icon :icon="copied ? 'check' : 'copy'" :size="13" class="text-neutral-500"/>
      </button>
      <slot name="actions"/>
    </div>

    <EmptyState v-if="!fileContents" :title="t('files.fileCodeViewer.noSourceStored')" :text="t('files.fileCodeViewer.snapshotDoesNotInclude')" icon="file-text" class="grow"/>
    <div v-else class="relative flex min-h-0 grow flex-col" :class="fill ? '' : 'max-h-[600px]'">
      <!-- Sticky scope: the signature of the function being read, once it has scrolled away. -->
      <button v-if="stickyScope" type="button" class="scope-bar" :title="t('files.fileCodeViewer.scopeTitle', { name: stickyScope.name || t('files.fileCodeViewer.anonymous') })" @click="jumpTo(stickyScope)">
        <span class="scope-num">{{ signatureLine(stickyScope) }}</span>
        <code class="scope-code code-body" v-html="codeLines[signatureLine(stickyScope) - 1]?.html || ' '"></code>
        <span v-if="stickyScope.cognitive > 15" class="cx-fn">{{ t('files.fileCodeViewer.cognitive', { cognitive: stickyScope.cognitive }) }}</span>
      </button>
      <div ref="scrollContainerRef" class="code-scroll relative flex min-h-0 grow items-start overflow-auto" @scroll.passive="onScroll">
        <div class="sticky left-0 z-10 flex min-w-[3.5rem] shrink-0 select-none flex-col bg-ground py-3 pl-3 pr-2 font-mono text-xs leading-5 text-neutral-400 hairline-r">
          <a
            v-for="(line, i) in codeLines"
            :key="'num-' + line.number"
            :ref="line.isHighlighted ? 'highlightedLineRef' : undefined"
            :href="`#L${line.number}`"
            class="gutter-line block text-right"
            :class="[line.isHighlighted ? 'text-neutral-900' : '', showComplexity && notes[i].fn ? 'in-complex' : '']"
            :title="showComplexity && notes[i].fn ? t('files.fileCodeViewer.inComplexFunction', { name: notes[i].fn!.name, cognitive: notes[i].fn!.cognitive }) : t('files.fileCodeViewer.selectLine')"
            @click.prevent="selectLine(line.number, $event)"
          >{{ line.number }}</a>
        </div>
        <pre class="m-0 min-w-0 grow py-3 pl-4 pr-6 font-mono text-xs leading-5 text-neutral-800"><code class="code-body block whitespace-pre text-left"><div v-for="(line, i) in codeLines" :key="'code-' + line.number" class="code-line" :class="{ 'is-highlighted': line.isHighlighted }"><span v-html="line.html || ' '"></span><template v-if="showComplexity && notes[i].steps.length"><span v-for="(step, j) in notes[i].steps" :key="j" class="cx-step" :class="step.points >= 3 ? 'is-heavy' : step.points === 2 ? 'is-nested' : ''" :title="step.nesting > 0 ? t('files.fileCodeViewer.stepNested', { points: step.points, construct: step.construct, nesting: step.nesting }) : t('files.fileCodeViewer.step', { points: step.points, construct: step.construct })">+{{ step.points }} {{ step.construct }}</span></template></div></code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A file's source, read the way GitHub reads one: a breadcrumb header, line
// numbers that select a line or (with shift) a range, the signature of the
// function being read pinned at the top once it scrolls away, and, when the
// snapshot has them, the steps that make each complex function complex.
import OpenInEditor from "./OpenInEditor.vue"
import { copyText } from '~/platform/files'
import { ref, computed, watch, onMounted, nextTick, type PropType } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import Icon from "~/shared/ui/Icon.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import hljs from "highlight.js"
import { t } from "~/shared/i18n"
import { formatNumber } from "~/shared/format"
import { annotateLines, symbolAt, type ComplexityAnnotations, type FileSymbol } from "~/features/files/complexityAnnotations"

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
  // The folder the breadcrumb reads from; the file's folders above it are left out.
  root: {
    type: String,
    default: "",
  },
  // The complex functions and what their complexity is made of, drawn beside
  // the code (useComplexityAnnotations). Without them the code is plain.
  annotations: {
    type: Object as PropType<ComplexityAnnotations | null>,
    default: null,
  },
  // Every function of the file (useFileSymbols): the sticky scope and the
  // Symbols toggle read them.
  symbols: {
    type: Array as PropType<FileSymbol[] | null>,
    default: null,
  },
  symbolsOpen: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits<{ "update:symbolsOpen": [open: boolean]; scope: [symbol: FileSymbol | null] }>()

const showComplexity = ref(true)
const notes = computed(() => annotateLines(codeLines.value.length, props.annotations))

const route = useRoute()
const router = useRouter()
const store = useDataStore()
const copied = ref(false)
const scrollContainerRef = ref<HTMLElement | null>(null)
const highlightedLineRef = ref<HTMLElement[] | null>(null)

const escapedPath = computed(() => props.filePath.replace(/'/g, "''"))

const fileBasename = computed(() => {
  const parts = props.filePath.split('/')
  return parts[parts.length - 1] || props.filePath
})
const crumbDir = computed(() => {
  const rel = props.root && props.filePath.startsWith(props.root + "/") ? props.filePath.slice(props.root.length + 1) : props.filePath
  const i = rel.lastIndexOf("/")
  return i === -1 ? "" : rel.slice(0, i)
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
    'xml': t("files.fileCodeViewer.vueHtmlXml"),
    'javascript': 'javascript',
    'typescript': 'typescript',
    'java': 'java',
    'python': 'python',
    'go': 'go',
    'sql': 'sql',
    'yaml': 'yaml',
    'bash': t("files.fileCodeViewer.bashShell"),
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
    'diff': t("files.fileCodeViewer.diffPatch"),
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'ini': t("files.fileCodeViewer.iniToml"),
    'protobuf': 'protobuf',
    'graphql': 'graphql',
    'perl': 'perl',
    'r': 'r'
  }
  return labels[lang] || lang
})


// ── Syntax highlighting, once per file ──────────────────────────
// Kept apart from the selection: a click on a line number must not
// highlight 1,600 lines again.
const htmlLines = computed(() => {
  if (!fileContents.value) return []
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
  return highlightedHtml.split('\n')
})

const codeLines = computed(() => {
  if (!fileContents.value) return []
  // A final newline ends the last line rather than starting another.
  let count = fileContents.value.split('\n').length
  if (fileContents.value.endsWith('\n')) count--
  const hStart = highlightStart.value
  const hEnd = highlightEnd.value
  const html = htmlLines.value
  return Array.from({ length: count }, (_, idx) => ({
    number: idx + 1,
    html: html[idx] ?? '',
    isHighlighted: hStart > 0 && (idx + 1) >= hStart && (idx + 1) <= hEnd
  }))
})

// ── Selecting lines: click a number, shift-click to extend ──────
let scrollOnHash = true
function selectLine(line: number, event: MouseEvent) {
  const from = event.shiftKey && highlightStart.value > 0 ? highlightStart.value : line
  const [a, b] = from <= line ? [from, line] : [line, from]
  scrollOnHash = false
  router.replace({ path: route.path, query: route.query, hash: a === b ? `#L${a}` : `#L${a}-L${b}` })
}
function jumpTo(symbol: FileSymbol) {
  router.replace({ path: route.path, query: route.query, hash: `#L${symbol.begin}-L${symbol.end}` })
}

// ── Scroll to highlighted line ──────────────────────────────────
function rowHeight(): number {
  return scrollContainerRef.value?.querySelector<HTMLElement>('.code-line')?.offsetHeight || 20
}
function scrollToHighlighted() {
  nextTick(() => {
    if (highlightedLineRef.value && highlightedLineRef.value.length > 0 && scrollContainerRef.value) {
      // The first line of the range lands near the top, as GitHub puts it.
      scrollContainerRef.value.scrollTop = Math.max(0, highlightedLineRef.value[0].offsetTop - rowHeight() * 3)
    }
  })
}

onMounted(() => {
  if (highlightStart.value > 0) {
    scrollToHighlighted()
  }
})

watch(() => route.hash, () => {
  if (highlightStart.value > 0 && scrollOnHash) {
    scrollToHighlighted()
  }
  scrollOnHash = true
})

// The contents arrive after the viewer mounts, so a link that opens the file
// at a line scrolls once there are lines to scroll to.
watch(() => codeLines.value.length, (count) => {
  if (count > 0 && highlightStart.value > 0) {
    scrollToHighlighted()
  }
})

// ── Where the reader is: the top line, and the function it is in ─
const topLine = ref(1)
let frame = 0
function onScroll() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const el = scrollContainerRef.value
    if (!el) return
    topLine.value = Math.max(1, Math.floor((el.scrollTop - 12) / rowHeight()) + 1)
  })
}
watch(() => props.filePath, () => { topLine.value = 1 })
// The line just under the bar decides the scope, so the bar never covers the
// line it names.
const scope = computed(() => symbolAt(props.symbols, topLine.value + 1))
// A function's node starts at its annotations and doc comment; the bar shows
// the line that names it, as GitHub's sticky lines do.
const rawLines = computed(() => fileContents.value.split('\n'))
function signatureLine(symbol: FileSymbol): number {
  for (let line = symbol.begin; line <= Math.min(symbol.end, symbol.begin + 30); line++) {
    const text = (rawLines.value[line - 1] ?? '').trim()
    if (!text || text.startsWith('@') || text.startsWith('//') || text.startsWith('/*') || text.startsWith('*') || text.startsWith('#[') || text.startsWith('[')) continue
    return line
  }
  return symbol.begin
}
const stickyScope = computed(() => (scope.value && topLine.value >= signatureLine(scope.value) ? scope.value : null))
watch(scope, s => emit("scope", s), { immediate: true })

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
/* Every line, number and code alike, is exactly one row tall. They are two
   columns, so a code line a font made a pixel taller (WebKit's italic
   comments did) pushed the code below it out of step with its numbers, 11
   lines by the end of a Broadleaf file. */
.code-line { height: 1.25rem; line-height: 1.25rem; margin: 0 -1.5rem 0 -1rem; padding: 0 1.5rem 0 1rem; }
.code-line.is-highlighted { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.gutter-line { height: 1.25rem; line-height: 1.25rem; cursor: pointer; text-decoration: none; color: inherit; }
.gutter-line:hover { color: rgb(var(--c-neutral-900)); }
.gutter-line.text-neutral-900 { color: rgb(var(--c-neutral-900)); }
.gutter-line.in-complex { box-shadow: inset -2px 0 0 rgb(var(--c-red-500)); }
.scope-bar { position: absolute; top: 0; left: 0; right: 0; z-index: 20; display: flex; align-items: center; height: calc(1.25rem + 1px); padding-right: 0.75rem; overflow: hidden; background: rgb(var(--c-surface)); border-bottom: 1px solid rgb(var(--c-neutral-200)); text-align: left; cursor: pointer; }
.scope-bar:hover .scope-code { color: rgb(var(--c-neutral-900)); }
.scope-num { flex: none; width: 3.5rem; padding: 0 0.5rem 0 0.75rem; text-align: right; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.75rem; line-height: 1.25rem; color: rgb(var(--c-neutral-400)); background: rgb(var(--c-neutral-50)); box-shadow: inset -1px 0 0 rgb(var(--c-neutral-200)); align-self: stretch; }
.scope-code { min-width: 0; flex: none; padding-left: 1rem; white-space: pre; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.75rem; line-height: 1.25rem; color: rgb(var(--c-neutral-800)); }
.cx-fn, .cx-step { display: inline-block; margin-left: 0.75rem; padding: 0 0.375rem; border-radius: 0.25rem; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.6875rem; line-height: 1rem; vertical-align: 1px; white-space: nowrap; }
.cx-fn { flex: none; color: rgb(var(--c-red-700)); background: rgb(var(--c-red-50)); }
.cx-step { color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-100)); }
.cx-step + .cx-step { margin-left: 0.25rem; }
.cx-step.is-nested { color: rgb(var(--c-amber-800)); background: rgb(var(--c-amber-50)); }
.cx-step.is-heavy { color: rgb(var(--c-red-700)); background: rgb(var(--c-red-50)); }

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
