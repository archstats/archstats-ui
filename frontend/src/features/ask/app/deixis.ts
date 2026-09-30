// Whether a question points at the screen: "this view", "on screen", or a
// bare "this", "these" or "here" when the person has just come from a view
// (Ask offers that view for one question). Otherwise a later "is this bad?"
// usually means the answer above it, so only an explicit pointer counts.

const EXPLICIT = /\b(?:this|these) (?:views?|pages?|screens?|charts?|figures?|tables?|lists?|graphs?|diagrams?|maps?|components?|files?|tangles?|cycles?|rankings?|matrix|rows?|results?|numbers?)\b|\bon (?:the )?screen\b|\bshown here\b|\bi(?:'m| am) (?:looking at|seeing)\b/i

export function pointsAtView(question: string, firstInThread: boolean): boolean {
    if (EXPLICIT.test(question)) return true
    return firstInThread && /\b(?:this|these|those|here)\b/i.test(question)
}
