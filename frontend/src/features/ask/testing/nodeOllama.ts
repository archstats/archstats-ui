// A model client for Node: Ollama over HTTP, no streaming. For evaluations
// that run the engine outside the app.

import type { ModelClient } from "../engine/types"

export function nodeOllama(model: string, base = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"): ModelClient {
    return {
        name: model,
        async chat(req, _onDelta, signal) {
            const t0 = Date.now()
            const body: Record<string, unknown> = { model, messages: req.messages, stream: false, keep_alive: "30m", options: { num_ctx: 32768, temperature: 0.2, num_predict: 2048, seed: 7 }, think: !!req.think }
            if (req.tools?.length) body.tools = req.tools
            if (req.format) body.format = req.format
            const res = await fetch(`${base.startsWith("http") ? base : `http://${base}`}/api/chat`, { method: "POST", body: JSON.stringify(body), signal, headers: { "Content-Type": "application/json" } })
            if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`)
            const j: any = await res.json()
            return {
                content: j.message?.content ?? "",
                thinking: j.message?.thinking ?? "",
                toolCalls: (j.message?.tool_calls ?? []).map((c: any) => ({ name: c.function?.name ?? "", args: typeof c.function?.arguments === "string" ? JSON.parse(c.function.arguments) : c.function?.arguments ?? {} })),
                promptTokens: j.prompt_eval_count ?? 0,
                outputTokens: j.eval_count ?? 0,
                ms: Date.now() - t0,
                stopped: false,
            }
        },
    }
}
