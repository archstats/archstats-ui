import type { Tool } from "../engine/types"
import { codeTools } from "./code"
import { coreTools } from "./core"
import { historyTools } from "./history"
import { queryTools } from "./query"
import { structureTools } from "./structure"
import { figureTools } from "./figures"
import { codeModeTool } from "./codeMode"

/** Every tool, in the order the model sees them. */
export const TOOLS: Tool[] = [...coreTools, ...structureTools, ...figureTools, ...codeTools, ...historyTools, ...queryTools, ...(typeof process !== "undefined" && process.env?.ASK_NO_CODE === "1" ? [] : [codeModeTool])]

export const toolByName = (name: string) => TOOLS.find(t => t.name === name)

export { INTENTS } from "../intents"

/** Which tool set a turn uses: the intents, unless ASK_TOOLS=legacy (evals comparing the two). */
export const useIntents = () => !(typeof process !== "undefined" && process.env?.ASK_TOOLS === "legacy")
