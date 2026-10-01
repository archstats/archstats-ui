<template>
  <section class="flex flex-col gap-6" aria-labelledby="ai-title">
    <!-- The switch: every AI feature hangs from it. -->
    <div class="ai-panel flex items-start gap-4 px-4 py-3.5">
      <Sparkles :size="16" :stroke-width="1.75" class="mt-px shrink-0 text-neutral-400" aria-hidden="true"/>
      <div class="min-w-0 grow">
        <h3 id="ai-title" class="text-base font-semibold text-neutral-900">{{ t('ai.aisettings.aiFeatures') }}</h3>
        <p class="mt-0.5 max-w-[58ch] text-sm leading-[18px] text-neutral-600">
          {{ t('ai.aisettings.askAnyAiFeature') }}
        </p>
        <p v-if="ai.status.policy" class="mt-2 flex items-center gap-1.5 text-sm text-neutral-800">
          <Lock :size="12" :stroke-width="2" class="shrink-0 text-neutral-500" aria-hidden="true"/>
          <span>{{ ai.status.locked ? (ai.status.policy || t('ai.aisettings.heldOffYourOrganisation')) : ai.status.policy }}</span>
        </p>
        <p v-else-if="ai.status.switch && !ai.ready.length" class="mt-2 flex items-center gap-1.5 text-sm text-neutral-800">
          <span class="ai-dot is-waiting" aria-hidden="true"/>{{ ' ' + t('ai.aisettings.butNoProviderReady') }}
        </p>
      </div>
      <Switch
          :model-value="ai.status.switch && !ai.status.locked"
          :disabled="ai.status.locked || switching"
          aria-labelledby="ai-title"
          class="mt-0.5"
          @update:model-value="setEnabled"
      />
    </div>
    <p v-if="switchError" class="-mt-4 text-sm text-red-700" role="alert">{{ switchError }}</p>

    <!-- The providers: one row each, on or off at a glance; details open beneath. -->
    <div>
      <div class="mb-2 flex items-baseline justify-between">
        <h4 class="ui-section-title">{{ t('ai.aisettings.providers') }}</h4>
        <span class="font-mono text-xs text-neutral-500">{{ t('ai.aisettings.ready', { readyLength: ai.ready.length, providersLength: ai.status.providers.length }) }}</span>
      </div>
      <ul class="ai-panel overflow-hidden">
        <li v-for="p in ai.status.providers" :key="p.id" class="ai-row" :class="{ 'is-open': open === p.id }">
          <div class="flex h-12 items-center gap-3 pl-3 pr-3">
            <button
                type="button"
                class="ai-row-head flex min-w-0 grow items-center gap-3 self-stretch text-left"
                :aria-expanded="open === p.id"
                :aria-controls="`ai-${p.id}`"
                @click="toggleOpen(p)"
            >
              <ChevronRight :size="12" :stroke-width="2" class="ai-chevron shrink-0 text-neutral-400" aria-hidden="true"/>
              <component :is="iconOf(p)" :size="14" :stroke-width="1.75" class="shrink-0 text-neutral-500" aria-hidden="true"/>
              <span class="min-w-0 grow">
                <span class="block truncate text-base font-medium leading-[18px] text-neutral-900">{{ nameOf(p) }}</span>
                <span class="block truncate text-xs leading-4 text-neutral-500">
                  <template v-if="p.local">{{ t('ai.aisettings.machine') }} <span class="font-mono">{{ hostOf(p.baseUrl) }}</span></template>
                  <template v-else-if="p.cloud">{{ t('ai.aisettings.cloudQuestionsLeaveMachine') }}</template>
                  <template v-else-if="p.baseUrl">{{ t('ai.aisettings.yourServer') }} <span class="font-mono">{{ hostOf(p.baseUrl) }}</span></template>
                  <template v-else>{{ t('ai.aisettings.lmStudioVllmLlama') }}</template>
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-1.5 text-sm" :class="stateOf(p).ink">
                <span class="ai-dot" :class="stateOf(p).dot" aria-hidden="true"/>{{ stateOf(p).text }}
              </span>
            </button>
            <Switch
                :model-value="p.on"
                :disabled="!p.allowed"
                :aria-label="t('ai.aisettings.use', { p: nameOf(p) })"
                @update:model-value="v => setOn(p, v)"
            />
          </div>

          <div :id="`ai-${p.id}`" class="ai-details" :inert="open !== p.id">
            <div class="min-h-0 overflow-hidden">
              <dl class="ai-form">
                <template v-if="!p.allowed">
                  <dt>{{ t('ai.aisettings.policy') }}</dt>
                  <dd class="text-sm text-neutral-800">{{ t('ai.aisettings.notAllowedHere', { policy: ai.status.policy }) }}</dd>
                </template>

                <template v-if="p.id === 'openai-compatible'">
                  <dt><label :for="`ai-name-${p.id}`">{{ t('ai.aisettings.name') }}</label></dt>
                  <dd><input :id="`ai-name-${p.id}`" v-model="draftOf(p).name" type="text" class="ui-input w-full" :placeholder="t('ai.aisettings.lmStudio')" @change="save(p)"></dd>
                </template>

                <template v-if="p.id === 'ollama' || p.id === 'openai-compatible'">
                  <dt><label :for="`ai-url-${p.id}`">{{ t('ai.aisettings.address') }}</label></dt>
                  <dd>
                    <input
                        :id="`ai-url-${p.id}`"
                        v-model="draftOf(p).baseUrl"
                        type="url"
                        class="ui-input ui-input-mono w-full"
                        :placeholder="p.defaultUrl || 'http://localhost:1234/v1'"
                        spellcheck="false"
                        @change="save(p)"
                        @keydown.enter.prevent="save(p)"
                    >
                    <p v-if="p.id === 'openai-compatible'" class="ai-hint"><I18nT k="ai.aisettings.whereChatApiLives"><template #icon><span class="font-mono">/chat/completions</span></template></I18nT></p>
                  </dd>
                </template>

                <template v-if="p.takesKey">
                  <dt><label :for="`ai-key-${p.id}`">{{ t('ai.aisettings.apiKey') }}</label></dt>
                  <dd>
                    <!-- Saved: shown by its last four, never read back. -->
                    <div v-if="p.keySource === 'keychain' && replacing !== p.id" class="flex items-center gap-2">
                      <span class="ai-secret" :title="t('ai.aisettings.kept', { keychainName })">
                        <KeyRound :size="12" :stroke-width="1.75" class="shrink-0 text-neutral-400" aria-hidden="true"/>
                        <span class="font-mono tracking-[0.08em]">••••••••{{ p.keyHint || "••••" }}</span>
                      </span>
                      <button type="button" class="ui-btn ui-btn-sm" @click="startReplace(p)">{{ t('ai.aisettings.replace') }}</button>
                      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="busy[p.id] === 'key'" @click="removeKey(p)">{{ t('ai.aisettings.remove') }}</button>
                    </div>
                    <form v-else class="flex items-center gap-2" @submit.prevent="saveKey(p)">
                      <input
                          :id="`ai-key-${p.id}`"
                          v-model="draftOf(p).key"
                          type="password"
                          class="ui-input ui-input-mono min-w-0 grow"
                          :placeholder="envKeyed(p) ? t('ai.aisettings.using', { keySource: p.keySource }) : p.needsKey ? t('ai.aisettings.pasteKey') : t('ai.aisettings.onlyIfServerAsks')"
                          autocomplete="off"
                          spellcheck="false"
                      >
                      <button type="submit" class="ui-btn" :disabled="!draftOf(p).key.trim() || busy[p.id] === 'key'">{{ busy[p.id] === "key" ? t('ai.aisettings.saving') : t('ai.aisettings.saveKey') }}</button>
                      <button v-if="replacing === p.id" type="button" class="ui-btn ui-btn-quiet" @click="replacing = null; draftOf(p).key = ''">{{ t('ai.aisettings.cancel') }}</button>
                    </form>
                    <p class="ai-hint">
                      <template v-if="envKeyed(p)"><I18nT k="ai.aisettings.readKeySavedHere"><template #keySource><span class="font-mono text-neutral-700">{{ p.keySource }}</span></template></I18nT></template>
                      <template v-else>{{ t('ai.aisettings.keptSentOnlyNever', { keychainName, value: p.cloud ? p.label : sentTo(p) }) }}</template>
                      <button v-if="p.keyUrl" type="button" class="ai-link" @click="openUrl(p.keyUrl)">{{ t('ai.aisettings.getKey') }}<ArrowUpRight :size="11" :stroke-width="2" aria-hidden="true"/></button>
                    </p>
                  </dd>
                </template>

                <dt class="is-inline">{{ t('ai.aisettings.sourceCode') }}</dt>
                <dd>
                  <Checkbox :model-value="draftOf(p).shareCode" @update:model-value="v => { draftOf(p).shareCode = v; save(p) }">{{ t('ai.aisettings.askMayReadLines') }}</Checkbox>
                  <p class="ai-hint">
                    {{ draftOf(p).shareCode
                      ? t('ai.aisettings.linesAskReadsAnswer', { p: sentTo(p) })
                      : t('ai.aisettings.askAnswersNamesMeasures', { p: sentTo(p) }) }}
                  </p>
                </dd>

                <dt>{{ t('ai.aisettings.connection') }}</dt>
                <dd class="flex min-h-7 items-center gap-3">
                  <button type="button" class="ui-btn ui-btn-sm" :disabled="busy[p.id] === 'test' || (p.needsKey && !p.hasKey) || (p.needsUrl && !p.baseUrl)" @click="test(p)">
                    <Loader2 v-if="busy[p.id] === 'test'" :size="12" class="animate-spin" aria-hidden="true"/>
                    {{ busy[p.id] === "test" ? t('ai.aisettings.checking') : t('ai.aisettings.checkConnection') }}
                  </button>
                  <span v-if="results[p.id]" class="flex min-w-0 items-center gap-1.5 text-sm" :class="results[p.id]!.ok ? 'text-neutral-800' : 'text-red-700'" role="status">
                    <span class="ai-dot" :class="results[p.id]!.ok ? 'is-ready' : 'is-error'" aria-hidden="true"/>
                    <span class="min-w-0">{{ results[p.id]!.message }}</span>
                  </span>
                </dd>

                <template v-if="errors[p.id]">
                  <dt class="sr-only">{{ t('ai.aisettings.error') }}</dt>
                  <dd class="text-sm text-red-700" role="alert">{{ errors[p.id] }}</dd>
                </template>
              </dl>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- What leaves the machine, said plainly, once. -->
    <div>
      <h4 class="ui-section-title mb-2">{{ t('ai.aisettings.whatQuestionSends') }}</h4>
      <dl class="ai-sent">
        <dt>{{ t('ai.aisettings.always') }}</dt>
        <dd>{{ t('ai.aisettings.questionNamesPathsMeasures') }}</dd>
        <dt>{{ t('ai.aisettings.sourceCode2') }}</dt>
        <dd>{{ t('ai.aisettings.linesCodeAskReads') }}</dd>
        <dt>{{ t('ai.aisettings.never') }}</dt>
        <dd>{{ t('ai.aisettings.apiKeysTheyStay', { keychainName }) }}</dd>
        <dt>{{ t('ai.aisettings.policy') }}</dt>
        <dd><I18nT k="ai.aisettings.administratorCanHoldAi"><template #span><span class="font-mono text-neutral-700">ARCHSTATS_AI=off</span></template><template #policyPath><span class="font-mono text-neutral-700 [overflow-wrap:anywhere]">{{ ai.status.policyPath }}</span></template></I18nT></dd>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { ArrowUpRight, ChevronRight, Cloud, KeyRound, Laptop, Loader2, Lock, Server, Sparkles } from "lucide-vue-next"
import { BrowserOpenURL } from "wailsjs/runtime/runtime"
import Checkbox from "~/shared/ui/Checkbox.vue"
import Switch from "~/shared/ui/Switch.vue"
import { usePlatform } from "~/platform/usePlatform"
import { useAIStore, type ProviderId, type ProviderStatus } from "../ai.store"
import { t } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

const ai = useAIStore()
const { isMac, isWindows } = usePlatform()
const keychainName = computed(() => (isMac.value ? t("ai.aisettings.macosKeychain") : isWindows.value ? t("ai.aisettings.windowsCredentialManager") : t("ai.aisettings.systemKeyring")))

interface Draft { baseUrl: string; name: string; shareCode: boolean; key: string }

const open = ref<string | null>(null)
const replacing = ref<string | null>(null)
const drafts = reactive<Record<string, Draft>>({})
const busy = reactive<Record<string, "" | "key" | "test">>({})
const switching = ref(false)
const errors = reactive<Record<string, string>>({})
const results = reactive<Record<string, { ok: boolean; message: string } | null>>({})
const switchError = ref("")

onMounted(() => void ai.refresh())

/** A provider's editable fields, taken from its status the first time they are shown. */
function draftOf(p: ProviderStatus): Draft {
  return (drafts[p.id] ??= { baseUrl: p.baseUrl && p.baseUrl !== p.defaultUrl ? p.baseUrl : "", name: p.name, shareCode: p.shareCode, key: "" })
}

function toggleOpen(p: ProviderStatus) {
  open.value = open.value === p.id ? null : p.id
  draftOf(p)
}

async function setEnabled(on: boolean) {
  switching.value = true
  switchError.value = ""
  try { await ai.setEnabled(on) } catch (e: any) { switchError.value = String(e?.message ?? e) } finally { switching.value = false }
}

async function saveInput(p: ProviderStatus, on: boolean) {
  const d = draftOf(p)
  errors[p.id] = ""
  try {
    await ai.saveProvider(p.id as ProviderId, { on, baseUrl: d.baseUrl, name: d.name, shareCode: d.shareCode })
    return true
  } catch (e: any) {
    errors[p.id] = String(e?.message ?? e)
    return false
  }
}

const save = (p: ProviderStatus) => saveInput(p, p.on)

async function setOn(p: ProviderStatus, on: boolean) {
  results[p.id] = null
  // Turned on without what it needs: open it where the key or address goes.
  if (on && ((p.needsKey && !p.hasKey) || (p.needsUrl && !p.baseUrl))) open.value = p.id
  await saveInput(p, on)
}

async function saveKey(p: ProviderStatus) {
  const d = draftOf(p)
  busy[p.id] = "key"
  errors[p.id] = ""
  results[p.id] = null
  try {
    await ai.setKey(p.id as ProviderId, d.key)
    d.key = ""
    replacing.value = null
    busy[p.id] = ""
    const now = ai.provider(p.id)
    if (now) await test(now)
  } catch (e: any) {
    errors[p.id] = String(e?.message ?? e)
  } finally {
    if (busy[p.id] === "key") busy[p.id] = ""
  }
}

function startReplace(p: ProviderStatus) {
  replacing.value = p.id
  draftOf(p).key = ""
}

async function removeKey(p: ProviderStatus) {
  busy[p.id] = "key"
  errors[p.id] = ""
  results[p.id] = null
  try { await ai.deleteKey(p.id as ProviderId) } catch (e: any) { errors[p.id] = String(e?.message ?? e) } finally { busy[p.id] = "" }
}

async function test(p: ProviderStatus) {
  busy[p.id] = "test"
  results[p.id] = null
  try {
    const r = await ai.test(p.id as ProviderId)
    // It answers: that is the provider the person wants to use.
    if (r.ok && !p.on) { await saveInput(p, true); r.message = t("ai.aisettings.now", { message: r.message }) }
    results[p.id] = r
  } finally { busy[p.id] = "" }
}

function openUrl(url: string) {
  try { BrowserOpenURL(url) } catch { window.open(url, "_blank") }
}

const envKeyed = (p: ProviderStatus) => !!p.keySource && p.keySource !== "keychain"
const nameOf = (p: ProviderStatus) => (p.id === "openai-compatible" && p.name ? p.name : p.label)
const iconOf = (p: ProviderStatus) => (p.local ? Laptop : p.cloud ? Cloud : Server)
const sentTo = (p: ProviderStatus) => (p.local ? t("ai.aisettings.modelMachine") : p.id === "openai-compatible" ? (p.name || t("ai.aisettings.server")) : p.label)

function hostOf(url: string): string {
  try { const u = new URL(url); return u.host + (u.pathname === "/" ? "" : u.pathname) } catch { return url }
}

function stateOf(p: ProviderStatus): { text: string; dot: string; ink: string } {
  if (!p.allowed) return { text: t("ai.aisettings.notAllowed"), dot: "is-off", ink: "text-neutral-500" }
  if (p.ready) return { text: t("ai.aisettings.ready2"), dot: "is-ready", ink: "text-neutral-800" }
  if (p.on && p.needsKey && !p.hasKey) return { text: t("ai.aisettings.needsKey"), dot: "is-waiting", ink: "text-neutral-800" }
  if (p.on && p.needsUrl && !p.baseUrl) return { text: t("ai.aisettings.needsAddress"), dot: "is-waiting", ink: "text-neutral-800" }
  return { text: t("ai.aisettings.off"), dot: "is-off", ink: "text-neutral-500" }
}
</script>

<style scoped>
/* A hairline panel: the ring is the border (DESIGN: Cards / Containers). */
.ai-panel {
  border-radius: 6px;
  background: rgb(var(--c-surface));
  box-shadow: 0 0 0 1px rgb(var(--c-neutral-200));
}

.ai-row + .ai-row { border-top: 1px solid rgb(var(--c-neutral-200)); }
.ai-row-head { border-radius: 4px; outline-offset: -2px; }
.ai-row:hover:not(.is-open) { background: rgb(var(--c-neutral-50)); }
.ai-row.is-open { background: rgb(var(--c-neutral-50)); }
.ai-chevron { transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.ai-row.is-open .ai-chevron { transform: rotate(90deg); }

/* Details open by growing from nothing: one motion, on the one thing that moves. */
.ai-details {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ai-row.is-open .ai-details { grid-template-rows: 1fr; }

/* Lined up under the provider's name: the row's padding, chevron, gap, icon, gap. */
.ai-form {
  margin: 2px 0.75rem 18px calc(0.75rem * 3 + 26px);
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  column-gap: 16px;
  row-gap: 14px;
  align-items: baseline;
}
.ai-form > dt {
  padding-top: 5px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: rgb(var(--c-neutral-500));
  align-self: start;
}
.ai-form > dt.is-inline { padding-top: 1px; }
.ai-form > dd { min-width: 0; align-self: start; }

.ai-hint {
  margin-top: 5px;
  font-size: 12px;
  line-height: 16px;
  color: rgb(var(--c-neutral-500));
}

.ai-secret {
  display: inline-flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 4px;
  background: rgb(var(--c-neutral-50));
  box-shadow: 0 0 0 1px rgb(var(--c-neutral-200));
  font-size: 12px;
  color: rgb(var(--c-neutral-700));
}

.ai-link {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-left: 6px;
  color: rgb(var(--c-accent-700));
  text-decoration: underline;
  text-decoration-color: rgb(var(--c-accent-300));
  text-underline-offset: 2px;
}
.ai-link:hover { text-decoration-color: currentColor; }

/* Status dots: the health-level vocabulary (DESIGN: Health levels). */
.ai-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
}
.ai-dot.is-ready { background: rgb(var(--c-green-500)); }
.ai-dot.is-waiting { background: rgb(var(--c-amber-500)); }
.ai-dot.is-error { background: rgb(var(--c-red-500)); }
.ai-dot.is-off { box-shadow: inset 0 0 0 1.5px rgb(var(--c-neutral-300)); }

.ai-sent {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  column-gap: 16px;
  row-gap: 8px;
  font-size: 12px;
  line-height: 17px;
}
.ai-sent > dt { font-weight: 500; color: rgb(var(--c-neutral-500)); }
.ai-sent > dd { color: rgb(var(--c-neutral-650)); max-width: 62ch; }

@media (prefers-reduced-motion: reduce) {
  .ai-details, .ai-chevron { transition: none; }
}
</style>
