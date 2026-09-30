// Whether a question points at the screen: "this view", "on screen", or, as
// the first question of a conversation, a bare "this" or "these". A later
// "is this bad?" usually means the answer above it, so only an explicit
// pointer takes the view then.

const EXPLICIT = /\b(?:this|these) (?:views?|pages?|screens?|charts?|figures?|tables?|lists?|graphs?|diagrams?|maps?|components?|files?|tangles?|cycles?|rankings?|matrix|rows?|results?|numbers?)\b|\bon (?:the )?screen\b|\bshown here\b|\bi(?:'m| am) (?:looking at|seeing)\b/i

export function pointsAtView(question: string, firstInThread: boolean): boolean {
    if (EXPLICIT.test(question)) return true
    return firstInThread && /\b(?:this|these|those|here)\b/i.test(question)
}
