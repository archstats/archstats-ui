// The Ask engine's vocabulary. Nothing in engine/ imports a store, a
// component or a Wails binding: the app hands it a World (the snapshot), a
// model client and the tools, and the same loop runs headless in tests and
// evaluations.

import type { ConnectionRow, Definition, Snapshot } from "~/features/snapshot/snapshot"
import type { ExhibitPart } from "~/features/exhibits/types"

export type { ConnectionRow, Definition }

// ── The snapshot as the tools see it ──────────────────────────────────────

export interface Limited { columns: string[]; rows: unknown[][]; truncated: boolean }

export interface FindHits { files: Array<{ file: string; hits: number }>; totalHits: number; searched: number; truncated: boolean }
export interface HitLine { line: number; text: string; context: boolean }

/** What a view had on screen when the person came to Ask from it. */
export interface ViewContext {
    route: string
    label: string
    /** The component or file the view is about, when it is about one. */
    subject?: { kind: "component" | "file"; name: string }
    focus?: string
    selection?: string[]
    exhibits: Array<{ kind: "table" | "figure"; title: string; columns?: string[]; rows?: string[][]; total?: number; legend?: string }>
    /** The view's figures as PNG (base64, no prefix), for a model that can see. At most two. */
    images?: Array<{ title: string; png: string }>
    capturedAt: string
}

/** The snapshot, plus what only the chat needs: SQL from the model, code search, the screen. */
export interface World extends Snapshot {
    /** SQL written by the model: read-only, capped, timed. */
    console(sql: string): Promise<Limited>
    findInCode?(needle: string, opts: { regex?: boolean; caseSensitive?: boolean; word?: boolean }): Promise<FindHits>
    findLines?(file: string, needle: string, opts: { regex?: boolean; caseSensitive?: boolean; word?: boolean }): Promise<HitLine[]>
    /** A view drawn out of sight: its figures (as images) and tables. Only in the app. */
    readView?(route: string, opts: { focus?: string; take?: string }): Promise<{ figures: Array<{ title: string; src: string; width: number; height: number; legend: string; png?: string }>; tables: Array<{ title: string; columns: string[]; rows: string[][]; total: number }> }>
    /** Runs a code-mode script against the given API, sandboxed. */
    runCode?(code: string, api: Record<string, (...a: any[]) => Promise<unknown>>): Promise<{ value: unknown; logs: string[]; error?: string }>
    /** Vectors for texts from a local embedding model, when one is available. */
    embed?(texts: string[]): Promise<number[][]>
    /** The view the person came from, if they came from one. */
    onScreen?(): ViewContext | null
}

// ── Evidence: what a tool found, shown in the conversation ───────────────

export interface RanOn { scanId: string; commit: string; revision: number; workspace: string }

interface EvidenceBase {
    id: string
    title: string
    ranOn: RanOn
    /** Where to see it in the app. */
    open?: { route: string; focus?: string; hl?: string[]; label: string }
    /** SQL that reproduces it, when there is one: the report runs it again. */
    sql?: string
    /** From a verified cookbook query. */
    verified?: boolean
}

export type Evidence =
    | EvidenceBase & { kind: "bars"; metric: string; unit: string; items: Array<{ label: string; value: number; key?: string }>; note?: string }
    | EvidenceBase & { kind: "table"; columns: string[]; rows: unknown[][]; total: number; note?: string }
    | EvidenceBase & { kind: "component"; name: string; values: Array<{ id: string; label: string; value: number | null }>; dependents: Array<{ name: string; refs: number }>; dependencies: Array<{ name: string; refs: number }> }
    | EvidenceBase & { kind: "graph"; nodes: string[]; edges: Array<{ from: string; to: string; weight: number }>; query: string; anchors: string[] }
    | EvidenceBase & { kind: "tangle"; members: string[]; edges: Array<{ from: string; to: string; imports: number; files: number }>; steps: Array<{ from: string; to: string; imports: number; files: number; freed: number; tangled: number; carriers: string[] }>; anchor?: string }
    | EvidenceBase & { kind: "file"; path: string; component: string; role: string; values: Array<{ label: string; value: number | null }>; outline: Array<{ line: number; kind: string; text: string }>; importsFrom: string[]; importedBy: string[] }
    | EvidenceBase & { kind: "code"; path: string; from: number; lines: string[]; highlight?: number[] }
    | EvidenceBase & { kind: "timeline"; points: Array<{ label: string; value: number }>; unit: string }
    | EvidenceBase & { kind: "layers"; floors: Array<{ id: string; label: string; sub: string; weight: number }>; flows: Array<{ key: string; from: string; to: string; count: number; bad?: boolean }>; grouping: string }
    | EvidenceBase & { kind: "folders"; files: string[]; lines: number[]; values: Array<number | string | null>; colorBy: "role" | "health" | "churn" | "component" }
    | EvidenceBase & { kind: "knowledge"; rows: Array<{ component: string; lines: number; state: string; hereShare: number; hereCommits: number; ask: string | null; main: string | null }>; windowWords: string }
    | EvidenceBase & { kind: "view"; route: string; focus?: string; figures: Array<{ title: string; src: string; width: number; height: number; legend: string }>; tables: Array<{ title: string; columns: string[]; rows: string[][]; total: number }> }
    /** A view to open, and nothing else: the person clicks it. */
    | EvidenceBase & { kind: "link" }

// ── Tools ─────────────────────────────────────────────────────────────────

export type Namespace = "core" | "graph" | "cycles" | "files" | "history" | "query" | "view"

export interface ToolContext {
    world: World
    ranOn: RanOn
    /** Mints evidence ids, unique within a conversation. */
    nextId: () => string
    /** Every result of the conversation so far, for `recall`. */
    recall: (id: string) => string | null
}

export interface ToolResult {
    /** What the model reads. Concise; ids in square brackets. */
    text: string
    evidence?: Evidence[]
    /** Exhibits the tool made: drawn in the answer where cited, their facts citable as E3.4. */
    exhibits?: ExhibitPart[]
    /** Questions worth asking next, offered as chips. */
    followUps?: string[]
    /** Namespaces to offer from the next step on (load_tools). */
    load?: Namespace[]
    /** The turn stops here and asks the person to choose. */
    askUser?: { question: string; options: string[] }
}

export interface ToolParam { type: "string" | "number" | "boolean"; description: string; enum?: string[] }

export interface Tool {
    name: string
    namespace: Namespace
    /** What it answers, then one or two example calls. */
    description: string
    params: Record<string, ToolParam>
    required?: string[]
    /** A short line for the step list: "Looked up the cycles of `web`". */
    label: (args: Record<string, any>) => string
    run: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>
}

// ── The model ─────────────────────────────────────────────────────────────

export interface ModelMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, any> | string } }>
    tool_name?: string
    images?: string[]
}

export interface ModelRequest {
    messages: ModelMessage[]
    tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: any } }>
    /** A JSON schema the reply must follow (structured output, no tools). */
    format?: any
    think?: boolean
}

export interface ModelReply {
    content: string
    thinking: string
    toolCalls: Array<{ name: string; args: Record<string, any> }>
    promptTokens: number
    outputTokens: number
    ms: number
    stopped: boolean
}

export interface ModelClient {
    name: string
    chat(req: ModelRequest, onDelta: (d: { content: string; thinking: string }) => void, signal: AbortSignal): Promise<ModelReply>
}

// ── What a turn reports as it runs ────────────────────────────────────────

export interface Check { id: "unsourced" | "gave-up" | "uncited" | "verdict" | "invented" | "menu"; ok: boolean; detail: string }

export type TurnEvent =
    | { type: "route"; namespaces: Namespace[]; tools: string[] }
    | { type: "plan"; steps: Array<{ claim: string; test: string }> }
    | { type: "system"; content: string; tools: string[] }
    | { type: "claim"; index: number; status: "testing" | "done"; verdict?: "supported" | "refuted" | "can't tell"; summary?: string }
    | { type: "model"; step: number; phase: "start" }
    | { type: "model"; step: number; phase: "end"; reply: ModelReply }
    | { type: "delta"; content: string; thinking: string }
    | { type: "tool"; phase: "start"; callId: string; name: string; args: Record<string, any>; label: string }
    | { type: "tool"; phase: "end"; callId: string; name: string; result: ToolResult; ms: number; error?: string }
    | { type: "draft-reset" }
    | { type: "checks"; checks: Check[] }
    | { type: "repair"; reason: string }
    | { type: "choices"; question: string; options: string[] }
    | { type: "done"; answer: string }
    | { type: "error"; message: string }
