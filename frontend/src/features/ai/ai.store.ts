import { acceptHMRUpdate, defineStore } from "pinia"
import { DeleteKey, SaveProvider, SetEnabled, SetKey, Status, Test } from "wailsjs/go/app/AIService"

// The AI switch every AI feature obeys, and the providers behind it. The Go
// side keeps the settings and the keys (in the system keychain) and refuses
// every model call while AI is off; this store mirrors its status so the
// app can hide what cannot be used. It never sees a key: only whether there
// is one, where it comes from, and its last four characters.

export type ProviderId = "ollama" | "anthropic" | "openai" | "gemini" | "openai-compatible"

export interface ProviderStatus {
    id: ProviderId
    label: string
    cloud: boolean
    needsKey: boolean
    takesKey: boolean
    needsUrl: boolean
    defaultUrl: string
    envKey: string
    keyUrl: string
    on: boolean
    baseUrl: string
    name: string
    shareCode: boolean
    hasKey: boolean
    /** "keychain", the environment variable's name, or "". */
    keySource: string
    keyHint: string
    allowed: boolean
    ready: boolean
    local: boolean
}

export interface AIStatus {
    enabled: boolean
    switch: boolean
    locked: boolean
    policy: string
    policyPath: string
    providers: ProviderStatus[]
}

export interface ProviderInput { on: boolean; baseUrl: string; name: string; shareCode: boolean }

const OFF: AIStatus = { enabled: false, switch: false, locked: false, policy: "", policyPath: "", providers: [] }

export const useAIStore = defineStore("ai", {
    state: () => ({
        status: OFF as AIStatus,
        loaded: false,
        loading: null as Promise<void> | null,
    }),
    getters: {
        /** AI features may be shown and used. */
        enabled(s): boolean { return s.status.enabled },
        ready(s): ProviderStatus[] { return s.status.providers.filter(p => p.ready) },
        provider(s) { return (id: string): ProviderStatus | undefined => s.status.providers.find(p => p.id === id) },
    },
    actions: {
        /** Reads the status once; later calls wait for the same read. */
        load(): Promise<void> {
            if (this.loaded) return Promise.resolve()
            this.loading ??= this.refresh().finally(() => { this.loading = null })
            return this.loading
        },
        async refresh() {
            try {
                this.status = ((await Status()) ?? OFF) as unknown as AIStatus
            } catch {
                // Outside the desktop shell: no backend, so no AI.
                this.status = OFF
            }
            this.loaded = true
        },
        async setEnabled(on: boolean) {
            try { await SetEnabled(on) } finally { await this.refresh() }
        },
        async saveProvider(id: ProviderId, input: ProviderInput) {
            try { await SaveProvider(id, input as any) } finally { await this.refresh() }
        },
        async setKey(id: ProviderId, key: string) {
            try { await SetKey(id, key) } finally { await this.refresh() }
        },
        async deleteKey(id: ProviderId) {
            try { await DeleteKey(id) } finally { await this.refresh() }
        },
        async test(id: ProviderId): Promise<{ ok: boolean; models: number; message: string }> {
            try {
                return (await Test(id)) as any
            } catch (e: any) {
                return { ok: false, models: 0, message: String(e?.message ?? e) }
            }
        },
    },
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAIStore, import.meta.hot))
