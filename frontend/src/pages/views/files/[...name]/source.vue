<template>
  <div class="flex h-full min-h-0 overflow-hidden">
    <div class="min-w-0 grow overflow-hidden">
      <FileCodeViewer v-model:symbols-open="symbolsOpen" :file-path="filePath" :annotations="annotations" :symbols="symbols" @scope="scope = $event"/>
    </div>
    <SymbolsPane v-if="symbolsOpen && symbols && symbols.length" :symbols="symbols" :active="scope" @jump="jump"/>
  </div>
</template>

<script setup lang="ts">
// The file's source with its Symbols panel, as GitHub shows a file.
import { ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import FileCodeViewer from "~/features/files/components/FileCodeViewer.vue"
import SymbolsPane from "~/features/files/components/SymbolsPane.vue"
import { useComplexityAnnotations, useFileSymbols, type FileSymbol } from "~/features/files/complexityAnnotations"
import { useFileRoute } from "~/features/files/useFileRoute"

const route = useRoute()
const router = useRouter()
const { filePath } = useFileRoute()
const annotations = useComplexityAnnotations(filePath)
const symbols = useFileSymbols(filePath)
const scope = ref<FileSymbol | null>(null)

const SYMBOLS_KEY = "archstats.symbolsOpen"
const symbolsOpen = ref(true)
try { symbolsOpen.value = localStorage.getItem(SYMBOLS_KEY) !== "0" } catch { /* open by default */ }
watch(symbolsOpen, open => { try { localStorage.setItem(SYMBOLS_KEY, open ? "1" : "0") } catch { /* a preference */ } })

function jump(symbol: FileSymbol) {
  router.replace({ path: route.path, query: route.query, hash: `#L${symbol.begin}-L${symbol.end}` })
}
</script>
