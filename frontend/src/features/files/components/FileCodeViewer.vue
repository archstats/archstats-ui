<template>
  <div class="flex min-h-0 flex-col overflow-hidden bg-surface" :class="fill ? 'h-full' : 'rounded-lg hairline'">
    <!-- One header: where the file is, what it is, what to do with it. -->
    <div class="flex h-10 shrink-0 items-center gap-2 px-3 hairline-b">
      <span v-if="!beside && (canBack || canForward)" class="-ml-1 flex shrink-0 items-center">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet px-1" :disabled="!canBack" :aria-label="t('files.fileCodeViewer.back')" :title="t('files.fileCodeViewer.backTitle')" @click="router.back()">
          <Icon icon="arrow-left" :size="13" class="text-neutral-500"/>
        </button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet px-1" :disabled="!canForward" :aria-label="t('files.fileCodeViewer.forward')" :title="t('files.fileCodeViewer.forwardTitle')" @click="router.forward()">
          <Icon icon="arrow-right" :size="13" class="text-neutral-500"/>
        </button>
      </span>
      <span class="flex min-w-[6rem] shrink items-baseline overflow-hidden font-mono text-sm" :title="filePath">
        <span v-if="crumbDir" class="min-w-0 truncate text-neutral-500">{{ crumbDir }}/</span>
        <span class="min-w-0 truncate font-semibold text-neutral-900">{{ fileBasename }}</span>
      </span>
      <span v-if="detectedLanguageLabel && !fileBasename.includes('.')" class="ui-tag shrink-0">{{ detectedLanguageLabel }}</span>
      <slot name="tags"/>
      <span v-if="!beside" class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="meta"><span class="ui-toolbar-meta">{{ t('files.fileCodeViewer.lines', { codeLinesLength: formatNumber(codeLines.length) }) }}</span></slot>
      </span>
      <span v-if="!beside" class="h-4 w-px shrink-0 bg-neutral-200"></span>
      <span v-else class="ml-auto"></span>
      <button v-if="annotations && !beside" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :class="{ 'bg-neutral-100': showComplexity }" :aria-pressed="showComplexity" :aria-label="t('files.fileCodeViewer.complexity')" :title="t('files.fileCodeViewer.complexityTitle')" @click="showComplexity = !showComplexity">
        <Icon icon="braces" :size="13" :class="showComplexity ? 'text-neutral-900' : 'text-neutral-500'"/>
      </button>
      <button v-if="intel" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :class="{ 'bg-neutral-100': showArch }" :aria-pressed="showArch" :aria-label="t('files.fileCodeViewer.architecture')" :title="t('files.fileCodeViewer.architectureTitle')" @click="showArch = !showArch">
        <Icon icon="layers" :size="13" :class="showArch ? 'text-neutral-900' : 'text-neutral-500'"/>
      </button>
      <button v-if="symbols && symbols.length && !beside" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :class="{ 'bg-neutral-100': symbolsOpen }" :aria-pressed="symbolsOpen" :aria-label="t('files.fileCodeViewer.symbols')" :title="t('files.fileCodeViewer.symbolsTitle')" @click="emit('update:symbolsOpen', !symbolsOpen)">
        <Icon icon="layout-list" :size="13" :class="symbolsOpen ? 'text-neutral-900' : 'text-neutral-500'"/>
      </button>
      <OpenInEditor :file="filePath" :line="highlightStart > 0 ? highlightStart : undefined"/>
      <button v-if="!beside" type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :disabled="!fileContents" :title="copied ? t('files.fileCodeViewer.copied') : t('files.fileCodeViewer.copy')" :aria-label="t('files.fileCodeViewer.copy')" @click="copyToClipboard">
        <Icon :icon="copied ? 'check' : 'copy'" :size="13" class="text-neutral-500"/>
      </button>
      <slot name="actions"/>
    </div>

    <div v-if="intel && showArch && fileContents" class="legend hairline-b">
      <span class="legend-item" :title="t('files.fileCodeViewer.legendComponentTitle')"><span class="legend-swatch is-component"></span>{{ t('files.fileCodeViewer.legendComponent', { count: crossings.component }) }}</span>
      <span class="legend-item" :title="t('files.fileCodeViewer.legendModuleTitle')"><span class="legend-swatch is-module"></span>{{ t('files.fileCodeViewer.legendModule', { count: crossings.module }) }}</span>
      <span v-if="forbidden" class="legend-item" :title="t('files.fileCodeViewer.legendForbiddenTitle')"><span class="legend-swatch is-forbidden"></span>{{ t('files.fileCodeViewer.legendForbidden', { count: crossings.forbidden }) }}</span>
      <span class="ml-auto flex items-center gap-2.5">
        <span v-for="k in markKinds" :key="k.kind" class="legend-item" :title="k.title"><Icon :icon="MARK_ICON[k.kind]" :size="11" :class="`mark-${k.kind}`"/>{{ formatNumber(k.count) }}</span>
      </span>
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
        <div class="sticky left-0 z-10 flex min-w-[3.5rem] shrink-0 select-none flex-col bg-ground py-3 font-mono text-xs leading-5 text-neutral-400 hairline-r" :class="showMarks ? 'pl-1' : 'pl-3'">
          <div v-for="(line, i) in codeLines" :key="'num-' + line.number" class="gutter-row">
            <template v-if="showMarks">
              <button v-if="leads[i]" type="button" class="mark-btn" :class="`mark-${leads[i]!.kind}`" :aria-label="markTitle(leads[i]!)" @pointerenter="hoverMarks(line.number, $event)" @pointerleave="scheduleHide" @click="clickMark(line.number, $event)">
                <Icon :icon="MARK_ICON[leads[i]!.kind]" :size="11"/>
              </button>
              <span v-else class="mark-btn"></span>
            </template>
            <a
              :href="`#L${line.number}`"
              class="gutter-line block grow text-right"
              :class="[line.isHighlighted ? 'text-neutral-900' : '', showComplexity && notes[i].fn ? 'in-complex' : '']"
              :title="showComplexity && notes[i].fn ? t('files.fileCodeViewer.inComplexFunction', { name: notes[i].fn!.name, cognitive: notes[i].fn!.cognitive }) : t('files.fileCodeViewer.selectLine')"
              @click.prevent="selectLine(line.number, $event)"
            >{{ line.number }}</a>
          </div>
        </div>
        <pre class="m-0 min-w-0 grow py-3 pl-4 pr-6 font-mono text-xs leading-5 text-neutral-800"><code class="code-body block whitespace-pre text-left" :class="{ 'arch-on': showArch }" @pointerover="onPointerOver" @pointerout="onPointerOut" @click="onCodeClick"><div v-for="(line, i) in codeLines" :key="'code-' + line.number" class="code-line" :class="{ 'is-highlighted': line.isHighlighted }" :data-line="line.number"><span v-html="line.html || ' '"></span><template v-if="showArch && lensOf(line.number)"><button v-if="lensOf(line.number)!.usages > 0" type="button" class="lens-chip" :title="t('files.fileCodeViewer.usagesTitle')" @click.stop="inquire({ kind: 'usages', unit: lensOf(line.number)!.target.unit, fn: lensOf(line.number)!.target.kind === 'function' ? lensOf(line.number)!.target.fn : null, entry: null })">{{ lensOf(line.number)!.target.kind === 'function' ? t('files.fileCodeViewer.callSites', { count: lensOf(line.number)!.usages }) : t('files.fileCodeViewer.usedBy', { count: lensOf(line.number)!.usages }) }}</button><button v-if="lensOf(line.number)!.implementations > 0" type="button" class="lens-chip" :title="t('files.fileCodeViewer.implementationsTitle')" @click.stop="inquire({ kind: 'types', unit: lensOf(line.number)!.target.unit, fn: null, entry: null })">{{ t('files.fileCodeViewer.implementations', { count: lensOf(line.number)!.implementations }) }}</button></template><template v-if="showComplexity && notes[i].steps.length"><span v-for="(step, j) in notes[i].steps" :key="j" class="cx-step" :class="step.points >= 3 ? 'is-heavy' : step.points === 2 ? 'is-nested' : ''" :title="step.nesting > 0 ? t('files.fileCodeViewer.stepNested', { points: step.points, construct: step.construct, nesting: step.nesting }) : t('files.fileCodeViewer.step', { points: step.points, construct: step.construct })">+{{ step.points }} {{ step.construct }}</span></template></div></code></pre>
      </div>
    </div>
    <SymbolCard
      :rect="card.rect"
      :target="card.target"
      :declaration="card.declaration"
      :marks="card.marks"
      :boundary="card.boundary"
      :forbidden-by="card.forbiddenBy"
      :here="filePath"
      @go="go"
      @inquire="inquire"
      @enter="cardHover = true; cancelHide()"
      @leave="cardHover = false; scheduleHide()"
    />
  </div>
</template>

<script setup lang="ts">
// A file's source, read the way GitHub reads one: a breadcrumb header, line
// numbers that select a line or (with shift) a range, the signature of the
// function being read pinned at the top once it scrolls away, and, when the
// snapshot has them, the steps that make each complex function complex.
// Names in the code are links where the snapshot resolved them: a type to
// its unit, a call to the function it reaches, a declaration to its usages.
// With Architecture on, a reference that leaves the file's component is
// tinted by how far it goes, declarations carry their usage counts, and the
// gutter marks routes, outbound calls, data access and configuration.
import OpenInEditor from "./OpenInEditor.vue"
import SymbolCard from "./SymbolCard.vue"
import { splitHighlighted } from "~/features/files/highlightLines"
import { boundaryOf, linkLine, type Boundary, type Declaration, type LineMark, type MarkKind, type SymbolTarget } from "~/features/files/codeIntel"
import { useCodeIntel, useForbiddenCrossing } from "~/features/files/useCodeIntel"
import { MARK_ICON, MARK_ORDER, leadMark, markTitle } from "~/features/files/codeMarks"
import { encodeInquiry, type Inquiry } from "~/features/files/codeInquiry"
import { filePath as fileRoute } from "~/features/navigation/routes"
import { copyText } from '~/platform/files'
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick, type PropType } from "vue"
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
  // Shown beside another file: the selection is these props, not the URL's
  // hash, and following a link replaces what is beside.
  beside: {
    type: Boolean,
    default: false,
  },
  besideLine: {
    type: Number,
    default: 0,
  },
  besideEnd: {
    type: Number,
    default: 0,
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
  if (props.beside) return props.besideLine
  const hash = route.hash || ''
  // Matches #L23 or #L23-L25 or #L23-25
  const match = hash.match(/^#L(\d+)/)
  return match ? parseInt(match[1]) : 0
})

const highlightEnd = computed(() => {
  if (props.beside) return Math.max(props.besideLine, props.besideEnd)
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
  return splitHighlighted(highlightedHtml)
})

// ── Code intelligence: what each name points at ─────────────────
const intel = useCodeIntel(computed(() => props.filePath), fileContents)
const forbidden = useForbiddenCrossing(computed(() => props.filePath))
const linkedLines = computed(() => {
  const html = htmlLines.value
  const i = intel.value
  if (!i) return html
  return html.map((h, idx) => linkLine(h, idx + 1, i, forbidden.value))
})

const ARCH_KEY = "archstats.codeArchitecture"
const showArch = ref(true)
try { showArch.value = localStorage.getItem(ARCH_KEY) !== "0" } catch { /* on by default */ }
watch(showArch, on => { try { localStorage.setItem(ARCH_KEY, on ? "1" : "0") } catch { /* a preference */ } })

const showMarks = computed(() => showArch.value && !!intel.value?.marks.size)
const leads = computed(() => {
  const marks = intel.value?.marks
  return Array.from({ length: codeLines.value.length }, (_, i) => leadMark(marks?.get(i + 1)))
})
const lensOf = (line: number): Declaration | null => intel.value?.declarations.get(line) ?? null

// How many distinct places this file reaches, by how far.
const crossings = computed(() => {
  const out: Record<Boundary, number> = { same: 0, component: 0, module: 0, forbidden: 0 }
  const i = intel.value
  if (!i) return out
  const seen = new Set<string>()
  const count = (t: SymbolTarget) => {
    const k = t.kind === "function" ? `unit:${t.unit}` : t.key
    if (seen.has(k)) return
    seen.add(k)
    out[boundaryOf(i, t, forbidden.value)]++
  }
  for (const t of i.types.values()) count(t)
  for (const at of i.sites.values()) for (const t of at.values()) count(t)
  return out
})
const markKinds = computed(() => {
  const by = new Map<MarkKind, number>()
  for (const list of intel.value?.marks.values() ?? []) for (const m of list) by.set(m.kind, (by.get(m.kind) ?? 0) + 1)
  const titles: Record<MarkKind, string> = {
    entry: t("files.fileCodeViewer.marksEntry"), outbound: t("files.fileCodeViewer.marksOutbound"), data: t("files.fileCodeViewer.marksData"),
    config: t("files.fileCodeViewer.marksConfig"), binding: t("files.fileCodeViewer.marksBinding"), flag: t("files.fileCodeViewer.marksFlag"),
    unresolved: t("files.fileCodeViewer.marksUnresolved"),
  }
  return MARK_ORDER.filter(k => by.has(k)).map(kind => ({ kind, count: by.get(kind)!, title: titles[kind] }))
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
    html: linkedLines.value[idx] ?? html[idx] ?? '',
    isHighlighted: hStart > 0 && (idx + 1) >= hStart && (idx + 1) <= hEnd
  }))
})

// ── Selecting lines: click a number, shift-click to extend ──────
let scrollOnHash = true
function selectLine(line: number, event: MouseEvent) {
  const from = event.shiftKey && highlightStart.value > 0 ? highlightStart.value : line
  const [a, b] = from <= line ? [from, line] : [line, from]
  if (props.beside) {
    showBeside(props.filePath, a, b, false)
    return
  }
  scrollOnHash = false
  router.replace({ path: route.path, query: route.query, hash: a === b ? `#L${a}` : `#L${a}-L${b}` })
}
function jumpTo(symbol: FileSymbol) {
  if (props.beside) {
    showBeside(props.filePath, symbol.begin, symbol.end, true)
    return
  }
  router.replace({ path: route.path, query: route.query, hash: `#L${symbol.begin}-L${symbol.end}` })
}

// ── Going places: definitions, beside, inquiries ────────────────
// A definition opens in the source tab as a new history entry, so Back
// returns to the call. Beside replaces what is beside and keeps the hash.
const onSourcePage = computed(() => route.path === fileRoute(props.filePath, "source"))
function showBeside(file: string, line: number, end: number, scroll: boolean) {
  if (!scroll) skipBesideScroll = true
  router.replace({ path: route.path, query: { ...route.query, beside: `${file}:${line}:${end || line}` }, hash: route.hash })
}
function go(target: SymbolTarget, beside: boolean) {
  hideCard()
  if (!target.file) return
  const line = target.line ?? 1
  const end = target.end && target.end > line ? target.end : line
  if (beside || props.beside) {
    showBeside(target.file, line, end, true)
    return
  }
  const query: Record<string, any> = {}
  if (route.query.beside) query.beside = route.query.beside
  if (route.query.look) query.look = route.query.look
  router.push({ path: fileRoute(target.file, "source"), query, hash: end > line ? `#L${line}-L${end}` : `#L${line}` })
}
function inquire(inquiry: Inquiry) {
  hideCard()
  const look = encodeInquiry(inquiry)
  if (onSourcePage.value || props.beside) {
    router.replace({ path: route.path, query: { ...route.query, look }, hash: route.hash })
  } else {
    router.push({ path: fileRoute(props.filePath, "source"), query: { look }, hash: route.hash })
  }
}

// Back and forward through the places followed, from the router's own history.
const canBack = ref(false)
const canForward = ref(false)
function readHistory() {
  const state = typeof window !== "undefined" ? (window.history.state as { back?: string | null; forward?: string | null } | null) : null
  canBack.value = !!state?.back
  canForward.value = !!state?.forward
}
watch(() => route.fullPath, () => nextTick(readHistory), { immediate: true })

// ── The card under the pointer ──────────────────────────────────
const card = reactive<{ rect: { left: number; top: number; bottom: number } | null; target: SymbolTarget | null; declaration: Declaration | null; marks: LineMark[] | null; boundary: Boundary; forbiddenBy: string | null }>({
  rect: null, target: null, declaration: null, marks: null, boundary: "same", forbiddenBy: null,
})
const cardHover = ref(false)
let showTimer = 0
let hideTimer = 0
function cancelHide() { clearTimeout(hideTimer) }
function hideCard() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  cardHover.value = false
  card.rect = null
  card.target = null
  card.marks = null
}
function scheduleHide() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => { if (!cardHover.value) hideCard() }, 220)
}
function rectOf(el: Element) {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, bottom: r.bottom }
}
function refAt(el: EventTarget | null): { el: HTMLElement; target: SymbolTarget; line: number; declaration: boolean } | null {
  const span = (el as HTMLElement | null)?.closest?.<HTMLElement>(".ref")
  const key = span?.dataset.ref
  const target = key ? intel.value?.targets.get(key) : undefined
  const line = Number(span?.closest<HTMLElement>(".code-line")?.dataset.line)
  return span && target && line ? { el: span, target, line, declaration: span.dataset.decl === "1" } : null
}
function onPointerOver(e: PointerEvent) {
  const hit = refAt(e.target)
  if (!hit) return
  cancelHide()
  clearTimeout(showTimer)
  showTimer = window.setTimeout(() => {
    const i = intel.value
    if (!i) return
    const lensName = forbidden.value && hit.target.file ? forbidden.value(hit.target.file) : null
    card.rect = rectOf(hit.el)
    card.target = hit.target
    card.declaration = hit.declaration ? i.declarations.get(hit.line) ?? null : null
    card.marks = null
    card.boundary = boundaryOf(i, hit.target, forbidden.value)
    card.forbiddenBy = lensName
  }, card.rect ? 60 : 350)
}
function onPointerOut(e: PointerEvent) {
  if (refAt(e.target) && !refAt(e.relatedTarget)) scheduleHide()
}
function hoverMarks(line: number, e: PointerEvent) {
  cancelHide()
  clearTimeout(showTimer)
  const el = e.currentTarget as HTMLElement
  showTimer = window.setTimeout(() => {
    card.rect = rectOf(el)
    card.target = null
    card.declaration = null
    card.marks = intel.value?.marks.get(line) ?? null
    card.boundary = "same"
  }, 120)
}
function clickMark(line: number, e: MouseEvent) {
  const entry = intel.value?.marks.get(line)?.find(m => m.kind === "entry" && m.data.id !== null && m.data.id !== undefined)
  if (entry) inquire({ kind: "reach", unit: "", fn: null, entry: Number(entry.data.id) })
  else hoverMarks(line, e as PointerEvent)
}
function onCodeClick(e: MouseEvent) {
  const hit = refAt(e.target)
  if (!hit) return
  // A reader selecting text is not following a link.
  if (window.getSelection()?.toString()) return
  e.preventDefault()
  if (hit.declaration) inquire({ kind: "usages", unit: hit.target.unit, fn: hit.target.kind === "function" ? hit.target.fn : null, entry: null })
  else go(hit.target, e.metaKey || e.ctrlKey)
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && card.rect) hideCard()
}
onMounted(() => window.addEventListener("keydown", onKey))
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey)
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})
watch(() => props.filePath, hideCard)

// ── Scroll to highlighted line ──────────────────────────────────
function rowHeight(): number {
  return scrollContainerRef.value?.querySelector<HTMLElement>('.code-line')?.offsetHeight || 20
}
function scrollToHighlighted() {
  nextTick(() => {
    // Found by line number, not by a template ref: refs collected under a
    // conditional name kept the previous line's element, so a second jump in
    // the same file highlighted the new line and stayed on the old one.
    const el = scrollContainerRef.value
    const line = el?.querySelector<HTMLElement>("code.code-body")?.children[highlightStart.value - 1] as HTMLElement | undefined
    if (!el || !line) return
    // The first line of the range lands near the top, as GitHub puts it.
    el.scrollTop = Math.max(0, line.offsetTop - rowHeight() * 3)
  })
}
onMounted(() => {
  if (highlightStart.value > 0) {
    scrollToHighlighted()
  }
})

watch(() => route.hash, () => {
  if (props.beside) return
  if (highlightStart.value > 0 && scrollOnHash) {
    scrollToHighlighted()
  }
  scrollOnHash = true
})
let skipBesideScroll = false
watch(() => [props.besideLine, props.filePath], () => {
  if (props.beside && highlightStart.value > 0 && !skipBesideScroll) scrollToHighlighted()
  skipBesideScroll = false
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
  if (card.rect && !cardHover.value) hideCard()
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
/* The padding sits on the number, not the column, so the complexity bar
   runs along the divider instead of over the last digit. */
.gutter-row { display: flex; align-items: center; height: 1.25rem; }
.mark-btn { display: grid; place-items: center; width: 1rem; height: 1rem; margin-right: 0.125rem; flex: none; border-radius: 0.1875rem; }
button.mark-btn:hover { background: rgb(var(--c-neutral-200)); }
.mark-entry { color: rgb(var(--c-violet-700)); }
.mark-outbound { color: rgb(var(--c-blue-700)); }
.mark-data { color: rgb(var(--c-green-700)); }
.mark-config, .mark-binding, .mark-unresolved { color: rgb(var(--c-neutral-500)); }
.mark-flag { color: rgb(var(--c-red-700)); }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.875rem; min-height: 1.75rem; padding: 0.25rem 0.75rem; font-size: 0.6875rem; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-ground)); }
.legend-item { display: inline-flex; align-items: center; gap: 0.3125rem; white-space: nowrap; }
.legend-swatch { width: 0.875rem; height: 0; border-bottom: 2px dotted; }
.legend-swatch.is-component { border-color: rgb(var(--c-blue-500)); }
.legend-swatch.is-module { border-color: rgb(var(--c-amber-600)); }
.legend-swatch.is-forbidden { border-bottom-style: solid; border-color: rgb(var(--c-red-600)); }
.lens-chip { display: inline-block; margin-left: 0.75rem; padding: 0 0.375rem; border-radius: 0.25rem; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.6875rem; line-height: 1rem; vertical-align: 1px; white-space: nowrap; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-100)); }
.lens-chip:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-200)); }
.lens-chip + .lens-chip { margin-left: 0.25rem; }

/* Names the snapshot resolved. A link reads as code until the pointer is on
   it; with Architecture on, one that leaves the component is underlined by
   how far it goes. */
.code-body :deep(.ref) { cursor: pointer; border-radius: 2px; }
.code-body :deep(.ref:hover) { text-decoration: underline; text-underline-offset: 2px; background: rgb(var(--c-neutral-100)); }
.code-body.arch-on :deep(.ref-component) { text-decoration: underline dotted rgb(var(--c-blue-500)); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
.code-body.arch-on :deep(.ref-module) { text-decoration: underline dotted rgb(var(--c-amber-600)); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
.code-body.arch-on :deep(.ref-forbidden) { text-decoration: underline wavy rgb(var(--c-red-600)); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.code-body :deep(.ref-decl:hover) { background: rgb(var(--c-accent-50)); }
.gutter-line { height: 1.25rem; line-height: 1.25rem; padding-right: 0.5rem; cursor: pointer; text-decoration: none; color: inherit; }
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
