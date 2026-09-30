<template>
  <ViewWorkspaceLayout :queryable="false" title="Ask">
    <template #stats>
      <span class="inline-flex items-center gap-1.5" :title="`Answers read the open snapshot: ${snapshotLabel}`">
        <span class="h-1.5 w-1.5 rounded-full" :class="ask.model ? 'bg-green-500' : ask.modelsError ? 'bg-red-500' : 'bg-neutral-300'"/>
        <span class="text-neutral-800">{{ snapshotLabel }}</span>
      </span>
    </template>
    <template #switches>
      <select
          class="ui-input ui-input-sm max-w-[200px]"
          :value="ask.modelName"
          :disabled="ask.running"
          title="The local model that answers (Ollama)"
          aria-label="Model"
          @change="ask.setModel(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!ask.models.length" value="">{{ ask.loadingModels ? "Finding models…" : "No models" }}</option>
        <option v-for="m in ask.models" :key="m.name" :value="m.name" :disabled="!m.tools">{{ m.name }}{{ m.remote ? " · cloud" : "" }}{{ m.tools ? "" : " · no tools" }}</option>
      </select>
      <label v-if="ask.model?.think" class="flex items-center gap-1.5 text-[12px] text-neutral-600" title="Let the model reason before each step: slower, sometimes better on broad questions">
        <input type="checkbox" class="ui-check" :checked="ask.think" :disabled="ask.running" @change="ask.setThink(($event.target as HTMLInputElement).checked)"> Think
      </label>
    </template>
    <template #actions>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="!canWriteUp || ask.writing" :title="'Write a report from this conversation: pick a template, and every section is written from its evidence'" @click="ask.openWriteUp()">
        <FileText :size="13" :stroke-width="1.75"/> {{ ask.writing ? "Writing…" : "Write up" }}
      </button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" title="New conversation" aria-label="New conversation" @click="fresh"><Plus :size="14" :stroke-width="1.75"/></button>
      <button v-if="tight" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :class="{ 'is-active': threadsOpen }" :title="threadsOpen ? 'Hide conversations' : 'Show conversations'" aria-label="Conversations" @click="threadsOpen = !threadsOpen"><PanelLeft :size="14" :stroke-width="1.75"/></button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :class="{ 'is-active': ask.inspector.open }" :title="ask.inspector.open ? 'Hide the inspector' : 'Show the inspector'" aria-label="Inspector" @click="ask.inspector.open = !ask.inspector.open">
        <PanelRight :size="14" :stroke-width="1.75"/>
      </button>
    </template>

    <template #visualizer>
      <div ref="shell" class="ask-shell relative flex min-h-0 grow">
        <div class="ask-rail w-[236px] shrink-0 bg-ground hairline-r" :class="{ 'ask-rail-open': threadsOpen }">
          <AskThreads @new="fresh"/>
        </div>

        <main class="relative flex min-w-[360px] grow flex-col" aria-label="Conversation">
          <div ref="scroller" class="min-h-0 grow overflow-y-auto" @scroll.passive="onScroll">
            <div class="mx-auto w-full max-w-[780px] pb-6" :class="tight ? 'px-4' : 'px-8'">
              <!-- A conversation about another snapshot: readable, but not continued. -->
              <div v-if="ask.stale" class="ask-banner">
                <History :size="13" :stroke-width="1.75"/>
                <span class="flex-1">This conversation is about snapshot {{ ask.current?.snapshot }}. The open snapshot is different, so a new question starts a new conversation.</span>
                <button type="button" class="ui-btn ui-btn-sm" @click="fresh">New conversation</button>
              </div>

              <!-- Nothing asked yet. -->
              <section v-if="!ask.current?.turns.length" class="ask-welcome">
                <div class="ask-mark"><Sparkles :size="18" :stroke-width="1.75"/></div>
                <h1>What do you want to know about {{ workspaceName }}?</h1>
                <p class="ask-sub">
                  Answers come from the open snapshot, through the code the views use. Every number cites its evidence; every piece of evidence opens in its view, pins, or goes into a report.
                  <span class="text-neutral-400">{{ ask.model ? `${ask.model.name}, on this machine.` : "" }}</span>
                </p>
                <p v-if="ask.modelsError" class="ask-error"><AlertCircle :size="13" :stroke-width="1.75"/> {{ ask.modelsError }} <button type="button" class="underline" @click="ask.loadModels()">Try again</button></p>
                <div class="ask-starters">
                  <button v-for="s in starters" :key="s.q" type="button" class="ask-starter" @click="send(s.q)">
                    <component :is="s.icon" :size="14" :stroke-width="1.75" class="mt-0.5 shrink-0 text-accent-600"/>
                    <span><span class="block text-[12.5px] font-medium text-neutral-900">{{ s.title }}</span><span class="block text-[12px] leading-snug text-neutral-500">{{ s.q }}</span></span>
                  </button>
                </div>
              </section>

              <AskTurn
                  v-for="(t, i) in ask.current?.turns ?? []"
                  :key="t.id"
                  :turn="t"
                  :last="i === (ask.current?.turns.length ?? 0) - 1"
                  :ids="ids"
                  :titles="titles"
                  :sources="sources"
                  :selected-id="ask.inspector.evidenceId"
                  :flash-id="flashId"
                  :lit="lit"
                  :earlier="earlierOf(i)"
                  :reveal="revealed"
                  @pick="onPick"
                  @ask="send"
                  @cite="cite"
                  @inspect="id => { ask.inspect(id); cite(id) }"
                  @trace="id => { ask.inspect(`turn:${id}`, 'trace') }"
                  @edit="edit"
              />
            </div>
          </div>

          <button v-if="awayFromEnd" type="button" class="ask-latest" @click="scrollToEnd(true)"><ArrowDown :size="12" :stroke-width="2"/> Latest</button>
          <div class="shrink-0 pb-5 pt-2" :class="tight ? 'px-4' : 'px-8'">
            <div class="mx-auto w-full max-w-[780px]">
              <Transition name="ask-toast"><p v-if="ask.notice" class="ask-toast" role="status">{{ ask.notice }}</p></Transition>
              <p v-if="queued" class="ask-queued"><Loader2 :size="11" class="animate-spin"/> Asks next, when this answer is done: “{{ queued.length > 90 ? `${queued.slice(0, 90)}…` : queued }}” <button type="button" @click="queued = null">Cancel</button></p>
              <AskComposer ref="composer" @send="send"/>
            </div>
          </div>
        </main>

        <!-- Beside the conversation when there is room; over it, as a drawer, when there is not. -->
        <!-- Beside the conversation when there is room; over it, as a drawer with a backdrop, when there is not (container queries below). -->
        <div v-if="ask.inspector.open || threadsOpen" class="ask-scrim" aria-hidden="true" @click.stop.prevent="ask.inspector.open = false; threadsOpen = false" @mousedown.stop.prevent/>
        <div v-if="ask.inspector.open" class="ask-insp bg-surface hairline-l">
          <AskInspector @cite="cite" @ask="send"/>
          <GroupActionBar v-if="picked.size" :selected-items="[...picked]" :kind="pickedKind" :show-in-except="[]" @replace="picked = new Set($event)" @clear="picked = new Set()" @created="picked = new Set()"/>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
  <AskWriteUp/>
</template>

<script setup lang="ts">
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { AlertCircle, ArrowDown, Braces, FileText, Flame, History, Network, Plus, PanelLeft, PanelRight, RefreshCw, Sparkles, Users, Compass, Loader2 } from "lucide-vue-next"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import AskThreads from "~/features/ask/components/AskThreads.vue"
import AskTurn from "~/features/ask/components/AskTurn.vue"
import AskComposer from "~/features/ask/components/AskComposer.vue"
import AskInspector from "~/features/ask/components/AskInspector.vue"
import AskWriteUp from "~/features/ask/components/AskWriteUp.vue"
import { useAskStore } from "~/features/ask/app/ask.store"
import { useAskActions } from "~/features/ask/app/useAskActions"
import { reportable } from "~/features/ask/app/toReport"
import { shortName } from "~/features/ask/tools/shared"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"

const ask = useAskStore()
const actions = useAskActions()
const data = useDataStore()
const ws = useWorkspacesStore()
const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof AskComposer> | null>(null)
const flashId = ref<string | null>(null)

// The conversation keeps at least a readable column: below 1180 px the
// inspector becomes a drawer over it; below 900 px the rail folds away.
const shell = ref<HTMLElement | null>(null)
const width = ref(1400)
const narrow = computed(() => width.value < 1180)
const tight = computed(() => width.value < 900)
const threadsOpen = ref(false)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!shell.value) return
  width.value = shell.value.getBoundingClientRect().width || width.value
  if (narrow.value) ask.inspector.open = false
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width })
  ro.observe(shell.value)
  window.addEventListener("resize", measure)
})
function measure() { if (shell.value) width.value = shell.value.getBoundingClientRect().width || width.value }
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener("resize", measure) })
// Narrowing the window closes the inspector's column; it can still open as a drawer.
watch(narrow, n => { if (n) ask.inspector.open = false })
// Picking a conversation from the rail when it is a drawer closes the drawer.
watch(() => ask.currentId, () => { if (tight.value) threadsOpen.value = false })

const workspaceName = computed(() => ws.active?.name ?? "this codebase")
const snapshotLabel = computed(() => {
  const info = data.snapshotInfo as Record<string, string>
  const scan = (ws.scans as any[]).find(s => s.id === data._openScanId)
  const commit = String(info.git_head_commit || scan?.headCommit || "").slice(0, 7)
  const rev = info.analysis_revision ?? scan?.analysisRevision
  return `${commit || "snapshot"} · rev ${rev ?? "?"}`
})

watch(() => ws.active?.id, id => { if (id) ask.load(id) }, { immediate: true })
watch(() => data._openScanId, () => void ask.loadCard(), { immediate: true })
onMounted(() => {
  if (!ask.models.length) void ask.loadModels()
  void nextTick(() => composer.value?.focus())
  window.addEventListener("keydown", onKey)
})
onBeforeUnmount(() => window.removeEventListener("keydown", onKey))

function onKey(e: KeyboardEvent) {
  if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); composer.value?.focus() }
  if (e.key === "Escape" && ask.running) ask.stop()
}

const exhibits = computed(() => ask.current?.turns.flatMap(t => t.exhibits ?? []) ?? [])
const ids = computed(() => new Set([...ask.allEvidence.map(e => e.id), ...Object.keys(ask.aliases), ...exhibits.value.flatMap(x => [x.id, ...x.facts.map(f => f.id)])]))
const titles = computed(() => {
  const m = new Map(ask.allEvidence.map(e => [e.id, e.title]))
  for (const [a, o] of Object.entries(ask.aliases)) m.set(a, m.get(o) ?? "")
  for (const x of exhibits.value) { m.set(x.id, x.title); for (const f of x.facts) m.set(f.id, f.text) }
  return m
})
/**
 * What was picked inside the chat's figures: components or files, one kind at a time. Groups are how
 * code is sliced in Archstats, so a pick is one click from a group (the app's own action bar).
 */
const picked = ref(new Set<string>())
const pickedKind = ref<"component" | "file">("component")
function onPick(_exhibit: string, element: string) {
  // An import (a matrix cell, a tangle edge) picks both of its ends.
  const edge = /^edge:(.+)>(.+)$/.exec(element)
  if (edge) {
    const next = new Set(pickedKind.value === "component" ? picked.value : [])
    next.add(edge[1]); next.add(edge[2])
    pickedKind.value = "component"; picked.value = next
    return
  }
  const m = /^(component|file):(.+)$/.exec(element)
  if (!m) return
  const kind = m[1] as "component" | "file"
  const next = new Set(kind === pickedKind.value ? picked.value : [])
  if (next.has(m[2])) next.delete(m[2]); else next.add(m[2])
  pickedKind.value = kind
  picked.value = next
}
/** The exhibits of the turns before turn i: its answer may cite and draw them. */
function earlierOf(i: number) {
  return new Map((ask.current?.turns.slice(0, i) ?? []).flatMap(t => t.exhibits ?? []).map(x => [x.id, x]))
}
/** Figures a citation asked for that were not on screen: opened under their own turn. */
const revealed = ref(new Set<string>())
/** The element a fact citation lights in its exhibit, until another is clicked. */
const lit = ref<{ exhibit: string; element: string } | null>(null)
const sources = computed(() => [ask.cardText, ...(ask.current?.turns ?? []).flatMap(t => t.steps.map(s => s.text ?? ""))].join("\n"))
const canWriteUp = computed(() => !ask.running && !!ask.current?.turns.some(t => t.status === "done" && (t.evidence.some(reportable) || !!t.exhibits?.length)))
void actions

const largest = computed(() => {
  const c = [...(data.allRawComponents as any[])].filter(x => x.name !== ".").sort((a, b) => (Number(b.complexity__lines) || 0) - (Number(a.complexity__lines) || 0))[0]
  return c ? shortName(String(c.name)) : ""
})
const starters = computed(() => {
  const s = [
    { icon: Compass, title: "Get my bearings", q: "What is this codebase made of, and where is its mass?" },
    { icon: RefreshCw, title: "Tangles", q: "Where are the tangles, and what would untangle the largest one?" },
    { icon: Flame, title: "Risk", q: "Which files are risky to change: complex and changed often?" },
    { icon: Network, title: "Blast radius", q: largest.value ? `What depends on ${largest.value}, all the way up?` : "Which components does everything depend on?" },
    { icon: Users, title: "Knowledge", q: largest.value ? `Who knows ${largest.value}, and is that knowledge thin?` : "Who are the most active authors?" },
    { icon: Braces, title: "Inside", q: largest.value ? `What are the biggest files in ${largest.value}, and what do they do?` : "Which files are the largest?" },
  ]
  const c = ask.pendingContext
  if (c) s.unshift({ icon: Sparkles, title: `About ${c.label}`, q: c.subject ? `Explain ${shortName(c.subject.name)}: what depends on it, and what is fragile?` : `Explain what ${c.label} is showing me.` })
  return s.slice(0, 6)
})

/** A question asked while an answer is still being written: asked as soon as that answer is done. */
const queued = ref<string | null>(null)
function send(q: string) {
  if (ask.running) { queued.value = q; return }
  void ask.send(q)
  void nextTick(() => scrollToEnd(true))
}
watch(() => ask.running, on => {
  if (on || !queued.value) return
  const q = queued.value
  queued.value = null
  send(q)
})
/** The last question back in the composer, its answer taken back. */
function edit(turnId: string) {
  const back = ask.takeBack(turnId)
  if (!back) return
  ask.pendingContext = back.context
  composer.value?.fill(back.question)
}

function fresh() {
  if (ask.running) return
  const t = ask.current
  if (!t || t.turns.length) ask.newThread()
  void nextTick(() => composer.value?.focus())
}

function cite(cited: string) {
  const id = ask.aliases[cited] ?? cited
  // A fact of an exhibit: scroll to the figure and light what the fact is about.
  const base = id.split(".")[0]
  const x = exhibits.value.find(e => e.id === base)
  if (x) {
    ask.inspector.evidenceId = id
    if (ask.inspector.tab !== "evidence") ask.inspector.tab = "evidence"
    const element = x.facts.find(f => f.id === id)?.element
    lit.value = element ? { exhibit: base, element } : null
    const show = () => {
      // The newest drawing of it: an answer that cites an earlier figure draws it again.
      const all = scroller.value?.querySelectorAll(`[data-exhibit="${base}"]`)
      const fig = all?.length ? all[all.length - 1] : null
      if (!fig) return false
      fig.scrollIntoView({ behavior: "smooth", block: "nearest" }); fig.classList.add("ex-flash"); setTimeout(() => fig.classList.remove("ex-flash"), 1100)
      return true
    }
    // Not drawn anywhere yet (past the three an answer draws): open it under its turn, then go to it.
    if (!show()) { revealed.value = new Set([...revealed.value, base]); void nextTick(() => setTimeout(show, 120)) }
    return
  }
  ask.inspect(id)
  const el = scroller.value?.querySelector(`[data-evidence="${id}"]`)
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
    flashId.value = id
    setTimeout(() => { if (flashId.value === id) flashId.value = null }, 1100)
  }
}

const awayFromEnd = ref(false)
function onScroll() {
  const el = scroller.value
  if (el) awayFromEnd.value = el.scrollHeight - el.scrollTop - el.clientHeight > 480
}

// Follow the answer while it arrives, unless the reader scrolled up to read.
function scrollToEnd(force = false) {
  const el = scroller.value
  if (!el) return
  if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 220) el.scrollTo({ top: el.scrollHeight, behavior: force ? "smooth" : "auto" })
}
watch(() => {
  const t = ask.current?.turns.at(-1)
  return [ask.current?.id, ask.current?.turns.length, t?.answer.length, t?.steps.length, t?.evidence.length, t?.status]
}, () => void nextTick(() => scrollToEnd()))
watch(() => ask.currentId, () => void nextTick(() => scrollToEnd(true)))
</script>

<style scoped>
.ask-welcome { padding: 9vh 0 24px; }
.ask-latest { position: absolute; left: 50%; bottom: 150px; z-index: 5; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; padding: 4px 11px; border-radius: 999px; color: rgb(var(--c-neutral-800)); background: rgb(var(--c-surface)); border: 1px solid rgb(var(--c-neutral-200)); box-shadow: 0 4px 16px rgb(0 0 0 / 0.1); }
.ask-latest:hover { border-color: rgb(var(--c-accent-400)); }
.ask-shell { container-type: inline-size; container-name: askshell; }
.ask-insp { position: relative; width: 380px; flex-shrink: 0; }
.ask-scrim { display: none; }
.ask-insp, .ask-rail { z-index: 31; }
@container askshell (max-width: 1180px) {
  .ask-insp { position: absolute; top: 0; right: 0; bottom: 0; z-index: 31; width: min(380px, 92%); box-shadow: -12px 0 32px -12px rgb(0 0 0 / 0.22); }
  .ask-scrim { display: block; position: absolute; inset: 0; z-index: 30; background: rgb(0 0 0 / 0.18); cursor: default; }
}
@container askshell (max-width: 900px) {
  .ask-rail:not(.ask-rail-open) { display: none; }
  .ask-rail.ask-rail-open { position: absolute; top: 0; left: 0; bottom: 0; z-index: 32; box-shadow: 12px 0 32px -12px rgb(0 0 0 / 0.22); }
}
.ask-mark { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: rgb(var(--c-accent-600)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); margin-bottom: 16px; }
.ask-welcome h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: rgb(var(--c-neutral-900)); }
.ask-sub { margin-top: 6px; max-width: 620px; font-size: 13px; line-height: 1.6; color: rgb(var(--c-neutral-600)); }
.ask-starters { margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.ask-starter { display: flex; gap: 10px; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid rgb(var(--c-neutral-200)); background: rgb(var(--c-surface)); transition: border-color 0.15s, background 0.15s; }
.ask-starter:hover { border-color: rgb(var(--c-accent-400)); background: rgb(var(--c-accent-50) / 0.5); }
.ask-banner { margin-top: 16px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-100)); border-radius: 8px; padding: 8px 10px; }
.ask-error { margin-top: 12px; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: rgb(var(--c-red-800, 153 27 27)); }
.ask-toast { margin-bottom: 8px; font-size: 12px; color: rgb(var(--c-accent-800)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); border-radius: 8px; padding: 6px 10px; }
.ask-toast-enter-active, .ask-toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.ask-toast-enter-from, .ask-toast-leave-to { opacity: 0; transform: translateY(4px); }
.ask-queued { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11.5px; color: rgb(var(--c-neutral-600)); }
.ask-queued button { margin-left: auto; color: rgb(var(--c-neutral-500)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ask-queued button:hover { color: rgb(var(--c-neutral-900)); }
</style>
