// The model client the app uses: whichever provider the picked model belongs
// to (Ollama on this machine, Claude, OpenAI, Gemini, or an OpenAI-compatible
// server), reached through the Go side, which holds the keys and refuses
// every call while AI features are off. Replies stream back as events.

import { Cancel, Chat, Models } from "wailsjs/go/app/AskService"
import { EventsOn } from "wailsjs/runtime/runtime"
import type { ModelClient, ModelReply, ModelRequest } from "../engine/types"

export interface AskModel {
    /** "<provider>/<name>": what is picked, remembered and sent. */
    id: string
    provider: string
    name: string
    label: string
    size: number
    tools: boolean
    vision: boolean
    think: boolean
    /** The conversation leaves this machine. */
    remote: boolean
}

export interface ModelProblem { provider: string; label: string; message: string }

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

export async function listModels(): Promise<{ models: AskModel[]; problems: ModelProblem[] }> {
    const r = (await Models()) as any
    return { models: (r?.models ?? []) as AskModel[], problems: (r?.problems ?? []) as ModelProblem[] }
}

export function modelClient(model: AskModel): ModelClient {
    return {
        name: model.label || model.name,
        async chat(req: ModelRequest, onDelta, signal): Promise<ModelReply> {
            subscribe()
            const id = `ask-${Date.now().toString(36)}-${++seq}`
            listeners.set(id, d => onDelta({ content: d.content ?? "", thinking: d.thinking ?? "" }))
            const abort = () => void Cancel(id)
            signal.addEventListener("abort", abort)
            try {
                const body: Record<string, unknown> = { model: model.id, messages: req.messages }
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
                        return { id: c.id || undefined, name: String(c.function?.name ?? ""), args: args ?? {} }
                    }),
                    promptTokens: res.promptTokens ?? 0,
                    outputTokens: res.outputTokens ?? 0,
                    ms: res.ms ?? 0,
                    stopped: !!res.stopped,
                    raw: res.raw ?? undefined,
                }
            } finally {
                signal.removeEventListener("abort", abort)
                listeners.delete(id)
            }
        },
    }
}
