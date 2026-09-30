<template>
  <article class="ask-turn">
    <!-- The question, and the view it was asked from. -->
    <div class="flex flex-col items-start gap-1">
      <p class="ask-q">{{ turn.question }}</p>
      <span v-if="turn.context" class="ask-ctx" :title="`Asked from ${turn.context.route}`"><PanelTop :size="11" :stroke-width="1.75"/> from {{ turn.context.label }}<template v-if="turn.context.subject"> · {{ short(turn.context.subject.name) }}</template></span>
    </div>

    <div class="mt-4">
      <!-- The plan, for questions that judge the whole codebase: shown while it is tested, then folded
           into one line, so hypotheses never read as the answer. -->
      <button v-if="turn.plan.length && !running" type="button" class="ask-steps-head mb-1 text-[12px]" :aria-expanded="planOpen" @click="planOpen = !planOpen">
        <ChevronRight :size="12" :stroke-width="2" class="transition-transform" :class="{ 'rotate-90': planOpen }"/>
        <span>{{ planSummary }}</span>
      </button>
      <div v-if="turn.plan.length && (running || planOpen)" class="ask-plan">
        <p class="ask-eyebrow"><ListChecks :size="12" :stroke-width="1.75"/> {{ running ? "Testing these claims" : "Claims tested" }}</p>
        <ol>
          <li v-for="(p, i) in turn.plan" :key="i">
            <span class="ask-plan-n">
              <Loader2 v-if="turn.claims?.[i]?.status === 'testing'" :size="11" :stroke-width="2.25" class="animate-spin"/>
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="min-w-0 flex-1">
              <span class="text-neutral-900">{{ p.claim }}</span>
              <span v-if="turn.claims?.[i]?.verdict" class="ask-verdict" :class="`ask-verdict-${verdictClass(turn.claims[i].verdict)}`">{{ turn.claims[i].verdict }}</span>
              <span v-if="!turn.claims?.[i]?.summary" class="text-neutral-500"> — {{ p.test }}</span>
              <span v-else class="mt-0.5 block text-[12px] leading-snug text-neutral-600">{{ turn.claims[i].summary.replace(/\s*\[E\d+(?:\.\d+)?(?:,\s*E\d+(?:\.\d+)?)*\]/g, "") }}</span>
            </span>
          </li>
        </ol>
      </div>

      <!-- What it looked at. Open while it works; folded into one line after. -->
      <div v-if="turn.steps.length || running" class="ask-steps">
        <button type="button" class="ask-steps-head" :aria-expanded="stepsOpen" @click="stepsToggled = !stepsOpen">
          <Loader2 v-if="running" :size="12" :stroke-width="2" class="animate-spin text-accent-600"/>
          <ChevronRight v-else :size="12" :stroke-width="2" class="transition-transform" :class="{ 'rotate-90': stepsOpen }"/>
          <span>{{ stepsSummary }}</span>
        </button>
        <ol v-if="stepsOpen" class="ask-steps-list">
          <li v-for="s in turn.steps" :key="s.callId">
            <details>
              <summary>
                <Loader2 v-if="s.status === 'running'" :size="11" :stroke-width="2" class="animate-spin text-neutral-400"/>
                <AlertCircle v-else-if="s.status === 'error'" :size="11" :stroke-width="1.75" class="text-red-600"/>
                <Check v-else :size="11" :stroke-width="2" class="text-neutral-400"/>
                <span class="min-w-0 flex-1 truncate">{{ s.label }}</span>
                <span v-for="id in s.evidenceIds" :key="id" class="ask-step-id">{{ id }}</span>
                <span v-if="s.ms !== undefined" class="tabular-nums text-neutral-400">{{ s.ms }} ms</span>
              </summary>
              <pre>{{ s.text }}</pre>
            </details>
          </li>
          <li v-if="running" class="ask-thinking"><span class="ask-dots"><i/><i/><i/></span><span class="min-w-0 flex-1 truncate">{{ turn.phase ?? "Working" }}</span><span class="tabular-nums text-neutral-400">{{ elapsed }} s</span></li>
        </ol>
      </div>

      <!-- Its verdict on itself, read before the claims: how many its facts bear out, and which to check. -->
      <div v-if="!running && verdict.level !== 'none'" class="ask-vline" :class="`is-${verdict.level}`">
        <button type="button" :aria-expanded="groundOpen" :disabled="!verdict.flagged.length" @click="groundOpen = !groundOpen">
          <span class="ask-vdot" aria-hidden="true"/>
          <span class="ask-vhead" title="Each sentence with a number or a name is checked against the facts it cites: the numbers must be in them, the things named must be what they are about.">{{ verdict.headline }}</span>
          <span v-if="verdict.problems.length" class="ask-vprob">{{ verdict.problems.join(" · ") }}</span>
          <span v-if="verdict.flagged.length" class="ask-vshow">{{ groundOpen ? "Hide" : folded ? "Show them" : "Show which" }}</span>
        </button>
        <ul v-if="groundOpen && verdict.flagged.length">
          <li v-for="(c, i) in verdict.flagged" :key="i" :class="`ask-ground-${c.verdict}`"><span class="ask-ground-v" :title="VERDICT_WORDS[c.verdict]">{{ c.verdict }}</span> {{ c.sentence.replace(/\s*\[E[^\]]*\]/g, "") }} <span class="text-neutral-500">— {{ c.reasons.join("; ") }}</span></li>
        </ul>
        <!-- A way out of every doubt: the facts themselves, or the question asked again with every claim cited. -->
        <div v-if="verdict.level !== 'good'" class="ask-vacts">
          <button v-if="turn.exhibits?.length" type="button" @click="$emit('inspect', turn.exhibits![0].id)">Show the facts</button>
          <button v-if="last" type="button" title="Ask the same question again: every number and name must cite the fact that holds it, or be left out. This answer is kept." @click="ask.retry(turn.id, { strict: true })">Ask again, strictly</button>
        </div>
      </div>

      <!-- The answer: prose, and the exhibits it shows where it shows them. -->
      <div v-if="turn.answer.trim()" class="ask-answer mt-3 grid gap-3">
        <template v-for="(b, i) in layout.blocks" :key="b.type === 'exhibit' ? b.id : `p${i}`">
          <AskProse v-if="b.type === 'prose'" :text="b.text" :ids="ids" :titles="titles" :verdicts="running ? undefined : verdicts" :sources="running ? undefined : sources" :flags="running ? undefined : verdict.flagged" @cite="id => $emit('cite', id)"/>
          <ExhibitView
              v-else-if="exhibitById.get(b.id)"
              :part="exhibitById.get(b.id)!"
              :highlight="lit?.exhibit === b.id ? [lit.element] : highlightOf(b.id, b.cites)"
              :caption="b.caption"
              addable
              @add="addExhibit(b.id, highlightOf(b.id, b.cites))"
              @open="actions.openTo"
              @pick="el => el && $emit('pick', b.id, el)"
          />
        </template>
      </div>
      <p v-else-if="turn.status === 'stopped'" class="mt-3 text-[12px] text-neutral-500">Stopped before an answer.</p>
      <div v-if="turn.status === 'error'" class="ask-error"><AlertCircle :size="13" :stroke-width="1.75"/><span>{{ turn.error }}</span></div>

      <!-- What it looked at but did not cite: offered, drawn when opened. -->
      <div v-if="!running && layout.unplaced.length" class="ask-also">
        <span class="text-neutral-500">Also looked at</span>
        <button v-for="id in layout.unplaced" :key="id" type="button" class="ui-chip ask-also-chip" :class="{ 'is-active': opened.has(id) }" @click="toggle(id)">
          <span class="ask-step-id">{{ id }}</span> <span class="truncate">{{ exhibitById.get(id)?.title }}</span>
        </button>
      </div>
      <div v-for="id in [...layout.unplaced.filter(x => opened.has(x)), ...revealed]" :key="`open-${id}`" class="mt-2">
        <ExhibitView :part="exhibitById.get(id)!" addable @add="addExhibit(id, [])" @open="actions.openTo"/>
      </div>

      <!-- Views to open, then the evidence. -->
      <div v-if="links.length" class="mt-3 grid gap-2" :class="links.length > 1 ? 'grid-cols-2' : ''">
        <AskEvidence v-for="e in links" :key="e.id" :e="e" :flash="flashId === e.id" @open="actions.open"/>
      </div>
      <div v-if="cards.length" class="mt-3 grid gap-2.5">
        <AskEvidence
            v-for="e in cards"
            :key="e.id"
            :e="e"
            :selected="selectedId === e.id"
            :flash="flashId === e.id"
            @open="actions.open"
            @add="actions.add"
            @pin="actions.pin"
            @sql="actions.sql"
            @inspect="x => $emit('inspect', x.id)"
            @ask="q => $emit('ask', q)"
        />
      </div>

      <!-- A question back: the options, one click each. -->
      <div v-if="turn.choices && last && !running" class="mt-3 flex flex-wrap gap-1.5">
        <button v-for="o in turn.choices.options" :key="o" type="button" class="ui-chip" @click="$emit('ask', o)">{{ o }}</button>
      </div>

      <!-- Where to go next. -->
      <div v-if="last && !running && turn.followUps.length" class="mt-3 flex flex-wrap gap-1.5">
        <button v-for="f in turn.followUps" :key="f" type="button" class="ui-chip" @click="$emit('ask', f)"><CornerDownRight :size="12" :stroke-width="1.75" class="text-neutral-400"/> {{ f }}</button>
      </div>

      <div v-if="confirmReport" class="ask-confirm" role="alert">
        <AlertTriangle :size="13" :stroke-width="1.75" class="mt-px shrink-0"/>
        <span class="min-w-0 flex-1">{{ unsafe }} {{ unsafe === 1 ? "statement here is" : "statements here are" }} not backed by the facts it cites. The report gets {{ unsafe === 1 ? "it" : "them" }} listed under “Check before using”.</span>
        <button type="button" class="ui-btn ui-btn-sm" @click="confirmReport = false">Cancel</button>
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" @click="confirmReport = false; toReport()">Add anyway</button>
      </div>

      <!-- Other answers to this question: a retry never loses the one it replaced. -->
      <p v-if="!running && turn.versions?.length" class="ask-versions">
        <History :size="12" :stroke-width="1.75"/>
        <span>{{ turn.keptEarlier ? "The retry checked out worse, so this earlier answer stays." : `${turn.versions.length + 1} answers to this question.` }}</span>
        <button type="button" @click="ask.swapVersion(turn.id, turn.versions.length - 1)">{{ turn.keptEarlier ? "Show the retry" : "Show the other" }}</button>
      </p>

      <!-- What can be done with the answer, and what made it: one row. -->
      <div v-if="!running && (turn.answer.trim() || turn.status !== 'error')" class="ask-foot">
        <div v-if="turn.answer.trim()" class="ask-actions">
          <button type="button" :title="copied ? 'Copied' : 'Copy the answer'" @click="copy"><Check v-if="copied" :size="12" :stroke-width="2"/><Copy v-else :size="12" :stroke-width="1.75"/></button>
          <button v-if="last" type="button" title="Ask again" @click="ask.retry(turn.id)"><RotateCw :size="12" :stroke-width="1.75"/></button>
          <button v-if="last" type="button" title="Edit the question and ask again" @click="$emit('edit', turn.id)"><Pencil :size="12" :stroke-width="1.75"/></button>
          <button type="button" title="Put this answer and its evidence into the conversation's report" @click="askToReport"><FilePlus2 :size="12" :stroke-width="1.75"/></button>
          <span class="mx-0.5 h-3 w-px bg-neutral-200"/>
          <button type="button" :class="{ 'ask-rated': turn.feedback === 'up' }" title="Good answer" @click="ask.rate(turn.id, 'up')"><ThumbsUp :size="12" :stroke-width="1.75"/></button>
          <button type="button" :class="{ 'ask-rated': turn.feedback === 'down' }" title="Wrong or unhelpful: kept with the trace, for improving Ask" @click="ask.rate(turn.id, 'down')"><ThumbsDown :size="12" :stroke-width="1.75"/></button>
        </div>
        <p v-if="turn.status !== 'error'" class="ask-meta">
          <span>{{ turn.model }}</span>
          <span>·</span><span class="tabular-nums">{{ (turn.tokens.ms / 1000).toFixed(1) }} s</span>
          <span>·</span><span class="tabular-nums">{{ tokens }} tokens</span>
          <template v-if="turn.repairs.length"><span>·</span><span :title="turn.repairs.join('\n')">revised after a check</span></template>
          <span>·</span><button type="button" class="hover:text-neutral-800" @click="$emit('trace', turn.id)">Trace</button>
        </p>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { Check, ChevronRight, AlertCircle, Copy, CornerDownRight, FilePlus2, ListChecks, Loader2, PanelTop, Pencil, RotateCw, ThumbsDown, ThumbsUp, AlertTriangle, History } from "lucide-vue-next"
import { useAskStore } from "../app/ask.store"
import type { Turn } from "../app/ask.store"
import type { ExhibitPart } from "~/features/exhibits/types"
import { useAskActions } from "../app/useAskActions"
import { shortName } from "../tools/shared"
import AskEvidence from "./AskEvidence.vue"
import AskProse from "./AskProse.vue"
import ExhibitView from "~/features/exhibits/components/ExhibitView.vue"
// The app's snapshots, for the exhibits drawn here.
import "~/features/exhibit-catalog/app"
import { highlightFor } from "~/features/exhibits/engine"
import { layoutAnswer } from "../render/blocks"
import { answerVerdict, brokenCitations, checkWords, foldsUnbacked, trustedText, untrusted, VERDICT_WORDS } from "../render/verdict"

const props = defineProps<{
  turn: Turn; last: boolean; ids: Set<string>; titles?: Map<string, string>; sources: string; selectedId: string | null; flashId: string | null
  /** An element lit from outside: the fact a citation click pointed at. */
  lit?: { exhibit: string; element: string } | null
  /** Exhibits of earlier turns: an answer that cites one draws it again where it cites it. */
  earlier?: Map<string, ExhibitPart>
  /** Figures a citation asked to see that this answer does not draw: shown under it, opened. */
  reveal?: Set<string>
}>()
defineEmits<{ (e: "ask", q: string): void; (e: "cite", id: string): void; (e: "inspect", id: string): void; (e: "trace", id: string): void; (e: "edit", id: string): void; (e: "pick", exhibit: string, element: string): void }>()

const actions = useAskActions()
const ask = useAskStore()
const copied = ref(false)
async function copy() {
  try { await navigator.clipboard.writeText(props.turn.answer.replace(/\s*\[E\d+(?:\.\d+)?(?:\s*,\s*E\d+(?:\.\d+)?)*\]/g, "").trim()); copied.value = true; setTimeout(() => (copied.value = false), 1200) } catch { /* no clipboard */ }
}
const confirmReport = ref(false)
const unsafe = computed(() => untrusted(props.turn.grounding).length + brokenCitations(props.turn.answer, props.ids).length)
function askToReport() {
  if (unsafe.value) confirmReport.value = true
  else void toReport()
}
async function toReport() {
  const title = await ask.answerToReport(props.turn.id)
  ask.flash(title ? `Added to “${title}”.` : "Could not add it to a report.")
}
const verdictClass = (v?: string) => (v === "supported" ? "yes" : v === "refuted" ? "no" : "unk")
const short = shortName
const running = computed(() => props.turn.status === "running")
const stepsToggled = ref<boolean | null>(null)
// A clock while it works: 30 s of a local model is long, and a still screen reads as a hang.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
watch(running, on => {
  if (on && !tick) tick = setInterval(() => (now.value = Date.now()), 1000)
  if (!on && tick) { clearInterval(tick); tick = null }
}, { immediate: true })
onBeforeUnmount(() => { if (tick) clearInterval(tick) })
const elapsed = computed(() => Math.max(0, Math.round((now.value - new Date(props.turn.askedAt).getTime()) / 1000)))
const turn_phase = () => props.turn.phase ?? "Working"
const stepsOpen = computed(() => stepsToggled.value ?? running.value)
const own = computed(() => new Set((props.turn.exhibits ?? []).map(x => x.id)))
const exhibitById = computed(() => new Map([...(props.earlier ?? new Map()), ...(props.turn.exhibits ?? []).map(x => [x.id, x] as const)]))
/** The answer as shown: without the sentences its facts did not back, when the rest checks out (the verdict line lists them). */
const folded = computed(() => !running.value && foldsUnbacked(props.turn.grounding))
const shownAnswer = computed(() => (folded.value ? trustedText(props.turn.answer, props.turn.grounding) : props.turn.answer))
const layout = computed(() => {
  const l = layoutAnswer(shownAnswer.value, new Set(exhibitById.value.keys()), { streaming: running.value })
  // Only this turn's own figures are offered below it; an earlier turn's are drawn only where cited.
  const unplaced = l.unplaced.filter(id => own.value.has(id))
  // An answer that places no figure still rests on one: the first this turn made (the view's own, when asked
  // from a view) goes after its opening paragraph, so no answer is prose alone.
  if (!running.value && unplaced.length && !l.blocks.some(b => b.type === "exhibit")) {
    const first = unplaced[0]
    const at = l.blocks.findIndex(b => b.type === "prose") + 1
    const blocks = [...l.blocks.slice(0, at), { type: "exhibit" as const, id: first, caption: "", cites: [] }, ...l.blocks.slice(at)]
    return { ...l, blocks, unplaced: unplaced.slice(1) }
  }
  return { ...l, unplaced }
})
/** What this turn draws inline, so a citation to anything else of it opens it below. */
const placed = computed(() => new Set(layout.value.blocks.flatMap(b => (b.type === "exhibit" ? [b.id] : []))))
const revealed = computed(() => [...(props.reveal ?? [])].filter(id => own.value.has(id) && !placed.value.has(id) && !layout.value.unplaced.includes(id)))
const highlightOf = (id: string, cites: string[]) => { const x = exhibitById.value.get(id); return x ? highlightFor(x, cites) : [] }
const opened = ref(new Set<string>())
const groundOpen = ref(false)
const planOpen = ref(false)
const planSummary = computed(() => {
  const vs = (props.turn.claims ?? []).map(c => c?.verdict).filter(Boolean) as string[]
  const n = (v: string) => vs.filter(x => x === v).length
  return [`Tested ${props.turn.plan.length} claim${props.turn.plan.length === 1 ? "" : "s"}`, n("supported") && `${n("supported")} held`, n("refuted") && `${n("refuted")} did not`, n("can't tell") && `${n("can't tell")} could not be told`].filter(Boolean).join(" · ")
})
const verdict = computed(() => answerVerdict(props.turn.grounding, { broken: brokenCitations(props.turn.answer, props.ids), failedChecks: failed.value.filter(c => c.id !== "topic").map(checkWords), wrongTopic: failed.value.find(c => c.id === "topic")?.detail.replace(/\s*\[E\d+\]$/, ""), folded: folded.value }))
/** Each citation's worst verdict among the sentences that use it. */
const verdicts = computed(() => {
  const rank: Record<string, number> = { verified: 0, cited: 1, partial: 2, uncited: 3, unsupported: 4 }
  const m = new Map<string, { verdict: string; reasons: string[] }>()
  for (const c of props.turn.grounding?.claims ?? []) for (const id of c.cites) {
    const was = m.get(id)
    if (!was || rank[c.verdict] > rank[was.verdict]) m.set(id, { verdict: c.verdict, reasons: c.reasons })
  }
  return m
})
async function addExhibit(id: string, highlight: string[]) {
  const x = exhibitById.value.get(id)
  if (!x) return
  const title = await ask.addExhibitToReport(x, highlight)
  ask.flash(title ? `${id} added to “${title}”.` : "Could not add it to a report.")
}
const toggle = (id: string) => { const s = new Set(opened.value); if (s.has(id)) s.delete(id); else s.add(id); opened.value = s }
const links = computed(() => props.turn.evidence.filter(e => e.kind === "link"))
const cards = computed(() => props.turn.evidence.filter(e => e.kind !== "link"))
const failed = computed(() => props.turn.checks.filter(c => !c.ok))
const tokens = computed(() => { const n = props.turn.tokens.prompt + props.turn.tokens.output; return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) })
const stepsSummary = computed(() => {
  const n = props.turn.steps.length
  if (running.value) return `${turn_phase()}${n ? ` · ${n} step${n === 1 ? "" : "s"}` : ""} · ${elapsed.value} s`
  const ms = props.turn.steps.reduce((s, x) => s + (x.ms ?? 0), 0)
  return `Looked at ${n} thing${n === 1 ? "" : "s"}${ms ? ` · ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`} in the tools` : ""}`
})
</script>

<style scoped>
.ask-turn { padding: 18px 0 22px; }
.ask-turn + .ask-turn { border-top: 1px solid rgb(var(--c-neutral-100)); }
.ask-q { white-space: pre-wrap; font-size: 14px; font-weight: 600; line-height: 1.45; color: rgb(var(--c-neutral-900)); }
.ask-ctx { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.ask-eyebrow { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; color: rgb(var(--c-neutral-500)); margin-bottom: 4px; }
.ask-plan { border-left: 2px solid rgb(var(--c-neutral-200)); padding: 2px 0 2px 12px; margin-bottom: 12px; }
.ask-plan ol { display: grid; gap: 3px; }
.ask-plan li { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; }
.ask-plan-n { flex-shrink: 0; width: 14px; display: inline-flex; justify-content: center; padding-top: 2px; color: rgb(var(--c-neutral-500)); font-weight: 600; font-size: 11.5px; }
.ask-verdict { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 500; padding: 0 5px; border-radius: 3px; vertical-align: 1px; }
.ask-verdict-yes { color: rgb(var(--c-green-800, 22 101 52)); background: rgb(var(--c-green-50, 240 253 244)); }
.ask-verdict-no { color: rgb(var(--c-red-800, 153 27 27)); background: rgb(var(--c-red-50, 254 242 242)); }
.ask-verdict-unk { color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-100)); }
.ask-steps { font-size: 12px; color: rgb(var(--c-neutral-600)); }
.ask-steps-head { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px 2px 2px; border-radius: 5px; color: rgb(var(--c-neutral-600)); }
.ask-steps-head:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-100)); }
.ask-steps-list { margin: 4px 0 0 7px; padding-left: 12px; border-left: 1px solid rgb(var(--c-neutral-200)); display: grid; gap: 1px; }
.ask-steps-list summary { display: flex; align-items: center; gap: 7px; cursor: pointer; list-style: none; padding: 2px 4px; border-radius: 4px; }
.ask-steps-list summary::-webkit-details-marker { display: none; }
.ask-steps-list summary:hover { background: rgb(var(--c-neutral-50)); color: rgb(var(--c-neutral-900)); }
.ask-steps-list pre { white-space: pre-wrap; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-50)); border-radius: 6px; padding: 7px 9px; margin: 2px 0 6px; max-height: 260px; overflow: auto; }
.ask-step-id { flex-shrink: 0; font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-100)); border-radius: 3px; padding: 0 4px; }
.ask-thinking { display: flex; align-items: center; gap: 8px; padding: 3px 4px; color: rgb(var(--c-neutral-500)); }
.ask-dots { display: inline-flex; gap: 3px; }
.ask-dots i { width: 4px; height: 4px; border-radius: 50%; background: rgb(var(--c-neutral-400)); animation: ask-dot 1.1s infinite ease-in-out; }
.ask-dots i:nth-child(2) { animation-delay: 0.15s; }
.ask-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes ask-dot { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
.ask-error { margin-top: 10px; display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: rgb(var(--c-red-800, 153 27 27)); background: rgb(var(--c-red-50, 254 242 242)); border-radius: 8px; padding: 8px 10px; }
.ask-versions { margin-top: 10px; display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgb(var(--c-neutral-600)); }
.ask-versions button { color: rgb(var(--c-neutral-800)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ask-versions button:hover { color: rgb(var(--c-neutral-900)); }
.ask-foot { margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.ask-actions { display: flex; align-items: center; gap: 2px; }
.ask-actions button { display: inline-flex; padding: 4px 5px; border-radius: 5px; color: rgb(var(--c-neutral-500)); }
.ask-actions button:hover { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-100)); }
.ask-actions .ask-rated { color: rgb(var(--c-neutral-900)); background: rgb(var(--c-neutral-100)); }
/* One column that never grows past the conversation: a wide figure scrolls inside its card instead. */
.ask-answer { grid-template-columns: minmax(0, 1fr); }
.ask-answer > * { min-width: 0; }
.ask-also { margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11.5px; }
.ask-also-chip { max-width: 300px; padding-left: 3px; }
.ask-vline { margin-top: 10px; border: 1px solid rgb(var(--c-neutral-200)); border-radius: 6px; background: rgb(var(--c-neutral-50)); font-size: 12px; }
.ask-vline > button { display: flex; width: 100%; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 6px 10px; text-align: left; color: rgb(var(--c-neutral-800)); }
.ask-vline > button:not(:disabled):hover .ask-vshow { color: rgb(var(--c-neutral-900)); text-decoration: underline; }
.ask-vdot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--c-green-600, 22 163 74)); }
.ask-vhead { font-weight: 500; }
.ask-vprob { color: rgb(var(--c-neutral-600)); }
.ask-vshow { margin-left: auto; color: rgb(var(--c-neutral-500)); }
.ask-vline.is-warn { border-color: rgb(var(--c-amber-300)); background: rgb(var(--c-amber-50)); }
.ask-vline.is-warn .ask-vdot { background: rgb(var(--c-amber-500)); }
.ask-vline.is-bad { border-color: rgb(var(--c-red-300, 252 165 165)); background: rgb(var(--c-red-50, 254 242 242)); }
.ask-vline.is-bad .ask-vdot { background: rgb(var(--c-red-600, 220 38 38)); }
.ask-vline.is-bad .ask-vprob { color: rgb(var(--c-red-800, 153 27 27)); }
.ask-vline ul { margin: 0; padding: 2px 10px 8px 28px; display: grid; gap: 4px; font-size: 12px; line-height: 1.5; color: rgb(var(--c-neutral-800)); }
.ask-vacts { display: flex; gap: 12px; padding: 0 10px 7px 28px; font-size: 12px; }
.ask-vacts button { color: rgb(var(--c-neutral-700)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ask-vacts button:hover { color: rgb(var(--c-neutral-900)); }
.ask-confirm { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.5; color: rgb(var(--c-neutral-800)); border: 1px solid rgb(var(--c-amber-300)); background: rgb(var(--c-amber-50)); border-radius: 6px; padding: 8px 10px; }
.ask-ground-v { display: inline-block; min-width: 72px; font-weight: 500; }
.ask-ground-partial .ask-ground-v, .ask-ground-uncited .ask-ground-v { color: rgb(var(--c-amber-800)); }
.ask-ground-unsupported .ask-ground-v { color: rgb(var(--c-red-700)); }
.ask-meta { margin-left: auto; display: flex; flex-wrap: wrap; gap: 5px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
</style>
