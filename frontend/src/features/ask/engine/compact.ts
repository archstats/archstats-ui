// Keeping a long conversation inside a local model's context. The last two
// questions stay whole; older tool results shrink to their first lines. The
// evidence ids stay, so the model can fetch any of them again with recall.

import type { ModelMessage } from "./types"

const KEEP_TURNS = 2
const SHORT = 280

/** A rough token count: good enough to decide when to compact. */
export function estimateTokens(messages: ModelMessage[]): number {
    return Math.ceil(messages.reduce((s, m) => s + m.content.length + JSON.stringify(m.tool_calls ?? "").length, 0) / 3.6)
}

export function compact(history: ModelMessage[], budget: number): ModelMessage[] {
    if (estimateTokens(history) <= budget) return history
    const userIdx = history.map((m, i) => (m.role === "user" && !m.content.startsWith("[Check]") ? i : -1)).filter(i => i >= 0)
    const keepFrom = userIdx.length > KEEP_TURNS ? userIdx[userIdx.length - KEEP_TURNS] : 0
    return history.map((m, i) => {
        if (i >= keepFrom || m.role !== "tool" || m.content.length <= SHORT) return m
        const ids = [...new Set(m.content.match(/\bE\d+(?:\.\d+)?\b/g) ?? [])]
        return { ...m, content: `${m.content.slice(0, SHORT).trimEnd()} …[shortened${ids.length ? `; recall ${ids.join(", ")} for all of it` : ""}]` }
    })
}
