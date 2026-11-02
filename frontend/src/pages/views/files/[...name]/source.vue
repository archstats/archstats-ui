<template>
  <div class="flex h-full min-h-0 overflow-hidden">
    <div class="min-w-0 grow basis-0 overflow-hidden">
      <FileCodeViewer v-model:symbols-open="symbolsOpen" :file-path="filePath" :annotations="annotations" :symbols="symbols" @scope="scope = $event"/>
    </div>
    <div v-if="beside" class="min-w-0 grow basis-0 overflow-hidden hairline-l">
      <FileCodeViewer
        :key="beside.file"
        :file-path="beside.file"
        :annotations="besideAnnotations"
        :symbols="besideSymbols"
        :beside="true"
        :beside-line="beside.line"
        :beside-end="beside.end"
      >
        <template #actions>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :title="t('pages.filesSource.openHere')" :aria-label="t('pages.filesSource.openHere')" @click="openHere">
            <Icon icon="arrow-left-to-line" :size="13" class="text-neutral-500"/>
          </button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0 px-1.5" :title="t('pages.filesSource.closeBeside')" :aria-label="t('pages.filesSource.closeBeside')" @click="closeBeside">
            <Icon icon="x" :size="13" class="text-neutral-500"/>
          </button>
        </template>
      </FileCodeViewer>
    </div>
    <CodeInsightPane v-if="inquiry" :inquiry="inquiry" :home="home" @close="closeInquiry" @open="openFromPane"/>
    <SymbolsPane v-else-if="symbolsOpen && symbols && symbols.length" :symbols="symbols" :active="scope" @jump="jump"/>
  </div>
</template>

<script setup lang="ts">
// The file's source with its Symbols panel, as GitHub shows a file. A
// symbol's usages, hierarchy or calls take the panel's place while they are
// asked (`?look=`), and a second file can be read beside the first
// (`?beside=<file>:<line>:<end>`).
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import FileCodeViewer from "~/features/files/components/FileCodeViewer.vue"
import SymbolsPane from "~/features/files/components/SymbolsPane.vue"
import CodeInsightPane from "~/features/files/components/CodeInsightPane.vue"
import Icon from "~/shared/ui/Icon.vue"
import { useComplexityAnnotations, useFileSymbols, type FileSymbol } from "~/features/files/complexityAnnotations"
import { decodeInquiry } from "~/features/files/codeInquiry"
import { useFileRoute } from "~/features/files/useFileRoute"
import { useDataStore } from "~/features/snapshot/data.store"
import { filePath as fileRoute } from "~/features/navigation/routes"
import { t } from "~/shared/i18n"

const route = useRoute()
const router = useRouter()
const store = useDataStore()
const { filePath } = useFileRoute()
const annotations = useComplexityAnnotations(filePath)
const symbols = useFileSymbols(filePath)
const scope = ref<FileSymbol | null>(null)
const home = computed(() => store.fileComponentIndex.get(filePath.value) ?? null)

const SYMBOLS_KEY = "archstats.symbolsOpen"
const symbolsOpen = ref(true)
try { symbolsOpen.value = localStorage.getItem(SYMBOLS_KEY) !== "0" } catch { /* open by default */ }
watch(symbolsOpen, open => { try { localStorage.setItem(SYMBOLS_KEY, open ? "1" : "0") } catch { /* a preference */ } })

function jump(symbol: FileSymbol) {
  router.replace({ path: route.path, query: route.query, hash: `#L${symbol.begin}-L${symbol.end}` })
}

// ── The question asked of a symbol ──────────────────────────────
const inquiry = computed(() => decodeInquiry(route.query.look))
function withoutQuery(key: string) {
  const query = { ...route.query }
  delete query[key]
  return query
}
function closeInquiry() {
  router.replace({ path: route.path, query: withoutQuery("look"), hash: route.hash })
}
function openFromPane(file: string | null, line: number | null) {
  if (!file) return
  const hash = line ? `#L${line}` : ""
  if (file === filePath.value) router.replace({ path: route.path, query: route.query, hash })
  else router.push({ path: fileRoute(file, "source"), query: route.query, hash })
}

// ── A second file beside the first ──────────────────────────────
const beside = computed(() => {
  const raw = route.query.beside
  if (typeof raw !== "string" || !raw) return null
  const m = raw.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/)
  if (!m || !m[1]) return null
  const line = Number(m[2] ?? 0)
  return { file: m[1], line, end: Number(m[3] ?? line) }
})
const besidePath = computed(() => beside.value?.file ?? "")
const besideAnnotations = useComplexityAnnotations(besidePath)
const besideSymbols = useFileSymbols(besidePath)
function closeBeside() {
  router.replace({ path: route.path, query: withoutQuery("beside"), hash: route.hash })
}
function openHere() {
  const b = beside.value
  if (!b) return
  router.push({ path: fileRoute(b.file, "source"), query: withoutQuery("beside"), hash: b.line ? (b.end > b.line ? `#L${b.line}-L${b.end}` : `#L${b.line}`) : "" })
}
</script>
