// The model client the app uses: a local Ollama server, reached through the
// Go side (the webview cannot call it directly), streamed back as events.

import { Cancel, Chat, Models } from "wailsjs/go/app/AskService"
import { EventsOn } from "wailsjs/runtime/runtime"
import type { ModelClient, ModelReply, ModelRequest } from "../engine/types"

export interface LocalModel { name: string; size: number; tools: boolean; vision: boolean; think: boolean; remote: boolean }

type Delta = { id: string; content: string; thinking: string }
const listeners = new Map<string, (d: Delta) => void>()
let subscribed = false

function subscribe() {
    if (subscribed) return
    try {
        EventsOn("ask:delta", (d: Delta) => listeners.get(d.id)?.(d))
        subscribed = true
    } catch { /* outside the app: no events, replies still arrive whole */ }
}

let seq = 0

export async function listModels(): Promise<LocalModel[]> {
    return ((await Models()) ?? []) as LocalModel[]
}

export function ollamaClient(model: LocalModel): ModelClient {
    return {
        name: model.name,
        async chat(req: ModelRequest, onDelta, signal): Promise<ModelReply> {
            subscribe()
            const id = `ask-${Date.now().toString(36)}-${++seq}`
            listeners.set(id, d => onDelta({ content: d.content ?? "", thinking: d.thinking ?? "" }))
            const abort = () => void Cancel(id)
            signal.addEventListener("abort", abort)
            try {
                const body: Record<string, unknown> = {
                    model: model.name,
                    messages: req.messages,
                    keep_alive: "30m",
                    options: { num_ctx: 32768, temperature: 0.2, num_predict: 2048 },
                }
                if (req.tools?.length) body.tools = req.tools
                if (req.format) body.format = req.format
                if (model.think) body.think = !!req.think
                const res = JSON.parse(await Chat(id, JSON.stringify(body)))
                return {
                    content: res.content ?? "",
                    thinking: res.thinking ?? "",
                    toolCalls: (res.toolCalls ?? []).map((c: any) => {
                        let args = c.function?.arguments ?? {}
                        if (typeof args === "string") { try { args = JSON.parse(args) } catch { args = {} } }
                        return { name: String(c.function?.name ?? ""), args }
                    }),
                    promptTokens: res.promptTokens ?? 0,
                    outputTokens: res.outputTokens ?? 0,
                    ms: res.ms ?? 0,
                    stopped: !!res.stopped,
                }
            } finally {
                signal.removeEventListener("abort", abort)
                listeners.delete(id)
            }
        },
    }
}
